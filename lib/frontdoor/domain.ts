import { z } from "zod";
import type { AuditEvent } from "../domain.ts";
export const fieldKeys = [
  "full_name",
  "age",
  "employment_type",
  "job_tenure_months",
  "income_minor",
  "housing_cost_minor",
  "monthly_obligations_minor",
  "budget_minor",
  "identity_verified",
  "identity_expiry",
] as const;
export type FieldKey = (typeof fieldKeys)[number];
export const purposes = [
  "INTAKE",
  "ELIGIBILITY",
  "BRANCH_HANDOFF",
  "DISPUTE_SUPPORT",
] as const;
export type Purpose = (typeof purposes)[number];
export const goals = [
  "CAR",
  "HOME",
  "SAVINGS",
  "DISPUTE",
  "BUSINESS",
  "UNKNOWN",
] as const;
export type Goal = (typeof goals)[number];
export type Value = string | number | boolean;
export type Verification =
  | "DECLARED"
  | "DOCUMENT_EXTRACTED"
  | "HUMAN_CONFIRMED"
  | "SYNTHETIC_VERIFIED"
  | "CONFLICT";
export interface ProfileField {
  key: FieldKey;
  value: Value;
  source_id: string;
  source_type: "STATEMENT" | "DOCUMENT" | "FORM" | "SYNTHETIC_IDENTITY";
  verified: Verification;
  updated_at: string;
}
export interface Proposal extends ProfileField {
  id: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  conflicts_with?: Value;
}
export interface Document {
  id: string;
  kind: "IDENTITY" | "SALARY" | "BANK_STATEMENT";
  name: string;
  content: string;
  created_at: string;
  proposal_ids: string[];
  status: "EXTRACTED" | "CONFIRMED" | "REJECTED";
}
export interface Consent {
  id: string;
  field_keys: FieldKey[];
  purpose: Purpose;
  granted: boolean;
  timestamp: string;
  actor: string;
}
export interface AgentStep {
  id: string;
  agent: string;
  purpose: Purpose;
  fields_read: FieldKey[];
  denied_fields: FieldKey[];
  summary: string;
  timestamp: string;
}
export interface RuleResult {
  id: string;
  label: string;
  status: "PASS" | "FAIL" | "UNKNOWN";
  detail: string;
  field_refs: FieldKey[];
}
export interface ProductResult {
  id: string;
  name: string;
  outcome: "POTENTIAL_MATCH" | "NEEDS_INFO" | "NOT_MATCH" | "MANUAL_REVIEW";
  rules: RuleResult[];
}
export interface Evaluation {
  id: string;
  timestamp: string;
  goal: Goal;
  products: ProductResult[];
  missing_fields: FieldKey[];
  missing_documents: Document["kind"][];
  exceptions: { code: string; message: string; field_keys: FieldKey[] }[];
  rulebook_version: string;
  available_monthly_minor?: number;
}
export interface Appointment {
  id: string;
  slot_id: string;
  branch: string;
  starts_at: string;
  status: "BOOKED" | "CHECKED_IN" | "COMPLETED" | "CANCELLED" | "ESCALATED";
  code: string;
  created_at: string;
  checked_in_at?: string;
  outcome?: string;
  note?: string;
}
export interface CustomerProfile {
  id: string;
  name: string;
  linked_case_id: string;
  version: number;
  updated_at: string;
  fields: Partial<Record<FieldKey, ProfileField>>;
  field_history: ProfileField[];
  proposals: Proposal[];
  documents: Document[];
  messages: {
    id: string;
    role: "CUSTOMER" | "SYSTEM";
    text: string;
    timestamp: string;
  }[];
  consents: Consent[];
  goal: Goal;
  goals: { goal: Goal; timestamp: string }[];
  agent_steps: AgentStep[];
  evaluations: Evaluation[];
  appointments: Appointment[];
  brief?: {
    id: string;
    timestamp: string;
    field_keys: FieldKey[];
    source_evaluation: string;
  };
  audit: AuditEvent[];
  processed: Record<string, { fingerprint: string; result: unknown }>;
  data_classification: "SYNTHETIC";
}
export const valueSchema = z.union([
  z.string().max(500),
  z.number().finite(),
  z.boolean(),
]);
export const fieldSchema = z.enum(fieldKeys);
export const purposeSchema = z.enum(purposes);
export const base = z.object({ expected_version: z.number().int().positive() });
export const actionSchema = z.discriminatedUnion("action", [
  base.extend({
    action: z.literal("INTAKE"),
    text: z.string().min(5).max(5000),
  }),
  base.extend({
    action: z.literal("CONFIRM_FIELDS"),
    proposals: z
      .array(z.object({ id: z.string(), value: valueSchema.optional() }))
      .min(1)
      .max(30),
    purposes: z.array(purposeSchema).max(4),
  }),
  base.extend({
    action: z.literal("UPDATE_FIELDS"),
    fields: z
      .array(z.object({ key: fieldSchema, value: valueSchema }))
      .min(1)
      .max(10),
    purposes: z.array(purposeSchema).max(4),
  }),
  base.extend({
    action: z.literal("CONSENT"),
    field_keys: z.array(fieldSchema).min(1),
    purpose: purposeSchema,
    granted: z.boolean(),
  }),
  base.extend({
    action: z.literal("UPLOAD_DOCUMENT"),
    kind: z.enum(["IDENTITY", "SALARY", "BANK_STATEMENT"]),
    name: z.string().min(1).max(150),
    content: z.string().min(5).max(20000),
  }),
  base.extend({
    action: z.literal("REJECT_DOCUMENT"),
    document_id: z.string(),
  }),
  base.extend({ action: z.literal("EVALUATE") }),
  base.extend({ action: z.literal("PREPARE_HANDOFF") }),
  base.extend({ action: z.literal("BOOK_APPOINTMENT"), slot_id: z.string() }),
  base.extend({
    action: z.literal("CANCEL_APPOINTMENT"),
    appointment_id: z.string(),
  }),
  base.extend({
    action: z.literal("CHECK_IN"),
    appointment_id: z.string(),
    code: z.string().min(1).max(20),
  }),
  base.extend({
    action: z.literal("COMPLETE_HANDOFF"),
    appointment_id: z.string(),
    outcome: z.enum(["APPLICATION_DEMO", "FOLLOW_UP", "ESCALATED"]),
    note: z.string().min(5).max(2000),
  }),
  base.extend({ action: z.literal("RESET_PROFILE") }),
]);
export type ProfileAction = z.infer<typeof actionSchema>;
export const fieldLabels: Record<FieldKey, string> = {
  full_name: "Nume client",
  age: "Vârstă",
  employment_type: "Tip contract",
  job_tenure_months: "Vechime la job (luni)",
  income_minor: "Venit net lunar",
  housing_cost_minor: "Cheltuieli locuință / lună",
  monthly_obligations_minor: "Alte obligații / lună",
  budget_minor: "Buget dorit",
  identity_verified: "Identitate verificată demo",
  identity_expiry: "Valabilitate identitate",
};
export const goalLabels: Record<Goal, string> = {
  CAR: "Achiziție auto",
  HOME: "Locuință",
  SAVINGS: "Economisire",
  DISPUTE: "Contestație card",
  BUSINESS: "Nevoie de business",
  UNKNOWN: "Intenție de clarificat",
};
export const purposeLabels: Record<Purpose, string> = {
  INTAKE: "Colectare și profil",
  ELIGIBILITY: "Eligibilitate demo",
  BRANCH_HANDOFF: "Pregătire consilier",
  DISPUTE_SUPPORT: "Suport contestații",
};
