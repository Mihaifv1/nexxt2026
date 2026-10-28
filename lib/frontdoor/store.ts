import { assert, now, uid } from "../domain.ts";
import type { DisputeCase } from "../domain.ts";
import type { CustomerProfile, Appointment } from "./domain.ts";
import { encrypt, decrypt } from "./crypto.ts";
export function newProfile(
  c: Pick<DisputeCase, "customer_id" | "customer_name" | "id">,
): CustomerProfile {
  const time = now();
  return {
    id: c.customer_id,
    name: c.customer_name,
    linked_case_id: c.id,
    version: 1,
    updated_at: time,
    fields: {
      full_name: {
        key: "full_name",
        value: c.customer_name,
        source_id: "SYNTHETIC-CUSTOMER-" + c.customer_id,
        source_type: "SYNTHETIC_IDENTITY",
        verified: "SYNTHETIC_VERIFIED",
        updated_at: time,
      },
    },
    field_history: [],
    proposals: [],
    documents: [],
    messages: [],
    consents: [
      {
        id: uid("CONSENT"),
        field_keys: ["full_name"],
        purpose: "INTAKE",
        granted: true,
        timestamp: time,
        actor: "synthetic-fixture",
      },
    ],
    goal: "UNKNOWN",
    goals: [],
    agent_steps: [],
    evaluations: [],
    appointments: [],
    audit: [],
    processed: {},
    data_classification: "SYNTHETIC",
  };
}
export class ProfileStore {
  constructor(
    public db: D1Database,
    public secret: string,
  ) {}
  async list(owner: string) {
    const rows = await this.db
      .prepare(
        "SELECT data FROM b2c_customer_profiles WHERE owner_id = ? ORDER BY id",
      )
      .bind(owner)
      .all<{ data: string }>();
    return Promise.all(
      rows.results.map((r) =>
        decrypt<CustomerProfile>(r.data, this.secret, owner),
      ),
    );
  }
  async get(owner: string, id: string) {
    const r = await this.db
      .prepare(
        "SELECT data FROM b2c_customer_profiles WHERE id = ? AND owner_id = ?",
      )
      .bind(`${owner}:${id}`, owner)
      .first<{ data: string }>();
    assert(r, "NOT_FOUND", "Profilul nu există.", 404);
    return decrypt<CustomerProfile>(r.data, this.secret, owner);
  }
  async bootstrap(owner: string, cases: DisputeCase[]) {
    for (const c of cases) {
      const p = newProfile(c);
      await this.db
        .prepare(
          "INSERT OR IGNORE INTO b2c_customer_profiles (id,owner_id,version,data,last_mutation) VALUES (?,?,?,?,?)",
        )
        .bind(
          `${owner}:${p.id}`,
          owner,
          1,
          await encrypt(p, this.secret, owner),
          uid("SEED"),
        )
        .run();
    }
  }
  async save(
    owner: string,
    p: CustomerProfile,
    expected: number,
    booking?: { add?: Appointment; remove?: Appointment },
  ) {
    const previous = await this.get(owner,p.id);
    assert(previous.version===expected,'VERSION_CONFLICT','Profilul a fost actualizat. Reîncarcă și repetă acțiunea.',409);
    const persistedEvents = new Set(previous.audit.map(e=>e.event_id));
    p.version = expected + 1;
    p.updated_at = now();
    const mutation = uid("PROFILE-MUT");
    const id = `${owner}:${p.id}`;
    const batch = [
      this.db
        .prepare(
          "UPDATE b2c_customer_profiles SET version = ?,data = ?,last_mutation = ? WHERE id = ? AND owner_id = ? AND version = ?",
        )
        .bind(
          p.version,
          await encrypt(p, this.secret, owner),
          mutation,
          id,
          owner,
          expected,
        ),
    ];
    for (const e of p.audit.filter(e=>!persistedEvents.has(e.event_id)))
      batch.push(
        this.db
          .prepare(
            "INSERT OR IGNORE INTO b2c_audit_events (event_id,case_id,owner_id,timestamp,data) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM b2c_customer_profiles WHERE id = ? AND last_mutation = ?)",
          )
          .bind(
            e.event_id,
            p.id,
            owner,
            e.timestamp,
            JSON.stringify(e),
            id,
            mutation,
          ),
      );
    if (booking?.add) {
      const a = booking.add;
      batch.push(
        this.db
          .prepare(
            "INSERT INTO b2c_branch_bookings (id,owner_id,customer_id,slot_id) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM b2c_customer_profiles WHERE id = ? AND last_mutation = ?)",
          )
          .bind(`${owner}:${a.slot_id}`, owner, p.id, a.slot_id, id, mutation),
      );
    }
    if (booking?.remove)
      batch.push(
        this.db
          .prepare(
            "DELETE FROM b2c_branch_bookings WHERE id = ? AND customer_id = ? AND EXISTS (SELECT 1 FROM b2c_customer_profiles WHERE id = ? AND last_mutation = ?)",
          )
          .bind(`${owner}:${booking.remove.slot_id}`, p.id, id, mutation),
      );
    let result;
    try {
      result = await this.db.batch(batch);
    } catch (e) {
      if (
        booking?.add &&
        /UNIQUE|duplicate key/i.test(e instanceof Error ? e.message : String(e))
      )
        assert(
          false,
          "SLOT_UNAVAILABLE",
          "Intervalul tocmai a fost rezervat. Alege altul.",
          409,
        );
      throw e;
    }
    assert(
      result[0].meta.changes === 1,
      "VERSION_CONFLICT",
      "Profilul a fost actualizat. Reîncarcă și repetă acțiunea.",
      409,
    );
  }
  async occupied(owner: string) {
    return (
      await this.db
        .prepare("SELECT slot_id FROM b2c_branch_bookings WHERE owner_id = ?")
        .bind(owner)
        .all<{ slot_id: string }>()
    ).results.map((r) => r.slot_id);
  }
}
