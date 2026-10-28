import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { handleApi } from "../lib/api.ts";
import { PostgresDatabase } from "./postgres.ts";
import { withRequestTasks } from "../lib/request-tasks.ts";
if (!process.env.DATABASE_URL)
  throw new Error("Configurează DATABASE_URL pentru PostgreSQL.");
const db = new PostgresDatabase(process.env.DATABASE_URL);
if (process.argv.includes("--migrate")) {
  await db.pool.query(
    await readFile(
      new URL("../db/postgres/004_operations_hub.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.pool.query(
    await readFile(
      new URL("../db/postgres/001_initial.sql", import.meta.url),
      "utf8",
    ),
  );
  console.log("Migrarea PostgreSQL a fost aplicată.");
  await db.pool.query(
    await readFile(
      new URL("../db/postgres/003_payment_incidents.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.pool.query(
    await readFile(
      new URL("../db/postgres/002_frontdoor.sql", import.meta.url),
      "utf8",
    ),
  );
}
createServer(async (req, res) => {
  try {
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 50000) {
        res.writeHead(413);
        res.end();
        return;
      }
    }
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers))
      if (value)
        headers.set(key, Array.isArray(value) ? value.join(",") : value);
    // This standalone adapter is loopback-only and explicitly a local demo identity.
    headers.set("oai-authenticated-user-id", "local-postgres-demo");
    const origin = headers.get("origin") ?? "http://localhost:5173";
    const request = new Request(new URL(req.url ?? "/", origin), {
      method: req.method,
      headers,
      ...(body ? { body } : {}),
    });
    const response = await withRequestTasks(
      {
        waitUntil(task) {
          task.catch((error) =>
            console.error(
              "Investigation task failed",
              error instanceof Error ? error.message : "error",
            ),
          );
        },
      },
      () =>
        handleApi(request, {
          DB: db as unknown as D1Database,
          LLM_ENDPOINT: process.env.LLM_ENDPOINT,
          LLM_MODEL: process.env.LLM_MODEL,
          LLM_API_KEY: process.env.LLM_API_KEY,
          PROFILE_ENCRYPTION_KEY: process.env.PROFILE_ENCRYPTION_KEY,
        }),
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(await response.text());
  } catch {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({ message: "Eroare în adaptorul local PostgreSQL." }),
    );
  }
}).listen(8788, "127.0.0.1", () =>
  console.log("B2C PostgreSQL API: http://127.0.0.1:8788"),
);
