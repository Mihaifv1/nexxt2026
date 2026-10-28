import type { DisputeCase, Evaluation, Question } from "./domain.ts";
export const questionBank: Question[] = [
  {
    id: "Q1",
    key: "recognition",
    text: "Recunoști comerciantul, chiar dacă denumirea afișată este diferită?",
    reason: "Clarifică dacă descriptorul comerciantului este cunoscut.",
    answer_type: "YES_NO_UNSURE",
  },
  {
    id: "Q2",
    key: "authorization",
    text: "Ai autorizat personal această plată?",
    reason: "Confirmă declarația clientului despre autorizarea plății.",
    answer_type: "YES_NO_UNSURE",
  },
  {
    id: "Q3",
    key: "refund_confirmation",
    text: "Ai primit de la comerciant o confirmare a rambursării?",
    reason: "Dovada rambursării promise lipsește din setul disponibil.",
    answer_type: "YES_NO_UNSURE",
  },
];
export function evaluate(c: DisputeCase) {
  const rules: Evaluation[] = [];
  const refs = (type: string) =>
    c.evidence.filter((e) => e.type === type).map((e) => e.id);
  const add = (
    rule_id: string,
    result: string,
    severity: Evaluation["severity"],
    explanation: string,
    evidence_refs: string[] = [],
  ) => rules.push({ rule_id, result, severity, explanation, evidence_refs });
  const answers = Object.assign(
    {},
    ...c.requests
      .filter((r) => r.status === "ANSWERED")
      .map((r) => r.answers ?? {}),
  ) as Record<string, string>;
  let questions: Question[] = [];
  let route = "UNRECOGNIZED_CNP";
  let escalate = false;
  if (!c.transaction) {
    add(
      "DSP-001",
      "ESCALATE_DATA_ISSUE",
      "block",
      "Tranzacția nu a fost găsită. Este necesară verificarea sursei.",
      refs("transaction"),
    );
    route = "ESCALATE_DATA_ISSUE";
    escalate = true;
  } else if (
    c.conflict ||
    (answers.recognition === "NO" && answers.authorization === "YES")
  ) {
    add(
      "DSP-006",
      "CONFLICT_ESCALATE",
      "block",
      "Dovezile sau declarațiile se contrazic. Concluzia necesită revizuire umană.",
      [...refs("history"), ...refs("statement"), ...refs("customer_response")],
    );
    route = "CONFLICT_ESCALATE";
    escalate = true;
  } else if (c.card_status === "LOST") {
    add(
      "DSP-007",
      "PRIORITY_SECURITY_REVIEW",
      "block",
      "Card declarat pierdut. Se recomandă revizuire prioritară de securitate.",
      refs("card"),
    );
    route = "PRIORITY_SECURITY_REVIEW";
    escalate = true;
  } else if (c.category === "POSSIBLE_DUPLICATE") {
    const candidates = c.duplicate_candidates.filter(
      (t) =>
        t.status === "SETTLED" &&
        t.amount_minor === c.transaction!.amount_minor &&
        t.currency === c.transaction!.currency &&
        t.merchant === c.transaction!.merchant &&
        Math.abs(
          Date.parse(t.occurred_at) - Date.parse(c.transaction!.occurred_at),
        ) <= 86400000,
    );
    const ids = new Set(candidates.map((t) => t.id));
    const references = new Set(candidates.map((t) => t.reference));
    if (ids.size >= 2 && references.size >= 2) {
      route = "POSSIBLE_DUPLICATE_REVIEW";
      add(
        "DSP-004",
        route,
        "pass",
        "Două tranzacții distincte, cu referințe distincte și decontări confirmate.",
        refs("duplicates"),
      );
    } else {
      route = "INSUFFICIENT_DUPLICATE_EVIDENCE";
      add(
        "DSP-005",
        route,
        "warning",
        "Nu există două decontări distincte. Două autorizări nu confirmă o duplicare.",
        refs("duplicates"),
      );
    }
  } else if (c.category === "REFUND_NOT_RECEIVED") {
    route = "REFUND_REVIEW";
    if (
      !c.refund.confirmed &&
      !["YES", "NO"].includes(answers.refund_confirmation)
    )
      questions = [questionBank[2]];
  } else {
    questions = questionBank
      .slice(0, 2)
      .filter((q) => !["YES", "NO"].includes(answers[q.key]));
    if (answers.recognition === "YES") route = "MERCHANT_RECOGNIZED_REVIEW";
  }
  if (
    c.transaction &&
    c.category !== "POSSIBLE_DUPLICATE" &&
    c.auth.three_ds_status === "UNKNOWN"
  )
    add(
      "DSP-003",
      "AUTH_EVIDENCE_UNKNOWN",
      "warning",
      "Dovada 3DS nu este disponibilă. Aceasta nu demonstrează fraudă.",
      refs("authentication"),
    );
  if (questions.length)
    add(
      "DSP-002",
      "MISSING_CUSTOMER_INFO",
      "warning",
      "Lipsesc confirmări esențiale din partea clientului.",
      [...refs("statement"), ...refs("customer_response")],
    );
  if (!escalate && !questions.length)
    add(
      "DSP-008",
      "READY_FOR_HUMAN_REVIEW",
      "pass",
      "Dovezile disponibile permit propunerea unui traseu pentru revizuire umană.",
      c.evidence.map((e) => e.id),
    );
  add(
    "DSP-009",
    "HUMAN_APPROVAL_REQUIRED",
    "pass",
    "Cererea către client poate fi creată numai după aprobarea angajatului.",
  );
  add(
    "DSP-010",
    "FINANCIAL_ACTIONS_BLOCKED",
    "pass",
    "Rambursările, blocarea cardurilor și chargeback-urile reale nu sunt implementate.",
  );
  return { rules, questions, route, escalate, answers };
}
