import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
export class SqliteD1 {
  db: DatabaseSync;
  constructor(path = ":memory:") {
    this.db = new DatabaseSync(path);
    this.db.exec(
      `CREATE TABLE b2c_dispute_cases (id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,version INTEGER NOT NULL,data TEXT NOT NULL,last_mutation TEXT NOT NULL);CREATE TABLE b2c_audit_events (event_id TEXT PRIMARY KEY,case_id TEXT NOT NULL,owner_id TEXT NOT NULL,timestamp TEXT NOT NULL,data TEXT NOT NULL);CREATE TABLE b2c_demo_sessions (id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,role TEXT NOT NULL,customer_id TEXT,expires_at TEXT NOT NULL);`,
    );
    this.db.exec(
      readFileSync(
        new URL("../drizzle/0002_productive_speed_demon.sql", import.meta.url),
        "utf8",
      ),
    );
    this.db.exec(readFileSync(new URL('../drizzle/0003_stale_midnight.sql',import.meta.url),'utf8'));
  }
  prepare(sql: string) {
    return new Statement(this, sql);
  }
  async batch(statements: Statement[]) {
    this.db.exec("BEGIN");
    try {
      const results = [];
      for (const s of statements) results.push(await s.run());
      this.db.exec("COMMIT");
      return results;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
}
class Statement {
  values: (string | number | null)[] = [];
  constructor(
    public parent: SqliteD1,
    public sql: string,
  ) {}
  bind(...values: (string | number | null)[]) {
    this.values = values;
    return this;
  }
  async all() {
    return {
      results: this.parent.db.prepare(this.sql).all(...this.values),
      success: true,
      meta: { changes: 0 },
    };
  }
  async first() {
    return this.parent.db.prepare(this.sql).get(...this.values) ?? null;
  }
  async run() {
    const result = this.parent.db.prepare(this.sql).run(...this.values);
    return {
      results: [],
      success: true,
      meta: { changes: Number(result.changes) },
    };
  }
}
