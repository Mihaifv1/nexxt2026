import { assert } from "../domain.ts";
import type { Actor } from "../engine.ts";
import type { DisputeCase } from "../domain.ts";
import type { ProviderConfig } from "../provider.ts";
import { ProfileStore } from "./store.ts";
import { FrontDoorEngine, branchSlots, profileView } from "./engine.ts";
import { documentSample } from "./extraction.ts";
export async function frontDoorApi(
  request: Request,
  db: D1Database,
  secret: string,
  owner: string,
  actor: Actor,
  config: ProviderConfig,
  listCases: () => Promise<DisputeCase[]>,
) {
  const path = new URL(request.url).pathname
    .replace(/^\/api\/b2c\/frontdoor\/?/, "")
    .split("/")
    .filter(Boolean);
  const store = new ProfileStore(db, secret);
  const engine = new FrontDoorEngine(store, owner, actor, config);
  const method = request.method;
  const json = (x: unknown) =>
    Response.json(x, { headers: { "Cache-Control": "no-store" } });
  if (path[0] === "bootstrap" && method === "POST") {
    await store.bootstrap(owner, await listCases());
    return json({ ready: true });
  }
  if (!path.length && method === "GET") {
    const all = await store.list(owner);
    return json({
      profiles: all.map((p) => ({
        id: p.id,
        name: p.name,
        goal: p.goal,
        version: p.version,
        fields_count: Object.keys(p.fields).length,
        documents_count: p.documents.filter((d) => d.status === "CONFIRMED")
          .length,
        pending: p.proposals.filter((x) => x.status === "PENDING").length,
        appointment: p.appointments
          .filter((a) => ["BOOKED", "CHECKED_IN"].includes(a.status))
          .at(-1),
        exceptions: p.evaluations.at(-1)?.exceptions ?? [],
        linked_case_id: p.linked_case_id,
      })),
      metrics: {
        total: all.length,
        intakes: all.filter((p) => p.messages.length).length,
        verified_fields: all
          .flatMap((p) => Object.values(p.fields))
          .filter(
            (f) =>
              f?.verified === "HUMAN_CONFIRMED" ||
              f?.verified === "SYNTHETIC_VERIFIED",
          ).length,
        active_appointments: all
          .flatMap((p) => p.appointments)
          .filter((a) => ["BOOKED", "CHECKED_IN"].includes(a.status)).length,
        completed: all
          .flatMap((p) => p.appointments)
          .filter((a) => a.status === "COMPLETED").length,
        exceptions: all.filter((p) => p.evaluations.at(-1)?.exceptions.length)
          .length,
      },
    });
  }
  const p = await store.get(owner, path[0]);
  if (path.length === 1 && method === "GET") return json(profileView(p));
  if (path[1] === "actions" && method === "POST")
    return json(
      await engine.act(
        p.id,
        await request.json(),
        request.headers.get("Idempotency-Key") ?? "",
      ),
    );
  if (path[1] === "slots" && method === "GET") {
    const occupied = await store.occupied(owner);
    return json(branchSlots().filter((s) => !occupied.includes(s.id)));
  }
  if (path[1] === "sample" && method === "GET") {
    const kind = new URL(request.url).searchParams.get("kind");
    assert(
      ["IDENTITY", "SALARY", "BANK_STATEMENT"].includes(kind ?? ""),
      "INVALID_DOCUMENT",
      "Tip de document invalid.",
    );
    return json({
      name: `${kind}-${p.id}.txt`,
      content: documentSample(
        kind as "IDENTITY" | "SALARY" | "BANK_STATEMENT",
        p,
      ),
    });
  }
  if (path[1] === "audit" && method === "GET") return json(p.audit);
  return Response.json({ message: "Endpoint inexistent." }, { status: 404 });
}
