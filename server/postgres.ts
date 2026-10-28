import pg from "pg";
// D1-shaped interface keeps the same transactional repository and API on PostgreSQL.
export class PostgresDatabase {
  pool: pg.Pool;
  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString });
  }
  prepare(sql: string) {
    return new PgStatement(this, sql);
  }
  async batch(statements: PgStatement[]) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const results = [];
      for (const statement of statements)
        results.push(await statement.execute(client));
      await client.query("COMMIT");
      return results;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
}
class PgStatement {
  values: unknown[] = [];
  constructor(
    public db: PostgresDatabase,
    public sql: string,
  ) {}
  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }
  query() {
    let index = 0;
    const ignore = /INSERT OR IGNORE/i.test(this.sql);
    let sql = this.sql
      .replace(/INSERT OR IGNORE/i, "INSERT")
      .replace(/\?/g, () => `$${++index}`);
    if (ignore) sql += " ON CONFLICT DO NOTHING";
    return sql;
  }
  async execute(client: pg.Pool | pg.PoolClient = this.db.pool) {
    const result = await client.query(this.query(), this.values);
    return {
      results: result.rows,
      success: true,
      meta: { changes: result.rowCount ?? 0 },
    };
  }
  async all() {
    return this.execute();
  }
  async run() {
    return this.execute();
  }
  async first() {
    return (await this.execute()).results[0] ?? null;
  }
}
