import {
  assert,
  audit,
  now,
  uid,
  transition,
  approvalSchema,
  responseSchema,
  type DisputeCase,
  type Evidence,
  type Investigation,
  type Role,
} from "./domain.ts";
import { evaluate } from "./rules.ts";
import { classify, type ProviderConfig } from "./provider.ts";
import type { Store } from "./store.ts";
export interface Actor {
  id: string;
  role: Role;
  customer_id?: string;
}
export class Engine {
  constructor(
    public store: Store,
    public owner: string,
    public actor: Actor,
    public config: ProviderConfig = {},
  ) {}
  authorize(roles: Role[]) {
    assert(
      roles.includes(this.actor.role),
      "FORBIDDEN",
      "Rolul curent nu poate executa această acțiune.",
      403,
    );
  }
  async load(id: string, version: number) {
    const c = await this.store.get(this.owner, id);
    assert(
      c.version === version,
      "VERSION_CONFLICT",
      "Cazul a fost actualizat. Reîncarcă datele.",
      409,
    );
    return c;
  }
  async persist(c: DisputeCase) {
    await this.store.save(this.owner, c, c.version);
  }
  event(
    c: DisputeCase,
    type: string,
    payload: Record<string, unknown> = {},
    correlation?: string,
  ) {
    audit(c, type, payload, this.actor.id, this.actor.role, correlation);
  }
  async replay(id: string, key: string, body: unknown) {
    assert(
      key && key.length <= 150,
      "IDEMPOTENCY_REQUIRED",
      "Lipsește Idempotency-Key.",
    );
    const c = await this.store.get(this.owner, id);
    const old = c.processed[key];
    if (old) {
      assert(
        old.fingerprint === JSON.stringify(body),
        "IDEMPOTENCY_CONFLICT",
        "Aceeași cheie a fost folosită pentru altă operațiune.",
        409,
      );
      return old.result;
    }
    return null;
  }
  remember(c: DisputeCase, key: string, body: unknown, result: unknown) {
    c.processed[key] = { fingerprint: JSON.stringify(body), result };
  }
  async investigate(
    id: string,
    body: { expected_case_version: number; recover_demo_fault?: boolean },
    key: string,
  ) {
    this.authorize(["B2C_AGENT", "B2C_SUPERVISOR"]);
    const replay = await this.replay(id, key, body);
    if (replay) return replay;
    const c = await this.load(id, body.expected_case_version);
    assert(
      ["OPEN", "ESCALATED", "AWAITING_APPROVAL", "READY_FOR_REVIEW"].includes(
        c.status,
      ),
      "INVALID_STATE",
      "Investigația nu poate fi pornită în starea curentă.",
      409,
    );
    if (body.recover_demo_fault) {
      this.authorize(["B2C_SUPERVISOR"]);
      c.fault = undefined;
      this.event(c, "DEMO_FAULT_RECOVERED");
    }
    const result = { run_id: uid("INV"), case_id: id, status: "RUNNING" };
    this.remember(c, key, body, result);
    await this.run(c, result.run_id);
    result.status = c.investigations.at(-1)!.status;
    this.remember(c, key, body, result);
    await this.persist(c);
    return result;
  }
  async run(c: DisputeCase, runId = uid("INV")) {
    const reinvestigation = c.investigations.length > 0;
    transition(c, "INVESTIGATING");
    for (const r of c.requests)
      if (r.status === "PENDING") r.status = "EXPIRED";
    const run: Investigation = {
      id: runId,
      status: "RUNNING",
      started_at: now(),
      provider: this.config.LLM_ENDPOINT
        ? "LLM configurat"
        : "Motor demo determinist",
      calls: [],
      findings: [],
      unknowns: [],
      questions: [],
      rules: [],
      suggested_route: "",
      next_action: "",
    };
    c.investigations.push(run);
    c.evidence = [];
    this.event(
      c,
      reinvestigation ? "REINVESTIGATION_STARTED" : "INVESTIGATION_STARTED",
      { run_id: runId },
      runId,
    );
    await this.persist(c);
    const tool = async (
      name: string,
      type: string,
      summary: () => string,
      data: () => Record<string, unknown>,
    ) => {
      const started_at = now();
      const started = performance.now();
      this.event(c, "TOOL_CALLED", { name, run_id: runId }, runId);
      await this.persist(c);
      try {
        if (c.fault === "TOOL_TIMEOUT" && name === "get_auth_evidence")
          throw new Error("Timeout în adaptorul sintetic de autentificare.");
        const evidence: Evidence = {
          id: uid("EVD"),
          type,
          source: name,
          timestamp: now(),
          summary: summary(),
          data: data(),
        };
        c.evidence.push(evidence);
        run.calls.push({
          name,
          status: "COMPLETED",
          started_at,
          duration_ms: Math.round(performance.now() - started),
          evidence_refs: [evidence.id],
        });
        this.event(
          c,
          "EVIDENCE_RETRIEVED",
          { name, evidence_id: evidence.id },
          runId,
        );
        await this.persist(c);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Instrument indisponibil";
        run.calls.push({
          name,
          status: "FAILED",
          started_at,
          duration_ms: Math.round(performance.now() - started),
          evidence_refs: [],
          error: message,
        });
        throw error;
      }
    };
    try {
      await tool(
        "get_case",
        "statement",
        () => `Declarația clientului: „${c.customer_statement}”`,
        () => ({ statement: c.customer_statement, category: c.category }),
      );
      await tool(
        "get_transaction",
        "transaction",
        () =>
          c.transaction
            ? `Tranzacția ${c.transaction.id} are status ${c.transaction.status}; suma este ${c.transaction.amount_minor} unități minore ${c.transaction.currency}.`
            : "Tranzacția nu a fost găsită în sursa sintetică.",
        () => ({ transaction: c.transaction }),
      );
      if (c.transaction) {
        if (c.category === "POSSIBLE_DUPLICATE")
          await tool(
            "find_possible_duplicates",
            "duplicates",
            () =>
              `${c.duplicate_candidates.filter((t) => t.status === "SETTLED").length} decontări și ${c.duplicate_candidates.filter((t) => t.status === "AUTHORIZED").length} autorizări în setul de tranzacții candidate.`,
            () => ({ candidates: c.duplicate_candidates }),
          );
        else {
          await tool(
            "get_auth_evidence",
            "authentication",
            () =>
              c.auth.three_ds_status === "UNKNOWN"
                ? "Dovada 3DS nu este disponibilă în setul curent."
                : "Există o dovadă sintetică de autentificare 3DS verificată.",
            () => ({ ...c.auth }),
          );
          if (c.category === "REFUND_NOT_RECEIVED")
            await tool(
              "get_refund_evidence",
              "refund",
              () =>
                c.refund.confirmed
                  ? "Există confirmare sintetică a rambursării."
                  : "Rambursarea este promisă, fără confirmare în setul disponibil.",
              () => ({ ...c.refund }),
            );
          else {
            await tool(
              "get_card_status",
              "card",
              () => `Cardul •••• ${c.card_last4} are status ${c.card_status}.`,
              () => ({ last4: c.card_last4, status: c.card_status }),
            );
            await tool(
              "get_case_history",
              "history",
              () => c.history.join(" "),
              () => ({ history: c.history, conflict: c.conflict }),
            );
          }
        }
      }
      const responses = c.requests.filter((r) => r.status === "ANSWERED");
      if (responses.length)
        await tool(
          "get_customer_responses",
          "customer_response",
          () =>
            `Clientul a furnizat ${Object.keys(responses.at(-1)!.answers ?? {}).length} răspunsuri structurate.`,
          () => ({
            responses: responses.map((r) => ({ id: r.id, answers: r.answers })),
          }),
        );
      await tool(
        "get_rulebook",
        "rulebook",
        () => `Reguli demonstrative ${c.rulebook_version}.`,
        () => ({ version: c.rulebook_version }),
      );
      const output = await classify(c, this.config);
      run.provider = output.provider;
      run.findings = output.findings;
      run.unknowns = output.unknowns;
      run.questions = output.questions;
      run.suggested_route = output.suggested_route;
      run.next_action = output.next_action;
      this.event(
        c,
        "AI_CLASSIFICATION_GENERATED",
        {
          run_id: runId,
          provider: output.provider,
          route: output.suggested_route,
        },
        runId,
      );
      const decision = evaluate(c);
      run.rules = decision.rules;
      for (const rule of decision.rules)
        this.event(c, "RULE_EVALUATED", { ...rule, run_id: runId }, runId);
      transition(
        c,
        decision.escalate
          ? "ESCALATED"
          : run.questions.length
            ? "AWAITING_APPROVAL"
            : "READY_FOR_REVIEW",
      );
      this.event(
        c,
        decision.escalate
          ? "CASE_ESCALATED"
          : run.questions.length
            ? "CUSTOMER_QUESTIONS_PROPOSED"
            : "ROUTE_PROPOSED",
        { route: run.suggested_route, run_id: runId },
        runId,
      );
      run.status = "COMPLETED";
    } catch (error) {
      run.status = "FAILED";
      run.error =
        error instanceof Error ? error.message : "Investigația a eșuat.";
      transition(c, "ESCALATED");
      this.event(
        c,
        "INVESTIGATION_FAILED",
        { run_id: runId, error: run.error },
        runId,
      );
    }
    run.completed_at = now();
    run.duration_ms = Date.parse(run.completed_at) - Date.parse(run.started_at);
    await this.persist(c);
  }
  async approve(id: string, input: unknown, key: string) {
    this.authorize(["B2C_AGENT", "B2C_SUPERVISOR"]);
    const body = approvalSchema.parse(input);
    const replay = await this.replay(id, key, body);
    if (replay) return replay;
    const c = await this.load(id, body.expected_case_version);
    const run = c.investigations.at(-1);
    assert(
      run && run.id === body.investigation_id,
      "STALE_INVESTIGATION",
      "Investigația nu mai este actuală.",
      409,
    );
    let result: Record<string, unknown> = { case_id: id, action: body.action };
    if (body.action === "APPROVE_CUSTOMER_QUESTIONS") {
      assert(
        c.status === "AWAITING_APPROVAL" && run.status === "COMPLETED",
        "INVALID_STATE",
        "Nu există întrebări care pot fi aprobate.",
        409,
      );
      const selected =
        body.approved_question_ids ?? run.questions.map((q) => q.id);
      assert(
        selected.length === new Set(selected).size &&
          selected.length > 0 &&
          selected.every((id) => run.questions.some((q) => q.id === id)),
        "INVALID_QUESTIONS",
        "Selectează întrebări valide.",
      );
      const questions = selected.map((id) => {
        const original = run.questions.find((q) => q.id === id)!;
        const edit = body.questions?.find((q) => q.id === id);
        assert(
          !edit ||
            (edit.key === original.key &&
              edit.answer_type === original.answer_type),
          "INVALID_QUESTIONS",
          "Cheia și tipul întrebării nu pot fi modificate.",
        );
        return { ...original, text: edit?.text ?? original.text };
      });
      const request = {
        id: uid("REQ"),
        investigation_id: run.id,
        questions,
        status: "PENDING" as const,
        created_at: now(),
        expires_at: new Date(
          Date.now() + (c.id.endsWith("0208") ? -60000 : 86400000),
        ).toISOString(),
        case_version: c.version + 1,
        approved_by: this.actor.id,
      };
      c.requests.push(request);
      transition(c, "AWAITING_CUSTOMER");
      this.event(
        c,
        "CUSTOMER_REQUEST_CREATED",
        { request_id: request.id, question_ids: selected },
        run.id,
      );
      result = { ...result, request_id: request.id };
    } else if (body.action === "REQUEST_REVISION") {
      assert(
        c.status === "AWAITING_APPROVAL",
        "INVALID_STATE",
        "Revizuirea necesită întrebări propuse.",
        409,
      );
      this.event(c, "QUESTIONS_REVISION_REQUESTED", { comment: body.comment });
    } else if (body.action === "ESCALATE") {
      assert(
        !["CLOSED_DEMO", "ESCALATED", "INVESTIGATING"].includes(c.status),
        "INVALID_STATE",
        "Escaladarea nu este disponibilă.",
        409,
      );
      for (const r of c.requests)
        if (r.status === "PENDING") r.status = "EXPIRED";
      transition(c, "ESCALATED");
      this.event(c, "CASE_ESCALATED", { comment: body.comment });
    } else if (body.action === "APPROVE_ROUTE") {
      assert(
        c.status === "READY_FOR_REVIEW" &&
          run.status === "COMPLETED" &&
          !run.questions.length,
        "INVALID_STATE",
        "Traseul nu poate fi aprobat.",
        409,
      );
      assert(
        !c.approvals.some(
          (a) => a.action === "APPROVE_ROUTE" && a.investigation_id === run.id,
        ),
        "ALREADY_APPROVED",
        "Traseul a fost deja aprobat.",
        409,
      );
      this.event(c, "ROUTE_APPROVED", { route: run.suggested_route });
    } else if (body.action === "CLOSE_DEMO") {
      this.authorize(["B2C_SUPERVISOR"]);
      assert(
        c.status === "READY_FOR_REVIEW" &&
          c.approvals.some(
            (a) =>
              a.action === "APPROVE_ROUTE" && a.investigation_id === run.id,
          ),
        "APPROVAL_REQUIRED",
        "Este necesară aprobarea traseului înainte de închidere.",
        409,
      );
      transition(c, "CLOSED_DEMO");
      this.event(c, "CASE_CLOSED_DEMO", { route: run.suggested_route });
    }
    c.approvals.push({
      id: uid("APR"),
      action: body.action,
      actor: this.actor.id,
      timestamp: now(),
      comment: body.comment,
      investigation_id: run.id,
    });
    this.event(
      c,
      "EMPLOYEE_APPROVED",
      { action: body.action, comment: body.comment },
      run.id,
    );
    this.remember(c, key, body, result);
    await this.persist(c);
    if (body.action === "REQUEST_REVISION") await this.run(c);
    return result;
  }
  async respond(id: string, requestId: string, input: unknown, key: string) {
    this.authorize(["DEMO_CUSTOMER"]);
    const body = responseSchema.parse(input);
    const replay = await this.replay(id, key, body);
    if (replay) return replay;
    const c = await this.load(id, body.expected_case_version);
    assert(
      c.customer_id === this.actor.customer_id,
      "FORBIDDEN",
      "Cererea aparține altui profil demo.",
      403,
    );
    const request = c.requests.find((r) => r.id === requestId);
    assert(request, "NOT_FOUND", "Cererea nu există.", 404);
    assert(
      request.status === "PENDING" &&
        c.status === "AWAITING_CUSTOMER" &&
        request.case_version === c.version &&
        Date.parse(request.expires_at) > Date.now(),
      "STALE_REQUEST",
      "Cererea a expirat sau cazul a fost actualizat. Solicită o cerere nouă.",
      409,
    );
    const keys = request.questions.map((q) => q.key);
    assert(
      Object.keys(body.answers).length === keys.length &&
        keys.every((k) => body.answers[k]),
      "INCOMPLETE_RESPONSE",
      "Răspunde la toate întrebările.",
    );
    request.answers = body.answers;
    request.answered_at = now();
    request.status = "ANSWERED";
    this.event(
      c,
      "CUSTOMER_RESPONDED",
      { request_id: request.id, answers: body.answers },
      request.investigation_id,
    );
    const result = { case_id: id, request_id: request.id };
    this.remember(c, key, body, result);
    await this.persist(c);
    await this.run(c);
    return result;
  }
}
