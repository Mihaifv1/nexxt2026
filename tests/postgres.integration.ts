import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PostgresDatabase } from "../server/postgres.ts";
import { D1Store } from "../lib/store.ts";
import { Engine } from "../lib/engine.ts";
import { ProfileStore } from "../lib/frontdoor/store.ts";
import { FrontDoorEngine, branchSlots } from "../lib/frontdoor/engine.ts";
import { sampleStatement } from "../lib/frontdoor/extraction.ts";
const db = new PostgresDatabase(
  process.env.DATABASE_URL ??
    "postgresql://disputepilot:local-demo-only@127.0.0.1:5432/disputepilot",
);
test("PostgreSQL: all primary scenarios, persistence, CAS and immutable audit", async () => {
  try {
    await db.pool.query(
      await readFile(
        new URL("../db/postgres/001_initial.sql", import.meta.url),
        "utf8",
      ),
    );
    const owner = "integration-" + crypto.randomUUID();
    await db.pool.query(
      await readFile(
        new URL("../db/postgres/002_frontdoor.sql", import.meta.url),
        "utf8",
      ),
    );
    const store = new D1Store(db as unknown as D1Database);
    await store.reset(owner);
    const engine = new Engine(store, owner, {
      id: "employee",
      role: "B2C_AGENT",
    });
    let a = await store.get(owner, "DSP-2026-0187");
    await engine.investigate(
      a.id,
      { expected_case_version: a.version },
      "investigate",
    );
    a = await store.get(owner, a.id);
    assert.equal(a.status, "AWAITING_APPROVAL");
    await engine.approve(
      a.id,
      {
        expected_case_version: a.version,
        investigation_id: a.investigations[0].id,
        action: "APPROVE_CUSTOMER_QUESTIONS",
      },
      "approve",
    );
    a = await store.get(owner, a.id);
    const customer = new Engine(store, owner, {
      id: "customer",
      role: "DEMO_CUSTOMER",
      customer_id: a.customer_id,
    });
    await customer.respond(
      a.id,
      a.requests[0].id,
      {
        expected_case_version: a.version,
        answers: { recognition: "NO", authorization: "NO" },
      },
      "response",
    );
    a = await store.get(owner, a.id);
    assert.equal(a.status, "READY_FOR_REVIEW");
    assert.equal(a.investigations.length, 2);
    for (const [id, status, route] of [
      ["DSP-2026-0192", "READY_FOR_REVIEW", "POSSIBLE_DUPLICATE_REVIEW"],
      ["DSP-2026-0201", "ESCALATED", "CONFLICT_ESCALATE"],
    ]) {
      let c = await store.get(owner, id);
      await engine.investigate(id, { expected_case_version: c.version }, id);
      c = await store.get(owner, id);
      assert.equal(c.status, status);
      assert.equal(c.investigations[0].suggested_route, route);
    }
    const fresh = new D1Store(db as unknown as D1Database);
    assert.equal((await fresh.get(owner, a.id)).status, "READY_FOR_REVIEW");
    const c1 = await store.get(owner, a.id);
    const c2 = structuredClone(c1);
    const writes = await Promise.allSettled([
      store.save(owner, c1, c1.version),
      store.save(owner, c2, c2.version),
    ]);
    assert.equal(writes.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(writes.filter((r) => r.status === "rejected").length, 1);
    await assert.rejects(
      db.pool.query("DELETE FROM b2c_audit_events WHERE owner_id = $1", [
        owner,
      ]),
      /append-only/,
    );
    const audit = await db.pool.query(
      "SELECT COUNT(*)::integer AS count FROM b2c_audit_events WHERE owner_id=$1",
      [owner],
    );
    assert.ok(audit.rows[0].count > 50);
    const profiles = new ProfileStore(
      db as unknown as D1Database,
      "cd".repeat(32),
    );
    await profiles.bootstrap(owner, await store.list(owner));
    const frontdoor = new FrontDoorEngine(profiles, owner, {
      id: "operator",
      role: "B2C_AGENT",
    });
    let profile = await profiles.get(owner, "CUST-10482");
    await frontdoor.act(
      profile.id,
      {
        action: "INTAKE",
        text: sampleStatement,
        expected_version: profile.version,
      },
      "intake",
    );
    profile = await profiles.get(owner, profile.id);
    assert.equal(profile.goal, "CAR");
    await frontdoor.act(
      profile.id,
      {
        action: "CONFIRM_FIELDS",
        expected_version: profile.version,
        proposals: profile.proposals.map((x) => ({ id: x.id })),
        purposes: ["ELIGIBILITY", "BRANCH_HANDOFF"],
      },
      "confirm",
    );
    profile = await profiles.get(owner, profile.id);
    assert.equal(profile.fields.income_minor?.value, 1050000);
    await frontdoor.act(
      profile.id,
      {
        action: "CONSENT",
        expected_version: profile.version,
        field_keys: ["full_name"],
        purpose: "BRANCH_HANDOFF",
        granted: true,
      },
      "consent",
    );
    profile = await profiles.get(owner, profile.id);
    await frontdoor.act(
      profile.id,
      {
        action: "BOOK_APPOINTMENT",
        expected_version: profile.version,
        slot_id: branchSlots()[0].id,
      },
      "book",
    );
    profile = await profiles.get(owner, profile.id);
    assert.equal(profile.appointments.length, 1);
    const raw = await db.pool.query(
      "SELECT data FROM b2c_customer_profiles WHERE id=$1",
      [owner + ":" + profile.id],
    );
    assert.ok(!raw.rows[0].data.includes("Andreea"));
    console.log(
      "PostgreSQL encrypted canonical profile, intake confirmation and appointment passed.",
    );
    console.log(
      "PostgreSQL persisted",
      audit.rows[0].count,
      "immutable audit events.",
    );
  } finally {
    await db.pool.end();
  }
});
