import { assert, now, type AuditEvent } from "../domain.ts";
import type { Actor } from "../engine.ts";
import type { ProviderConfig } from "../provider.ts";
import { IncidentStore } from "./store.ts";
import { callTool, investigatorTools } from "./tools.ts";
import { extractEntities } from "./intake.ts";
import {
  answers,
  classifyRoute,
  compatible,
  investigateRules,
  manipulation,
  versionFor,
} from "./rules.ts";
import { investigationPrompt, modelJson, triagePrompt } from "./provider.ts";
import {
  approvalSchema,
  responseSchema,
  guardSensitive,
  resultSchema,
  triageSchema,
  transition,
  uuid,
  validateGrounding,
  type Incident,
  type Job,
  type Run,
  type Evidence,
  type Route,
  type Proposal,
  type CustomerRequest,
} from "./domain.ts";
export function incidentEvent(
  c: Incident,
  type: string,
  payload: Record<string, unknown> = {},
  actor = "orchestrator",
  role = "SYSTEM",
  correlation = uuid(),
) {
  const e: AuditEvent = {
    event_id: uuid(),
    case_id: c.id,
    actor_id: actor,
    actor_type: role,
    event_type: type,
    timestamp: now(),
    payload,
    correlation_id: correlation,
  };
  c.audit.push(e);
}
function safeQuestion(text: string) {
  assert(
    !/\b(?:PIN|CVV|CVC|OTP|parol[ăa]|parole|password)\b/i.test(text),
    "SENSITIVE_QUESTION",
    "Întrebările nu pot solicita date secrete.",
  );
}
export class IncidentService {
  constructor(
    public store: IncidentStore,
    public owner: string,
    public actor: Actor,
    public config: ProviderConfig = {},
  ) {}
  employee() {
    assert(
      ["B2C_AGENT", "B2C_SUPERVISOR"].includes(this.actor.role),
      "FORBIDDEN",
      "Acțiunea necesită rolul unui angajat.",
      403,
    );
  }
  async replay(c: Incident, key: string, body: unknown) {
    assert(
      key && key.length <= 150,
      "IDEMPOTENCY_REQUIRED",
      "Lipsește Idempotency-Key.",
    );
    const old = c.processed[key];
    if (old) {
      assert(
        old.fingerprint === JSON.stringify(body),
        "IDEMPOTENCY_CONFLICT",
        "Cheia a fost utilizată pentru altă operațiune.",
        409,
      );
      return old.result;
    }
    return null;
  }
  remember(c: Incident, key: string, body: unknown, result: unknown) {
    c.processed[key] = { fingerprint: JSON.stringify(body), result };
  }
  check(c: Incident, version: number) {
    assert(
      c.version === version,
      "VERSION_CONFLICT",
      "Incidentul a fost actualizat. Reîncarcă datele.",
      409,
    );
    assert(
      !c.active_job_id,
      "INVESTIGATION_RUNNING",
      "Există deja o investigație în execuție.",
      409,
    );
  }
  job(c: Incident): Job {
    const id = uuid();
    const run_id = uuid();
    const time = now();
    const job: Job = {
      id,
      owner_id: this.owner,
      incident_id: c.id,
      run_id,
      status: "QUEUED",
      attempts: 0,
      lock_token: "",
      lease_until: "1970-01-01T00:00:00Z",
      created_at: time,
      updated_at: time,
      error: null,
      actor_id: this.actor.id,
      actor_role: this.actor.role,
    };
    const run: Run = {
      id: run_id,
      job_id: id,
      status: "QUEUED",
      started_at: time,
      primary_route: "HUMAN_REVIEW",
      secondary_routes: [],
      calls: [],
      known_facts: [],
      customer_claims: [],
      unknowns: [],
      contradictions: [],
      customer_questions: [],
      proposed_actions: [],
      rules: [],
      recommended_status: "HUMAN_REVIEW",
      rulebook_version: "payment-demo-v1",
      provider: this.config.LLM_ENDPOINT
        ? "LLM configurat"
        : "Demo determinist",
    };
    for (const r of c.requests)
      if (r.status === "PENDING") r.status = "EXPIRED";
    transition(c, "TRIAGING");
    c.active_job_id = id;
    c.runs.push(run);
    incidentEvent(
      c,
      "INVESTIGATION_JOB_QUEUED",
      { job_id: id, run_id, previous_runs: c.runs.length - 1 },
      this.actor.id,
      this.actor.role,
      id,
    );
    return job;
  }
  async enqueue(
    id: string,
    body: { expected_case_version: number; recover_demo_fault?: boolean },
    key: string,
  ) {
    this.employee();
    const c = await this.store.get(this.owner, id);
    const replay = await this.replay(c, key, body);
    if (replay) return replay as { job_id: string; run_id: string };
    this.check(c, body.expected_case_version);
    assert(
      c.status !== "CLOSED_DEMO",
      "INVALID_STATE",
      "Cazul demo este închis.",
      409,
    );
    if (body.recover_demo_fault) {
      assert(
        this.actor.role === "B2C_SUPERVISOR",
        "FORBIDDEN",
        "Recuperarea defecțiunii demo necesită supervizor.",
        403,
      );
      const bank = await this.store.bankRecord(
        this.owner,
        c.transaction_id,
        c.customer_id,
      );
      if (bank) {
        delete bank.fault;
        await this.store.setFault(this.owner, bank);
      }
      incidentEvent(
        c,
        "DEMO_FAULT_RECOVERED",
        {},
        this.actor.id,
        this.actor.role,
      );
    }
    const job = this.job(c);
    const result = { job_id: job.id, run_id: job.run_id, incident_id: c.id };
    this.remember(c, key, body, result);
    await this.store.save(this.owner, c, c.version, undefined, job);
    return result;
  }
  async approve(id: string, input: unknown, key: string) {
    this.employee();
    const body = approvalSchema.parse(input);
    const c = await this.store.get(this.owner, id);
    const replay = await this.replay(c, key, body);
    if (replay) return replay as { job_id?: string };
    this.check(c, body.expected_case_version);
    const run = c.runs.at(-1);
    assert(
      run && run.id === body.run_id && run.status === "COMPLETED",
      "STALE_RUN",
      "Investigația nu mai este actuală sau nu s-a finalizat.",
      409,
    );
    assert(
      c.status !== "CLOSED_DEMO",
      "INVALID_STATE",
      "Cazul este închis.",
      409,
    );
    let job: Job | undefined;
    const result: {
      incident_id: string;
      job_id?: string;
      request_id?: string;
    } = { incident_id: id };
    if (body.action === "APPROVE") {
      assert(
        body.action_ids.length > 0 &&
          new Set(body.action_ids).size === body.action_ids.length,
        "INVALID_ACTIONS",
        "Selectează o propunere validă.",
      );
      const selected = body.action_ids.map((id) =>
        run.proposed_actions.find((a) => a.id === id),
      );
      assert(
        selected.every((a) => a?.status === "PENDING"),
        "INVALID_ACTIONS",
        "Propunerea nu există sau a fost deja procesată.",
        409,
      );
      for (const action of selected as Proposal[]) {
        if (action.type === "ASK_CUSTOMER") {
          assert(
            ["AWAITING_APPROVAL", "HUMAN_REVIEW"].includes(c.status),
            "INVALID_STATE",
            "Întrebările nu pot fi trimise în starea curentă.",
            409,
          );
          const q = run.customer_questions.map((original) => {
            const edit = body.questions?.find((x) => x.id === original.id);
            assert(
              !edit ||
                (edit.key === original.key &&
                  edit.answer_type === original.answer_type &&
                  JSON.stringify(edit.options) ===
                    JSON.stringify(original.options)),
              "INVALID_QUESTION",
              "Cheile și tipurile răspunsurilor nu pot fi modificate.",
            );
            const text = edit?.text ?? original.text;
            safeQuestion(text);
            return { ...original, text };
          });
          assert(q.length, "INVALID_QUESTION", "Nu există întrebări propuse.");
          assert(
            !body.questions ||
              body.questions.every((q) =>
                run.customer_questions.some((x) => x.id === q.id),
              ),
            "INVALID_QUESTION",
            "O întrebare nu aparține investigației.",
          );
          const request: CustomerRequest = {
            id: uuid(),
            incident_id: c.id,
            run_id: run.id,
            kind: "QUESTIONS",
            status: "PENDING",
            case_version: c.version + 1,
            questions: q,
            message:
              "Te rugăm să clarifici aceste informații pentru investigarea incidentului.",
            approved_by: this.actor.id,
            created_at: now(),
            expires_at: new Date(Date.now() + 86400000).toISOString(),
          };
          c.requests.push(request);
          transition(c, "AWAITING_CUSTOMER");
          result.request_id = request.id;
          incidentEvent(
            c,
            "CUSTOMER_REQUEST_CREATED",
            { request_id: request.id, question_ids: q.map((x) => x.id) },
            this.actor.id,
            this.actor.role,
            run.id,
          );
        } else if (action.type === "ESCALATE") {
          transition(c, "ESCALATED");
          for (const r of c.requests)
            if (r.status === "PENDING") r.status = "EXPIRED";
          incidentEvent(
            c,
            "INCIDENT_ESCALATED",
            { reason: action.reason },
            this.actor.id,
            this.actor.role,
            run.id,
          );
        } else if (action.type === "SEND_CUSTOMER_UPDATE") {
          const request: CustomerRequest = {
            id: uuid(),
            incident_id: c.id,
            run_id: run.id,
            kind: "UPDATE",
            status: "DELIVERED",
            case_version: c.version + 1,
            questions: [],
            message:
              "Investigația a fost revizuită de un angajat. " +
              (c.evidence.find(
                (e) =>
                  e.run_id === run.id && e.source === "get_reversal_status",
              )?.summary ??
                "Dovezile disponibile au fost consemnate pentru verificare.") +
              " Această comunicare nu inițiază și nu garantează recuperarea unor fonduri.",
            approved_by: this.actor.id,
            created_at: now(),
            expires_at: new Date(Date.now() + 86400000).toISOString(),
          };
          c.requests.push(request);
          result.request_id = request.id;
          transition(c, "READY_FOR_REVIEW");
          incidentEvent(
            c,
            "CUSTOMER_UPDATE_APPROVED",
            { request_id: request.id },
            this.actor.id,
            this.actor.role,
            run.id,
          );
        } else {
          c.artifacts.push({
            id: uuid(),
            run_id: run.id,
            type: action.type,
            created_at: now(),
            approved_by: this.actor.id,
            evidence_ids: [
              ...new Set(run.known_facts.flatMap((f) => f.evidence_ids)),
            ],
            summary: action.reason,
          });
          transition(c, "READY_FOR_REVIEW");
          incidentEvent(
            c,
            "OPERATIONAL_PACK_PREPARED",
            { type: action.type, artifact_id: c.artifacts.at(-1)!.id },
            this.actor.id,
            this.actor.role,
            run.id,
          );
        }
        action.status = "APPROVED";
      }
    } else if (body.action === "REJECT") {
      assert(
        body.comment.trim().length >= 5,
        "COMMENT_REQUIRED",
        "Descrie motivul respingerii.",
      );
      for (const a of run.proposed_actions)
        if (a.status === "PENDING") a.status = "REJECTED";
      transition(c, "HUMAN_REVIEW");
      incidentEvent(
        c,
        "RECOMMENDATION_REJECTED",
        { comment: body.comment },
        this.actor.id,
        this.actor.role,
        run.id,
      );
    } else if (body.action === "REVISION") {
      for (const a of run.proposed_actions)
        if (a.status === "PENDING") a.status = "REJECTED";
      incidentEvent(
        c,
        "INVESTIGATION_REVISION_REQUESTED",
        { comment: body.comment },
        this.actor.id,
        this.actor.role,
        run.id,
      );
      job = this.job(c);
      result.job_id = job.id;
    } else if (body.action === "ESCALATE") {
      assert(
        body.comment.trim().length >= 5,
        "COMMENT_REQUIRED",
        "Descrie motivul escaladării.",
      );
      transition(c, "ESCALATED");
      for (const r of c.requests)
        if (r.status === "PENDING") r.status = "EXPIRED";
      incidentEvent(
        c,
        "INCIDENT_ESCALATED",
        { comment: body.comment, manual: true },
        this.actor.id,
        this.actor.role,
        run.id,
      );
    } else {
      assert(
        this.actor.role === "B2C_SUPERVISOR",
        "FORBIDDEN",
        "Închiderea demo necesită supervizor.",
        403,
      );
      assert(
        c.status === "READY_FOR_REVIEW" &&
          run.proposed_actions.some(
            (a) => a.status === "APPROVED" && a.type !== "ASK_CUSTOMER",
          ),
        "APPROVAL_REQUIRED",
        "Aprobă întâi următorul pas operațional.",
        409,
      );
      transition(c, "CLOSED_DEMO");
      incidentEvent(
        c,
        "INCIDENT_CLOSED_DEMO",
        {},
        this.actor.id,
        this.actor.role,
        run.id,
      );
    }
    c.approvals.push({
      id: uuid(),
      run_id: run.id,
      actor_id: this.actor.id,
      role: this.actor.role,
      action: body.action,
      action_ids: body.action_ids,
      case_version: body.expected_case_version,
      comment: body.comment,
      timestamp: now(),
    });
    incidentEvent(
      c,
      "HUMAN_APPROVAL_RECORDED",
      {
        action: body.action,
        action_ids: body.action_ids,
        case_version: body.expected_case_version,
      },
      this.actor.id,
      this.actor.role,
      run.id,
    );
    this.remember(c, key, body, result);
    await this.store.save(this.owner, c, c.version, undefined, job);
    return result;
  }
  async respond(requestId: string, input: unknown, key: string) {
    assert(
      this.actor.role === "DEMO_CUSTOMER",
      "FORBIDDEN",
      "Răspunsul trebuie trimis din simulatorul clientului.",
      403,
    );
    const body = responseSchema.parse(input);
    const c = (await this.store.list(this.owner)).find(
      (c) =>
        c.customer_id === this.actor.customer_id &&
        c.requests.some((r) => r.id === requestId),
    );
    assert(c, "NOT_FOUND", "Solicitarea nu există pentru acest client.", 404);
    const replay = await this.replay(c, key, body);
    if (replay) return replay as { job_id: string };
    this.check(c, body.expected_case_version);
    const request = c.requests.find((r) => r.id === requestId)!;
    assert(
      c.status === "AWAITING_CUSTOMER" &&
        request.status === "PENDING" &&
        request.case_version === c.version &&
        Date.parse(request.expires_at) > Date.now(),
      "STALE_REQUEST",
      "Solicitarea a expirat sau cazul a fost actualizat.",
      409,
    );
    assert(
      Object.keys(body.answers).length === request.questions.length &&
        request.questions.every((q) => body.answers[q.key]?.trim()),
      "INCOMPLETE_RESPONSE",
      "Răspunde la toate întrebările aprobate.",
    );
    for (const q of request.questions) {
      const value = body.answers[q.key];
      if (q.answer_type !== "TEXT")
        assert(
          q.options?.some((o) => o.value === value),
          "INVALID_ANSWER",
          "Răspunsul nu este una dintre opțiunile aprobate.",
        );
      guardSensitive(value);
    }
    if (body.attachment) guardSensitive(body.attachment.content);
    request.status = "ANSWERED";
    request.answers = body.answers;
    request.attachment = body.attachment;
    request.answered_at = now();
    incidentEvent(
      c,
      "CUSTOMER_RESPONSE_RECEIVED",
      {
        request_id: request.id,
        answered_keys: Object.keys(body.answers),
        has_attachment: !!body.attachment,
      },
      this.actor.id,
      this.actor.role,
      request.run_id,
    );
    const job = this.job(c);
    const result = { incident_id: c.id, job_id: job.id, run_id: job.run_id };
    this.remember(c, key, body, result);
    await this.store.save(this.owner, c, c.version, undefined, job);
    return result;
  }
  async reassign(
    id: string,
    input: {
      expected_case_version: number;
      route: Route;
      transaction_id?: string;
      comment: string;
    },
    key: string,
  ) {
    this.employee();
    const c = await this.store.get(this.owner, id);
    const replay = await this.replay(c, key, input);
    if (replay) return replay as { job_id: string };
    this.check(c, input.expected_case_version);
    assert(
      input.comment.trim().length >= 5,
      "COMMENT_REQUIRED",
      "Descrie motivul reasignării.",
    );
    const record = await this.store.bankRecord(
      this.owner,
      input.transaction_id ?? c.transaction_id,
      c.customer_id,
    );
    assert(
      compatible(input.route, record),
      "ROUTE_INCOMPATIBLE",
      "Ruta nu corespunde tranzacției. Cazul rămâne pentru revizuire umană.",
      409,
    );
    assert(
      !manipulation(c) ||
        record?.channel === "ATM" ||
        ["SCAM_RESCUE", "HUMAN_REVIEW"].includes(input.route),
      "SECURITY_ROUTE_REQUIRED",
      "Indiciile de manipulare necesită ScamRescue sau revizuire umană.",
      409,
    );
    if (input.transaction_id) {
      assert(
        record,
        "TRANSACTION_NOT_FOUND",
        "Tranzacția nu aparține clientului.",
      );
      c.transaction_id = record.id;
      if (!c.candidate_ids.includes(record.id)) c.candidate_ids.push(record.id);
    }
    const previous = c.primary_route;
    c.manual_route = input.route;
    incidentEvent(
      c,
      "INCIDENT_REASSIGNED",
      {
        previous_route: previous,
        new_route: input.route,
        comment: input.comment,
      },
      this.actor.id,
      this.actor.role,
    );
    const job = this.job(c);
    const result = { incident_id: c.id, job_id: job.id, run_id: job.run_id };
    this.remember(c, key, input, result);
    await this.store.save(this.owner, c, c.version, undefined, job);
    return result;
  }
}
export class InvestigationOrchestrator {
  constructor(
    public store: IncidentStore,
    public config: ProviderConfig = {},
  ) {}
  async execute(owner: string, id: string) {
    const job = await this.store.claim(owner, id);
    if (!job) return;
    let c = await this.store.get(owner, job.incident_id);
    if (c.active_job_id !== job.id) {
      await this.store.finish(
        job,
        c.runs.find((r) => r.id === job.run_id)?.status === "COMPLETED"
          ? "COMPLETED"
          : "FAILED",
        "Rularea a fost înlocuită.",
      );
      return;
    }
    const run = c.runs.find((r) => r.id === job.run_id)!;
    const persist = () => this.store.save(owner, c, c.version, job);
    const event = (type: string, payload: Record<string, unknown> = {}) =>
      incidentEvent(
        c,
        type,
        { ...payload, run_id: run.id, job_id: job.id },
        "payment-orchestrator",
        "SYSTEM",
        run.id,
      );
    const tool = async (name: string, agent: string) => {
      for (let attempt = 1; attempt <= 2; attempt++) {
        const call = {
          id: uuid(),
          run_id: run.id,
          agent,
          name,
          status: "RUNNING" as "RUNNING" | "COMPLETED" | "FAILED",
          attempt,
          started_at: now(),
          evidence_ids: [] as string[],
          completed_at: undefined as string | undefined,
          duration_ms: undefined as number | undefined,
          error: undefined as string | undefined,
        };
        run.calls.push(call);
        event("TOOL_CALLED", { tool: name, agent, attempt, call_id: call.id });
        await persist();
        const started = performance.now();
        try {
          const value = await callTool(this.store, owner, c, name, attempt);
          const e: Evidence = {
            id: uuid(),
            incident_id: c.id,
            run_id: run.id,
            source: name,
            evidence_type: value.type,
            summary: value.summary,
            payload: { ...value.payload, job_attempt: job.attempts },
            observed_at: value.observed_at,
            retrieved_at: now(),
            data_classification: "SYNTHETIC",
          };
          c.evidence.push(e);
          call.evidence_ids = [e.id];
          call.status = "COMPLETED";
          call.completed_at = now();
          call.duration_ms = Math.round(performance.now() - started);
          event("EVIDENCE_RETRIEVED", {
            tool: name,
            evidence_id: e.id,
            call_id: call.id,
          });
          await persist();
          return e;
        } catch (error) {
          call.status = "FAILED";
          call.error =
            error instanceof Error ? error.message : "Instrument indisponibil";
          call.completed_at = now();
          call.duration_ms = Math.round(performance.now() - started);
          event("TOOL_FAILED", {
            tool: name,
            attempt,
            error: call.error,
            call_id: call.id,
          });
          await persist();
          if (attempt === 2) throw error;
          event("TOOL_RETRY_SCHEDULED", { tool: name, next_attempt: 2 });
        }
      }
      throw new Error("Tool failed.");
    };
    const validatedModel = async <T>(
      stage: string,
      draft: T,
      invoke: () => Promise<T>,
    ) => {
      if (!this.config.LLM_ENDPOINT) return draft;
      for (let attempt = 1; attempt <= 2; attempt++) {
        event("LLM_CALLED", { stage, attempt });
        await persist();
        try {
          return await invoke();
        } catch (error) {
          event("LLM_OUTPUT_REJECTED", {
            stage,
            attempt,
            error: error instanceof Error ? error.message : "Ieșire invalidă",
          });
          await persist();
          if (attempt === 2) throw error;
        }
      }
      throw new Error("LLM indisponibil.");
    };
    try {
      if (job.attempts > 3)
        throw new Error(
          "Investigația a fost întreruptă de trei ori. Este necesară revizuire umană înainte de o rulare nouă.",
        );
      if (job.attempts > 1) {
        for (const call of run.calls)
          if (call.status === "RUNNING") {
            call.status = "FAILED";
            call.error =
              "Execuție întreruptă; job recuperat după expirarea lease-ului.";
          }
        c.status = "TRIAGING";
        event("INVESTIGATION_JOB_RECOVERED", { attempt: job.attempts });
      }
      run.status = "RUNNING";
      event(
        c.runs.length > 1 ? "REINVESTIGATION_STARTED" : "INVESTIGATION_STARTED",
      );
      await persist();
      const triageStarted = performance.now();
      await tool("get_incident", "PAYMENT_TRIAGE");
      const candidatesEvidence = await tool(
        "find_candidate_transactions",
        "PAYMENT_TRIAGE",
      );
      if (c.requests.some((r) => r.status === "ANSWERED"))
        await tool("get_customer_responses", "PAYMENT_TRIAGE");
      const available = await this.store.bankRecords(owner, c.customer_id);
      const candidates = available.filter((r) =>
        c.candidate_ids.includes(r.id),
      );
      let record = available.find((r) => r.id === c.transaction_id) ?? null;
      const entities = extractEntities(c.statement);
      const channel = answers(c).payment_channel ?? entities.channel;
      const amount = c.reported_amount_minor ?? entities.amount_minor;
      if (!record) {
        const compatibleCandidates = candidates.filter(
          (r) =>
            (!channel || channel === "UNSURE" || r.channel === channel) &&
            (amount === undefined || r.amount_minor === amount),
        );
        if (compatibleCandidates.length === 1) {
          record = compatibleCandidates[0];
          c.transaction_id = record.id;
          event("INCIDENT_TRANSACTION_LINKED", { transaction_id: record.id });
        }
      }
      const deterministic = classifyRoute(c, record, candidates);
      const triageDraft = {
        primary_route: deterministic.primary_route,
        secondary_routes: deterministic.secondary_routes,
        routing_reason: deterministic.routing_reason,
        evidence_ids: [candidatesEvidence.id],
      };
      const triage = await validatedModel("TRIAGE", triageDraft, async () => {
        const parsed = triageSchema.parse(
          await modelJson(this.config, triagePrompt, {
            untrusted_statement: c.statement,
            customer_answers: answers(c),
            evidence: [candidatesEvidence],
            allowed_route: deterministic.primary_route,
            deterministic_draft: triageDraft,
          }),
        );
        assert(
          parsed.primary_route === deterministic.primary_route &&
            JSON.stringify(parsed.secondary_routes) ===
              JSON.stringify(deterministic.secondary_routes),
          "ROUTE_INCOMPATIBLE",
          "Ruta LLM nu este compatibilă cu dovezile.",
          422,
        );
        assert(
          parsed.evidence_ids.every((id) =>
            c.evidence.some((e) => e.id === id && e.run_id === run.id),
          ),
          "FABRICATED_EVIDENCE",
          "Referință inexistentă în triere.",
          422,
        );
        return parsed;
      });
      const previous = c.primary_route;
      c.primary_route = triage.primary_route;
      c.secondary_routes = triage.secondary_routes;
      run.primary_route = triage.primary_route;
      run.secondary_routes = triage.secondary_routes;
      run.triage = {
        ...deterministic,
        ...triage,
        duration_ms: Math.round(performance.now() - triageStarted),
        provider: run.provider,
      };
      event(
        previous && previous !== c.primary_route
          ? "INCIDENT_RECLASSIFIED"
          : "INCIDENT_ROUTED",
        {
          previous_route: previous,
          primary_route: c.primary_route,
          reason: triage.routing_reason,
        },
      );
      if (c.primary_route !== "HUMAN_REVIEW") transition(c, "INVESTIGATING");
      await persist();
      let names = investigatorTools[c.primary_route];
      if (c.primary_route === "DISPUTE_PILOT" && record?.card_context) {
        const category = record.card_context.category;
        names = names.filter((name) =>
          name === "find_duplicate_settlements"
            ? category === "POSSIBLE_DUPLICATE"
            : name === "get_refund_evidence"
              ? category === "REFUND_NOT_RECEIVED"
              : category === "POSSIBLE_DUPLICATE"
                ? ![
                    "get_3ds_evidence",
                    "get_card_status",
                    "get_case_history",
                  ].includes(name)
                : true,
        );
      }
      for (const name of names) await tool(name, c.primary_route);
      const evidence = c.evidence.filter(
        (e) => e.run_id === run.id && e.payload.job_attempt === job.attempts,
      );
      const decision = investigateRules(c, record, c.primary_route, evidence);
      const bankFacts = evidence.filter(
        (e) => !["CUSTOMER_CLAIM", "RULEBOOK"].includes(e.evidence_type),
      );
      const draft = {
        known_facts: bankFacts.map((e) => ({
          text: e.summary,
          evidence_ids: [e.id],
        })),
        customer_claims: [
          c.statement,
          ...Object.entries(answers(c)).map(
            ([key, value]) => `${key}: ${value}`,
          ),
        ],
        unknowns: decision.unknowns,
        contradictions: decision.contradictions,
        customer_questions: decision.customer_questions,
        proposed_actions: decision.proposed_actions,
      };
      const output = await validatedModel("INVESTIGATION", draft, async () => {
        const parsed = resultSchema.parse(
          await modelJson(this.config, investigationPrompt, {
            evidence,
            deterministic_draft: draft,
          }),
        );
        validateGrounding(parsed, evidence);
        assert(
          parsed.customer_questions.length ===
            draft.customer_questions.length &&
            parsed.customer_questions.every((q) => {
              const original = draft.customer_questions.find(
                (x) => x.id === q.id,
              );
              return (
                original &&
                original.key === q.key &&
                original.answer_type === q.answer_type &&
                JSON.stringify(original.options) === JSON.stringify(q.options)
              );
            }),
          "INVALID_QUESTIONS",
          "Întrebările LLM nu respectă contractul.",
          422,
        );
        for (const q of parsed.customer_questions) safeQuestion(q.text);
        assert(
          JSON.stringify(parsed.proposed_actions.map((a) => [a.id, a.type])) ===
            JSON.stringify(draft.proposed_actions.map((a) => [a.id, a.type])),
          "UNSUPPORTED_ACTION",
          "Acțiune nesuportată în rezultatul LLM.",
          422,
        );
        assert(
          JSON.stringify(parsed.customer_claims) ===
            JSON.stringify(draft.customer_claims) &&
            JSON.stringify(parsed.contradictions) ===
              JSON.stringify(draft.contradictions),
          "UNSUPPORTED_CLAIM",
          "Modelul a modificat declarațiile sau contradicțiile.",
          422,
        );
        return {
          ...parsed,
          proposed_actions: draft.proposed_actions,
          unknowns: draft.unknowns,
        };
      });
      validateGrounding(output, evidence);
      run.known_facts = output.known_facts;
      run.customer_claims = output.customer_claims;
      run.unknowns = output.unknowns;
      run.contradictions = output.contradictions;
      run.customer_questions = output.customer_questions;
      run.proposed_actions = output.proposed_actions;
      run.rules = decision.rules;
      run.recommended_status = decision.recommended_status;
      run.rulebook_version = versionFor(c.primary_route);
      for (const rule of run.rules)
        event("RULE_EVALUATED", {
          rule_id: rule.rule_id,
          result: rule.result,
          evidence_ids: rule.evidence_ids,
        });
      if (decision.recommended_status === "ESCALATED") c.priority = "URGENT";
      else if (c.primary_route === "SCAM_RESCUE") c.priority = "HIGH";
      transition(
        c,
        c.primary_route === "HUMAN_REVIEW" ||
          decision.recommended_status === "HUMAN_REVIEW"
          ? "HUMAN_REVIEW"
          : decision.recommended_status === "READY_FOR_REVIEW"
            ? "READY_FOR_REVIEW"
            : "AWAITING_APPROVAL",
      );
      run.status = "COMPLETED";
      run.completed_at = now();
      run.duration_ms =
        Date.parse(run.completed_at) - Date.parse(run.started_at);
      c.active_job_id = null;
      event("INVESTIGATION_COMPLETED", {
        primary_route: run.primary_route,
        recommended_status: run.recommended_status,
        pending_approval: run.proposed_actions.length,
      });
      await persist();
      await this.store.finish(job, "COMPLETED");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message.slice(0, 1500)
          : "Investigația a eșuat.";
      const latest = await this.store.get(owner, c.id);
      if (latest.active_job_id === job.id) {
        c = latest;
        const failed = c.runs.find((r) => r.id === job.run_id)!;
        failed.status = "FAILED";
        failed.error = message;
        failed.completed_at = now();
        failed.duration_ms =
          Date.parse(failed.completed_at) - Date.parse(failed.started_at);
        failed.proposed_actions = [];
        c.status = "HUMAN_REVIEW";
        c.secondary_routes =
          c.primary_route && c.primary_route !== "HUMAN_REVIEW"
            ? [c.primary_route]
            : [];
        c.primary_route = "HUMAN_REVIEW";
        c.active_job_id = null;
        incidentEvent(
          c,
          "INVESTIGATION_FAILED",
          {
            run_id: failed.id,
            job_id: job.id,
            error: message,
            requires_human_review: true,
          },
          "payment-orchestrator",
          "SYSTEM",
          failed.id,
        );
        await this.store.save(owner, c, c.version, job).catch(() => {});
      }
      await this.store.finish(job, "FAILED", message);
    }
  }
}
