import { z } from "zod";
import { assert, now, type AuditEvent, type DisputeCase } from "../domain.ts";
export const routes = [
  "DISPUTE_PILOT",
  "SCAM_RESCUE",
  "ROPAY_RESCUE",
  "ATM_TRACE",
  "HUMAN_REVIEW",
] as const;
export type Route = (typeof routes)[number];
export const states = [
  "NEW",
  "TRIAGING",
  "INVESTIGATING",
  "AWAITING_APPROVAL",
  "AWAITING_CUSTOMER",
  "READY_FOR_REVIEW",
  "ESCALATED",
  "HUMAN_REVIEW",
  "CLOSED_DEMO",
] as const;
export type State = (typeof states)[number];
export const routeLabels: Record<Route, string> = {
  DISPUTE_PILOT: "DisputePilot",
  SCAM_RESCUE: "ScamRescue",
  ROPAY_RESCUE: "RoPay Rescue",
  ATM_TRACE: "ATMTrace",
  HUMAN_REVIEW: "Revizuire umană",
};
export const stateLabels: Record<State, string> = {
  NEW: "Nou",
  TRIAGING: "În triere",
  INVESTIGATING: "În investigație",
  AWAITING_APPROVAL: "Așteaptă aprobarea",
  AWAITING_CUSTOMER: "Așteaptă clientul",
  READY_FOR_REVIEW: "Gata de revizuire",
  ESCALATED: "Escaladat",
  HUMAN_REVIEW: "Revizuire umană",
  CLOSED_DEMO: "Închis demo",
};
export type Answer = string;
export interface BankRecord {
  id: string;
  customer_id: string;
  channel: "CARD" | "TRANSFER" | "ATM";
  amount_minor: number;
  currency: "RON";
  occurred_at: string;
  status: "SETTLED" | "PENDING" | "REVERSED";
  descriptor: string;
  card_last4?: string;
  card_context?: DisputeCase;
  transfer?: {
    beneficiary: string;
    alias: string;
    reference: string;
    beneficiary_known: boolean;
    intended_name?: string;
    intended_alias?: string;
  };
  security?: {
    remote_signal: "DETECTED" | "NONE" | "UNKNOWN";
    credential_signal: "DETECTED" | "NONE" | "UNKNOWN";
    conflict: boolean;
    session_summary: string;
  };
  atm?: {
    terminal_id: string;
    location: string;
    journal_complete: boolean;
    dispense_status: "FAILED" | "DISPENSED" | "PARTIAL" | "UNKNOWN";
    dispensed_minor: number | null;
    reversal_minor: number;
    reconciliation: "MATCH" | "MISMATCH" | "PENDING";
    conflict: boolean;
    events: { at: string; type: string; summary: string }[];
  };
  fault?: "TOOL_UNAVAILABLE" | "TOOL_ONCE" | "INVALID_OUTPUT";
  data_classification: "SYNTHETIC";
}
export interface Evidence {
  id: string;
  incident_id: string;
  run_id: string;
  source: string;
  evidence_type: string;
  summary: string;
  payload: Record<string, unknown>;
  observed_at: string;
  retrieved_at: string;
  data_classification: "SYNTHETIC";
}
export interface ToolCall {
  id: string;
  run_id: string;
  agent: string;
  name: string;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  attempt: number;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  evidence_ids: string[];
  error?: string;
}
export interface Question {
  id: string;
  key: string;
  text: string;
  reason: string;
  answer_type: "YES_NO" | "TEXT" | "CHOICE";
  options?: { value: string; label: string }[];
}
export const actionTypes = [
  "ASK_CUSTOMER",
  "ESCALATE",
  "PREPARE_RECOVERY_PACK",
  "PREPARE_DISPUTE_PACK",
  "REQUEST_TECHNICAL_REVIEW",
  "SEND_CUSTOMER_UPDATE",
] as const;
export type ActionType = (typeof actionTypes)[number];
export interface Proposal {
  id: string;
  type: ActionType;
  reason: string;
  requires_approval: true;
  status: "PENDING" | "APPROVED" | "REJECTED";
}
export interface Rule {
  id: string;
  rule_id: string;
  rulebook_version: string;
  result: "PASS" | "WARN" | "BLOCK" | "ESCALATE";
  explanation: string;
  evidence_ids: string[];
}
export interface Triage {
  primary_route: Route;
  secondary_routes: Route[];
  routing_reason: string;
  candidate_routes: Route[];
  missing_information: string[];
  requires_human_review: boolean;
  evidence_ids: string[];
  duration_ms: number;
  provider: string;
}
export interface Run {
  id: string;
  job_id: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  primary_route: Route;
  secondary_routes: Route[];
  triage?: Triage;
  calls: ToolCall[];
  known_facts: { text: string; evidence_ids: string[] }[];
  customer_claims: string[];
  unknowns: string[];
  contradictions: string[];
  customer_questions: Question[];
  proposed_actions: Proposal[];
  rules: Rule[];
  recommended_status:
    | "AWAITING_APPROVAL"
    | "READY_FOR_REVIEW"
    | "ESCALATED"
    | "HUMAN_REVIEW";
  rulebook_version: string;
  provider: string;
  error?: string;
}
export interface CustomerRequest {
  id: string;
  incident_id: string;
  run_id: string;
  kind: "QUESTIONS" | "UPDATE";
  status: "PENDING" | "ANSWERED" | "EXPIRED" | "DELIVERED";
  case_version: number;
  questions: Question[];
  message: string;
  approved_by: string;
  created_at: string;
  expires_at: string;
  answers?: Record<string, Answer>;
  attachment?: { name: string; content: string };
  answered_at?: string;
}
export interface Approval {
  id: string;
  run_id: string;
  actor_id: string;
  role: string;
  action: "APPROVE" | "REJECT" | "REVISION" | "ESCALATE" | "CLOSE";
  action_ids: string[];
  case_version: number;
  comment: string;
  timestamp: string;
}
export interface Artifact {
  id: string;
  run_id: string;
  type: ActionType;
  created_at: string;
  approved_by: string;
  evidence_ids: string[];
  summary: string;
}
export interface Incident {
  id: string;
  reference: string;
  fixture_code?: string;
  customer_id: string;
  customer_name: string;
  statement: string;
  reported_amount_minor?: number;
  transaction_id: string | null;
  candidate_ids: string[];
  status: State;
  primary_route: Route | null;
  secondary_routes: Route[];
  priority: "NORMAL" | "HIGH" | "URGENT";
  version: number;
  created_at: string;
  updated_at: string;
  active_job_id: string | null;
  manual_route?: Route;
  evidence: Evidence[];
  runs: Run[];
  requests: CustomerRequest[];
  approvals: Approval[];
  artifacts: Artifact[];
  audit: AuditEvent[];
  processed: Record<string, { fingerprint: string; result: unknown }>;
  data_classification: "SYNTHETIC";
}
export interface Job {
  id: string;
  owner_id: string;
  incident_id: string;
  run_id: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  attempts: number;
  lock_token: string;
  lease_until: string;
  created_at: string;
  updated_at: string;
  error: string | null;
  actor_id: string;
  actor_role: string;
}
export const uuid = () => crypto.randomUUID();
export const fresh = (
  customer_id: string,
  customer_name: string,
  statement: string,
  transaction_id: string | null,
  candidate_ids: string[],
  reference: string,
): Incident => ({
  id: uuid(),
  reference,
  customer_id,
  customer_name,
  statement,
  transaction_id,
  candidate_ids,
  status: "NEW",
  primary_route: null,
  secondary_routes: [],
  priority: "NORMAL",
  version: 1,
  created_at: now(),
  updated_at: now(),
  active_job_id: null,
  evidence: [],
  runs: [],
  requests: [],
  approvals: [],
  artifacts: [],
  audit: [],
  processed: {},
  data_classification: "SYNTHETIC",
});
export function transition(c: Incident, to: State) {
  const allowed: Record<State, State[]> = {
    NEW: ["TRIAGING"],
    TRIAGING: ["INVESTIGATING", "HUMAN_REVIEW"],
    INVESTIGATING: ["AWAITING_APPROVAL", "READY_FOR_REVIEW", "HUMAN_REVIEW"],
    AWAITING_APPROVAL: [
      "AWAITING_CUSTOMER",
      "TRIAGING",
      "ESCALATED",
      "HUMAN_REVIEW",
      "READY_FOR_REVIEW",
    ],
    AWAITING_CUSTOMER: ["TRIAGING", "ESCALATED"],
    READY_FOR_REVIEW: [
      "CLOSED_DEMO",
      "TRIAGING",
      "ESCALATED",
      "HUMAN_REVIEW",
      "AWAITING_CUSTOMER",
    ],
    ESCALATED: ["TRIAGING"],
    HUMAN_REVIEW: ["TRIAGING", "AWAITING_CUSTOMER", "ESCALATED"],
    CLOSED_DEMO: [],
  };
  assert(
    c.status === to || allowed[c.status].includes(to),
    "INVALID_TRANSITION",
    `Tranziție nepermisă: ${c.status} → ${to}.`,
    409,
  );
  c.status = to;
}
export function guardSensitive(text: string) {
  assert(
    !/(?:\b(?:PIN|CVV|CVC|OTP)\b\s*[:=]?\s*\d{3,8}|(?:parol[ăa]|password)\s*[:=]\s*\S+)/i.test(
      text,
    ),
    "SENSITIVE_DATA",
    "Nu introduce PIN, CVV, OTP sau parole. Folosește exclusiv date sintetice.",
  );
}
export const questionSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  text: z.string().min(5).max(500),
  reason: z.string().max(1000),
  answer_type: z.enum(["YES_NO", "TEXT", "CHOICE"]),
  options: z
    .array(z.object({ value: z.string(), label: z.string() }))
    .optional(),
});
export const createSchema = z.object({
  customer_id: z.string().min(1),
  statement: z.string().min(8).max(5000),
  transaction_id: z.string().nullable().optional(),
  reported_amount_minor: z
    .number()
    .int()
    .nonnegative()
    .max(1000000000)
    .optional(),
});
export const versionSchema = z.object({
  expected_case_version: z.number().int().positive(),
});
export const approvalSchema = versionSchema.extend({
  run_id: z.string(),
  action: z.enum(["APPROVE", "REJECT", "REVISION", "ESCALATE", "CLOSE"]),
  action_ids: z.array(z.string()).max(6).default([]),
  questions: z.array(questionSchema).max(8).optional(),
  comment: z.string().max(2000).default(""),
});
export const responseSchema = versionSchema.extend({
  answers: z.record(z.string().max(1200)),
  attachment: z
    .object({ name: z.string().max(100), content: z.string().max(10000) })
    .optional(),
});
export const triageSchema = z
  .object({
    primary_route: z.enum(routes),
    secondary_routes: z.array(z.enum(routes)).max(3),
    routing_reason: z.string().min(5).max(1200),
    evidence_ids: z.array(z.string()).min(1),
  })
  .strict();
export const resultSchema = z
  .object({
    known_facts: z
      .array(
        z.object({
          text: z.string().max(1400),
          evidence_ids: z.array(z.string()).min(1),
        }),
      )
      .max(30),
    customer_claims: z.array(z.string().max(1500)).max(20),
    unknowns: z.array(z.string().max(1000)).max(15),
    contradictions: z.array(z.string().max(1000)).max(10),
    customer_questions: z.array(questionSchema).max(8),
    proposed_actions: z
      .array(
        z.object({
          id: z.string(),
          type: z.enum(actionTypes),
          reason: z.string().max(1200),
          requires_approval: z.literal(true),
          status: z.literal("PENDING"),
        }),
      )
      .max(6),
  })
  .strict();
export function validateGrounding(
  run: Pick<Run, "known_facts">,
  evidence: Evidence[],
) {
  for (const fact of run.known_facts) {
    assert(
      fact.evidence_ids.length &&
        fact.evidence_ids.every((id) => evidence.some((e) => e.id === id)),
      "FABRICATED_EVIDENCE",
      "Rezultatul citează o dovadă inexistentă.",
      422,
    );
    assert(
      evidence.some(
        (e) => fact.evidence_ids.includes(e.id) && e.summary === fact.text,
      ),
      "UNGROUNDED_FACT",
      "Afirmația nu este susținută exact de o dovadă.",
      422,
    );
  }
}
