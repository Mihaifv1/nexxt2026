import test from "node:test";
import assert from "node:assert/strict";
import { MemoryStore, D1Store } from "../lib/store.ts";
import { Engine } from "../lib/engine.ts";
import {
  DomainError,
  money,
  outputSchema,
  transition,
  validateGrounding,
} from "../lib/domain.ts";
import { evaluate } from "../lib/rules.ts";
import { SqliteD1 } from "./sqlite-d1.ts";
import { handleApi } from "../lib/api.ts";
import { classify } from "../lib/provider.ts";
const id = (n: number) => `DSP-2026-${String(n).padStart(4, "0")}`;
async function setup(sql = false) {
  const store = sql
    ? new D1Store(new SqliteD1() as unknown as D1Database)
    : new MemoryStore();
  await store.reset("test");
  return {
    store,
    engine: new Engine(store, "test", { id: "employee", role: "B2C_AGENT" }),
  };
}
test("monetary amounts use integer minor units and Romanian formatting", () => {
  assert.match(money(48990), /489,90/);
  assert.match(money(124900), /1.249,00/);
});
test("state machine rejects closing an open case", async () => {
  const { store } = await setup();
  const c = await store.get("test", id(187));
  assert.throws(() => transition(c, "CLOSED_DEMO"), DomainError);
});
test("unknown authentication is never a fraud finding", async () => {
  const { store, engine } = await setup();
  let c = await store.get("test", id(187));
  await engine.investigate(c.id, { expected_case_version: c.version }, "run");
  c = await store.get("test", c.id);
  assert.equal(c.status, "AWAITING_APPROVAL");
  assert.equal(c.requests.length, 0);
  assert.equal(c.investigations[0].questions.length, 2);
  assert.ok(c.investigations[0].rules.some((r) => r.rule_id === "DSP-003"));
  assert.ok(
    c.investigations[0].findings.every((f) => !f.claim.includes("fraudă")),
  );
});
test("all factual references must exist and invalid JSON is rejected", () => {
  assert.throws(() => outputSchema.parse({ suggested_route: "REFUND_NOW" }));
  assert.throws(() =>
    validateGrounding(
      {
        findings: [{ claim: "unsupported", evidence_refs: ["missing"] }],
        unknowns: [],
        questions: [],
        suggested_route: "MANUAL_REVIEW",
        next_action: "HUMAN_REVIEW",
      },
      [],
    ),
  );
});
test("scenario A: real persisted approval, customer response and reinvestigation", async () => {
  const { store, engine } = await setup(true);
  let c = await store.get("test", id(187));
  await engine.investigate(
    c.id,
    { expected_case_version: c.version },
    "investigate",
  );
  c = await store.get("test", c.id);
  const body = {
    expected_case_version: c.version,
    investigation_id: c.investigations[0].id,
    action: "APPROVE_CUSTOMER_QUESTIONS",
    approved_question_ids: ["Q1", "Q2"],
    comment: "Validat",
  };
  await engine.approve(c.id, body, "approve");
  await engine.approve(c.id, body, "approve");
  c = await store.get("test", c.id);
  assert.equal(c.requests.length, 1);
  assert.equal(c.status, "AWAITING_CUSTOMER");
  const customer = new Engine(store, "test", {
    id: "customer",
    role: "DEMO_CUSTOMER",
    customer_id: c.customer_id,
  });
  const response = {
    expected_case_version: c.version,
    answers: { recognition: "NO", authorization: "NO" },
  };
  await customer.respond(c.id, c.requests[0].id, response, "response");
  await customer.respond(c.id, c.requests[0].id, response, "response");
  c = await store.get("test", c.id);
  assert.equal(c.status, "READY_FOR_REVIEW");
  assert.equal(c.investigations.length, 2);
  assert.equal(c.investigations[1].suggested_route, "UNRECOGNIZED_CNP");
  assert.ok(c.audit.some((e) => e.event_type === "CUSTOMER_RESPONDED"));
  assert.ok(c.audit.some((e) => e.event_type === "REINVESTIGATION_STARTED"));
  await engine.approve(
    c.id,
    {
      expected_case_version: c.version,
      investigation_id: c.investigations[1].id,
      action: "APPROVE_ROUTE",
    },
    "route",
  );
  c = await store.get("test", c.id);
  const supervisor = new Engine(store, "test", {
    id: "supervisor",
    role: "B2C_SUPERVISOR",
  });
  await supervisor.approve(
    c.id,
    {
      expected_case_version: c.version,
      investigation_id: c.investigations[1].id,
      action: "CLOSE_DEMO",
    },
    "close",
  );
  assert.equal((await store.get("test", c.id)).status, "CLOSED_DEMO");
});
test("scenario B: duplicate branch calls only relevant tools and verifies distinct settlements", async () => {
  const { store, engine } = await setup();
  let c = await store.get("test", id(192));
  await engine.investigate(c.id, { expected_case_version: c.version }, "dup");
  c = await store.get("test", c.id);
  assert.equal(c.status, "READY_FOR_REVIEW");
  const r = c.investigations[0];
  assert.equal(r.suggested_route, "POSSIBLE_DUPLICATE_REVIEW");
  assert.ok(r.calls.some((t) => t.name === "find_possible_duplicates"));
  assert.ok(!r.calls.some((t) => t.name === "get_card_status"));
});
test("two authorizations or one settlement never prove a duplicate", async () => {
  const { store, engine } = await setup();
  let c = await store.get("test", id(206));
  await engine.investigate(c.id, { expected_case_version: c.version }, "auth");
  c = await store.get("test", c.id);
  assert.equal(
    c.investigations[0].suggested_route,
    "INSUFFICIENT_DUPLICATE_EVIDENCE",
  );
  c.duplicate_candidates[1].reference = c.duplicate_candidates[0].reference;
  c.duplicate_candidates[1].status = "SETTLED";
  assert.equal(evaluate(c).route, "INSUFFICIENT_DUPLICATE_EVIDENCE");
});
test("scenario C: conflicting evidence escalates", async () => {
  const { store, engine } = await setup();
  let c = await store.get("test", id(201));
  await engine.investigate(
    c.id,
    { expected_case_version: c.version },
    "conflict",
  );
  c = await store.get("test", c.id);
  assert.equal(c.status, "ESCALATED");
  assert.equal(c.investigations[0].suggested_route, "CONFLICT_ESCALATE");
});
for (const [number, route] of [
  [204, "PRIORITY_SECURITY_REVIEW"],
  [205, "ESCALATE_DATA_ISSUE"],
] as const)
  test(`scenario ${number}: ${route}`, async () => {
    const { store, engine } = await setup();
    let c = await store.get("test", id(number));
    await engine.investigate(c.id, { expected_case_version: c.version }, "run");
    c = await store.get("test", c.id);
    assert.equal(c.status, "ESCALATED");
    assert.equal(c.investigations[0].suggested_route, route);
  });
for (const number of [209, 210])
  test(`failure fixture ${number} records controlled error and supports recovery`, async () => {
    const { store, engine } = await setup();
    let c = await store.get("test", id(number));
    await engine.investigate(c.id, { expected_case_version: c.version }, "run");
    c = await store.get("test", c.id);
    assert.equal(c.status, "ESCALATED");
    assert.equal(c.investigations[0].status, "FAILED");
    assert.ok(c.audit.some((e) => e.event_type === "INVESTIGATION_FAILED"));
    const supervisor = new Engine(store, "test", {
      id: "supervisor",
      role: "B2C_SUPERVISOR",
    });
    await supervisor.investigate(
      c.id,
      { expected_case_version: c.version, recover_demo_fault: true },
      "recover",
    );
    assert.equal((await store.get("test", c.id)).status, "AWAITING_APPROVAL");
  });
test("prompt injection remains untrusted statement data", async () => {
  const { store, engine } = await setup();
  let c = await store.get("test", id(211));
  await engine.investigate(
    c.id,
    { expected_case_version: c.version },
    "injection",
  );
  c = await store.get("test", c.id);
  assert.equal(c.status, "AWAITING_APPROVAL");
  assert.equal(c.requests.length, 0);
  assert.equal(c.approvals.length, 0);
  assert.ok(c.investigations[0].rules.some((r) => r.rule_id === "DSP-010"));
});
test("approval gate rejects nonexistent question IDs and stale versions", async () => {
  const { store, engine } = await setup();
  let c = await store.get("test", id(187));
  await engine.investigate(c.id, { expected_case_version: c.version }, "run");
  c = await store.get("test", c.id);
  await assert.rejects(
    engine.approve(
      c.id,
      {
        expected_case_version: c.version,
        investigation_id: c.investigations[0].id,
        action: "APPROVE_CUSTOMER_QUESTIONS",
        approved_question_ids: ["made-up"],
      },
      "bad",
    ),
    DomainError,
  );
  await assert.rejects(
    engine.investigate(c.id, { expected_case_version: 1 }, "stale"),
    (e: unknown) => e instanceof DomainError && e.status === 409,
  );
  assert.equal((await store.get("test", c.id)).requests.length, 0);
});
test("RBAC blocks customer investigation and agent closure", async () => {
  const { store, engine } = await setup();
  const c = await store.get("test", id(187));
  const customer = new Engine(store, "test", {
    id: "customer",
    role: "DEMO_CUSTOMER",
    customer_id: c.customer_id,
  });
  await assert.rejects(
    customer.investigate(c.id, { expected_case_version: 1 }, "run"),
    (e: unknown) => e instanceof DomainError && e.status === 403,
  );
  await engine.investigate(c.id, { expected_case_version: 1 }, "run");
  const updated = await store.get("test", c.id);
  await assert.rejects(
    engine.approve(
      c.id,
      {
        expected_case_version: updated.version,
        investigation_id: updated.investigations[0].id,
        action: "CLOSE_DEMO",
      },
      "close",
    ),
    (e: unknown) => e instanceof DomainError && e.status === 403,
  );
});
test("expired requests reject late answers and incomplete responses are rejected", async () => {
  const { store, engine } = await setup();
  let c = await store.get("test", id(208));
  await engine.investigate(c.id, { expected_case_version: c.version }, "run");
  c = await store.get("test", c.id);
  await engine.approve(
    c.id,
    {
      expected_case_version: c.version,
      investigation_id: c.investigations[0].id,
      action: "APPROVE_CUSTOMER_QUESTIONS",
    },
    "approve",
  );
  c = await store.get("test", c.id);
  const customer = new Engine(store, "test", {
    id: "customer",
    role: "DEMO_CUSTOMER",
    customer_id: c.customer_id,
  });
  await assert.rejects(
    customer.respond(
      c.id,
      c.requests[0].id,
      {
        expected_case_version: c.version,
        answers: { recognition: "NO", authorization: "NO" },
      },
      "late",
    ),
    (e: unknown) => e instanceof DomainError && e.code === "STALE_REQUEST",
  );
  assert.equal((await store.get("test", c.id)).requests[0].status, "PENDING");
});
test("CAS repository rejects competing writes without appending orphan audit events", async () => {
  const { store } = await setup(true);
  const first = await store.get("test", id(187));
  const second = structuredClone(first);
  await store.save("test", first, first.version);
  await assert.rejects(store.save("test", second, second.version), DomainError);
  assert.equal((await store.get("test", first.id)).version, 2);
});
test("demo reset restores fixtures and preserves previous audit", async () => {
  const { store, engine } = await setup(true);
  let c = await store.get("test", id(192));
  await engine.investigate(c.id, { expected_case_version: c.version }, "run");
  c = await store.get("test", c.id);
  const events = c.audit.map((e) => e.event_id);
  await store.reset("test");
  const reset = await store.get("test", c.id);
  assert.equal(reset.status, "OPEN");
  assert.equal(reset.investigations.length, 0);
  assert.ok(events.every((id) => reset.audit.some((e) => e.event_id === id)));
  assert.ok(reset.audit.some((e) => e.event_type === "DEMO_RESET"));
  assert.ok(reset.version > c.version);
});
test("HTTP API authentication, role cookies, persistence and customer isolation", async () => {
  const DB = new SqliteD1() as unknown as D1Database;
  const send = (
    path: string,
    method = "GET",
    body?: unknown,
    cookie = "",
    auth = true,
  ) =>
    handleApi(
      new Request("http://localhost/api/b2c/" + path, {
        method,
        headers: {
          ...(auth ? { "oai-authenticated-user-id": "owner" } : {}),
          "Content-Type": "application/json",
          Cookie: cookie,
          "Idempotency-Key": crypto.randomUUID(),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      { DB },
    );
  assert.equal(
    (await send("disputes", "GET", undefined, "", false)).status,
    401,
  );
  const session = await send("session", "POST", { role: "B2C_AGENT" });
  assert.equal(session.status, 200);
  const cookie = session.headers.get("set-cookie")!.split(";")[0];
  const response = await send("disputes", "GET", undefined, cookie);
  assert.equal(response.status, 200);
  assert.equal(((await response.json()) as unknown[]).length, 13);
  const customer = await send("session", "POST", {
    role: "DEMO_CUSTOMER",
    customer_id: "CUST-10482",
  });
  const customerCookie = customer.headers.get("set-cookie")!.split(";")[0];
  const own = await send("customer-requests", "GET", undefined, customerCookie);
  assert.equal(((await own.json()) as unknown[]).length, 1);
  const forbidden = await send("demo/reset", "POST", {}, cookie);
  assert.equal(forbidden.status, 403);
  const isolated = await handleApi(
    new Request("http://localhost/api/b2c/disputes", {
      headers: { "oai-authenticated-user-id": "other", Cookie: cookie },
    }),
    { DB },
  );
  assert.equal(isolated.status, 401);
});

test("incomplete answers do not mutate the request", async () => {
  const { store, engine } = await setup();
  let c = await store.get("test", id(187));
  await engine.investigate(c.id, { expected_case_version: c.version }, "run");
  c = await store.get("test", c.id);
  await engine.approve(
    c.id,
    {
      expected_case_version: c.version,
      investigation_id: c.investigations[0].id,
      action: "APPROVE_CUSTOMER_QUESTIONS",
    },
    "approve",
  );
  c = await store.get("test", c.id);
  const customer = new Engine(store, "test", {
    id: "customer",
    role: "DEMO_CUSTOMER",
    customer_id: c.customer_id,
  });
  await assert.rejects(
    customer.respond(
      c.id,
      c.requests[0].id,
      { expected_case_version: c.version, answers: { recognition: "NO" } },
      "partial",
    ),
    (e: unknown) =>
      e instanceof DomainError && e.code === "INCOMPLETE_RESPONSE",
  );
  assert.equal((await store.get("test", c.id)).version, c.version);
});
test("request revision executes a new investigation without sending messages", async () => {
  const { store, engine } = await setup();
  let c = await store.get("test", id(187));
  await engine.investigate(c.id, { expected_case_version: c.version }, "run");
  c = await store.get("test", c.id);
  await engine.approve(
    c.id,
    {
      expected_case_version: c.version,
      investigation_id: c.investigations[0].id,
      action: "REQUEST_REVISION",
    },
    "revise",
  );
  c = await store.get("test", c.id);
  assert.equal(c.investigations.length, 2);
  assert.equal(c.status, "AWAITING_APPROVAL");
  assert.equal(c.requests.length, 0);
});
test("LLM unavailable is recorded as a failure without demo success fallback", async () => {
  const { store, engine } = await setup();
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({ error: "unavailable" }, { status: 503 });
  try {
    engine.config = {
      LLM_ENDPOINT: "https://example.test/completions",
      LLM_MODEL: "test",
    };
    let c = await store.get("test", id(187));
    await engine.investigate(c.id, { expected_case_version: c.version }, "llm");
    c = await store.get("test", c.id);
    assert.equal(c.status, "ESCALATED");
    assert.equal(c.investigations[0].status, "FAILED");
    assert.match(c.investigations[0].error ?? "", /503/);
    assert.equal(c.requests.length, 0);
  } finally {
    globalThis.fetch = original;
  }
});
test("reusing an idempotency key with a changed payload is rejected", async () => {
  const { store, engine } = await setup();
  const c = await store.get("test", id(192));
  const first = await engine.investigate(
    c.id,
    { expected_case_version: c.version },
    "repeat",
  );
  const replay = await engine.investigate(
    c.id,
    { expected_case_version: c.version },
    "repeat",
  );
  assert.deepEqual(first, replay);
  await assert.rejects(
    engine.investigate(c.id, { expected_case_version: 999 }, "repeat"),
    (e: unknown) =>
      e instanceof DomainError && e.code === "IDEMPOTENCY_CONFLICT",
  );
  assert.equal((await store.get("test", c.id)).investigations.length, 1);
});
