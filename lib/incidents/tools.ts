import { assert } from "../domain.ts";
import { extractEntities } from "./intake.ts";
import type { IncidentStore } from "./store.ts";
import type { BankRecord, Incident, Route } from "./domain.ts";
export interface ToolOutput {
  type: string;
  summary: string;
  payload: Record<string, unknown>;
  observed_at: string;
}
export const investigatorTools: Record<Route, string[]> = {
  DISPUTE_PILOT: [
    "get_card_transaction",
    "get_3ds_evidence",
    "get_card_status",
    "get_case_history",
    "find_duplicate_settlements",
    "get_refund_evidence",
    "get_dispute_rulebook",
  ],
  SCAM_RESCUE: [
    "get_recent_transfers",
    "get_beneficiary_history",
    "get_session_signals",
    "get_security_events",
    "get_case_history",
    "get_scam_rulebook",
  ],
  ROPAY_RESCUE: [
    "get_transfer",
    "get_transfer_status",
    "get_alias_snapshot",
    "get_beneficiary_history",
    "get_transfer_rulebook",
  ],
  ATM_TRACE: [
    "get_atm_transaction",
    "get_atm_journal",
    "get_dispense_events",
    "get_reversal_status",
    "get_atm_reconciliation",
    "get_atm_rulebook",
  ],
  HUMAN_REVIEW: [],
};
export const toolLabels: Record<string, string> = {
  get_incident: "Preluare sesizare",
  find_candidate_transactions: "Identificare tranzacții candidate",
  get_customer_responses: "Preluare răspunsuri client",
  get_card_transaction: "Tranzacție card",
  get_3ds_evidence: "Autentificare 3DS",
  get_card_status: "Starea cardului",
  get_case_history: "Istoric incidente",
  find_duplicate_settlements: "Comparație decontări",
  get_refund_evidence: "Dovezi rambursare",
  get_dispute_rulebook: "Reguli DisputePilot",
  get_recent_transfers: "Transferuri recente",
  get_beneficiary_history: "Istoric beneficiar",
  get_session_signals: "Semnale sesiune",
  get_security_events: "Evenimente de securitate",
  get_scam_rulebook: "Reguli ScamRescue",
  get_transfer: "Detalii transfer",
  get_transfer_status: "Status transfer",
  get_alias_snapshot: "Alias la momentul plății",
  get_transfer_rulebook: "Reguli RoPay Rescue",
  get_atm_transaction: "Tranzacție ATM",
  get_atm_journal: "Jurnal ATM",
  get_dispense_events: "Evenimente numerar",
  get_reversal_status: "Verificare reversare",
  get_atm_reconciliation: "Reconciliere ATM",
  get_atm_rulebook: "Reguli ATMTrace",
};
export async function callTool(
  store: IncidentStore,
  owner: string,
  c: Incident,
  name: string,
  attempt: number,
): Promise<ToolOutput> {
  const output = (
    type: string,
    summary: string,
    payload: Record<string, unknown>,
    observed_at = new Date().toISOString(),
  ) => ({ type, summary, payload, observed_at });
  if (name === "get_incident")
    return output(
      "CUSTOMER_CLAIM",
      "Sesizarea clientului a fost înregistrată ca declarație neconfirmată.",
      {
        statement: c.statement,
        customer_id: c.customer_id,
        declared_entities: extractEntities(c.statement),
      },
    );
  if (name === "find_candidate_transactions") {
    const all = await store.bankRecords(owner, c.customer_id);
    const candidates = all.filter((r) => c.candidate_ids.includes(r.id));
    return output(
      "TRANSACTION_CANDIDATES",
      `${candidates.length} tranzacții candidate există în setul sintetic al clientului.`,
      {
        candidates: candidates.map((r) => ({
          id: r.id,
          channel: r.channel,
          amount_minor: r.amount_minor,
          status: r.status,
          descriptor: r.descriptor,
        })),
      },
    );
  }
  if (name === "get_customer_responses") {
    const answered = c.requests.filter((r) => r.status === "ANSWERED");
    return output(
      "CUSTOMER_CLAIM",
      `${answered.length} răspunsuri aprobate și transmise de client au fost înregistrate.`,
      {
        responses: answered.map((r) => ({
          request_id: r.id,
          answers: r.answers,
          attachment: r.attachment,
          at: r.answered_at,
        })),
      },
    );
  }
  if (name.endsWith("_rulebook")) {
    const id =
      name === "get_dispute_rulebook"
        ? "DISPUTE_PILOT"
        : name === "get_scam_rulebook"
          ? "SCAM_RESCUE"
          : name === "get_transfer_rulebook"
            ? "ROPAY_RESCUE"
            : "ATM_TRACE";
    const book = await store.db
      .prepare("SELECT data FROM b2c_rulebook_versions WHERE id=?")
      .bind(id)
      .first<{ data: string }>();
    assert(
      book,
      "RULEBOOK_UNAVAILABLE",
      "Rulebook-ul demonstrativ nu este disponibil.",
      503,
    );
    return output(
      "RULEBOOK",
      `Rulebook ${JSON.parse(book.data).version} disponibil pentru verificare.`,
      JSON.parse(book.data),
    );
  }
  const r = await store.bankRecord(owner, c.transaction_id, c.customer_id);
  assert(
    r,
    "TRANSACTION_NOT_FOUND",
    "Tranzacția relevantă nu a fost identificată.",
    422,
  );
  if (
    (r.fault === "TOOL_UNAVAILABLE" ||
      (r.fault === "TOOL_ONCE" && attempt === 1)) &&
    [
      "get_session_signals",
      "get_3ds_evidence",
      "get_atm_journal",
      "get_alias_snapshot",
    ].includes(name)
  )
    throw new Error(
      "Adaptorul sintetic nu este disponibil. Timeout controlat.",
    );
  if (name === "get_case_history") {
    const previous = (await store.list(owner)).filter(
      (i) => i.customer_id === c.customer_id && i.id !== c.id,
    );
    return output(
      "CASE_HISTORY",
      `${previous.length} alte incidente sintetice sunt asociate clientului.`,
      { references: previous.map((i) => i.reference) },
      r.occurred_at,
    );
  }
  if (name === "get_card_transaction") {
    assert(
      r.channel === "CARD",
      "CHANNEL_MISMATCH",
      "Tranzacția nu este o plată cu cardul.",
    );
    return output(
      "TRANSACTION",
      `Plata cu cardul ${r.id} are status ${r.status}, suma ${r.amount_minor} unități minore RON.`,
      {
        transaction: r.card_context?.transaction,
        amount_minor: r.amount_minor,
        status: r.status,
        descriptor: r.descriptor,
      },
      r.occurred_at,
    );
  }
  if (name === "get_3ds_evidence") {
    const auth = r.card_context?.auth;
    return output(
      "AUTHENTICATION",
      auth?.three_ds_status === "VERIFIED"
        ? "O dovadă sintetică 3DS este disponibilă."
        : "Dovada 3DS este necunoscută în setul curent.",
      { ...auth },
      r.occurred_at,
    );
  }
  if (name === "get_card_status")
    return output(
      "CARD",
      `Cardul mascat •••• ${r.card_last4} are starea ${r.card_context?.card_status ?? "UNKNOWN"}.`,
      { last4: r.card_last4, status: r.card_context?.card_status },
      r.occurred_at,
    );
  if (name === "find_duplicate_settlements") {
    const candidates = r.card_context?.duplicate_candidates ?? [];
    return output(
      "DUPLICATES",
      `${new Set(candidates.filter((x) => x.status === "SETTLED").map((x) => x.id)).size} decontări distincte în tranzacțiile candidate.`,
      { candidates },
      r.occurred_at,
    );
  }
  if (name === "get_refund_evidence")
    return output(
      "REFUND",
      r.card_context?.refund.confirmed
        ? "Există o confirmare sintetică de rambursare."
        : "Nu există confirmare de rambursare în setul disponibil.",
      { ...r.card_context?.refund },
      r.occurred_at,
    );
  if (name === "get_recent_transfers") {
    const transfers = (await store.bankRecords(owner, c.customer_id)).filter(
      (x) => x.channel === "TRANSFER",
    );
    return output(
      "TRANSFERS",
      `${transfers.length} transferuri sintetice disponibile; transferul relevant este ${r.id}.`,
      {
        transfers: transfers.map((x) => ({
          id: x.id,
          amount_minor: x.amount_minor,
          status: x.status,
          at: x.occurred_at,
        })),
      },
      r.occurred_at,
    );
  }
  if (name === "get_beneficiary_history")
    return output(
      "BENEFICIARY",
      r.transfer?.beneficiary_known
        ? "Beneficiarul apare în istoricul sintetic."
        : "Beneficiarul nu apare în istoricul anterior disponibil. Aceasta nu dovedește fraudă.",
      {
        beneficiary: r.transfer?.beneficiary,
        known: r.transfer?.beneficiary_known,
      },
      r.occurred_at,
    );
  if (name === "get_session_signals")
    return output(
      "SESSION",
      r.security?.session_summary ?? "Semnale de sesiune indisponibile.",
      { ...r.security },
      r.occurred_at,
    );
  if (name === "get_security_events")
    return output(
      "SECURITY",
      r.security?.remote_signal === "DETECTED"
        ? "Există un semnal tehnic sintetic de acces la distanță."
        : "Nu există un semnal tehnic confirmat de acces la distanță în datele disponibile.",
      {
        remote_signal: r.security?.remote_signal ?? "UNKNOWN",
        credential_signal: r.security?.credential_signal ?? "UNKNOWN",
        conflict: r.security?.conflict ?? false,
      },
      r.occurred_at,
    );
  if (name === "get_transfer") {
    assert(
      r.channel === "TRANSFER",
      "CHANNEL_MISMATCH",
      "Operațiunea nu este un transfer.",
    );
    return output(
      "TRANSFER",
      `Transferul ${r.id} are suma ${r.amount_minor} unități minore RON către ${r.transfer?.beneficiary}.`,
      {
        id: r.id,
        amount_minor: r.amount_minor,
        beneficiary: r.transfer?.beneficiary,
        reference: r.transfer?.reference,
      },
      r.occurred_at,
    );
  }
  if (name === "get_transfer_status")
    return output(
      "TRANSFER_STATUS",
      `Transferul este ${r.status}. Un transfer decontat nu este anulat de această investigație.`,
      { status: r.status },
      r.occurred_at,
    );
  if (name === "get_alias_snapshot")
    return output(
      "ALIAS",
      `Aliasul folosit la plată este ${r.transfer?.alias}; beneficiarul efectiv este ${r.transfer?.beneficiary}.`,
      {
        alias: r.transfer?.alias,
        beneficiary: r.transfer?.beneficiary,
        intended_name: r.transfer?.intended_name,
        intended_alias: r.transfer?.intended_alias,
        intent_source: "CUSTOMER_CLAIM",
      },
      r.occurred_at,
    );
  if (name === "get_atm_transaction") {
    assert(r.channel === "ATM", "CHANNEL_MISMATCH", "Operațiunea nu este ATM.");
    return output(
      "ATM_TRANSACTION",
      `Operațiunea ATM ${r.id} este înregistrată cu status ${r.status}, suma ${r.amount_minor} unități minore RON.`,
      {
        terminal_id: r.atm?.terminal_id,
        amount_minor: r.amount_minor,
        status: r.status,
      },
      r.occurred_at,
    );
  }
  if (name === "get_atm_journal")
    return output(
      "ATM_JOURNAL",
      r.atm?.journal_complete
        ? "Jurnalul ATM sintetic este disponibil complet."
        : "Jurnalul ATM este incomplet; nu permite o concluzie definitivă.",
      { complete: r.atm?.journal_complete, events: r.atm?.events },
      r.occurred_at,
    );
  if (name === "get_dispense_events")
    return output(
      "ATM_DISPENSE",
      `Starea tehnică a eliberării numerarului este ${r.atm?.dispense_status ?? "UNKNOWN"}. Debitarea nu dovedește eliberarea.`,
      {
        status: r.atm?.dispense_status,
        dispensed_minor: r.atm?.dispensed_minor,
        events: r.atm?.events,
      },
      r.occurred_at,
    );
  if (name === "get_reversal_status")
    return output(
      "ATM_REVERSAL",
      r.atm?.reversal_minor
        ? `O reversare de ${r.atm.reversal_minor} unități minore RON este înregistrată.`
        : "Nu există o reversare înregistrată în setul curent.",
      { reversal_minor: r.atm?.reversal_minor ?? 0 },
      r.occurred_at,
    );
  if (name === "get_atm_reconciliation")
    return output(
      "ATM_RECONCILIATION",
      `Starea reconcilierii ATM este ${r.atm?.reconciliation ?? "UNKNOWN"}.`,
      { state: r.atm?.reconciliation, conflict: r.atm?.conflict },
      r.occurred_at,
    );
  throw new Error("Instrument neînregistrat.");
}
