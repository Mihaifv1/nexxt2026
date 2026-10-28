import { assert, now, type DisputeCase } from "../domain.ts";
import { ProfileStore, newProfile } from "../frontdoor/store.ts";
import { encrypt, decrypt } from "../frontdoor/crypto.ts";
import type { CustomerProfile } from "../frontdoor/domain.ts";
import { uuid } from "../incidents/domain.ts";
import { hash, type Case } from "./domain.ts";
export class OperationsStore {
  profiles: ProfileStore;
  constructor(
    public db: D1Database,
    public secret: string,
  ) {
    this.profiles = new ProfileStore(db, secret);
  }
  async bootstrap(owner: string, legacy: DisputeCase[]) {
    await this.profiles.bootstrap(owner, legacy);
    for (const c of legacy) await this.seedRecord(owner, c.customer_id);
  }
  async seedRecord(owner: string, customer: string) {
    await this.db
      .prepare(
        "INSERT OR IGNORE INTO b2c_operation_records (id,owner_id,customer_id,data) VALUES (?,?,?,?)",
      )
      .bind(
        owner + ":" + customer,
        owner,
        customer,
        JSON.stringify({
          customer_id: customer,
          synthetic: true,
          source: "NEXT-CRM-MOCK-v1",
          balance_minor: 1250000,
          monthly_income_minor: 650000,
          obligations_minor: 70000,
          existing_loan_balance_minor: 1800000,
          existing_installment_minor: 65000,
          fee: {
            reference: "FEE-DEMO-01",
            amount_minor: 1500,
            base_minor: 150000,
            rate: 0.01,
            rulebook: "tariff-demo-v1",
          },
          refund: {
            reference: "REF-DEMO-01",
            status: "PENDING",
            amount_minor: 8999,
          },
          recurring: [
            {
              merchant: "STREAM-DEMO",
              amount_minor: 3999,
              occurrences: 3,
              mandate: "MANDATE-DEMO-01",
            },
          ],
          restrictions: [],
          open_mandates: 1,
          observed_at: now(),
        }),
      )
      .run();
  }
  async records(owner: string, customer: string) {
    const r = await this.db
      .prepare(
        "SELECT data FROM b2c_operation_records WHERE owner_id=? AND customer_id=?",
      )
      .bind(owner, customer)
      .first<{ data: string }>();
    return r ? (JSON.parse(r.data) as Record<string, unknown>) : null;
  }
  async list(owner: string) {
    const r = await this.db
      .prepare(
        "SELECT data FROM b2c_workflow_cases WHERE owner_id=? ORDER BY id",
      )
      .bind(owner)
      .all<{ data: string }>();
    return Promise.all(
      r.results.map((r) => decrypt<Case>(r.data, this.secret, owner)),
    );
  }
  async maybe(owner: string, id: string) {
    const r = await this.db
      .prepare("SELECT data FROM b2c_workflow_cases WHERE id=? AND owner_id=?")
      .bind(id, owner)
      .first<{ data: string }>();
    return r ? decrypt<Case>(r.data, this.secret, owner) : null;
  }
  async get(owner: string, id: string) {
    const c = await this.maybe(owner, id);
    assert(c, "NOT_FOUND", "Cazul nu există.", 404);
    return c;
  }
  async create(owner: string, c: Case, newCustomer?: CustomerProfile) {
    const mutation = uuid();
    const sql: D1PreparedStatement[] = [
      this.db
        .prepare(
          "INSERT INTO b2c_workflow_cases (id,owner_id,version,data,last_mutation) VALUES (?,?,?,?,?)",
        )
        .bind(c.id, owner, 1, await encrypt(c, this.secret, owner), mutation),
    ];
    if (newCustomer)
      sql.push(
        this.db
          .prepare(
            "INSERT INTO b2c_customer_profiles (id,owner_id,version,data,last_mutation) VALUES (?,?,?,?,?)",
          )
          .bind(
            owner + ":" + newCustomer.id,
            owner,
            1,
            await encrypt(newCustomer, this.secret, owner),
            mutation,
          ),
      );
    for (const e of c.audit)
      sql.push(
        this.db
          .prepare(
            "INSERT INTO b2c_audit_events (event_id,case_id,owner_id,timestamp,data) VALUES (?,?,?,?,?)",
          )
          .bind(e.event_id, c.id, owner, e.timestamp, JSON.stringify(e)),
      );
    await this.db.batch(sql);
    if (newCustomer) await this.seedRecord(owner, newCustomer.id);
  }
  async save(
    owner: string,
    c: Case,
    expected: number,
    profile?: CustomerProfile,
  ) {
    const previous = await this.get(owner, c.id);
    assert(
      previous.version === expected,
      "VERSION_CONFLICT",
      "Cazul a fost modificat. Reîncarcă dosarul.",
      409,
    );
    const oldProfile = profile
      ? await this.profiles.get(owner, profile.id)
      : null;
    if (profile)
      assert(
        oldProfile!.version === profile.version,
        "PROFILE_CHANGED",
        "Profilul a fost modificat. Reia analiza.",
        409,
      );
    const mutation = uuid();
    c.version = expected + 1;
    c.updated_at = now();
    const sql: D1PreparedStatement[] = [
      this.db
        .prepare(
          "UPDATE b2c_workflow_cases SET version=?,data=?,last_mutation=? WHERE id=? AND owner_id=? AND version=?" +
            (profile
              ? " AND EXISTS (SELECT 1 FROM b2c_customer_profiles WHERE id=? AND owner_id=? AND version=?)"
              : ""),
        )
        .bind(
          c.version,
          await encrypt(c, this.secret, owner),
          mutation,
          c.id,
          owner,
          expected,
          ...(profile
            ? [owner + ":" + profile.id, owner, profile.version]
            : []),
        ),
    ];
    if (profile) {
      profile.version++;
      profile.updated_at = now();
      sql.push(
        this.db
          .prepare(
            "UPDATE b2c_customer_profiles SET version=?,data=?,last_mutation=? WHERE id=? AND owner_id=? AND version=? AND EXISTS (SELECT 1 FROM b2c_workflow_cases WHERE id=? AND last_mutation=?)",
          )
          .bind(
            profile.version,
            await encrypt(profile, this.secret, owner),
            mutation,
            owner + ":" + profile.id,
            owner,
            profile.version - 1,
            c.id,
            mutation,
          ),
      );
    }
    const known = new Set(previous.audit.map((e) => e.event_id));
    const oldEvents = new Set(oldProfile?.audit.map((e) => e.event_id) ?? []);
    const events = [
      ...c.audit.filter((e) => !known.has(e.event_id)),
      ...(profile?.audit.filter((e) => !oldEvents.has(e.event_id)) ?? []),
    ];
    for (const e of events)
      sql.push(
        this.db
          .prepare(
            "INSERT OR IGNORE INTO b2c_audit_events (event_id,case_id,owner_id,timestamp,data) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM b2c_workflow_cases WHERE id=? AND last_mutation=?)",
          )
          .bind(
            e.event_id,
            e.case_id,
            owner,
            e.timestamp,
            JSON.stringify(e),
            c.id,
            mutation,
          ),
      );
    const result = await this.db.batch(sql);
    assert(
      result[0].meta.changes === 1,
      "VERSION_CONFLICT",
      "Cazul sau profilul s-a modificat. Reia analiza.",
      409,
    );
  }
  async stableId(owner: string, key: string) {
    const h = await hash(owner + ":workflow:" + key);
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
  }
  newCustomer(id: string, name: string) {
    return newProfile({
      customer_id: id,
      customer_name: name,
      id: "NEXT-NEW-CUSTOMER",
    });
  }
}
