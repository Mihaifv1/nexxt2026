import { z } from "zod";
import { assert, type DisputeCase } from "../domain.ts";
import type { Actor } from "../engine.ts";
import type { ProviderConfig } from "../provider.ts";
import { IncidentStore } from "../incidents/store.ts";
import { incidentMetrics } from "../incidents/api.ts";
import { OperationsStore } from "./store.ts";
import { OperationsEngine } from "./engine.ts";
import { definition, workflows } from "./catalog.ts";
import { terminal, type Case } from "./domain.ts";
import { pdf, sampleDocument, complaintDraft } from "./documents.ts";
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export function caseRow(c: Case) {
  const def = definition(c.workflow_id)!;
  return {
    id: c.id,
    reference: c.reference,
    workflow_id: c.workflow_id,
    workflow_name: def.name,
    customer_id: c.customer_id,
    customer_name: c.customer_name,
    state: c.state,
    priority: c.priority,
    version: c.version,
    created_at: c.created_at,
    updated_at: c.updated_at,
    source: "WORKFLOW",
    href: "/b2c/cases/" + c.id,
    needs_approval: [
      "NEEDS_CLARIFICATION",
      "READY_FOR_REVIEW",
      "INTERNAL_REVIEW",
      "ESCALATED",
    ].includes(c.state),
    task_count: c.tasks.filter((t) => t.status === "PENDING").length,
    completed: terminal.includes(c.state),
  };
}
export async function operationsApi(
  request: Request,
  db: D1Database,
  secret: string,
  owner: string,
  actor: Actor,
  config: ProviderConfig,
  legacy: DisputeCase[],
) {
  assert(
    secret,
    "ENCRYPTION_NOT_CONFIGURED",
    "Cheia de criptare nu este configurată.",
    503,
  );
  const store = new OperationsStore(db, secret),
    engine = new OperationsEngine(store, owner, actor, config),
    url = new URL(request.url),
    parts = url.pathname
      .replace(/^\/api\/b2c\/?/, "")
      .split("/")
      .filter(Boolean),
    method = request.method,
    key = request.headers.get("Idempotency-Key") ?? "";
  const employee = () => engine.employee();
  const allRows = async () => {
    const operations = (await store.list(owner)).map(caseRow);
    const payments = (await new IncidentStore(db).list(owner)).map((c) => {
      const w = workflows.find((w) => w.paymentRoute === c.primary_route);
      return {
        id: c.id,
        reference: c.reference,
        workflow_id: w?.id ?? "PAYMENT_TRIAGE",
        workflow_name: w?.name ?? "Payment Incident Triage",
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        state: c.status,
        priority: c.priority,
        version: c.version,
        created_at: c.created_at,
        updated_at: c.updated_at,
        source: "PAYMENT",
        href: "/b2c/incidents/" + c.id,
        needs_approval:
          c.runs.at(-1)?.proposed_actions.some((a) => a.status === "PENDING") ??
          false,
        task_count: c.requests.filter((r) => r.status === "PENDING").length,
        completed: c.status === "CLOSED_DEMO",
      };
    });
    return [...operations, ...payments].sort((a, b) =>
      b.updated_at.localeCompare(a.updated_at),
    );
  };
  if (parts[0] === "customer") {
    assert(
      actor.role === "DEMO_CUSTOMER",
      "FORBIDDEN",
      "Selectează profilul clientului demo.",
      403,
    );
    const own = (await store.list(owner)).filter(
      (c) => c.customer_id === actor.customer_id,
    );
    if (parts[1] === "tasks" && !parts[2] && method === "GET")
      return json(
        own.map((c) => ({
          id: c.id,
          reference: c.reference,
          workflow_id: c.workflow_id,
          workflow_name: definition(c.workflow_id)!.name,
          customer_id: c.customer_id,
          customer_name: c.customer_name,
          state: c.state,
          version: c.version,
          tasks: c.tasks,
          documents: c.documents
            .filter(
              (d) =>
                d.direction === "OUTPUT" &&
                ["APPROVED", "SIGNED_MOCK"].includes(d.status),
            )
            .map((d) => ({ ...d, input_snapshot: {} })),
        })),
      );
    if (parts[1] === "documents" && method === "GET")
      return json(
        own.flatMap((c) =>
          c.documents
            .filter(
              (d) =>
                d.direction === "OUTPUT" &&
                ["APPROVED", "SIGNED_MOCK"].includes(d.status),
            )
            .map((d) => ({
              ...d,
              case_id: c.id,
              reference: c.reference,
              input_snapshot: {},
            })),
        ),
      );
    const c = own.find((c) => c.tasks.some((t) => t.id === parts[2]));
    assert(c, "NOT_FOUND", "Solicitarea nu aparține clientului curent.", 404);
    const task = c.tasks.find((t) => t.id === parts[2])!;
    if (parts[3] === "respond" && method === "POST")
      return json(await engine.respond(task.id, await request.json(), key));
    if (parts[3] === "sample" && method === "GET") {
      assert(
        task.status === "PENDING",
        "STALE_TASK",
        "Solicitarea nu mai este activă.",
        409,
      );
      const kind = url.searchParams.get("kind") ?? "";
      assert(
        task.required_documents.includes(kind),
        "INVALID_DOCUMENT",
        "Documentul nu a fost solicitat.",
      );
      return json({
        name: kind + "-DEMO.txt",
        content: sampleDocument(c, kind),
      });
    }
    if (method === "GET")
      return json({
        case_id: c.id,
        reference: c.reference,
        version: c.version,
        task,
        documents: c.documents.filter(
          (d) =>
            d.id === task.document_id &&
            ["APPROVED", "SIGNED_MOCK"].includes(d.status),
        ),
      });
    return json({ message: "Endpoint inexistent." }, 404);
  }
  if (
    parts[0] === "contracts" &&
    parts[2] === "sign-mock" &&
    method === "POST"
  ) {
    assert(
      actor.role === "DEMO_CUSTOMER",
      "FORBIDDEN",
      "Semnarea se face numai din simulatorul clientului.",
      403,
    );
    const all = await store.list(owner),
      c = all.find(
        (c) =>
          c.customer_id === actor.customer_id &&
          (c.id === parts[1] || c.documents.some((d) => d.id === parts[1])),
      );
    assert(c, "NOT_FOUND", "Contractul nu există pentru client.", 404);
    const t = c.tasks.findLast(
      (t) => t.kind === "SIGNATURE" && t.status === "PENDING",
    );
    assert(t, "NOT_FOUND", "Cererea de semnare nu există.", 404);
    return json(await engine.respond(t.id, await request.json(), key));
  }
  employee();
  if (
    parts[0] === "operations" &&
    parts[1] === "bootstrap" &&
    method === "POST"
  ) {
    await store.bootstrap(owner, legacy);
    await new IncidentStore(db).seed(owner);
    return json({ ready: true });
  }
  if (parts[0] === "workflows" && method === "GET") return json(workflows);
  if (parts[0] === "operations" && parts[1] === "metrics" && method === "GET") {
    const cases = await store.list(owner),
      rows = await allRows(),
      runs = cases.flatMap((c) => c.runs),
      finished = rows.filter((c) => c.completed).length;
    return json({
      total: rows.length,
      operations: cases.length,
      payments: rows.length - cases.length,
      active: rows.filter((c) => !c.completed && c.state !== "CANCELLED")
        .length,
      awaiting_customer: rows.filter((c) =>
        ["AWAITING_CUSTOMER", "AWAITING_SIGNATURE"].includes(c.state),
      ).length,
      awaiting_approval: rows.filter((c) => c.needs_approval).length,
      completed: finished,
      escalated: rows.filter((c) =>
        ["ESCALATED", "HUMAN_REVIEW"].includes(c.state),
      ).length,
      workflow_reuse: new Set(cases.map((c) => c.workflow_id)).size,
      available_workflows: 29,
      runs: runs.length,
      tool_calls: runs.reduce((n, r) => n + r.calls.length, 0),
      documents: cases.reduce((n, c) => n + c.documents.length, 0),
      signatures: cases.reduce(
        (n, c) => n + c.signatures.filter((s) => s.accepted).length,
        0,
      ),
      avg_run_ms: runs.length
        ? Math.round(runs.reduce((n, r) => n + r.duration_ms, 0) / runs.length)
        : null,
      grounding: runs.some((r) => r.facts.length)
        ? Math.round(
            (runs.flatMap((r) => r.facts).filter((f) => f.evidence_ids.length)
              .length /
              Math.max(1, runs.flatMap((r) => r.facts).length)) *
              100,
          )
        : null,
      payment_incidents: await incidentMetrics(new IncidentStore(db), owner),
    });
  }
  if (parts[0] === "operations" && parts[1] === "audit" && method === "GET") {
    const events = await db
      .prepare(
        "SELECT data FROM b2c_audit_events WHERE owner_id=? ORDER BY timestamp DESC",
      )
      .bind(owner)
      .all<{ data: string }>();
    return json(events.results.map((r) => JSON.parse(r.data)));
  }
  if (parts[0] === "clients") {
    if (!parts[1] && method === "GET")
      return json(
        (await store.profiles.list(owner)).map((p) => ({
          id: p.id,
          name: p.name,
          version: p.version,
          kyc_status: p.operations?.kyc_status ?? "UNVERIFIED",
          fields_count: Object.keys(p.fields).length,
          products: p.operations?.products ?? [],
        })),
      );
    if (parts[1] && method === "GET") {
      const p = await store.profiles.get(owner, parts[1]);
      const cases = (await allRows()).filter((c) => c.customer_id === p.id);
      return json({
        id: p.id,
        name: p.name,
        version: p.version,
        fields: p.fields,
        operations: p.operations ?? {
          contact: {},
          kyc_status: "UNVERIFIED",
          products: [],
        },
        documents: p.documents,
        consents: p.consents,
        cases,
        audit: p.audit,
        appointments: p.appointments,
        workflow_documents: (await store.list(owner))
          .filter((c) => c.customer_id === p.id)
          .flatMap((c) =>
            c.documents.map((d) => ({
              ...d,
              case_id: c.id,
              reference: c.reference,
            })),
          ),
      });
    }
  }
  if (parts[0] === "approvals" && parts[1] === "pending" && method === "GET")
    return json((await allRows()).filter((c) => c.needs_approval));
  if (parts[0] === "cases") {
    if (!parts[1] && method === "GET") return json(await allRows());
    if (!parts[1] && method === "POST")
      return json(await engine.create(await request.json(), key), 201);
    const c = await store.get(owner, parts[1]);
    if (!parts[2] && method === "GET")
      return json({
        ...c,
        processed: {},
        definition: definition(c.workflow_id),
        response_draft:
          c.workflow_id === "B2C-08" && c.runs.length
            ? complaintDraft(c, c.runs.at(-1)!)
            : undefined,
      });
    if (["timeline", "audit"].includes(parts[2]) && method === "GET")
      return json(c.audit);
    if (parts[2] === "actions" && method === "POST")
      return json(await engine.act(c.id, await request.json(), key));
    if (parts[2] === "agent-runs" && method === "POST") {
      const body = (await request.json()) as Record<string, unknown>;
      return json(await engine.act(c.id, { ...body, action: "RUN" }, key));
    }
    if (parts[2] === "sample" && method === "GET") {
      const kind = url.searchParams.get("kind") ?? "";
      assert(
        definition(c.workflow_id)!.documents.includes(kind),
        "INVALID_DOCUMENT",
        "Tip de document nepermis.",
      );
      let content = sampleDocument(c, kind);
      if (c.scenario === "CONFLICT") {
        if (kind === "SALARY")
          content = content.replace(
            /income_minor: \d+/,
            `income_minor: ${Math.max(10000, Number(c.input.income_minor ?? 650000) - 100000)}`,
          );
        else if (kind === "IDENTITY")
          content = content.replace(
            /full_name: .+/,
            "full_name: ALT NUME SINTETIC",
          );
      }
      return json({ name: kind + "-DEMO.txt", content });
    }
    if (parts[2] === "documents" && parts[3]) {
      const doc = c.documents.find((d) => d.id === parts[3]);
      assert(doc, "NOT_FOUND", "Documentul nu există.", 404);
      if (parts[4] === "pdf")
        return new Response(pdf(doc.content), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="${c.reference}-v${doc.version}-DEMO.pdf"`,
            "Cache-Control": "no-store",
          },
        });
      if (parts[4] === "preview")
        return new Response(doc.content, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Security-Policy":
              "default-src 'none'; style-src 'unsafe-inline'; sandbox",
            "Cache-Control": "no-store",
          },
        });
      return json(doc);
    }
  }
  if (
    (parts[0] === "contracts" && !parts[1]) ||
    (parts[0] === "credits" && parts[1] === "applications" && !parts[2])
  ) {
    if (method === "POST") {
      const body = (await request.json()) as Record<string, unknown>;
      return json(
        await engine.create(
          {
            ...body,
            workflow_id: parts[0] === "contracts" ? "B2C-02" : "B2C-03",
          },
          key,
        ),
        201,
      );
    }
    return json(
      (await store.list(owner))
        .filter(
          (c) =>
            definition(c.workflow_id)?.family ===
            (parts[0] === "contracts" ? "CONTRACT" : "CREDIT"),
        )
        .map(caseRow),
    );
  }
  if (parts[0] === "contracts" || parts[0] === "credits") {
    const id = parts[0] === "credits" ? parts[2] : parts[1];
    const action = parts[0] === "credits" ? parts[3] : parts[2];
    const c = (await store.list(owner)).find(
      (c) => c.id === id || c.documents.some((d) => d.id === id),
    );
    assert(c, "NOT_FOUND", "Dosarul nu există.", 404);
    if (
      method === "POST" &&
      [
        "generate",
        "submit-review",
        "preassessment-mock",
        "generate-offer",
        "generate-contract",
      ].includes(action)
    ) {
      const body = (await request.json()) as Record<string, unknown>;
      return json(await engine.act(c.id, { ...body, action: "RUN" }, key));
    }
    if (action === "versions")
      return json(c.documents.filter((d) => d.direction === "OUTPUT"));
    const doc = c.documents.filter((d) => d.direction === "OUTPUT").at(-1);
    if (action === "preview") {
      assert(doc, "NOT_FOUND", "Documentul nu a fost generat.", 404);
      return new Response(doc.content, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy":
            "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        },
      });
    }
    return json({ ...c, processed: {} });
  }
  return json({ message: "Endpoint inexistent." }, 404);
}
