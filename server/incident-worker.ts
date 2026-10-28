import { PostgresDatabase } from "./postgres.ts";
import { IncidentStore } from "../lib/incidents/store.ts";
import { InvestigationOrchestrator } from "../lib/incidents/orchestrator.ts";
if (!process.env.DATABASE_URL)
  throw new Error("Configurează DATABASE_URL pentru worker.");
const db = new PostgresDatabase(process.env.DATABASE_URL);
const store = new IncidentStore(db as unknown as D1Database);
const worker = new InvestigationOrchestrator(store, {
  LLM_ENDPOINT: process.env.LLM_ENDPOINT,
  LLM_MODEL: process.env.LLM_MODEL,
  LLM_API_KEY: process.env.LLM_API_KEY,
});
let stopped = false;
process.on("SIGINT", () => {
  stopped = true;
});
process.on("SIGTERM", () => {
  stopped = true;
});
console.log("Payment Incident worker: coadă PostgreSQL persistentă.");
try {
  do {
    for (const job of await store.pending())
      await worker.execute(job.owner_id, job.id);
    if (process.argv.includes("--once")) break;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  } while (!stopped);
} finally {
  await db.pool.end();
}
