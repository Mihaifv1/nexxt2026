import { assert, now, type AuditEvent } from "../domain.ts";
import { incidentFixtures, rulebooks } from "./fixtures.ts";
import {
  uuid,
  type BankRecord,
  type Incident,
  type Job,
  type Run,
} from "./domain.ts";
const tables = [
  "b2c_evidence",
  "b2c_investigation_runs",
  "b2c_tool_calls",
  "b2c_rule_evaluations",
  "b2c_action_proposals",
  "b2c_approvals",
  "b2c_customer_requests",
  "b2c_customer_responses",
  "b2c_case_events",
  "b2c_incident_artifacts",
] as const;
export class IncidentStore {
  constructor(public db: D1Database) {}
  async list(owner: string) {
    return (
      await this.db
        .prepare(
          "SELECT data FROM b2c_incidents WHERE owner_id = ? ORDER BY id",
        )
        .bind(owner)
        .all<{ data: string }>()
    ).results.map((r) => JSON.parse(r.data) as Incident);
  }
  async get(owner: string, id: string) {
    const row = await this.db
      .prepare("SELECT data FROM b2c_incidents WHERE id = ? AND owner_id = ?")
      .bind(id, owner)
      .first<{ data: string }>();
    assert(row, "NOT_FOUND", "Incidentul nu există.", 404);
    return JSON.parse(row.data) as Incident;
  }
  async bankRecords(owner: string, customer?: string) {
    const sql =
      "SELECT data FROM b2c_synthetic_payment_records WHERE owner_id = ?" +
      (customer ? " AND customer_id = ?" : "");
    const statement = this.db.prepare(sql);
    const rows = await (
      customer ? statement.bind(owner, customer) : statement.bind(owner)
    ).all<{ data: string }>();
    return rows.results.map((r) => JSON.parse(r.data) as BankRecord);
  }
  async bankRecord(owner: string, id: string | null, customer_id: string) {
    if (!id) return null;
    return (
      (await this.bankRecords(owner, customer_id)).find((r) => r.id === id) ??
      null
    );
  }
  async setFault(owner: string, record: BankRecord) {
    await this.db
      .prepare(
        "UPDATE b2c_synthetic_payment_records SET data = ? WHERE id = ? AND owner_id = ?",
      )
      .bind(JSON.stringify(record), `${owner}:${record.id}`, owner)
      .run();
  }
  async seed(owner: string, reset = false) {
    const data = incidentFixtures();
    const old = await this.list(owner);
    const sql: D1PreparedStatement[] = [];
    for (const r of data.records)
      sql.push(
        this.db
          .prepare(
            reset
              ? "INSERT INTO b2c_synthetic_payment_records (id,owner_id,customer_id,data) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data"
              : "INSERT OR IGNORE INTO b2c_synthetic_payment_records (id,owner_id,customer_id,data) VALUES (?,?,?,?)",
          )
          .bind(`${owner}:${r.id}`, owner, r.customer_id, JSON.stringify(r)),
      );
    for (const book of rulebooks)
      sql.push(
        this.db
          .prepare(
            "INSERT OR IGNORE INTO b2c_rulebook_versions (id,data) VALUES (?,?)",
          )
          .bind(book.id, JSON.stringify(book)),
      );
    for (const c of data.incidents) {
      const prior = old.find((x) => x.fixture_code === c.fixture_code);
      if (prior && !reset) continue;
      if (!prior) {
        const digest = Array.from(
          new Uint8Array(
            await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(
                owner + ":incident-fixture:" + c.fixture_code,
              ),
            ),
          ),
        )
          .map((x) => x.toString(16).padStart(2, "0"))
          .join("");
        c.id = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
      }
      if (prior) {
        c.id = prior.id;
        c.version = prior.version + 1;
        c.audit = prior.audit;
        c.processed = prior.processed;
      }
      const event: AuditEvent = {
        event_id: uuid(),
        case_id: c.id,
        actor_id: "demo-control",
        actor_type: "SYSTEM",
        event_type: prior ? "INCIDENT_DEMO_RESET" : "INCIDENT_CREATED",
        timestamp: now(),
        payload: { fixture_code: c.fixture_code, synthetic: true },
        correlation_id: uuid(),
      };
      c.audit.push(event);
      const mutation = uuid();
      sql.push(
        this.db
          .prepare(
            reset
              ? "INSERT INTO b2c_incidents (id,owner_id,version,data,last_mutation) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,data=excluded.data,last_mutation=excluded.last_mutation"
              : "INSERT OR IGNORE INTO b2c_incidents (id,owner_id,version,data,last_mutation) VALUES (?,?,?,?,?)",
          )
          .bind(c.id, owner, c.version, JSON.stringify(c), mutation),
      );
      sql.push(this.auditStatement(owner, c, event, mutation));
    }
    if (reset)
      sql.push(
        this.db
          .prepare(
            "UPDATE b2c_investigation_jobs SET status='FAILED', error='DEMO_RESET', updated_at=? WHERE owner_id=? AND status IN ('QUEUED','RUNNING') AND incident_id IN (" +
              data.incidents.map(() => "?").join(",") +
              ")",
          )
          .bind(now(), owner, ...data.incidents.map((c) => c.id)),
      );
    if (sql.length) await this.db.batch(sql);
  }
  async create(owner: string, c: Incident) {
    await this.db.batch([
      this.db
        .prepare(
          "INSERT INTO b2c_incidents (id,owner_id,version,data,last_mutation) VALUES (?,?,?,?,?)",
        )
        .bind(c.id, owner, c.version, JSON.stringify(c), uuid()),
      ...c.audit.map((e) => this.auditStatement(owner, c, e)),
    ]);
  }
  auditStatement(owner: string, c: Incident, e: AuditEvent, mutation?: string) {
    return mutation
      ? this.db
          .prepare(
            "INSERT OR IGNORE INTO b2c_audit_events (event_id,case_id,owner_id,timestamp,data) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM b2c_incidents WHERE id=? AND last_mutation=?)",
          )
          .bind(
            e.event_id,
            c.id,
            owner,
            e.timestamp,
            JSON.stringify(e),
            c.id,
            mutation,
          )
      : this.db
          .prepare(
            "INSERT OR IGNORE INTO b2c_audit_events (event_id,case_id,owner_id,timestamp,data) VALUES (?,?,?,?,?)",
          )
          .bind(e.event_id, c.id, owner, e.timestamp, JSON.stringify(e));
  }
  projection(c: Incident) {
    const result: Record<
      (typeof tables)[number],
      { id: string; run_id?: string; data: unknown }[]
    > = {
      b2c_evidence: c.evidence.map((e) => ({
        id: e.id,
        run_id: e.run_id,
        data: e,
      })),
      b2c_investigation_runs: c.runs.map((r) => ({
        id: r.id,
        run_id: r.id,
        data: r,
      })),
      b2c_tool_calls: c.runs.flatMap((r) =>
        r.calls.map((t) => ({ id: t.id, run_id: r.id, data: t })),
      ),
      b2c_rule_evaluations: c.runs.flatMap((r) =>
        r.rules.map((x) => ({ id: x.id, run_id: r.id, data: x })),
      ),
      b2c_action_proposals: c.runs.flatMap((r) =>
        r.proposed_actions.map((x) => ({ id: x.id, run_id: r.id, data: x })),
      ),
      b2c_approvals: c.approvals.map((a) => ({
        id: a.id,
        run_id: a.run_id,
        data: a,
      })),
      b2c_customer_requests: c.requests.map((r) => ({
        id: r.id,
        run_id: r.run_id,
        data: r,
      })),
      b2c_customer_responses: c.requests
        .filter((r) => r.answers)
        .map((r) => ({
          id: r.id,
          run_id: r.run_id,
          data: {
            request_id: r.id,
            answers: r.answers,
            attachment: r.attachment,
            answered_at: r.answered_at,
          },
        })),
      b2c_case_events: c.audit.map((e) => ({ id: e.event_id, data: e })),
      b2c_incident_artifacts: c.artifacts.map((a) => ({
        id: a.id,
        run_id: a.run_id,
        data: a,
      })),
    };
    return result;
  }
  async save(
    owner: string,
    c: Incident,
    expected: number,
    job?: Job,
    enqueue?: Job,
  ) {
    const old = await this.get(owner, c.id);
    assert(
      old.version === expected,
      "VERSION_CONFLICT",
      "Incidentul a fost modificat. Reîncarcă datele.",
      409,
    );
    if (job) {
      const lease = await this.getJob(owner, job.id);
      assert(
        lease.status === "RUNNING" &&
          lease.lock_token === job.lock_token &&
          old.active_job_id === job.id,
        "JOB_LEASE_LOST",
        "Rularea nu mai deține cazul.",
        409,
      );
    }
    const mutation = uuid();
    c.version = expected + 1;
    c.updated_at = now();
    const statements = [
      this.db
        .prepare(
          "UPDATE b2c_incidents SET data=?,version=?,last_mutation=? WHERE id=? AND owner_id=? AND version=?" +
            (job
              ? " AND EXISTS (SELECT 1 FROM b2c_investigation_jobs WHERE id=? AND lock_token=? AND status='RUNNING')"
              : ""),
        )
        .bind(
          JSON.stringify(c),
          c.version,
          mutation,
          c.id,
          owner,
          expected,
          ...(job ? [job.id, job.lock_token] : []),
        ),
    ];
    const oldEvents = new Set(old.audit.map((e) => e.event_id));
    for (const e of c.audit.filter((e) => !oldEvents.has(e.event_id)))
      statements.push(this.auditStatement(owner, c, e, mutation));
    const previous = this.projection(old),
      next = this.projection(c);
    for (const table of tables) {
      const byId = new Map(
        previous[table].map((r) => [r.id, JSON.stringify(r.data)]),
      );
      for (const row of next[table])
        if (byId.get(row.id) !== JSON.stringify(row.data))
          statements.push(
            this.db
              .prepare(
                `INSERT INTO ${table} (id,owner_id,incident_id,run_id,data) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM b2c_incidents WHERE id=? AND last_mutation=?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`,
              )
              .bind(
                row.id,
                owner,
                c.id,
                row.run_id ?? null,
                JSON.stringify(row.data),
                c.id,
                mutation,
              ),
          );
    }
    if (c.transaction_id && c.transaction_id !== old.transaction_id)
      statements.push(
        this.db
          .prepare(
            "INSERT OR IGNORE INTO b2c_incident_transactions (id,owner_id,incident_id,run_id,data) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM b2c_incidents WHERE id=? AND last_mutation=?)",
          )
          .bind(
            uuid(),
            owner,
            c.id,
            null,
            JSON.stringify({ transaction_id: c.transaction_id }),
            c.id,
            mutation,
          ),
      );
    if (enqueue)
      statements.push(
        this.db
          .prepare(
            "INSERT INTO b2c_investigation_jobs (id,owner_id,incident_id,run_id,status,attempts,lock_token,lease_until,created_at,updated_at,error,actor_id,actor_role) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM b2c_incidents WHERE id=? AND last_mutation=?)",
          )
          .bind(
            enqueue.id,
            owner,
            c.id,
            enqueue.run_id,
            "QUEUED",
            0,
            "",
            "1970-01-01T00:00:00Z",
            enqueue.created_at,
            enqueue.updated_at,
            null,
            enqueue.actor_id,
            enqueue.actor_role,
            c.id,
            mutation,
          ),
      );
    const result = await this.db.batch(statements);
    assert(
      result[0].meta.changes === 1,
      "VERSION_CONFLICT",
      "Incidentul a fost modificat.",
      409,
    );
    if (job)
      await this.db
        .prepare(
          "UPDATE b2c_investigation_jobs SET lease_until=?,updated_at=? WHERE id=? AND lock_token=? AND status='RUNNING'",
        )
        .bind(
          new Date(Date.now() + 60000).toISOString(),
          now(),
          job.id,
          job.lock_token,
        )
        .run();
  }
  async getJob(owner: string, id: string) {
    const row = await this.db
      .prepare("SELECT * FROM b2c_investigation_jobs WHERE id=? AND owner_id=?")
      .bind(id, owner)
      .first<Job>();
    assert(row, "NOT_FOUND", "Jobul nu există.", 404);
    return row;
  }
  async claim(owner: string, id: string) {
    const token = uuid();
    const result = await this.db
      .prepare(
        "UPDATE b2c_investigation_jobs SET status='RUNNING',attempts=attempts+1,lock_token=?,lease_until=?,updated_at=? WHERE id=? AND owner_id=? AND attempts<4 AND (status='QUEUED' OR (status='RUNNING' AND lease_until<?))",
      )
      .bind(
        token,
        new Date(Date.now() + 60000).toISOString(),
        now(),
        id,
        owner,
        now(),
      )
      .run();
    return result.meta.changes === 1 ? this.getJob(owner, id) : null;
  }
  async finish(job: Job, status: "COMPLETED" | "FAILED", error?: string) {
    await this.db
      .prepare(
        "UPDATE b2c_investigation_jobs SET status=?,error=?,updated_at=? WHERE id=? AND lock_token=? AND status='RUNNING'",
      )
      .bind(status, error ?? null, now(), job.id, job.lock_token)
      .run();
  }
  async pending(owner?: string) {
    const query =
      "SELECT * FROM b2c_investigation_jobs WHERE (status='QUEUED' OR (status='RUNNING' AND lease_until<?)) AND attempts<4" +
      (owner ? " AND owner_id=?" : "") +
      " ORDER BY created_at";
    const stmt = this.db.prepare(query);
    return (
      await (owner ? stmt.bind(now(), owner) : stmt.bind(now())).all<Job>()
    ).results;
  }
  async run(owner: string, id: string) {
    const row = await this.db
      .prepare(
        "SELECT data FROM b2c_investigation_runs WHERE id=? AND owner_id=?",
      )
      .bind(id, owner)
      .first<{ data: string }>();
    return row ? (JSON.parse(row.data) as Run) : null;
  }
}
