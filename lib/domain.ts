import { z } from "zod";

export const states = [
  "OPEN",
  "INVESTIGATING",
  "AWAITING_APPROVAL",
  "AWAITING_CUSTOMER",
  "READY_FOR_REVIEW",
  "ESCALATED",
  "CLOSED_DEMO",
] as const;
export type Status = (typeof states)[number];
export type Role = "B2C_AGENT" | "B2C_SUPERVISOR" | "DEMO_CUSTOMER";
export type Category =
  | "UNRECOGNIZED_CARD_TRANSACTION"
  | "POSSIBLE_DUPLICATE"
  | "REFUND_NOT_RECEIVED"
  | "CONFLICTING_EVIDENCE";
export type Answer = "YES" | "NO" | "UNSURE";
export interface Transaction {
  id: string;
  amount_minor: number;
  currency: string;
  merchant: string;
  occurred_at: string;
  channel: string;
  status: "SETTLED" | "AUTHORIZED" | "REVERSED";
  reference: string;
}
export interface Evidence {
  id: string;
  type: string;
  source: string;
  timestamp: string;
  summary: string;
  data: Record<string, unknown>;
}
export interface Question {
  id: string;
  key: string;
  text: string;
  reason: string;
  answer_type: "YES_NO_UNSURE";
}
export interface Finding {
  claim: string;
  evidence_refs: string[];
}
export interface Evaluation {
  rule_id: string;
  result: string;
  severity: "pass" | "warning" | "block";
  explanation: string;
  evidence_refs: string[];
}
export interface ToolCall {
  name: string;
  status: "COMPLETED" | "FAILED";
  started_at: string;
  duration_ms: number;
  evidence_refs: string[];
  error?: string;
}
export interface Investigation {
  id: string;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  provider: string;
  calls: ToolCall[];
  findings: Finding[];
  unknowns: string[];
  questions: Question[];
  rules: Evaluation[];
  suggested_route: string;
  next_action: string;
  error?: string;
}
export interface CustomerRequest {
  id: string;
  investigation_id: string;
  questions: Question[];
  status: "PENDING" | "ANSWERED" | "EXPIRED";
  created_at: string;
  expires_at: string;
  case_version: number;
  approved_by: string;
  answers?: Record<string, Answer>;
  answered_at?: string;
}
export interface Approval {
  id: string;
  action: string;
  actor: string;
  timestamp: string;
  comment: string;
  investigation_id: string;
}
export interface AuditEvent {
  event_id: string;
  case_id: string;
  actor_id: string;
  actor_type: string;
  event_type: string;
  timestamp: string;
  payload: Record<string, unknown>;
  correlation_id: string;
}
export interface DisputeCase {
  id: string;
  customer_id: string;
  customer_name: string;
  card_id: string;
  card_last4: string;
  card_status: "ACTIVE" | "LOST";
  category: Category;
  status: Status;
  version: number;
  created_at: string;
  updated_at: string;
  priority: "NORMAL" | "HIGH" | "URGENT";
  customer_statement: string;
  transaction: Transaction | null;
  auth: {
    three_ds_status: "VERIFIED" | "UNKNOWN";
    evidence_available: boolean;
  };
  duplicate_candidates: Transaction[];
  refund: { promised: boolean; confirmed: boolean; promised_at?: string };
  history: string[];
  conflict: boolean;
  fault?: "TOOL_TIMEOUT" | "INVALID_LLM_OUTPUT";
  rulebook_version: string;
  data_classification: "SYNTHETIC";
  expected_route: string;
  evidence: Evidence[];
  investigations: Investigation[];
  requests: CustomerRequest[];
  approvals: Approval[];
  audit: AuditEvent[];
  processed: Record<string, { fingerprint: string; result: unknown }>;
}

export const questionSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  text: z.string().min(5).max(500),
  reason: z.string().min(1).max(500),
  answer_type: z.literal("YES_NO_UNSURE"),
});
export const outputSchema = z
  .object({
    findings: z.array(
      z.object({
        claim: z.string().min(1).max(1000),
        evidence_refs: z.array(z.string()).min(1),
      }),
    ),
    unknowns: z.array(z.string()),
    questions: z.array(questionSchema).max(6),
    suggested_route: z.enum([
      "UNRECOGNIZED_CNP",
      "MERCHANT_RECOGNIZED_REVIEW",
      "POSSIBLE_DUPLICATE_REVIEW",
      "INSUFFICIENT_DUPLICATE_EVIDENCE",
      "REFUND_REVIEW",
      "CONFLICT_ESCALATE",
      "PRIORITY_SECURITY_REVIEW",
      "ESCALATE_DATA_ISSUE",
      "MANUAL_REVIEW",
    ]),
    next_action: z.enum([
      "REQUEST_CUSTOMER_INFORMATION",
      "HUMAN_REVIEW",
      "ESCALATE",
    ]),
  })
  .strict();
export const mutationSchema = z.object({
  expected_case_version: z.number().int().positive(),
});
export const approvalSchema = mutationSchema.extend({
  action: z.enum([
    "APPROVE_CUSTOMER_QUESTIONS",
    "REQUEST_REVISION",
    "APPROVE_ROUTE",
    "ESCALATE",
    "CLOSE_DEMO",
  ]),
  investigation_id: z.string(),
  approved_question_ids: z.array(z.string()).optional(),
  questions: z.array(questionSchema).optional(),
  comment: z.string().max(2000).default(""),
});
export const responseSchema = mutationSchema.extend({
  answers: z.record(z.enum(["YES", "NO", "UNSURE"])),
});
export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function assert(
  condition: unknown,
  code: string,
  message: string,
  status = 400,
): asserts condition {
  if (!condition) throw new DomainError(code, message, status);
}
export const money = (minor: number, currency = "RON") =>
  new Intl.NumberFormat("ro-RO", { style: "currency", currency }).format(
    minor / 100,
  );
export const now = () => new Date().toISOString();
export const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
export function transition(c: DisputeCase, to: Status) {
  const allowed: Record<Status, Status[]> = {
    OPEN: ["INVESTIGATING", "ESCALATED"],
    INVESTIGATING: ["AWAITING_APPROVAL", "READY_FOR_REVIEW", "ESCALATED"],
    AWAITING_APPROVAL: ["AWAITING_CUSTOMER", "INVESTIGATING", "ESCALATED"],
    AWAITING_CUSTOMER: ["INVESTIGATING", "ESCALATED"],
    READY_FOR_REVIEW: ["CLOSED_DEMO", "ESCALATED", "INVESTIGATING"],
    ESCALATED: ["INVESTIGATING"],
    CLOSED_DEMO: [],
  };
  assert(
    allowed[c.status].includes(to),
    "INVALID_TRANSITION",
    `Tranziție nepermisă: ${c.status} → ${to}.`,
    409,
  );
  c.status = to;
}
export function audit(
  c: DisputeCase,
  event_type: string,
  payload: Record<string, unknown> = {},
  actor = "orchestrator",
  role = "SYSTEM",
  correlation_id = uid("COR"),
) {
  c.audit.push({
    event_id: uid("EVT"),
    case_id: c.id,
    actor_id: actor,
    actor_type: role,
    event_type,
    timestamp: now(),
    payload,
    correlation_id,
  });
}
export function validateGrounding(
  output: z.infer<typeof outputSchema>,
  evidence: Evidence[],
) {
  const ids = new Set(evidence.map((e) => e.id));
  for (const f of output.findings)
    assert(
      f.evidence_refs.length && f.evidence_refs.every((id) => ids.has(id)),
      "UNGROUNDED_OUTPUT",
      "Rezultatul conține referințe la dovezi inexistente.",
      422,
    );
}
