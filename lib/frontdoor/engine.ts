import { assert, now, uid, type AuditEvent } from "../domain.ts";
import type { Actor } from "../engine.ts";
import type { ProviderConfig } from "../provider.ts";
import {
  actionSchema,
  type CustomerProfile,
  type FieldKey,
  type Purpose,
  type ProfileAction,
  type ProfileField,
  type Value,
  type Appointment,
} from "./domain.ts";
import { ProfileStore, newProfile } from "./store.ts";
import {
  agentAccess,
  hasConsent,
  evaluateProfile,
  requiredFields,
} from "./rules.ts";
import {
  extractDocument,
  extractIntake,
  propose,
  validateValue,
} from "./extraction.ts";
export function branchSlots() {
  const result: { id: string; branch: string; starts_at: string }[] = [];
  for (let day = 1; day <= 3; day++) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + day);
    if ([0, 6].includes(date.getUTCDay())) continue;
    for (const [branch, slug] of [
      ["București · Universitate", "UNI"],
      ["București · Tineretului", "TIN"],
    ])
      for (const hour of [8, 10, 12]) {
        date.setUTCHours(hour, 0, 0, 0);
        result.push({
          id: slug + "-" + date.toISOString(),
          branch,
          starts_at: date.toISOString(),
        });
      }
  }
  return result;
}
export function consentFields(p: CustomerProfile, purpose: Purpose) {
  return Object.values(p.fields).filter(
    (f): f is ProfileField => !!f && hasConsent(p, f.key, purpose),
  );
}
export function briefStale(p: CustomerProfile) {
  if (!p.brief) return true;
  const index = p.audit.findLastIndex(
    (e) =>
      e.event_type === "BANKER_BRIEF_PREPARED" &&
      e.payload.brief_id === p.brief!.id,
  );
  return (
    p.brief.source_evaluation !== p.evaluations.at(-1)?.id ||
    p.audit
      .slice(index + 1)
      .some((e) =>
        [
          "CONSENT_CHANGED",
          "PROFILE_FIELDS_CONFIRMED",
          "PROFILE_FIELDS_UPDATED",
          "DOCUMENT_REJECTED",
          "INTAKE_COMPLETED",
          "DOCUMENT_EXTRACTED",
        ].includes(e.event_type),
      )
  );
}
export function profileView(p: CustomerProfile) {
  const latest = p.evaluations.at(-1);
  const allowed = consentFields(p, "BRANCH_HANDOFF");
  const keys = new Set(allowed.map((f) => f.key));
  return {
    ...p,
    processed: {},
    handoff_view: p.brief
      ? {
          id: p.brief.id,
          timestamp: p.brief.timestamp,
          facts: allowed.filter((f) => p.brief!.field_keys.includes(f.key)),
          missing_fields: requiredFields(p.goal).filter((k) => !keys.has(k)),
          missing_documents: evaluateProfile(p).missing_documents,
          stale: briefStale(p),
          goal: p.goal,
          linked_case_id: p.linked_case_id,
        }
      : null,
  };
}
export class FrontDoorEngine {
  constructor(
    public store: ProfileStore,
    public owner: string,
    public actor: Actor,
    public config: ProviderConfig = {},
  ) {}
  event(
    p: CustomerProfile,
    event_type: string,
    payload: Record<string, unknown> = {},
    actor_type = this.actor.role as string,
  ) {
    const e: AuditEvent = {
      event_id: uid("EVT"),
      case_id: p.id,
      actor_id:
        actor_type === "SYSTEM" ? "frontdoor-orchestrator" : this.actor.id,
      actor_type,
      event_type,
      timestamp: now(),
      payload,
      correlation_id: uid("JOURNEY"),
    };
    p.audit.push(e);
  }
  readAgent(p: CustomerProfile, agent: string) {
    const policy = agentAccess[agent];
    assert(policy, "AGENT_NOT_ALLOWED", "Agent necunoscut.", 403);
    const permitted =
      agent === "PRODUCT"
        ? policy.fields.filter((k) => requiredFields(p.goal).includes(k))
        : agent === "FINANCIAL_HEALTH" && !["CAR", "HOME"].includes(p.goal)
          ? []
          : policy.fields;
    const fields_read = permitted.filter(
      (k) => p.fields[k] && hasConsent(p, k, policy.purpose),
    );
    const denied_fields = permitted.filter(
      (k) => p.fields[k] && !hasConsent(p, k, policy.purpose),
    );
    const projection = Object.fromEntries(
      fields_read.map((k) => [k, p.fields[k]!]),
    );
    p.agent_steps.push({
      id: uid("STEP"),
      agent,
      purpose: policy.purpose,
      fields_read: [...fields_read],
      denied_fields: [...denied_fields],
      summary: `${fields_read.length} câmpuri citite; ${denied_fields.length} câmpuri protejate.`,
      timestamp: now(),
    });
    this.event(
      p,
      "AGENT_FIELDS_ACCESSED",
      { agent, purpose: policy.purpose, fields_read, denied_fields },
      "SYSTEM",
    );
    return projection;
  }
  grant(
    p: CustomerProfile,
    field_keys: FieldKey[],
    purpose: Purpose,
    granted: boolean,
  ) {
    p.consents.push({
      id: uid("CONSENT"),
      field_keys,
      purpose,
      granted,
      timestamp: now(),
      actor: this.actor.id,
    });
    this.event(p, "CONSENT_CHANGED", { field_keys, purpose, granted });
  }
  set(
    p: CustomerProfile,
    key: FieldKey,
    value: Value,
    source_id: string,
    source_type: ProfileField["source_type"],
    verified: ProfileField["verified"],
  ) {
    validateValue(key, value);
    if (p.fields[key]) p.field_history.push(p.fields[key]!);
    p.fields[key] = {
      key,
      value,
      source_id,
      source_type,
      verified,
      updated_at: now(),
    };
    for (const proposal of p.proposals)
      if (proposal.key === key && proposal.status === "PENDING")
        proposal.status = "REJECTED";
  }
  evaluate(p: CustomerProfile) {
    for (const agent of ["CAR", "HOME"].includes(p.goal)
      ? [
          "IDENTITY",
          "PRODUCT",
          "FINANCIAL_HEALTH",
          "DOCUMENT_READINESS",
          "LIFE_EVENT",
        ]
      : p.goal === "SAVINGS"
        ? ["IDENTITY", "PRODUCT", "DOCUMENT_READINESS"]
        : p.goal === "DISPUTE"
          ? ["DISPUTE", "DOCUMENT_READINESS"]
          : ["INTENT"])
      this.readAgent(p, agent);
    const e = evaluateProfile(p);
    p.evaluations.push(e);
    this.event(
      p,
      "ELIGIBILITY_EVALUATED",
      {
        evaluation_id: e.id,
        rulebook: e.rulebook_version,
        products: e.products.map((x) => ({ id: x.id, outcome: x.outcome })),
        exception_codes: e.exceptions.map((x) => x.code),
      },
      "SYSTEM",
    );
    return e;
  }
  async act(id: string, input: unknown, key: string) {
    assert(
      ["B2C_AGENT", "B2C_SUPERVISOR"].includes(this.actor.role),
      "FORBIDDEN",
      "Acțiunea necesită un angajat demo.",
      403,
    );
    const action = actionSchema.parse(input);
    assert(
      key && key.length <= 150,
      "IDEMPOTENCY_REQUIRED",
      "Lipsește Idempotency-Key.",
    );
    let p = await this.store.get(this.owner, id);
    const old = p.processed[key];
    if (old) {
      assert(
        old.fingerprint === JSON.stringify(action),
        "IDEMPOTENCY_CONFLICT",
        "Cheia a fost utilizată pentru altă cerere.",
        409,
      );
      return old.result;
    }
    assert(
      p.version === action.expected_version,
      "VERSION_CONFLICT",
      "Profilul a fost modificat. Reîncarcă datele.",
      409,
    );
    const expected = p.version;
    let booking: { add?: Appointment; remove?: Appointment } | undefined;
    let result: Record<string, unknown> = {
      customer_id: p.id,
      action: action.action,
    };
    if (action.action === "INTAKE") {
      this.readAgent(p, "INTAKE");
      this.readAgent(p, "INTENT");
      const extraction = await extractIntake(action.text, this.config);
      const source_id = uid("MSG");
      p.messages.push({
        id: source_id,
        role: "CUSTOMER",
        text: action.text,
        timestamp: now(),
      });
      if (extraction.goal !== "UNKNOWN") {
        p.goal = extraction.goal;
        p.goals.push({ goal: p.goal, timestamp: now() });
      }
      propose(p, extraction.fields, source_id, "STATEMENT");
      p.messages.push({
        id: uid("MSG"),
        role: "SYSTEM",
        text: extraction.currency_warning
          ? "Demo-ul folosește RON. Confirmă sumele în lei; nu efectuăm conversii valutare."
          : `Am identificat ${extraction.fields.length} informații pentru confirmare. Datele deja cunoscute rămân în profil.`,
        timestamp: now(),
      });
      this.event(p, "INTAKE_COMPLETED", {
        source_id,
        extracted_keys: extraction.fields.map((f) => f.key),
        goal: p.goal,
        untrusted_instruction_detected: extraction.untrusted_instruction,
        provider: this.config.LLM_ENDPOINT ? "LLM" : "DETERMINISTIC_DEMO",
      });
      if (extraction.untrusted_instruction)
        this.event(p, "UNTRUSTED_STATEMENT_IGNORED", { source_id });
    } else if (action.action === "UPLOAD_DOCUMENT") {
      this.readAgent(p, "DOCUMENT");
      assert(
        hasConsent(p, "full_name", "INTAKE"),
        "CONSENT_REQUIRED",
        "Permite utilizarea numelui pentru verificarea documentului demo.",
        403,
      );
      const fields = extractDocument(action.kind, action.content, p);
      const doc = {
        id: uid("DOC"),
        kind: action.kind,
        name: action.name,
        content: action.content,
        created_at: now(),
        proposal_ids: [] as string[],
        status: "EXTRACTED" as const,
      };
      propose(p, fields, doc.id, "DOCUMENT");
      doc.proposal_ids = p.proposals
        .filter((x) => x.source_id === doc.id)
        .map((x) => x.id);
      p.documents.push(doc);
      this.event(p, "DOCUMENT_EXTRACTED", {
        document_id: doc.id,
        kind: doc.kind,
        extracted_keys: fields.map((f) => f.key),
      });
    } else if (action.action === "CONFIRM_FIELDS") {
      const selected = action.proposals.map((s) => {
        const proposal = p.proposals.find((x) => x.id === s.id);
        assert(
          proposal && proposal.status === "PENDING",
          "STALE_PROPOSAL",
          "Propunerea nu mai este disponibilă.",
          409,
        );
        return { proposal, value: s.value ?? proposal.value };
      });
      assert(
        new Set(selected.map((x) => x.proposal.key)).size === selected.length,
        "DUPLICATE_FIELDS",
        "Alege o singură sursă pentru fiecare câmp.",
      );
      for (const { proposal, value } of selected) {
        assert(
          !["full_name", "identity_verified", "identity_expiry"].includes(
            proposal.key,
          ) || value === proposal.value,
          "PROTECTED_FIELD",
          "Câmpul de identitate trebuie confirmat exact ca în document.",
          403,
        );
        this.set(
          p,
          proposal.key,
          value,
          proposal.source_id,
          proposal.source_type,
          proposal.key === "identity_verified"
            ? "SYNTHETIC_VERIFIED"
            : "HUMAN_CONFIRMED",
        );
        proposal.status = "ACCEPTED";
      }
      const keys = selected.map((x) => x.proposal.key);
      this.grant(p, keys, "INTAKE", true);
      for (const purpose of action.purposes)
        if (purpose !== "INTAKE") this.grant(p, keys, purpose, true);
      this.event(p, "PROFILE_FIELDS_CONFIRMED", {
        field_keys: keys,
        proposal_ids: selected.map((x) => x.proposal.id),
      });
    } else if (action.action === "UPDATE_FIELDS") {
      for (const f of action.fields) {
        assert(
          !["full_name", "identity_verified", "identity_expiry"].includes(
            f.key,
          ),
          "PROTECTED_FIELD",
          "Identitatea se confirmă prin documentul sintetic.",
          403,
        );
        this.set(p, f.key, f.value, uid("FORM"), "FORM", "HUMAN_CONFIRMED");
      }
      const keys = action.fields.map((f) => f.key);
      this.grant(p, keys, "INTAKE", true);
      for (const purpose of action.purposes)
        if (purpose !== "INTAKE") this.grant(p, keys, purpose, true);
      this.event(p, "PROFILE_FIELDS_UPDATED", { field_keys: keys });
    } else if (action.action === "CONSENT") {
      this.grant(p, action.field_keys, action.purpose, action.granted);
      this.event(p, "HANDOFF_INVALIDATED", { reason: "CONSENT_CHANGED" });
    } else if (action.action === "REJECT_DOCUMENT") {
      const doc = p.documents.find((d) => d.id === action.document_id);
      assert(doc, "NOT_FOUND", "Document inexistent.", 404);
      doc.status = "REJECTED";
      for (const proposal of p.proposals)
        if (proposal.source_id === doc.id) proposal.status = "REJECTED";
      for (const field of Object.values(p.fields))
        if (field?.source_id === doc.id) {
          p.field_history.push(field);
          delete p.fields[field.key];
        }
      this.event(p, "DOCUMENT_REJECTED", { document_id: doc.id });
    } else if (action.action === "EVALUATE") this.evaluate(p);
    else if (action.action === "PREPARE_HANDOFF") {
      const evaluation = this.evaluate(p);
      const projection = this.readAgent(p, "BANKER_COPILOT");
      assert(
        Object.keys(projection).length,
        "CONSENT_REQUIRED",
        "Nu există câmpuri aprobate pentru pregătirea consilierului.",
        403,
      );
      p.brief = {
        id: uid("BRIEF"),
        timestamp: now(),
        field_keys: Object.keys(projection) as FieldKey[],
        source_evaluation: evaluation.id,
      };
      this.event(p, "BANKER_BRIEF_PREPARED", {
        brief_id: p.brief.id,
        field_keys: p.brief.field_keys,
        evaluation_id: evaluation.id,
      });
    } else if (action.action === "BOOK_APPOINTMENT") {
      assert(
        !p.appointments.some((a) =>
          ["BOOKED", "CHECKED_IN"].includes(a.status),
        ),
        "ACTIVE_APPOINTMENT",
        "Există deja o programare activă.",
        409,
      );
      assert(
        hasConsent(p, "full_name", "BRANCH_HANDOFF"),
        "CONSENT_REQUIRED",
        "Acordă permisiunea pentru nume în scopul programării.",
        403,
      );
      const slot = branchSlots().find((s) => s.id === action.slot_id);
      assert(
        slot && Date.parse(slot.starts_at) > Date.now(),
        "SLOT_UNAVAILABLE",
        "Intervalul nu mai este disponibil.",
        409,
      );
      assert(
        !(await this.store.occupied(this.owner)).includes(slot.id),
        "SLOT_UNAVAILABLE",
        "Intervalul a fost rezervat. Alege altul.",
        409,
      );
      this.readAgent(p, "APPOINTMENT");
      const appointment: Appointment = {
        id: uid("APT"),
        slot_id: slot.id,
        branch: slot.branch,
        starts_at: slot.starts_at,
        status: "BOOKED",
        code: crypto.randomUUID().slice(0, 8).toUpperCase(),
        created_at: now(),
      };
      p.appointments.push(appointment);
      booking = { add: appointment };
      this.event(p, "APPOINTMENT_BOOKED", {
        appointment_id: appointment.id,
        slot_id: slot.id,
      });
      result = { ...result, appointment_id: appointment.id };
    } else if (action.action === "CANCEL_APPOINTMENT") {
      const a = p.appointments.find((a) => a.id === action.appointment_id);
      assert(
        a && a.status === "BOOKED",
        "INVALID_STATE",
        "Programarea nu poate fi anulată.",
        409,
      );
      a.status = "CANCELLED";
      booking = { remove: a };
      this.event(p, "APPOINTMENT_CANCELLED", { appointment_id: a.id });
    } else if (action.action === "CHECK_IN") {
      const a = p.appointments.find((a) => a.id === action.appointment_id);
      assert(
        a && a.status === "BOOKED",
        "INVALID_STATE",
        "Nu există o programare care așteaptă sosirea.",
        409,
      );
      assert(
        a.code === action.code.trim().toUpperCase(),
        "INVALID_CHECKIN_CODE",
        "Codul de check-in nu corespunde.",
        403,
      );
      a.status = "CHECKED_IN";
      a.checked_in_at = now();
      this.event(p, "CUSTOMER_CHECKED_IN", {
        appointment_id: a.id,
        method: "DEMO_APP_CONFIRMATION",
      });
    } else if (action.action === "COMPLETE_HANDOFF") {
      const a = p.appointments.find((a) => a.id === action.appointment_id);
      assert(
        a && a.status === "CHECKED_IN",
        "INVALID_STATE",
        "Confirmă sosirea clientului înainte de rezultat.",
        409,
      );
      assert(
        p.brief,
        "BRIEF_REQUIRED",
        "Pregătește dosarul consilierului înainte de rezultat.",
        409,
      );
      if (action.outcome === "APPLICATION_DEMO") {
        assert(
          !briefStale(p),
          "STALE_BRIEF",
          "Actualizează dosarul înainte de continuarea cu o cerere demo.",
          409,
        );
        assert(
          evaluateProfile(p).products.some(
            (product) => product.outcome === "POTENTIAL_MATCH",
          ),
          "REVIEW_REQUIRED",
          "Regulile nu permit continuarea cu o cerere demo. Alege clarificare sau escaladare.",
          409,
        );
      }
      a.status = action.outcome === "ESCALATED" ? "ESCALATED" : "COMPLETED";
      a.outcome = action.outcome;
      a.note = action.note;
      booking = { remove: a };
      this.event(p, "HANDOFF_OUTCOME_RECORDED", {
        appointment_id: a.id,
        outcome: a.outcome,
      });
    } else if (action.action === "RESET_PROFILE") {
      assert(
        this.actor.role === "B2C_SUPERVISOR",
        "FORBIDDEN",
        "Resetarea necesită supervizor.",
        403,
      );
      const active = p.appointments.find((a) =>
        ["BOOKED", "CHECKED_IN"].includes(a.status),
      );
      if (active) booking = { remove: active };
      const old = p;
      p = newProfile({
        customer_id: old.id,
        customer_name: old.name,
        id: old.linked_case_id,
      });
      p.audit = old.audit;
      p.processed = old.processed;
      this.event(p, "CUSTOMER_PROFILE_RESET");
    }
    for (const doc of p.documents)
      if (doc.status !== "REJECTED") {
        const statuses = doc.proposal_ids.map(
          (id) => p.proposals.find((x) => x.id === id)?.status,
        );
        doc.status = statuses.every((s) => s === "ACCEPTED")
          ? "CONFIRMED"
          : statuses.some((s) => s === "REJECTED")
            ? "REJECTED"
            : "EXTRACTED";
      }
    p.processed[key] = { fingerprint: JSON.stringify(action), result };
    await this.store.save(this.owner, p, expected, booking);
    return result;
  }
}
