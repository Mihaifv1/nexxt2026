import { z } from "zod";
import {
  assert,
  DomainError,
  mutationSchema,
  uid,
  type Role,
} from "./domain.ts";
import { D1Store } from "./store.ts";
import { Engine, type Actor } from "./engine.ts";
import type { ProviderConfig } from "./provider.ts";
import { frontDoorApi } from "./frontdoor/api.ts";
import { IncidentStore } from "./incidents/store.ts";
import {
  IncidentService,
  InvestigationOrchestrator,
} from "./incidents/orchestrator.ts";
import {
  incidentsApi,
  incidentCustomerList,
  incidentMetrics,
} from "./incidents/api.ts";
import { dispatchTask } from "./request-tasks.ts";
export interface ApiEnv extends ProviderConfig {
  DB: D1Database;
  PROFILE_ENCRYPTION_KEY?: string;
}
const json = (
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
export async function handleApi(
  request: Request,
  env: ApiEnv,
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const path = url.pathname
      .replace(/^\/api\/b2c\/?/, "")
      .split("/")
      .filter(Boolean);
    const method = request.method;
    const owner = request.headers.get("oai-authenticated-user-id");
    assert(
      owner,
      "UNAUTHENTICATED",
      "Autentifică-te pentru a deschide spațiul demo.",
      401,
    );
    if (method !== "GET" && request.headers.get("origin"))
      assert(
        request.headers.get("origin") === url.origin,
        "INVALID_ORIGIN",
        "Originea cererii nu este permisă.",
        403,
      );
    const store = new D1Store(env.DB);
    if (path[0] === "session" && method === "POST") {
      const body = z
        .object({
          role: z.enum(["B2C_AGENT", "B2C_SUPERVISOR", "DEMO_CUSTOMER"]),
          customer_id: z.string().optional(),
        })
        .parse(await request.json());
      if (!(await store.list(owner)).length) await store.reset(owner);
      if (body.role === "DEMO_CUSTOMER")
        assert(
          body.customer_id &&
            (await store.list(owner)).some(
              (c) => c.customer_id === body.customer_id,
            ),
          "INVALID_CUSTOMER",
          "Selectează un profil sintetic.",
        );
      const id = uid("SESSION");
      await env.DB.prepare(
        "INSERT INTO b2c_demo_sessions (id,owner_id,role,customer_id,expires_at) VALUES (?,?,?,?,?)",
      )
        .bind(
          id,
          owner,
          body.role,
          body.customer_id ?? null,
          new Date(Date.now() + 43200000).toISOString(),
        )
        .run();
      return json(
        {
          role: body.role,
          customer_id: body.customer_id,
          mode: env.LLM_ENDPOINT ? "LLM configurat" : "Motor demo determinist",
        },
        200,
        {
          "Set-Cookie": `${body.role === "DEMO_CUSTOMER" ? "b2c_customer" : "b2c_employee"}=${id}; HttpOnly; SameSite=Strict; Path=/api/b2c; Max-Age=43200${url.protocol === "https:" ? "; Secure" : ""}`,
        },
      );
    }
    if (path.join("/") === "demo/profiles" && method === "GET")
      return json(
        (await store.list(owner)).map((c) => ({
          customer_id: c.customer_id,
          name: c.customer_name,
          case_id: c.id,
        })),
      );
    const isCustomer =
      path[0] === "customer-requests" || path[0] === "incident-customer";
    const cookie = request.headers.get("cookie") ?? "";
    const token = cookie
      .split(";")
      .map((c) => c.trim())
      .find((c) =>
        c.startsWith(`${isCustomer ? "b2c_customer" : "b2c_employee"}=`),
      )
      ?.split("=")[1];
    assert(token, "SESSION_REQUIRED", "Selectează un rol demo.", 401);
    const session = await env.DB.prepare(
      "SELECT role,customer_id,expires_at FROM b2c_demo_sessions WHERE id = ? AND owner_id = ?",
    )
      .bind(token, owner)
      .first<{ role: Role; customer_id: string; expires_at: string }>();
    assert(
      session && Date.parse(session.expires_at) > Date.now(),
      "SESSION_EXPIRED",
      "Sesiunea demo a expirat.",
      401,
    );
    const actor: Actor = {
      id: `${owner}:${session.role}`,
      role: session.role,
      customer_id: session.customer_id,
    };
    const engine = new Engine(store, owner, actor, env);
    const body = async () => {
      assert(
        Number(request.headers.get("content-length") ?? 0) < 50000,
        "PAYLOAD_TOO_LARGE",
        "Cererea este prea mare.",
        413,
      );
      return request.json();
    };
    const key = request.headers.get("Idempotency-Key") ?? "";
    if (path[0] === "incident-customer") {
      engine.authorize(["DEMO_CUSTOMER"]);
      return json(
        await incidentCustomerList(
          new IncidentStore(env.DB),
          owner,
          actor.customer_id!,
        ),
      );
    }
    if (path[0] === "customer-requests") {
      engine.authorize(["DEMO_CUSTOMER"]);
      const cases = (await store.list(owner)).filter(
        (c) => c.customer_id === actor.customer_id,
      );
      if (method === "GET")
        return json(
          cases.map((c) => ({
            id: c.id,
            customer_id: c.customer_id,
            customer_name: c.customer_name,
            version: c.version,
            status: c.status,
            transaction: c.transaction,
            card_last4: c.card_last4,
            requests: c.requests,
          })),
        );
      if (method === "POST" && path[2] === "responses") {
        const incidentStore = new IncidentStore(env.DB);
        const incident = (await incidentStore.list(owner)).find(
          (c) =>
            c.customer_id === actor.customer_id &&
            c.requests.some((r) => r.id === path[1]),
        );
        if (incident) {
          const result = await new IncidentService(
            incidentStore,
            owner,
            actor,
            env,
          ).respond(path[1], await body(), key);
          await dispatchTask(() =>
            new InvestigationOrchestrator(incidentStore, env).execute(
              owner,
              result.job_id,
            ),
          );
          return json(result, 202);
        }
        const c = cases.find((c) => c.requests.some((r) => r.id === path[1]));
        assert(c, "NOT_FOUND", "Cererea nu există.", 404);
        return json(await engine.respond(c.id, path[1], await body(), key));
      }
    }
    engine.authorize(["B2C_AGENT", "B2C_SUPERVISOR"]);
    if (path[0] === "incidents")
      return await incidentsApi(
        request,
        env.DB,
        owner,
        actor,
        env,
        await store.list(owner),
      );
    if (path[0] === "frontdoor")
      return await frontDoorApi(
        request,
        env.DB,
        env.PROFILE_ENCRYPTION_KEY ?? "",
        owner,
        actor,
        env,
        () => store.list(owner),
      );
    if (path[0] === "session" && method === "GET")
      return json({
        role: actor.role,
        mode: env.LLM_ENDPOINT ? "LLM configurat" : "Motor demo determinist",
      });
    if (path.join("/") === "demo/reset" && method === "POST") {
      engine.authorize(["B2C_SUPERVISOR"]);
      assert(key, "IDEMPOTENCY_REQUIRED", "Lipsește Idempotency-Key.");
      const exists = await env.DB.prepare(
        "SELECT id FROM b2c_demo_sessions WHERE id = ? AND owner_id = ?",
      )
        .bind(`RESET:${key}`, owner)
        .first();
      if (!exists) {
        await store.reset(owner);
        await env.DB.prepare(
          "INSERT INTO b2c_demo_sessions (id,owner_id,role,expires_at) VALUES (?,?,?,?)",
        )
          .bind(`RESET:${key}`, owner, "RESET", "9999-01-01")
          .run();
      }
      return json({ reset: true });
    }
    if (path[0] === "disputes") {
      if (path.length === 1 && method === "GET")
        return json(
          (await store.list(owner)).map((c) => ({ ...c, processed: {} })),
        );
      const id = path[1];
      const c = await store.get(owner, id);
      if (path.length === 2 && method === "GET")
        return json({ ...c, processed: {} });
      if (path[2] === "investigations" && method === "POST")
        return json(
          await engine.investigate(
            id,
            mutationSchema
              .extend({ recover_demo_fault: z.boolean().optional() })
              .parse(await body()),
            key,
          ),
          201,
        );
      if (path[2] === "approvals" && method === "POST")
        return json(await engine.approve(id, await body(), key));
      if (path[2] === "customer-requests" && method === "GET")
        return json(c.requests);
      if (path[2] === "audit" && method === "GET") return json(c.audit);
      if (path[2] === "events" && method === "GET") {
        const since = url.searchParams.get("after");
        const index = since
          ? c.audit.findIndex((e) => e.event_id === since)
          : -1;
        return json({
          version: c.version,
          status: c.status,
          events: c.audit.slice(index + 1),
          investigation: c.investigations.at(-1),
        });
      }
    }
    if (path[0] === "investigations" && method === "GET") {
      const run = (await store.list(owner))
        .flatMap((c) => c.investigations)
        .find((r) => r.id === path[1]);
      if (!run) {
        const incidentRun = await new IncidentStore(env.DB).run(owner, path[1]);
        assert(incidentRun, "NOT_FOUND", "Investigația nu există.", 404);
        return json(incidentRun);
      }
      assert(run, "NOT_FOUND", "Investigația nu există.", 404);
      return json(run);
    }
    if (path[0] === "analytics" && method === "GET") {
      const cases = await store.list(owner);
      const runs = cases.flatMap((c) => c.investigations);
      const complete = runs.filter((r) => r.status === "COMPLETED");
      const current = cases.filter(
        (c) => c.investigations.at(-1)?.status === "COMPLETED",
      );
      const findings = complete.flatMap((r) => r.findings);
      return json({
        total: cases.length,
        payment_incidents: await incidentMetrics(
          new IncidentStore(env.DB),
          owner,
        ),
        needs_info: cases.filter((c) => c.status === "AWAITING_APPROVAL")
          .length,
        awaiting_customer: cases.filter((c) => c.status === "AWAITING_CUSTOMER")
          .length,
        ready: cases.filter((c) => c.status === "READY_FOR_REVIEW").length,
        escalated: cases.filter((c) => c.status === "ESCALATED").length,
        closed: cases.filter((c) => c.status === "CLOSED_DEMO").length,
        runs: runs.length,
        avg_runtime_ms: runs.length
          ? Math.round(
              runs.reduce((n, r) => n + (r.duration_ms ?? 0), 0) / runs.length,
            )
          : null,
        avg_tools: runs.length
          ? Number(
              (
                runs.reduce((n, r) => n + r.calls.length, 0) / runs.length
              ).toFixed(1),
            )
          : null,
        routing_accuracy: current.length
          ? Math.round(
              (current.filter(
                (c) =>
                  c.investigations.at(-1)?.suggested_route === c.expected_route,
              ).length /
                current.length) *
                100,
            )
          : null,
        grounding: findings.length
          ? Math.round(
              (findings.filter((f) => f.evidence_refs.length).length /
                findings.length) *
                100,
            )
          : null,
        failed: runs.filter((r) => r.status === "FAILED").length,
      });
    }
    return json({ error: "NOT_FOUND", message: "Endpoint inexistent." }, 404);
  } catch (error) {
    if (error instanceof DomainError)
      return json({ error: error.code, message: error.message }, error.status);
    if (error instanceof z.ZodError)
      return json(
        {
          error: "VALIDATION_ERROR",
          message: "Date invalide.",
          details: error.flatten(),
        },
        400,
      );
    console.error(
      "B2C API failure",
      error instanceof Error ? error.message : error,
    );
    return json(
      {
        error: "INTERNAL_ERROR",
        message:
          "Operațiunea nu a putut fi finalizată. Reîncarcă și încearcă din nou.",
      },
      500,
    );
  }
}
