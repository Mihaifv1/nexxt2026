import { z } from "zod";
import { now, assert, type AuditEvent } from "../domain.ts";
import { uuid } from "../incidents/domain.ts";
export type Value = string | number | boolean;
export type State =
  | "DRAFT"
  | "VERIFYING"
  | "NEEDS_CLARIFICATION"
  | "AWAITING_CUSTOMER"
  | "READY_FOR_REVIEW"
  | "INTERNAL_REVIEW"
  | "AWAITING_SIGNATURE"
  | "APPROVED_DEMO"
  | "COMPLETED_DEMO"
  | "ACTIVATED_DEMO"
  | "CUSTOMER_DECLINED"
  | "ESCALATED"
  | "CANCELLED";
export const stateLabels: Record<State, string> = {
  DRAFT: "Ciornă",
  VERIFYING: "În verificare",
  NEEDS_CLARIFICATION: "Lipsesc informații",
  AWAITING_CUSTOMER: "Așteaptă clientul",
  READY_FOR_REVIEW: "Pregătit pentru review",
  INTERNAL_REVIEW: "Document de aprobat",
  AWAITING_SIGNATURE: "Așteaptă semnarea mock",
  APPROVED_DEMO: "Aprobat demo",
  COMPLETED_DEMO: "Finalizat demo",
  ACTIVATED_DEMO: "Produs activat demo",
  CUSTOMER_DECLINED: "Semnare refuzată",
  ESCALATED: "La specialist",
  CANCELLED: "Anulat",
};
export const terminal: State[] = [
  "APPROVED_DEMO",
  "COMPLETED_DEMO",
  "ACTIVATED_DEMO",
  "CANCELLED",
];
export type Product = {
  id: string;
  kind: string;
  name: string;
  status: "ACTIVE_DEMO" | "CLOSED_DEMO";
  source_case_id: string;
  created_at: string;
  version: number;
  amount_minor?: number;
  contract_id?: string;
};
export type CustomerOperations = {
  contact: Record<string, Value>;
  kyc_status: "UNVERIFIED" | "VERIFIED_DEMO" | "REFRESH_REQUIRED";
  kyc_verified_at?: string;
  products: Product[];
};
export type Evidence = {
  id: string;
  source: string;
  summary: string;
  payload: Record<string, unknown>;
  timestamp: string;
  classification: "SYNTHETIC";
  kind: "BANK_MOCK" | "CUSTOMER_CLAIM" | "DOCUMENT" | "CATALOG" | "PROFILE";
};
export type Rule = {
  id: string;
  status: "PASS" | "WARN" | "BLOCK";
  detail: string;
  evidence_ids: string[];
};
export type Document = {
  id: string;
  kind: string;
  name: string;
  direction: "INPUT" | "OUTPUT";
  content: string;
  version: number;
  status: "SUBMITTED" | "DRAFT" | "APPROVED" | "SIGNED_MOCK" | "SUPERSEDED";
  hash: string;
  created_at: string;
  approved_by?: string;
  approved_at?: string;
  input_snapshot: Record<string, Value>;
  profile_version: number;
  fields?: Record<string, string>;
};
export type Task = {
  id: string;
  kind: "INFORMATION" | "SIGNATURE" | "UPDATE";
  status: "PENDING" | "ANSWERED" | "DECLINED" | "EXPIRED" | "DELIVERED";
  questions: { key: string; label: string; type: string; options?: string[] }[];
  required_documents: string[];
  message: string;
  created_at: string;
  expires_at: string;
  case_version: number;
  approved_by: string;
  document_id?: string;
  document_version?: number;
  document_hash?: string;
  answers?: Record<string, Value>;
  answered_at?: string;
};
export type Run = {
  id: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  provider: string;
  status: "COMPLETED" | "FAILED";
  calls: {
    id: string;
    agent: string;
    tool: string;
    duration_ms: number;
    status: "COMPLETED" | "FAILED";
    evidence_ids: string[];
    error?: string;
  }[];
  facts: { text: string; evidence_ids: string[] }[];
  rules: Rule[];
  missing: string[];
  contradictions: string[];
  summary: string;
  error?: string;
  illustration?: {
    amount_minor: number;
    months: number;
    annual_rate: number;
    installment_minor: number;
    total_minor: number;
    ratio: number;
    existing_installment_minor?: number;
    saving_minor?: number;
  };
};
export type Case = {
  id: string;
  reference: string;
  workflow_id: string;
  workflow_version: "1.0";
  customer_id: string;
  customer_name: string;
  state: State;
  version: number;
  profile_version: number;
  priority: "NORMAL" | "HIGH" | "URGENT";
  created_at: string;
  updated_at: string;
  input: Record<string, Value>;
  evidence: Evidence[];
  runs: Run[];
  documents: Document[];
  tasks: Task[];
  approvals: {
    id: string;
    actor: string;
    role: string;
    action: string;
    case_version: number;
    document_ids: string[];
    timestamp: string;
    comment: string;
  }[];
  signatures: {
    id: string;
    customer_id: string;
    document_id: string;
    document_version: number;
    hash: string;
    timestamp: string;
    accepted: boolean;
  }[];
  audit: AuditEvent[];
  specialist_review?: { actor: string; comment: string; timestamp: string };
  scenario:
    | "NORMAL"
    | "MISSING"
    | "CONFLICT"
    | "TOOL_ERROR"
    | "EXPIRED"
    | "SPECIALIST";
  processed: Record<string, { fingerprint: string; result: unknown }>;
  creation_fingerprint: string;
  data_classification: "SYNTHETIC";
};
export const opsDefaults = (): CustomerOperations => ({
  contact: {},
  kyc_status: "UNVERIFIED",
  products: [],
});
export const valueSchema = z.union([
  z.string().max(5000),
  z.number().finite(),
  z.boolean(),
]);
export const createSchema = z.object({
  workflow_id: z.string(),
  customer_id: z.string().optional(),
  customer_name: z.string().min(3).max(100).optional(),
  input: z.record(valueSchema).default({}),
  scenario: z
    .enum([
      "NORMAL",
      "MISSING",
      "CONFLICT",
      "TOOL_ERROR",
      "EXPIRED",
      "SPECIALIST",
    ])
    .default("NORMAL"),
});
export const documentSchema = z.object({
  kind: z.string().max(40),
  name: z.string().max(100),
  content: z.string().max(15000),
});
export const actionSchema = z.object({
  expected_version: z.number().int().positive(),
  action: z.enum([
    "SAVE",
    "RUN",
    "REQUEST_INFO",
    "APPROVE",
    "REJECT",
    "REVISE",
    "ESCALATE",
    "CANCEL",
    "RESET",
    "ADD_DOCUMENT",
    "SPECIALIST_REVIEW",
  ]),
  input: z.record(valueSchema).optional(),
  comment: z.string().max(3000).default(""),
  message: z.string().max(5000).optional(),
  document: documentSchema.optional(),
});
export function move(c: Case, to: State) {
  const allowed: Record<State, State[]> = {
    DRAFT: ["VERIFYING", "CANCELLED"],
    VERIFYING: [
      "NEEDS_CLARIFICATION",
      "READY_FOR_REVIEW",
      "INTERNAL_REVIEW",
      "ESCALATED",
    ],
    NEEDS_CLARIFICATION: [
      "AWAITING_CUSTOMER",
      "VERIFYING",
      "DRAFT",
      "ESCALATED",
      "CANCELLED",
    ],
    AWAITING_CUSTOMER: ["VERIFYING", "DRAFT", "ESCALATED", "CANCELLED"],
    READY_FOR_REVIEW: [
      "APPROVED_DEMO",
      "COMPLETED_DEMO",
      "AWAITING_SIGNATURE",
      "DRAFT",
      "ESCALATED",
      "CANCELLED",
      "VERIFYING",
    ],
    INTERNAL_REVIEW: [
      "AWAITING_SIGNATURE",
      "COMPLETED_DEMO",
      "DRAFT",
      "ESCALATED",
      "CANCELLED",
      "VERIFYING",
    ],
    AWAITING_SIGNATURE: [
      "ACTIVATED_DEMO",
      "COMPLETED_DEMO",
      "CUSTOMER_DECLINED",
      "DRAFT",
      "ESCALATED",
      "CANCELLED",
    ],
    CUSTOMER_DECLINED: ["DRAFT", "ESCALATED", "CANCELLED"],
    ESCALATED: ["VERIFYING", "DRAFT", "CANCELLED"],
    APPROVED_DEMO: [],
    COMPLETED_DEMO: [],
    ACTIVATED_DEMO: [],
    CANCELLED: [],
  };
  assert(
    c.state === to || allowed[c.state].includes(to),
    "INVALID_TRANSITION",
    `Tranziție nepermisă: ${c.state} → ${to}.`,
    409,
  );
  c.state = to;
}
export function event(
  c: Case,
  type: string,
  actor: string,
  role: string,
  payload: Record<string, unknown> = {},
) {
  const e: AuditEvent = {
    event_id: uuid(),
    case_id: c.id,
    actor_id: actor,
    actor_type: role,
    event_type: "b2c." + type,
    timestamp: now(),
    payload,
    correlation_id: uuid(),
  };
  c.audit.push(e);
  return e;
}
export async function hash(text: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export function safe(text: string) {
  assert(
    !/(?:\b(?:PIN|CVV|CVC|OTP)\b\s*[:=]?\s*\d{3,8}|(?:parol[ăa]|password)\s*[:=]\s*\S+|\b\d{13,19}\b)/i.test(
      text,
    ),
    "SENSITIVE_DATA",
    "Folosește date sintetice, fără PIN, CVV, OTP, parole sau PAN complet.",
  );
}
