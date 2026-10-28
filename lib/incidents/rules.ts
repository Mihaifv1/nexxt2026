import { evaluate as evaluateDispute } from "../rules.ts";
import { assert } from "../domain.ts";
import {
  uuid,
  type Incident,
  type Evidence,
  type BankRecord,
  type Route,
  type Rule,
  type Question,
  type ActionType,
  type Triage,
  type Run,
} from "./domain.ts";
export const versionFor = (route: Route) =>
  ({
    DISPUTE_PILOT: "demo-v1",
    SCAM_RESCUE: "scam-demo-v1",
    ROPAY_RESCUE: "ropay-demo-v1",
    ATM_TRACE: "atm-demo-v1",
    HUMAN_REVIEW: "payment-demo-v1",
  })[route];
export function answers(c: Incident): Record<string, string> {
  return Object.assign(
    {},
    ...c.requests
      .filter((r) => r.status === "ANSWERED")
      .map((r) => r.answers ?? {}),
  );
}
export function manipulation(c: Incident) {
  const a = answers(c);
  return (
    a.manipulated === "YES" ||
    a.remote_access === "YES" ||
    a.credentials_shared === "YES" ||
    /cont sigur|apel.*banc|apelant|presiun|presată|manipul|scam|acces la distanță|remote access|fals.*invest/i.test(
      c.statement,
    )
  );
}
export function compatible(route: Route, r: BankRecord | null) {
  return (
    route === "HUMAN_REVIEW" ||
    (!!r &&
      (route === "DISPUTE_PILOT"
        ? r.channel === "CARD"
        : route === "ROPAY_RESCUE"
          ? r.channel === "TRANSFER"
          : route === "ATM_TRACE"
            ? r.channel === "ATM"
            : r.channel === "TRANSFER" || r.channel === "CARD"))
  );
}
export function classifyRoute(
  c: Incident,
  r: BankRecord | null,
  candidates: BankRecord[],
): Omit<Triage, "duration_ms" | "provider" | "evidence_ids"> {
  let route: Route = "HUMAN_REVIEW";
  let reason = "Tranzacția sau tipul incidentului nu poate fi stabilit sigur.";
  const a = answers(c);
  if (r) {
    if (r.channel === "ATM") {
      route = "ATM_TRACE";
      reason =
        "Tranzacție ATM identificată; cardul menționat nu transformă incidentul într-o dispută comercială.";
    } else if (manipulation(c)) {
      route = "SCAM_RESCUE";
      reason =
        "Relatarea sau răspunsurile indică posibilă manipulare; declarațiile nu sunt dovezi tehnice de fraudă.";
    } else if (r.channel === "CARD") {
      route = "DISPUTE_PILOT";
      reason =
        "Plată cu cardul identificată, fără indicii suficiente de manipulare.";
    } else {
      route = "ROPAY_RESCUE";
      reason =
        "Transfer identificat și beneficiar de clarificat; nu este presupusă automat frauda.";
    }
  }
  if (
    c.manual_route &&
    compatible(c.manual_route, r) &&
    !(
      manipulation(c) &&
      r?.channel !== "ATM" &&
      c.manual_route !== "SCAM_RESCUE" &&
      c.manual_route !== "HUMAN_REVIEW"
    )
  ) {
    route = c.manual_route;
    reason =
      "Rută reasignată explicit de angajat și verificată față de canalul tranzacției.";
  }
  const secondary: Route[] =
    route === "ATM_TRACE" && manipulation(c) ? ["SCAM_RESCUE"] : [];
  return {
    primary_route: route,
    secondary_routes: secondary,
    routing_reason: reason,
    candidate_routes: [
      ...new Set(
        candidates.flatMap((x) =>
          x.channel === "ATM"
            ? ["ATM_TRACE" as const]
            : x.channel === "CARD"
              ? ["DISPUTE_PILOT" as const]
              : ["ROPAY_RESCUE" as const, "SCAM_RESCUE" as const],
        ),
      ),
    ],
    missing_information: r
      ? []
      : ["Identificarea tranzacției și confirmarea canalului de plată"],
    requires_human_review:
      route === "HUMAN_REVIEW" || !!r?.security?.conflict || !!r?.atm?.conflict,
  };
}
const yesno = (key: string, text: string, reason: string): Question => ({
  id: uuid(),
  key,
  text,
  reason,
  answer_type: "YES_NO",
  options: [
    { value: "YES", label: "Da" },
    { value: "NO", label: "Nu" },
    { value: "UNSURE", label: "Nu știu" },
  ],
});
export function investigateRules(
  c: Incident,
  r: BankRecord | null,
  route: Route,
  evidence: Evidence[],
) {
  const rules: Rule[] = [];
  const unknowns: string[] = [];
  const contradictions: string[] = [];
  let questions: Question[] = [];
  let type: ActionType = "SEND_CUSTOMER_UPDATE";
  let reason = "Informațiile disponibile pot fi comunicate după revizuire.";
  let recommended_status: Run["recommended_status"] = "READY_FOR_REVIEW";
  const a = answers(c);
  const refs = (...types: string[]) =>
    evidence.filter((e) => types.includes(e.evidence_type)).map((e) => e.id);
  const add = (
    rule_id: string,
    result: Rule["result"],
    explanation: string,
    ids: string[] = [],
  ) =>
    rules.push({
      id: uuid(),
      rule_id,
      rulebook_version: versionFor(route),
      result,
      explanation,
      evidence_ids: ids,
    });
  add(
    "GLOBAL-APPROVAL",
    "PASS",
    "Orice întrebare, comunicare sau dosar operațional necesită aprobarea angajatului.",
  );
  add(
    "GLOBAL-FINANCIAL",
    "PASS",
    "Nu există instrumente de rambursare, transfer, chargeback sau blocare de card.",
  );
  add(
    "GLOBAL-SECRETS",
    "PASS",
    "Întrebările nu pot solicita PIN, CVV, OTP sau parole.",
  );
  if (route === "HUMAN_REVIEW" || !r) {
    add(
      "GLOBAL-INSUFFICIENT",
      "BLOCK",
      "Rutarea nu poate fi stabilită sigur din dovezile disponibile.",
      refs("TRANSACTION_CANDIDATES"),
    );
    unknowns.push(
      "Tranzacția relevantă nu este identificată fără ambiguitate.",
    );
    questions = [
      {
        id: uuid(),
        key: "payment_channel",
        text: "Ce operațiune dorești să clarifici?",
        reason: "Canalul ajută angajatul să identifice tranzacția potrivită.",
        answer_type: "CHOICE",
        options: [
          { value: "CARD", label: "Plată cu cardul" },
          { value: "TRANSFER", label: "Transfer" },
          { value: "ATM", label: "Retragere ATM" },
          { value: "UNSURE", label: "Nu sunt sigur" },
        ],
      },
    ];
    recommended_status = "HUMAN_REVIEW";
  } else if (route === "DISPUTE_PILOT") {
    assert(
      r.card_context,
      "CARD_DATA_MISSING",
      "Contextul sintetic al plății cu cardul lipsește.",
    );
    const map: Record<string, string> = {
      TRANSACTION: "transaction",
      AUTHENTICATION: "authentication",
      CARD: "card",
      CASE_HISTORY: "history",
      DUPLICATES: "duplicates",
      REFUND: "refund",
      CUSTOMER_CLAIM: "customer_response",
    };
    const context = {
      ...r.card_context,
      customer_statement: c.statement,
      evidence: evidence.map((e) => ({
        id: e.id,
        type: map[e.evidence_type] ?? "statement",
        source: e.source,
        timestamp: e.observed_at,
        summary: e.summary,
        data: e.payload,
      })),
      requests: c.requests
        .filter((x) => x.status === "ANSWERED")
        .map((x) => ({
          ...x,
          investigation_id: x.run_id,
          questions: [],
          status: "ANSWERED" as const,
          approved_by: x.approved_by,
          answers: x.answers as Record<string, "YES" | "NO" | "UNSURE">,
        })),
    };
    const evaluated = evaluateDispute(context);
    for (const rule of evaluated.rules)
      rules.push({
        id: uuid(),
        rule_id: rule.rule_id,
        rulebook_version: "demo-v1",
        result:
          rule.severity === "block"
            ? "ESCALATE"
            : rule.severity === "warning"
              ? "WARN"
              : "PASS",
        explanation: rule.explanation,
        evidence_ids: rule.evidence_refs,
      });
    questions = evaluated.questions.map((q) => yesno(q.key, q.text, q.reason));
    if (r.card_context.auth.three_ds_status === "UNKNOWN")
      unknowns.push(
        "Dovada 3DS este necunoscută; lipsa ei nu dovedește fraudă.",
      );
    if (evaluated.escalate) {
      contradictions.push(
        "Regulile DisputePilot cer revizuire specializată a dovezilor.",
      );
      type = "ESCALATE";
      reason = "Escalare propusă de regulile DisputePilot.";
      recommended_status = "ESCALATED";
    } else {
      type = "PREPARE_DISPUTE_PACK";
      reason = evaluated.route.replaceAll("_", " ").toLowerCase();
    }
  } else if (route === "SCAM_RESCUE") {
    const remoteClaim =
      a.remote_access === "YES" ||
      /instalat.*acces la distanță|instalat.*remote access/i.test(c.statement);
    const critical =
      remoteClaim ||
      a.credentials_shared === "YES" ||
      r.security?.remote_signal === "DETECTED" ||
      r.security?.credential_signal === "DETECTED";
    add(
      "SCAM-001",
      manipulation(c) ? "WARN" : "PASS",
      "Indicatorii de manipulare provin din declarația clientului și trebuie verificați.",
      refs("CUSTOMER_CLAIM"),
    );
    add(
      "SCAM-002",
      r.transfer?.beneficiary_known ? "PASS" : "WARN",
      "Un beneficiar nou este un indiciu de context, nu o dovadă de fraudă.",
      refs("BENEFICIARY"),
    );
    if (r.security?.conflict) {
      add(
        "SCAM-004",
        "ESCALATE",
        "Sursele tehnice conțin semnale contradictorii.",
        refs("SESSION", "SECURITY"),
      );
      contradictions.push("Semnalele tehnice de securitate se contrazic.");
    }
    if (critical || contradictions.length) {
      add(
        "SCAM-003",
        "ESCALATE",
        remoteClaim
          ? "Clientul declară acces la distanță; este necesară revizuire urgentă de securitate."
          : "Există un semnal critic sau dovezi contradictorii de securitate.",
        refs("SECURITY", "CUSTOMER_CLAIM"),
      );
      type = "ESCALATE";
      reason =
        "Propunere de escaladare către echipa de securitate; fără promisiune de recuperare.";
      recommended_status = "ESCALATED";
    } else {
      if (!["YES", "NO"].includes(a.remote_access))
        questions.push(
          yesno(
            "remote_access",
            "Ai instalat, la cererea apelantului, o aplicație de acces la distanță?",
            "Clarifică o posibilă compromitere a dispozitivului.",
          ),
        );
      if (!["YES", "NO"].includes(a.credentials_shared))
        questions.push(
          yesno(
            "credentials_shared",
            "Ai comunicat informații de autentificare apelantului? Nu include valorile lor în răspuns.",
            "Se cere numai confirmarea, fără parole sau coduri.",
          ),
        );
      type = "PREPARE_RECOVERY_PACK";
      reason =
        "Pregătirea unui dosar pentru verificări de securitate și recuperare, fără rezultat garantat.";
    }
    if (r.security?.remote_signal === "UNKNOWN")
      unknowns.push(
        "Nu există o confirmare tehnică a accesului la distanță în setul disponibil.",
      );
  } else if (route === "ROPAY_RESCUE") {
    add(
      "ROPAY-001",
      r.status === "SETTLED" ? "WARN" : "PASS",
      r.status === "SETTLED"
        ? "Transferul este decontat. Investigația nu îl anulează și nu garantează recuperarea."
        : "Statusul transferului trebuie urmărit în datele disponibile.",
      refs("TRANSFER_STATUS"),
    );
    add(
      "ROPAY-002",
      "PASS",
      "Beneficiarul efectiv și aliasul sunt păstrate separat de intenția declarată a clientului.",
      refs("TRANSFER", "ALIAS"),
    );
    if (!r.transfer?.intended_name && !a.intended_name)
      questions.push({
        id: uuid(),
        key: "intended_name",
        text: "Care era numele beneficiarului intenționat? Folosește un nume sintetic.",
        reason: "Compară intenția declarată cu beneficiarul efectiv.",
        answer_type: "TEXT",
      });
    if (!["YES", "NO"].includes(a.manipulated))
      questions.push(
        yesno(
          "manipulated",
          "Ai efectuat transferul la cererea unei persoane care te-a presat sau s-a prezentat drept reprezentant al băncii?",
          "Un indiciu nou de manipulare poate schimba investigatorul.",
        ),
      );
    type = "PREPARE_RECOVERY_PACK";
    reason =
      "Dosar de verificare pentru beneficiar greșit. Recuperarea fondurilor nu este garantată.";
  } else if (route === "ATM_TRACE") {
    add(
      "ATM-001",
      "PASS",
      "Debitarea contului nu este o dovadă că numerarul a fost eliberat.",
      refs("ATM_TRANSACTION", "ATM_DISPENSE"),
    );
    if (!r.atm?.journal_complete) {
      add(
        "ATM-002",
        "BLOCK",
        "Jurnalul incomplet nu permite o concluzie definitivă.",
        refs("ATM_JOURNAL"),
      );
      unknowns.push("Jurnalul ATM este incomplet.");
    }
    if (r.atm?.reversal_minor) {
      add(
        "ATM-003",
        "PASS",
        "Reversarea existentă este luată în calcul; nu se inițiază o rambursare nouă.",
        refs("ATM_REVERSAL"),
      );
      type = "SEND_CUSTOMER_UPDATE";
      reason = "Comunicare despre reversarea sintetică deja înregistrată.";
    } else {
      add(
        "ATM-004",
        r.atm?.dispense_status === "FAILED" ? "WARN" : "PASS",
        "Eliberarea numerarului și debitarea trebuie reconciliate separat.",
        refs("ATM_DISPENSE", "ATM_RECONCILIATION"),
      );
      type = "REQUEST_TECHNICAL_REVIEW";
      reason =
        "Pregătire pentru verificare tehnică ATM, fără rambursare automată.";
      if (!["NONE", "PARTIAL", "FULL"].includes(a.cash_received))
        questions.push({
          id: uuid(),
          key: "cash_received",
          text: "Cât numerar ai primit efectiv la această retragere?",
          reason: "Declarația clientului se compară cu jurnalul tehnic.",
          answer_type: "CHOICE",
          options: [
            { value: "NONE", label: "Nu am primit numerar" },
            { value: "PARTIAL", label: "Doar o parte din sumă" },
            { value: "FULL", label: "Întreaga sumă" },
            { value: "UNSURE", label: "Nu sunt sigur" },
          ],
        });
    }
    if (r.atm?.conflict) {
      contradictions.push(
        "Jurnalele ATM și contoarele raportează rezultate incompatibile.",
      );
      add(
        "ATM-005",
        "ESCALATE",
        "Dovezile tehnice contradictorii necesită escaladare.",
        refs("ATM_JOURNAL", "ATM_DISPENSE", "ATM_RECONCILIATION"),
      );
      type = "ESCALATE";
      reason = "Escalare către echipa tehnică pentru jurnale contradictorii.";
      recommended_status = "ESCALATED";
      questions = [];
    }
  }
  if (
    route !== "SCAM_RESCUE" &&
    (a.remote_access === "YES" ||
      a.credentials_shared === "YES" ||
      /(?:am|a) instalat.*acces la distanță/i.test(c.statement))
  ) {
    add(
      "GLOBAL-CRITICAL-SECURITY",
      "ESCALATE",
      "Clientul declară acces la distanță sau divulgarea datelor de autentificare. Este necesară revizuire urgentă de securitate.",
      refs("CUSTOMER_CLAIM"),
    );
    type = "ESCALATE";
    reason =
      "Semnal critic declarat de client; propunere urgentă de revizuire de securitate.";
    recommended_status = "ESCALATED";
  }
  if (recommended_status === "ESCALATED") questions = [];
  if (questions.length && recommended_status !== "HUMAN_REVIEW")
    recommended_status = "AWAITING_APPROVAL";
  const proposed_actions = questions.length
    ? [
        {
          id: uuid(),
          type: "ASK_CUSTOMER" as const,
          reason:
            "Clarificări relevante, revizuite de angajat înainte de trimitere.",
          requires_approval: true as const,
          status: "PENDING" as const,
        },
      ]
    : [
        {
          id: uuid(),
          type,
          reason,
          requires_approval: true as const,
          status: "PENDING" as const,
        },
      ];
  return {
    rules,
    unknowns,
    contradictions,
    customer_questions: questions,
    proposed_actions,
    recommended_status,
  };
}
