import {
  assert,
  uid,
  now,
  type DisputeCase,
  type AuditEvent,
} from "./domain.ts";
import { fixtures } from "./fixtures.ts";
export interface Store {
  list(owner: string): Promise<DisputeCase[]>;
  get(owner: string, id: string): Promise<DisputeCase>;
  save(owner: string, c: DisputeCase, version: number): Promise<void>;
  reset(owner: string): Promise<void>;
}
export class D1Store implements Store {
  constructor(public db: D1Database) {}
  async list(owner: string) {
    const r = await this.db
      .prepare(
        "SELECT data FROM b2c_dispute_cases WHERE owner_id = ? ORDER BY id",
      )
      .bind(owner)
      .all<{ data: string }>();
    return r.results.map((x) => JSON.parse(x.data) as DisputeCase);
  }
  async get(owner: string, id: string) {
    const row = await this.db
      .prepare(
        "SELECT data FROM b2c_dispute_cases WHERE owner_id = ? AND id = ?",
      )
      .bind(owner, `${owner}:${id}`)
      .first<{ data: string }>();
    assert(row, "NOT_FOUND", "Cazul nu există.", 404);
    return JSON.parse(row.data) as DisputeCase;
  }
  async save(owner: string, c: DisputeCase, version: number) {
    const previous = await this.get(owner,c.id);
    assert(previous.version===version,'VERSION_CONFLICT','Cazul a fost actualizat. Reîncarcă și repetă acțiunea.',409);
    const persistedEvents = new Set(previous.audit.map(e=>e.event_id));
    const mutation = uid("MUT");
    c.version = version + 1;
    c.updated_at = now();
    const sqls = [
      this.db
        .prepare(
          "UPDATE b2c_dispute_cases SET data = ?, version = ?, last_mutation = ? WHERE id = ? AND owner_id = ? AND version = ?",
        )
        .bind(
          JSON.stringify(c),
          c.version,
          mutation,
          `${owner}:${c.id}`,
          owner,
          version,
        ),
      ...c.audit.filter(e=>!persistedEvents.has(e.event_id)).map((e) =>
        this.db
          .prepare(
            "INSERT OR IGNORE INTO b2c_audit_events (event_id,case_id,owner_id,timestamp,data) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM b2c_dispute_cases WHERE id = ? AND last_mutation = ?)",
          )
          .bind(
            e.event_id,
            c.id,
            owner,
            e.timestamp,
            JSON.stringify(e),
            `${owner}:${c.id}`,
            mutation,
          ),
      ),
    ];
    const r = await this.db.batch(sqls);
    assert(
      r[0].meta.changes === 1,
      "VERSION_CONFLICT",
      "Cazul a fost actualizat. Reîncarcă și repetă acțiunea.",
      409,
    );
  }
  async reset(owner: string) {
    const old = await this.list(owner);
    const data = fixtures();
    const sqls = [
      this.db
        .prepare("DELETE FROM b2c_dispute_cases WHERE owner_id = ?")
        .bind(owner),
    ];
    for (const c of data) {
      const previous = old.find((x) => x.id === c.id);
      c.version = (previous?.version ?? 0) + 1;
      c.audit = previous?.audit ?? c.audit;
      const event: AuditEvent = {
        event_id: uid("EVT"),
        case_id: c.id,
        actor_id: "supervisor",
        actor_type: "B2C_SUPERVISOR",
        event_type: "DEMO_RESET",
        timestamp: now(),
        payload: { synthetic: true },
        correlation_id: uid("RESET"),
      };
      if (previous) c.audit.push(event);
      sqls.push(
        this.db
          .prepare(
            "INSERT INTO b2c_dispute_cases (id,owner_id,version,data,last_mutation) VALUES (?,?,?,?,?)",
          )
          .bind(
            `${owner}:${c.id}`,
            owner,
            c.version,
            JSON.stringify(c),
            uid("SEED"),
          ),
      );
      for (const e of c.audit)
        sqls.push(
          this.db
            .prepare(
              "INSERT OR IGNORE INTO b2c_audit_events (event_id,case_id,owner_id,timestamp,data) VALUES (?,?,?,?,?)",
            )
            .bind(e.event_id, c.id, owner, e.timestamp, JSON.stringify(e)),
        );
    }
    await this.db.batch(sqls);
  }
}
export class MemoryStore implements Store {
  data = new Map<string, DisputeCase>();
  async list(owner: string) {
    return [...this.data.entries()]
      .filter(([k]) => k.startsWith(owner + ":"))
      .map(([, v]) => structuredClone(v));
  }
  async get(owner: string, id: string) {
    const c = this.data.get(`${owner}:${id}`);
    assert(c, "NOT_FOUND", "Caz inexistent.", 404);
    return structuredClone(c);
  }
  async save(owner: string, c: DisputeCase, version: number) {
    const current = await this.get(owner, c.id);
    assert(
      current.version === version,
      "VERSION_CONFLICT",
      "Versiune expirată.",
      409,
    );
    c.version = version + 1;
    c.updated_at = now();
    this.data.set(`${owner}:${c.id}`, structuredClone(c));
  }
  async reset(owner: string) {
    const previous = await this.list(owner);
    for (const c of fixtures()) {
      const old = previous.find((x) => x.id === c.id);
      if (old) {
        c.version = old.version + 1;
        c.audit = old.audit;
      }
      this.data.set(`${owner}:${c.id}`, c);
    }
  }
}
