import { z } from "zod";
import { assert, now } from "../domain.ts";
import type { Actor } from "../engine.ts";
import type { ProviderConfig } from "../provider.ts";
import type { DisputeCase } from "../domain.ts";
import { dispatchTask } from "../request-tasks.ts";
import { IncidentStore } from "./store.ts";
import {
  IncidentService,
  InvestigationOrchestrator,
  incidentEvent,
} from "./orchestrator.ts";
import {
  createSchema,
  fresh,
  guardSensitive,
  routes,
  uuid,
  versionSchema,
  type Incident,
} from "./domain.ts";
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function incidentMetrics(store: IncidentStore, owner: string) {
  const all = await store.list(owner);
  const runs = all.flatMap((c) => c.runs);
  const done = runs.filter((r) => r.status === "COMPLETED");
  const facts = done.flatMap((r) => r.known_facts);
  return {
    total: all.length,
    by_route: Object.fromEntries(
      routes.map((r) => [r, all.filter((c) => c.primary_route === r).length]),
    ),
    new: all.filter((c) => c.status === "NEW").length,
    awaiting_approval: all.filter((c) => c.status === "AWAITING_APPROVAL")
      .length,
    awaiting_customer: all.filter((c) => c.status === "AWAITING_CUSTOMER")
      .length,
    ready: all.filter((c) => c.status === "READY_FOR_REVIEW").length,
    human_review: all.filter((c) => c.status === "HUMAN_REVIEW").length,
    escalated: all.filter((c) => c.status === "ESCALATED").length,
    closed: all.filter((c) => c.status === "CLOSED_DEMO").length,
    runs: runs.length,
    failed: runs.filter((r) => r.status === "FAILED").length,
    tool_calls: runs.reduce((n, r) => n + r.calls.length, 0),
    tool_errors: runs.reduce(
      (n, r) => n + r.calls.filter((call) => call.status === "FAILED").length,
      0,
    ),
    model_errors: all.reduce(
      (n, c) =>
        n +
        c.audit.filter(
          (e) =>
            e.event_type === "LLM_OUTPUT_REJECTED" &&
            c.runs.some((r) => r.id === e.payload.run_id),
        ).length,
      0,
    ),
    avg_triage_ms: done.length
      ? Math.round(
          done.reduce((n, r) => n + (r.triage?.duration_ms ?? 0), 0) /
            done.length,
        )
      : null,
    avg_investigation_ms: done.length
      ? Math.round(
          done.reduce((n, r) => n + (r.duration_ms ?? 0), 0) / done.length,
        )
      : null,
    customer_interactions: all.reduce(
      (n, c) => n + c.requests.filter((r) => r.status === "ANSWERED").length,
      0,
    ),
    escalation_rate: all.length
      ? Math.round(
          (all.filter((c) => c.status === "ESCALATED").length / all.length) *
            100,
        )
      : 0,
    human_intervention_rate: all.filter((c) => c.runs.length).length
      ? Math.round(
          (all.filter((c) => c.approvals.length).length /
            all.filter((c) => c.runs.length).length) *
            100,
        )
      : null,
    grounding: facts.length
      ? Math.round(
          (facts.filter((f) => f.evidence_ids.length).length / facts.length) *
            100,
        )
      : null,
    reclassifications: all.reduce(
      (n, c) =>
        n +
        c.audit.filter((e) => e.event_type === "INCIDENT_RECLASSIFIED").length,
      0,
    ),
  };
}
export async function incidentCustomerList(
  store: IncidentStore,
  owner: string,
  customer: string,
) {
  return Promise.all(
    (await store.list(owner))
      .filter((c) => c.customer_id === customer)
      .map(async (c) => {
        const r = await store.bankRecord(
          owner,
          c.transaction_id,
          c.customer_id,
        );
        return {
          id: c.id,
          reference: c.reference,
          customer_id: c.customer_id,
          customer_name: c.customer_name,
          version: c.version,
          status: c.status,
          primary_route: c.primary_route,
          priority: c.priority,
          transaction: r
            ? {
                id: r.id,
                amount_minor: r.amount_minor,
                currency: r.currency,
                descriptor: r.descriptor,
                status: r.status,
                channel: r.channel,
              }
            : null,
          requests: c.requests,
        };
      }),
  );
}
export async function incidentsApi(
  request: Request,
  db: D1Database,
  owner: string,
  actor: Actor,
  config: ProviderConfig,
  customers: DisputeCase[],
) {
  const path = new URL(request.url).pathname
    .replace(/^\/api\/b2c\/incidents\/?/, "")
    .split("/")
    .filter(Boolean);
  const method = request.method;
  const store = new IncidentStore(db);
  const service = new IncidentService(store, owner, actor, config);
  service.employee();
  const worker = new InvestigationOrchestrator(store, config);
  const key = request.headers.get("Idempotency-Key") ?? "";
  const launch = async (result: { job_id?: string }) => {
    if (result.job_id)
      await dispatchTask(() => worker.execute(owner, result.job_id!));
    return json(result, 202);
  };
  if (path[0] === "bootstrap" && method === "POST") {
    await store.seed(owner);
    const pending = (await store.pending(owner)).slice(0, 5);
    if (pending.length)
      await dispatchTask(async () => {
        for (const job of pending) await worker.execute(owner, job.id);
      });
    return json({ ready: true, recovered_jobs: pending.length });
  }
  if (path[0] === "catalog" && method === "GET")
    return json(
      (await store.bankRecords(owner)).map((r) => ({
        id: r.id,
        customer_id: r.customer_id,
        channel: r.channel,
        amount_minor: r.amount_minor,
        currency: r.currency,
        descriptor: r.descriptor,
        status: r.status,
      })),
    );
  if (path[0] === "metrics" && method === "GET")
    return json(await incidentMetrics(store, owner));
  if (path[0] === "audit" && method === "GET")
    return json(
      (await store.list(owner))
        .flatMap((c) => c.audit)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    );
  if (path[0] === "reset" && method === "POST") {
    assert(
      actor.role === "B2C_SUPERVISOR",
      "FORBIDDEN",
      "Resetarea necesită supervizor.",
      403,
    );
    assert(key, "IDEMPOTENCY_REQUIRED", "Lipsește Idempotency-Key.");
    const marker = `INCIDENT-RESET:${owner}:${key}`;
    const exists = await db
      .prepare("SELECT id FROM b2c_demo_sessions WHERE id=?")
      .bind(marker)
      .first();
    if (!exists) {
      await store.seed(owner, true);
      await db
        .prepare(
          "INSERT INTO b2c_demo_sessions (id,owner_id,role,expires_at) VALUES (?,?,?,?)",
        )
        .bind(marker, owner, "RESET", "9999-01-01")
        .run();
    }
    return json({ reset: true });
  }
  if (path[0] === "jobs" && path[1]) {
    const job = await store.getJob(owner, path[1]);
    if (method === "GET") return json(job);
    if (method === "POST" && path[2] === "resume")
      return launch({ job_id: job.id });
  }
  if (!path.length && method === "GET")
    return json(
      (await store.list(owner)).map((c) => ({ ...c, processed: {} })),
    );
  if (!path.length && method === "POST") {
    assert(
      key && key.length <= 150,
      "IDEMPOTENCY_REQUIRED",
      "Lipsește Idempotency-Key.",
    );
    const body = createSchema.parse(await request.json());
    guardSensitive(body.statement);
    const customer = customers.find((c) => c.customer_id === body.customer_id);
    assert(customer, "INVALID_CUSTOMER", "Clientul sintetic nu există.");
    const receiptHash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(owner + ":" + key),
        ),
      ),
    )
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
    const receiptId =
      receiptHash.slice(0, 8) +
      "-" +
      receiptHash.slice(8, 12) +
      "-5" +
      receiptHash.slice(13, 16) +
      "-a" +
      receiptHash.slice(17, 20) +
      "-" +
      receiptHash.slice(20, 32);
    const replay = async () => {
      const row = await db
        .prepare("SELECT data FROM b2c_case_events WHERE id=? AND owner_id=?")
        .bind(receiptId, owner)
        .first<{ data: string }>();
      if (!row) return null;
      const value = JSON.parse(row.data);
      assert(
        value.fingerprint === JSON.stringify(body),
        "IDEMPOTENCY_CONFLICT",
        "Aceeași cheie a fost utilizată pentru alt incident.",
        409,
      );
      return value.incident_id as string;
    };
    const existing = await replay();
    if (existing) return json({ incident_id: existing }, 200);
    const records = await store.bankRecords(owner, body.customer_id);
    const selected = records.find((r) => r.id === body.transaction_id);
    assert(
      !body.transaction_id || selected,
      "TRANSACTION_NOT_FOUND",
      "Tranzacția nu aparține clientului selectat.",
      422,
    );
    const candidates = selected
      ? [selected.id]
      : records
          .filter(
            (r) =>
              body.reported_amount_minor === undefined ||
              r.amount_minor === body.reported_amount_minor,
          )
          .map((r) => r.id);
    const c = fresh(
      customer.customer_id,
      customer.customer_name,
      body.statement,
      selected?.id ?? null,
      candidates,
      "PII-" +
        new Date().getUTCFullYear() +
        "-" +
        uuid().slice(0, 6).toUpperCase(),
    );
    c.reported_amount_minor = body.reported_amount_minor;
    incidentEvent(
      c,
      "INCIDENT_CREATED",
      { synthetic: true, source: "EMPLOYEE_INTAKE" },
      actor.id,
      actor.role,
    );
    const statements = [
      db
        .prepare(
          "INSERT INTO b2c_incidents (id,owner_id,version,data,last_mutation) VALUES (?,?,?,?,?)",
        )
        .bind(c.id, owner, c.version, JSON.stringify(c), uuid()),
      ...c.audit.map((e) => store.auditStatement(owner, c, e)),
      ...(c.transaction_id
        ? [
            db
              .prepare(
                "INSERT INTO b2c_incident_transactions (id,owner_id,incident_id,run_id,data) VALUES (?,?,?,?,?)",
              )
              .bind(
                uuid(),
                owner,
                c.id,
                null,
                JSON.stringify({ transaction_id: c.transaction_id }),
              ),
          ]
        : []),
      db
        .prepare(
          "INSERT INTO b2c_case_events (id,owner_id,incident_id,run_id,data) VALUES (?,?,?,?,?)",
        )
        .bind(
          receiptId,
          owner,
          c.id,
          null,
          JSON.stringify({
            fingerprint: JSON.stringify(body),
            incident_id: c.id,
            kind: "INTAKE_RECEIPT",
          }),
        ),
    ];
    try {
      await db.batch(statements);
    } catch (error) {
      const id = await replay();
      if (id) return json({ incident_id: id }, 200);
      throw error;
    }
    return json({ incident_id: c.id }, 201);
  }
  const c = await store.get(owner, path[0]);
  if (path.length === 1 && method === "GET")
    return json({
      ...c,
      processed: {},
      payment_record: await store.bankRecord(
        owner,
        c.transaction_id,
        c.customer_id,
      ),
      job: c.active_job_id ? await store.getJob(owner, c.active_job_id) : null,
    });
  if (method === "POST" && ["triage", "investigate"].includes(path[1]))
    return launch(
      await service.enqueue(
        c.id,
        versionSchema
          .extend({ recover_demo_fault: z.boolean().optional() })
          .parse(await request.json()),
        key,
      ),
    );
  if (path[1] === "approvals" && method === "POST")
    return launch(await service.approve(c.id, await request.json(), key));
  if (path[1] === "reassign" && method === "POST")
    return launch(
      await service.reassign(
        c.id,
        versionSchema
          .extend({
            route: z.enum(routes),
            transaction_id: z.string().optional(),
            comment: z.string().min(5).max(2000),
          })
          .parse(await request.json()),
        key,
      ),
    );
  if (path[1] === "evidence" && method === "GET") {
    const rows = await db
      .prepare(
        "SELECT data FROM b2c_evidence WHERE incident_id=? AND owner_id=?",
      )
      .bind(c.id, owner)
      .all<{ data: string }>();
    return json(rows.results.map((r) => JSON.parse(r.data)));
  }
  if (path[1] === "customer-requests" && method === "GET")
    return json(c.requests);
  if (path[1] === "events" && method === "GET") {
    const after = new URL(request.url).searchParams.get("after");
    const index = after ? c.audit.findIndex((e) => e.event_id === after) : -1;
    return json({
      version: c.version,
      status: c.status,
      active_job_id: c.active_job_id,
      events: c.audit.slice(index + 1),
      run: c.runs.at(-1),
    });
  }
  if (path[1] === "audit" && method === "GET") return json(c.audit);
  return json({ error: "NOT_FOUND", message: "Endpoint inexistent." }, 404);
}
