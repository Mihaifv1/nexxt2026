import {
  fieldKeys,
  type CustomerProfile,
  type FieldKey,
  type Purpose,
  type ProductResult,
  type RuleResult,
  type Goal,
} from "./domain.ts";
import { now, uid } from "../domain.ts";
export function hasConsent(
  p: CustomerProfile,
  key: FieldKey,
  purpose: Purpose,
) {
  const last = p.consents
    .filter((c) => c.purpose === purpose && c.field_keys.includes(key))
    .at(-1);
  return last?.granted === true;
}
export const requiredFields = (goal: Goal): FieldKey[] =>
  goal === "UNKNOWN" || goal === "BUSINESS"
    ? []
    : goal === "DISPUTE"
      ? ["full_name", "identity_verified", "identity_expiry"]
      : goal === "SAVINGS"
        ? ["age", "identity_verified", "identity_expiry"]
        : [
            "age",
            "identity_verified",
            "identity_expiry",
            "employment_type",
            "job_tenure_months",
            "income_minor",
            "housing_cost_minor",
            "monthly_obligations_minor",
            "budget_minor",
          ];
export const requiredDocuments = (goal: Goal) =>
  goal === "UNKNOWN" || goal === "BUSINESS"
    ? []
    : goal === "SAVINGS" || goal === "DISPUTE"
      ? (["IDENTITY"] as const)
      : (["IDENTITY", "SALARY", "BANK_STATEMENT"] as const);
export function missingQuestions(p: CustomerProfile) {
  return requiredFields(p.goal)
    .filter((k) => !p.fields[k])
    .map((key) => ({ key }));
}
export function evaluateProfile(p: CustomerProfile) {
  const required = requiredFields(p.goal);
  const visible = (k: FieldKey) =>
    hasConsent(p, k, "ELIGIBILITY") ? p.fields[k]?.value : undefined;
  const unknown = required.filter((k) => visible(k) === undefined);
  const denied = required.filter(
    (k) => p.fields[k] && !hasConsent(p, k, "ELIGIBILITY"),
  );
  const missingDocs = requiredDocuments(p.goal).filter(
    (kind) =>
      !p.documents.some((d) => d.kind === kind && d.status === "CONFIRMED"),
  );
  const conflicts = Object.values(p.fields)
    .filter(
      (f) =>
        f?.verified === "CONFLICT" &&
        required.includes(f.key) &&
        hasConsent(p, f.key, "ELIGIBILITY"),
    )
    .map((f) => f!.key);
  const pendingConflicts = p.proposals
    .filter(
      (x) =>
        x.status === "PENDING" &&
        x.conflicts_with !== undefined &&
        required.includes(x.key) &&
        hasConsent(p, x.key, "ELIGIBILITY"),
    )
    .map((x) => x.key);
  const allConflicts = [...new Set([...conflicts, ...pendingConflicts])];
  const exceptions: {
    code: string;
    message: string;
    field_keys: FieldKey[];
  }[] = [];
  if (denied.length)
    exceptions.push({
      code: "CONSENT_MISSING",
      message:
        "Lipsește permisiunea de reutilizare a unor câmpuri pentru eligibilitate.",
      field_keys: denied,
    });
  if (allConflicts.length)
    exceptions.push({
      code: "CONFLICTING_FIELDS",
      message: "Există valori contradictorii care necesită confirmare umană.",
      field_keys: allConflicts,
    });
  if (p.goal === "UNKNOWN" || p.goal === "BUSINESS" || p.goal === "DISPUTE")
    exceptions.push({
      code: "SPECIALIST_ROUTE",
      message:
        p.goal === "DISPUTE"
          ? "Continuă în dosarul DisputePilot asociat."
          : p.goal === "BUSINESS"
            ? "Nevoia de business necesită transfer către echipa B2B."
            : "Clarifică intenția înainte de evaluare.",
      field_keys: [],
    });
  const calculate = (
    id: string,
    name: string,
    minTenure: number,
    minIncome: number,
  ): ProductResult => {
    const rules: RuleResult[] = [];
    const rule = (
      id: string,
      label: string,
      keys: FieldKey[],
      condition: () => boolean,
      detail: string,
    ) =>
      rules.push({
        id,
        label,
        status: keys.some((k) => visible(k) === undefined)
          ? "UNKNOWN"
          : condition()
            ? "PASS"
            : "FAIL",
        detail,
        field_refs: keys,
      });
    rule(
      "OFD-001",
      "Vârstă minimă demo",
      ["age"],
      () => Number(visible("age")) >= 18,
      "Pragul sintetic este de 18 ani.",
    );
    rule(
      "OFD-002",
      "Identitate verificată sintetic",
      ["identity_verified", "identity_expiry"],
      () =>
        visible("identity_verified") === true &&
        Date.parse(String(visible("identity_expiry")) + "T23:59:59Z") >
          Date.now(),
      "Necesită un document de identitate demo confirmat.",
    );
    if (p.goal !== "SAVINGS") {
      rule(
        "OFD-003",
        "Tip de angajare",
        ["employment_type"],
        () =>
          ["PERMANENT", "FIXED_TERM", "SELF_EMPLOYED"].includes(
            String(visible("employment_type")),
          ),
        "Tipul contractului trebuie clarificat.",
      );
      rule(
        "OFD-004",
        "Venit lunar disponibil",
        ["income_minor"],
        () => Number(visible("income_minor")) >= minIncome,
        "Prag de venit exclusiv demonstrativ.",
      );
      rule(
        "OFD-005",
        "Vechime la locul de muncă",
        ["job_tenure_months"],
        () => Number(visible("job_tenure_months")) >= minTenure,
        `Vechime minimă sintetică: ${minTenure} luni.`,
      );
      rule(
        "OFD-006",
        "Obligații declarate",
        ["income_minor", "housing_cost_minor", "monthly_obligations_minor"],
        () =>
          Number(visible("income_minor")) > 0 &&
          (Number(visible("housing_cost_minor")) +
            Number(visible("monthly_obligations_minor"))) /
            Number(visible("income_minor")) <=
            0.6,
        "Cheltuielile declarate nu depășesc 60% din venit în regula demo.",
      );
      rule(
        "OFD-007",
        "Buget solicitat",
        ["budget_minor", "income_minor"],
        () =>
          Number(visible("budget_minor")) > 0 &&
          Number(visible("budget_minor")) <=
            Number(visible("income_minor")) * 24,
        "Limită sintetică pentru rutare; nu reprezintă ofertă sau calcul de credit.",
      );
    }
    rules.push({
      id: "OFD-008",
      label: "Documente pregătite",
      status: missingDocs.length ? "UNKNOWN" : "PASS",
      detail: missingDocs.length
        ? `Lipsesc ${missingDocs.length} tipuri de documente confirmate.`
        : "Documentele demo necesare sunt confirmate.",
      field_refs: [],
    });
    rules.push({
      id: "OFD-009",
      label: "Consimțământ pentru utilizare",
      status: denied.length ? "UNKNOWN" : "PASS",
      detail: "Permisiunea se verifică pentru fiecare câmp și scop.",
      field_refs: denied,
    });
    rules.push({
      id: "OFD-010",
      label: "Coerența dovezilor",
      status: allConflicts.length ? "FAIL" : "PASS",
      detail:
        "Contradicțiile se trimit spre revizuire, fără concluzie forțată.",
      field_refs: allConflicts,
    });
    const outcome = exceptions.some((e) => e.code !== "CONSENT_MISSING")
      ? "MANUAL_REVIEW"
      : rules.some((r) => r.status === "FAIL")
        ? "NOT_MATCH"
        : rules.some((r) => r.status === "UNKNOWN")
          ? "NEEDS_INFO"
          : "POTENTIAL_MATCH";
    return { id, name, outcome, rules };
  };
  const products = ["UNKNOWN", "BUSINESS", "DISPUTE"].includes(p.goal)
    ? []
    : p.goal === "SAVINGS"
      ? [calculate("SAVINGS", "Plan de economisire · demo", 0, 0)]
      : p.goal === "HOME"
        ? [
            calculate(
              "HOME_STANDARD",
              "Locuință · analiză standard",
              12,
              450000,
            ),
          ]
        : [
            calculate("CAR_STANDARD", "Auto · traseu standard", 6, 300000),
            calculate(
              "CAR_FLEX",
              "Auto · analiză cu vechime recentă",
              3,
              250000,
            ),
          ];
  const income = visible("income_minor");
  const housing = visible("housing_cost_minor");
  const obligations = visible("monthly_obligations_minor");
  return {
    id: uid("EVAL"),
    timestamp: now(),
    goal: p.goal,
    products,
    missing_fields: unknown,
    missing_documents: [...missingDocs],
    exceptions,
    rulebook_version: "intake-demo-v1",
    ...(typeof income === "number" &&
    typeof housing === "number" &&
    typeof obligations === "number"
      ? { available_monthly_minor: income - housing - obligations }
      : {}),
  };
}
export const agentAccess: Record<
  string,
  { purpose: Purpose; fields: readonly FieldKey[] }
> = {
  IDENTITY: {
    purpose: "INTAKE",
    fields: ["full_name", "age", "identity_verified", "identity_expiry"],
  },
  INTAKE: {
    purpose: "INTAKE",
    fields: fieldKeys.filter((k) => k !== "identity_expiry"),
  },
  DOCUMENT: { purpose: "INTAKE", fields: ["full_name"] },
  INTENT: { purpose: "INTAKE", fields: [] },
  PRODUCT: { purpose: "ELIGIBILITY", fields: requiredFields("CAR") },
  FINANCIAL_HEALTH: {
    purpose: "ELIGIBILITY",
    fields: [
      "income_minor",
      "housing_cost_minor",
      "monthly_obligations_minor",
      "budget_minor",
    ],
  },
  DOCUMENT_READINESS: { purpose: "INTAKE", fields: [] },
  LIFE_EVENT: {
    purpose: "INTAKE",
    fields: ["job_tenure_months", "housing_cost_minor"],
  },
  APPOINTMENT: { purpose: "BRANCH_HANDOFF", fields: ["full_name"] },
  BANKER_COPILOT: { purpose: "BRANCH_HANDOFF", fields: fieldKeys },
  DISPUTE: {
    purpose: "DISPUTE_SUPPORT",
    fields: ["full_name", "identity_verified"],
  },
};
