"use client";
import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  CreditCard,
  Download,
  FileCheck2,
  FileText,
  Fingerprint,
  GitBranch,
  Inbox,
  Layers3,
  LoaderCircle,
  MessageSquare,
  Network,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TriangleAlert,
  UserRound,
  X,
} from "lucide-react";
import { money, type Role } from "../lib/domain";
import {
  routeLabels,
  stateLabels,
  routes,
  type Route,
  type Incident,
  type Evidence,
  type BankRecord,
  type Job,
  type Question,
  type Run,
  type State,
  type CustomerRequest,
} from "../lib/incidents/domain";
import { toolLabels } from "../lib/incidents/tools";
type Profile = { customer_id: string; name: string; case_id: string };
type Catalog = {
  id: string;
  customer_id: string;
  channel: BankRecord["channel"];
  amount_minor: number;
  currency: string;
  descriptor: string;
  status: string;
};
type Detail = Incident & { payment_record: BankRecord | null; job: Job | null };
type MobileCase = Pick<
  Incident,
  | "id"
  | "reference"
  | "customer_id"
  | "customer_name"
  | "version"
  | "status"
  | "primary_route"
  | "priority"
  | "requests"
> & { transaction: Catalog | null };
type Metrics = {
  total: number;
  by_route: Record<Route, number>;
  new: number;
  awaiting_approval: number;
  awaiting_customer: number;
  ready: number;
  human_review: number;
  escalated: number;
  closed: number;
  runs: number;
  failed: number;
  tool_calls: number;
  tool_errors: number;
  model_errors: number;
  avg_triage_ms: number | null;
  avg_investigation_ms: number | null;
  customer_interactions: number;
  escalation_rate: number;
  human_intervention_rate: number | null;
  grounding: number | null;
  reclassifications: number;
};
const icons: Record<Route, ReactNode> = {
  DISPUTE_PILOT: <CreditCard size={19} />,
  SCAM_RESCUE: <ShieldAlert size={19} />,
  ROPAY_RESCUE: <ArrowUpRight size={19} />,
  ATM_TRACE: <Banknote size={19} />,
  HUMAN_REVIEW: <UserRound size={19} />,
};
const descriptions: Record<Route, string> = {
  DISPUTE_PILOT: "Plăți cu cardul",
  SCAM_RESCUE: "Manipulare și securitate",
  ROPAY_RESCUE: "Transferuri greșite",
  ATM_TRACE: "Numerar și jurnale ATM",
  HUMAN_REVIEW: "Cazuri ambigue",
};
const actionLabels: Record<string, string> = {
  ASK_CUSTOMER: "Trimite clarificări clientului",
  ESCALATE: "Escaladează către echipa specializată",
  PREPARE_RECOVERY_PACK: "Pregătește dosarul de verificare",
  PREPARE_DISPUTE_PACK: "Pregătește dosarul de dispută",
  REQUEST_TECHNICAL_REVIEW: "Pregătește verificarea tehnică ATM",
  SEND_CUSTOMER_UPDATE: "Trimite actualizarea către client",
};
const eventLabels: Record<string, string> = {
  INCIDENT_CREATED: "Incident creat",
  INCIDENT_DEMO_RESET: "Scenariu resetat",
  INVESTIGATION_JOB_QUEUED: "Investigație adăugată în coadă",
  INVESTIGATION_STARTED: "Investigație pornită",
  REINVESTIGATION_STARTED: "Reinvestigare pornită",
  TOOL_CALLED: "Instrument apelat",
  EVIDENCE_RETRIEVED: "Dovadă colectată",
  TOOL_FAILED: "Instrument indisponibil",
  TOOL_RETRY_SCHEDULED: "Reîncercare instrument",
  INCIDENT_ROUTED: "Rută selectată",
  INCIDENT_RECLASSIFIED: "Incident reclasificat",
  RULE_EVALUATED: "Regulă evaluată",
  INVESTIGATION_COMPLETED: "Investigație finalizată",
  INVESTIGATION_FAILED: "Investigație oprită controlat",
  CUSTOMER_REQUEST_CREATED: "Solicitare aprobată și trimisă",
  CUSTOMER_RESPONSE_RECEIVED: "Răspuns client primit",
  HUMAN_APPROVAL_RECORDED: "Decizie umană înregistrată",
  INCIDENT_ESCALATED: "Escaladare aprobată",
  INCIDENT_REASSIGNED: "Incident reasignat",
  OPERATIONAL_PACK_PREPARED: "Dosar operațional pregătit",
  CUSTOMER_UPDATE_APPROVED: "Comunicare aprobată",
  RECOMMENDATION_REJECTED: "Propunere respinsă",
  INVESTIGATION_REVISION_REQUESTED: "Revizuire solicitată",
  INCIDENT_CLOSED_DEMO: "Caz închis demo",
  INVESTIGATION_JOB_RECOVERED: "Job recuperat",
  LLM_CALLED: "Model apelat",
  LLM_OUTPUT_REJECTED: "Rezultat model respins",
  DEMO_FAULT_RECOVERED: "Defecțiune demo eliminată",
};
const date = (s: string) =>
  new Intl.DateTimeFormat("ro-RO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Bucharest",
  }).format(new Date(s));
function download(name: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
function Status({ state }: { state: State }) {
  return (
    <span className={"payment-status " + state.toLowerCase()}>
      <i />
      {stateLabels[state]}
    </span>
  );
}
function RouteTag({ route }: { route: Route | null }) {
  return (
    <span className={"route-tag " + (route ?? "unclassified").toLowerCase()}>
      {route ? icons[route] : <Network size={14} />}{" "}
      {route ? routeLabels[route] : "Neclasificat"}
    </span>
  );
}
function EvidenceModal({ e, onClose }: { e: Evidence; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Dovadă incident"
        onClick={(ev) => ev.stopPropagation()}
      >
        <button
          className="modal-close icon-button"
          aria-label="Închide dovada"
          onClick={onClose}
        >
          <X size={19} />
        </button>
        <span className="tag">
          <FileCheck2 size={13} />
          DOVADĂ SINTETICĂ
        </span>
        <h2>{toolLabels[e.source] ?? e.source}</h2>
        <p>{e.summary}</p>
        <dl className="evidence-meta">
          <div>
            <dt>Sursă</dt>
            <dd>{e.source}</dd>
          </div>
          <div>
            <dt>Observat la</dt>
            <dd>{e.observed_at}</dd>
          </div>
          <div>
            <dt>Colectat la</dt>
            <dd>{e.retrieved_at}</dd>
          </div>
          <div>
            <dt>Referință</dt>
            <dd>{e.id}</dd>
          </div>
        </dl>
        <pre>{JSON.stringify(e.payload, null, 2)}</pre>
      </section>
    </div>
  );
}
export default function IncidentCenter({
  path,
  role,
  mode,
  onNavigate,
}: {
  path: string;
  role: Role;
  mode: string;
  onNavigate: (path: string) => void;
}) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [catalog, setCatalog] = useState<Catalog[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [stateFilter, setStateFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [centerTab, setCenterTab] = useState("inbox");
  const [detailTab, setDetailTab] = useState("investigation");
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [comment, setComment] = useState("");
  const [reset, setReset] = useState(false);
  const [reassignRoute, setReassignRoute] = useState<Route>("HUMAN_REVIEW");
  const [reassignTx, setReassignTx] = useState("");
  const [showReassign, setShowReassign] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [newCustomer, setNewCustomer] = useState("");
  const [newTx, setNewTx] = useState("");
  const [newStatement, setNewStatement] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [mobileCustomer, setMobileCustomer] = useState("");
  const [mobileCases, setMobileCases] = useState<MobileCase[]>([]);
  const [mobileSelected, setMobileSelected] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [attachment, setAttachment] = useState<
    { name: string; content: string } | undefined
  >();
  const isNew = path === "/b2c/incidents/new";
  const isMobile = path === "/b2c/customer-demo";
  const isAnalytics = path === "/b2c/analytics";
  const isDemo = path === "/b2c/demo";
  const isAudit = path === "/b2c/audit";
  const caseId = path.match(/^\/b2c\/incidents\/([^/]+)$/)?.[1];
  const api = async <T,>(endpoint: string, body?: unknown): Promise<T> => {
    const r = await fetch("/api/b2c/" + endpoint, {
      ...(body !== undefined
        ? {
            method: "POST",
            body: JSON.stringify(body),
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": crypto.randomUUID(),
            },
          }
        : {}),
    });
    const value = (await r.json()) as { message?: string };
    if (!r.ok)
      throw new Error(value.message ?? "Operațiunea nu a putut fi finalizată.");
    return value as T;
  };
  async function refresh() {
    const [list, stats] = await Promise.all([
      api<Incident[]>("incidents"),
      api<Metrics>("incidents/metrics"),
    ]);
    setIncidents(list);
    setMetrics(stats);
    if (caseId) {
      const c = await api<Detail>("incidents/" + caseId);
      setDetail(c);
    }
  }
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await api("incidents/bootstrap", {});
        const [list, payments, customers, stats] = await Promise.all([
          api<Incident[]>("incidents"),
          api<Catalog[]>("incidents/catalog"),
          api<Profile[]>("demo/profiles"),
          api<Metrics>("incidents/metrics"),
        ]);
        if (!active) return;
        setIncidents(list);
        setCatalog(payments);
        setProfiles(customers);
        setMetrics(stats);
        setNewCustomer(customers[0]?.customer_id ?? "");
        setMobileCustomer(
          new URLSearchParams(location.search).get("customer") ??
            customers[0]?.customer_id ??
            "",
        );
        if (caseId) {
          const c = await api<Detail>("incidents/" + caseId);
          if (active) {
            setDetail(c);
            setReassignRoute(c.primary_route ?? "HUMAN_REVIEW");
            setReassignTx(c.transaction_id ?? "");
          }
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [caseId]);
  useEffect(() => {
    if (loading || isMobile) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh().catch(() => {});
    }, 1800);
    return () => clearInterval(timer);
  }, [loading, caseId, isMobile]);
  useEffect(() => {
    if (!isMobile || !mobileCustomer) return;
    let active = true;
    (async () => {
      try {
        await api("session", {
          role: "DEMO_CUSTOMER",
          customer_id: mobileCustomer,
        });
        const rows = await api<MobileCase[]>("incident-customer");
        if (active) {
          setMobileCases(rows);
          setMobileSelected(
            new URLSearchParams(location.search).get("incident") ??
              rows.find((c) => c.requests.some((r) => r.status === "PENDING"))
                ?.id ??
              rows[0]?.id ??
              "",
          );
          setAnswers({});
          setAttachment(undefined);
        }
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    const timer = setInterval(
      () =>
        api<MobileCase[]>("incident-customer")
          .then((rows) => {
            if (active) setMobileCases(rows);
          })
          .catch(() => {}),
      1800,
    );
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [isMobile, mobileCustomer]);
  const run = detail?.runs.at(-1);
  useEffect(() => {
    setEdits({});
    setComment("");
    setReplayIndex(0);
  }, [run?.id]);
  const act = async (action: () => Promise<unknown>, message: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await action();
      await refresh();
      setNotice(message);
      return result;
    } catch (e) {
      setError((e as Error).message);
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  };
  const start = (recover = false) =>
    detail &&
    act(
      () =>
        api(`incidents/${detail.id}/investigate`, {
          expected_case_version: detail.version,
          ...(recover ? { recover_demo_fault: true } : {}),
        }),
      "Investigația a fost adăugată în coada persistentă. Rezultatul apare în dosar.",
    );
  const approval = (
    action: "APPROVE" | "REJECT" | "REVISION" | "ESCALATE" | "CLOSE",
    ids: string[] = [],
  ) =>
    detail &&
    run &&
    act(
      () =>
        api(`incidents/${detail.id}/approvals`, {
          expected_case_version: detail.version,
          run_id: run.id,
          action,
          action_ids: ids,
          comment,
          ...(action === "APPROVE"
            ? {
                questions: run.customer_questions.map((q) => ({
                  ...q,
                  text: edits[q.id] ?? q.text,
                })),
              }
            : {}),
        }),
      action === "APPROVE"
        ? "Propunerea a fost aprobată și înregistrată."
        : action === "CLOSE"
          ? "Incidentul a fost închis demonstrativ."
          : "Decizia a fost salvată în audit.",
    );
  const sourceRecord = (c: Incident) =>
    catalog.find((r) => r.id === c.transaction_id);
  const sorted = incidents
    .filter(
      (c) =>
        (filter === "ALL" ||
          (filter === "UNCLASSIFIED"
            ? !c.primary_route
            : c.primary_route === filter)) &&
        (stateFilter === "ALL" || c.status === stateFilter) &&
        [c.reference, c.customer_name, c.statement]
          .join(" ")
          .toLocaleLowerCase("ro")
          .includes(search.toLocaleLowerCase("ro")),
    )
    .sort(
      (a, b) =>
        ({ URGENT: 0, HIGH: 1, NORMAL: 2 })[a.priority] -
          { URGENT: 0, HIGH: 1, NORMAL: 2 }[b.priority] ||
        a.reference.localeCompare(b.reference),
    );
  const mobileCase =
    mobileCases.find((c) => c.id === mobileSelected) ?? mobileCases[0];
  const mobileRequest = mobileCase?.requests
    .filter((r) => r.status === "PENDING")
    .at(-1);
  const mobileAnswered = mobileCase?.requests.some(
    (r) => r.status === "ANSWERED",
  );
  const mobileUpdates =
    mobileCase?.requests.filter(
      (r) => r.kind === "UPDATE" && r.status === "DELIVERED",
    ) ?? [];
  const goCase = (c: Incident) => onNavigate("/b2c/incidents/" + c.id);
  const customerLoop = () =>
    detail &&
    onNavigate(
      `/b2c/customer-demo?customer=${detail.customer_id}&incident=${detail.id}`,
    );
  function alerts() {
    return (
      <>
        {error && (
          <div className="error-banner" role="alert">
            <TriangleAlert size={17} />
            <span>{error}</span>
            <button
              aria-label="Închide eroarea incidentului"
              onClick={() => setError("")}
            >
              <X size={14} />
            </button>
          </div>
        )}
        {notice && (
          <div className="pi-notice" role="status">
            <CheckCircle2 size={16} />
            <span>{notice}</span>
            <button
              aria-label="Închide confirmarea incidentului"
              onClick={() => setNotice("")}
            >
              <X size={14} />
            </button>
          </div>
        )}
      </>
    );
  }
  const stats = (
    <div className="pi-metrics">
      <Metric
        title="Incidente în platformă"
        value={metrics?.total ?? 0}
        icon={<Layers3 size={19} />}
        note="4 investigatori · un singur circuit"
      />
      <Metric
        title="Așteaptă aprobarea"
        value={
          incidents.filter((c) =>
            c.runs.at(-1)?.proposed_actions.some((a) => a.status === "PENDING"),
          ).length
        }
        icon={<ShieldCheck size={19} />}
        note="Angajatul validează următorul pas"
      />
      <Metric
        title="Dialoguri cu clientul"
        value={metrics?.customer_interactions ?? 0}
        icon={<MessageSquare size={19} />}
        note="Răspunsuri persistate și reinvestigate"
      />
      <Metric
        title="Escaladate / Human Review"
        value={(metrics?.escalated ?? 0) + (metrics?.human_review ?? 0)}
        icon={<UserRound size={19} />}
        note="Cazuri care necesită intervenție"
      />
    </div>
  );
  if (loading)
    return (
      <div className="pi-empty">
        <LoaderCircle className="spin" size={27} />
        <h2>Se pregătește centrul de incidente…</h2>
        <p>Se încarcă sesizările, sursele sintetice și coada persistentă.</p>
      </div>
    );
  return (
    <div className="payment-center">
      {alerts()}
      {isMobile ? (
        <>
          <div className="page-heading">
            <div>
              <div className="eyebrow">SMART MOBILE · SIMULATOR COMUN</div>
              <h1>O singură conversație pentru incident.</h1>
              <p>
                Clientul primește numai solicitări aprobate. Răspunsul revine
                automat în orchestrator.
              </p>
            </div>
            <button
              className="button"
              onClick={() => onNavigate("/b2c/incidents")}
            >
              <ArrowLeft size={15} />
              Centrul de incidente
            </button>
          </div>
          <div className="pi-mobile-layout">
            <aside className="pi-mobile-description">
              <span className="tag">
                <Smartphone size={13} />
                SIMULARE · DATE SINTETICE
              </span>
              <h2>
                Tu clarifici.
                <br />
                Investigația continuă.
              </h2>
              <p>
                Fără integrare cu o aplicație bancară reală. Nu introduce PIN,
                CVV, OTP sau parole.
              </p>
              <label
                className="field-label"
                htmlFor="incident-customer-profile"
              >
                PROFIL CLIENT
              </label>
              <select
                id="incident-customer-profile"
                aria-label="Client simulator incidente"
                value={mobileCustomer}
                onChange={(e) => setMobileCustomer(e.target.value)}
              >
                {profiles.map((p) => (
                  <option key={p.customer_id} value={p.customer_id}>
                    {p.name} · {p.customer_id}
                  </option>
                ))}
              </select>
              <div className="pi-mobile-cases">
                {mobileCases.map((c) => (
                  <button
                    key={c.id}
                    className={c.id === mobileCase?.id ? "active" : ""}
                    onClick={() => {
                      setMobileSelected(c.id);
                      setAnswers({});
                      setAttachment(undefined);
                    }}
                  >
                    <span>
                      <strong>{c.reference}</strong>
                      <small>
                        {c.transaction?.descriptor ??
                          "Tranzacție de clarificat"}
                      </small>
                    </span>
                    <span className="counter">
                      {c.requests.filter((r) => r.status === "PENDING").length}
                    </span>
                    <ChevronRight size={14} />
                  </button>
                ))}
              </div>
            </aside>
            <div className="phone pi-phone">
              <div className="phone-top">
                <span>9:41</span>
                <span>● ▰ ▰</span>
              </div>
              <div className="phone-island" />
              <div className="phone-content">
                <div className="mobile-brand">
                  <span className="brand-symbol small">
                    <Network size={16} />
                  </span>
                  Payment Assist<span>DEMO</span>
                </div>
                <div className="mobile-greeting">
                  Bună, {mobileCase?.customer_name.split(" ")[0] ?? "client"}.
                </div>
                <h2>
                  Hai să clarificăm
                  <br />
                  incidentul tău.
                </h2>
                {mobileCase && (
                  <div className="pi-mobile-transaction">
                    <CreditCard size={21} />
                    <div>
                      <strong>
                        {mobileCase.transaction?.descriptor ??
                          "Tranzacție neidentificată"}
                      </strong>
                      <small>
                        {mobileCase.reference} ·{" "}
                        {mobileCase.transaction?.status ?? "UNKNOWN"}
                      </small>
                    </div>
                    <b>
                      {mobileCase.transaction
                        ? money(mobileCase.transaction.amount_minor)
                        : "—"}
                    </b>
                  </div>
                )}
                {mobileRequest ? (
                  <>
                    <div className="mobile-request-meta">
                      <ShieldCheck size={14} />
                      Solicitare aprobată · {
                        mobileRequest.questions.length
                      }{" "}
                      întrebări
                    </div>
                    {mobileRequest.questions.map((q, i) => (
                      <div className="mobile-question" key={q.id}>
                        <label>
                          {i + 1}. {q.text}
                        </label>
                        {q.answer_type === "TEXT" ? (
                          <input
                            className="pi-answer-text"
                            aria-label={q.text}
                            value={answers[q.key] ?? ""}
                            onChange={(e) =>
                              setAnswers((a) => ({
                                ...a,
                                [q.key]: e.target.value,
                              }))
                            }
                            maxLength={1200}
                          />
                        ) : (
                          <div className="pi-answer-options">
                            {q.options?.map((option) => (
                              <button
                                key={option.value}
                                className={
                                  answers[q.key] === option.value
                                    ? "chosen"
                                    : ""
                                }
                                onClick={() =>
                                  setAnswers((a) => ({
                                    ...a,
                                    [q.key]: option.value,
                                  }))
                                }
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    <label className="pi-attachment">
                      <FileText size={13} />
                      {attachment
                        ? attachment.name
                        : "Atașează o notă sintetică TXT (opțional)"}
                      <input
                        type="file"
                        accept=".txt,text/plain"
                        aria-label="Atașament sintetic incident"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 10000) {
                              setError("Atașamentul depășește 10 KB.");
                              return;
                            }
                            setAttachment({
                              name: file.name,
                              content: await file.text(),
                            });
                          }
                        }}
                      />
                    </label>
                    <button
                      className="button primary full"
                      disabled={
                        busy ||
                        !mobileRequest.questions.every((q) =>
                          answers[q.key]?.trim(),
                        )
                      }
                      onClick={() =>
                        act(async () => {
                          await api(
                            `customer-requests/${mobileRequest.id}/responses`,
                            {
                              expected_case_version: mobileCase.version,
                              answers,
                              attachment,
                            },
                          );
                          setMobileCases(
                            await api<MobileCase[]>("incident-customer"),
                          );
                          setAnswers({});
                          setAttachment(undefined);
                        }, "Răspunsurile au fost salvate și reinvestigația a fost programată.")
                      }
                    >
                      <Send size={14} />
                      {busy ? "Se salvează…" : "Trimite răspunsurile"}
                    </button>
                    <p className="mobile-fine">
                      Răspunsurile sunt declarații ale clientului, nu dovezi
                      tehnice.
                    </p>
                  </>
                ) : mobileAnswered ? (
                  <div className="mobile-success">
                    <span>
                      <CheckCircle2 size={30} />
                    </span>
                    <h3>Răspunsurile tale au fost salvate.</h3>
                    <p>Investigația continuă pe baza informațiilor noi.</p>
                    <Status state={mobileCase.status} />
                  </div>
                ) : (
                  <div className="pi-mobile-empty">
                    <MessageSquare size={27} />
                    <h3>Nicio solicitare nouă.</h3>
                    <p>Întrebările apar aici după aprobarea unui angajat.</p>
                  </div>
                )}
                {mobileUpdates.map((u) => (
                  <div className="pi-mobile-update" key={u.id}>
                    <ShieldCheck size={15} />
                    <p>{u.message}</p>
                  </div>
                ))}
              </div>
              <div className="phone-bottom" />
            </div>
          </div>
        </>
      ) : isNew ? (
        <>
          <button
            className="back-link"
            onClick={() => onNavigate("/b2c/incidents")}
          >
            <ArrowLeft size={14} />
            Toate incidentele
          </button>
          <div className="page-heading">
            <div>
              <div className="eyebrow">INCIDENT INTAKE · B2C</div>
              <h1>O problemă cu o plată. Un punct de pornire.</h1>
              <p>
                Orchestratorul verifică tranzacțiile și alege investigatorul
                compatibil cu dovezile.
              </p>
            </div>
          </div>
          <div className="pi-new-layout">
            <section className="panel pi-new-form">
              <div className="panel-header">
                <h2>Înregistrează sesizarea</h2>
                <span className="tag">SYNTHETIC</span>
              </div>
              <label htmlFor="new-incident-customer">Client sintetic</label>
              <select
                id="new-incident-customer"
                value={newCustomer}
                onChange={(e) => {
                  setNewCustomer(e.target.value);
                  setNewTx("");
                }}
              >
                {profiles.map((p) => (
                  <option key={p.customer_id} value={p.customer_id}>
                    {p.name} · {p.customer_id}
                  </option>
                ))}
              </select>
              <label htmlFor="new-incident-statement">
                Relatarea clientului
              </label>
              <textarea
                id="new-incident-statement"
                aria-label="Relatare incident nou"
                value={newStatement}
                onChange={(e) => setNewStatement(e.target.value)}
                maxLength={5000}
                placeholder="Descrie problema: plata, transferul, apelul suspect sau retragerea ATM…"
              />
              <p className="pi-input-help">
                <ShieldCheck size={13} />
                Exclusiv date sintetice. Fără PIN, CVV, OTP sau parole.
              </p>
              <div className="pi-new-row">
                <div>
                  <label htmlFor="new-incident-amount">
                    Suma declarată (RON, opțional)
                  </label>
                  <input
                    id="new-incident-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="new-incident-transaction">
                    Tranzacție relevantă (opțional)
                  </label>
                  <select
                    id="new-incident-transaction"
                    aria-label="Tranzacție incident nou"
                    value={newTx}
                    onChange={(e) => setNewTx(e.target.value)}
                  >
                    <option value="">Lasă orchestratorul să identifice</option>
                    {catalog
                      .filter((r) => r.customer_id === newCustomer)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.id} · {r.channel} · {money(r.amount_minor)}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <div className="pi-form-footer">
                <button
                  className="button"
                  onClick={() => onNavigate("/b2c/incidents")}
                >
                  Anulează
                </button>
                <button
                  className="button primary"
                  disabled={
                    busy || !newCustomer || newStatement.trim().length < 8
                  }
                  onClick={() =>
                    act(async () => {
                      const created = await api<{ incident_id: string }>(
                        "incidents",
                        {
                          customer_id: newCustomer,
                          statement: newStatement,
                          transaction_id: newTx || null,
                          ...(newAmount !== ""
                            ? {
                                reported_amount_minor: Math.round(
                                  Number(newAmount) * 100,
                                ),
                              }
                            : {}),
                        },
                      );
                      onNavigate("/b2c/incidents/" + created.incident_id);
                    }, "Incidentul a fost creat.")
                  }
                >
                  <Plus size={15} />
                  Creează incidentul
                </button>
              </div>
            </section>
            <aside className="pi-new-explainer">
              <span className="spark-icon">
                <Network size={20} />
              </span>
              <h2>
                Patru investigatori.
                <br />
                Aceeași trasabilitate.
              </h2>
              {routes.map((route) => (
                <div key={route}>
                  {icons[route]}
                  <span>
                    <strong>{routeLabels[route]}</strong>
                    <small>{descriptions[route]}</small>
                  </span>
                </div>
              ))}
              <p>
                O situație ambiguă rămâne în revizuire umană. Nicio operațiune
                financiară nu este executată.
              </p>
            </aside>
          </div>
        </>
      ) : isAnalytics ? (
        <>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                PAYMENT INCIDENT INTELLIGENCE · ANALYTICS
              </div>
              <h1>Fiecare pas, măsurabil.</h1>
              <p>
                Indicatori calculați din cazuri, apeluri, aprobări și dialoguri
                persistate.
              </p>
            </div>
            <span className="live-label">
              <span />
              Actualizare automată
            </span>
          </div>
          {stats}
          <div className="pi-analytics-grid">
            <section className="panel">
              <div className="panel-header">
                <h2>Distribuție pe investigatori</h2>
                <Network size={18} />
              </div>
              <div className="pi-route-bars">
                {routes.map((r) => (
                  <div key={r}>
                    <span>
                      {icons[r]}
                      {routeLabels[r]}
                    </span>
                    <i>
                      <b
                        style={{
                          width: `${metrics?.total ? (metrics.by_route[r] / metrics.total) * 100 : 0}%`,
                        }}
                      />
                    </i>
                    <strong>{metrics?.by_route[r] ?? 0}</strong>
                  </div>
                ))}
              </div>
            </section>
            <section className="panel">
              <div className="panel-header">
                <h2>Execuție și control</h2>
                <Activity size={18} />
              </div>
              {[
                [
                  "Timp mediu de triere",
                  metrics?.avg_triage_ms == null
                    ? "—"
                    : metrics.avg_triage_ms + " ms",
                ],
                [
                  "Timp mediu de investigație",
                  metrics?.avg_investigation_ms == null
                    ? "—"
                    : (metrics.avg_investigation_ms / 1000).toFixed(2) + " s",
                ],
                ["Apeluri de instrumente", metrics?.tool_calls ?? 0],
                [
                  "Erori instrumente / model",
                  `${metrics?.tool_errors ?? 0} / ${metrics?.model_errors ?? 0}`,
                ],
                [
                  "Rată de escaladare aprobată",
                  `${metrics?.escalation_rate ?? 0}%`,
                ],
                [
                  "Afirmații susținute de dovezi",
                  metrics?.grounding == null ? "—" : metrics.grounding + "%",
                ],
                [
                  "Intervenție umană în cazurile investigate",
                  metrics?.human_intervention_rate == null
                    ? "—"
                    : metrics.human_intervention_rate + "%",
                ],
                [
                  "Reclasificări între investigatori",
                  metrics?.reclassifications ?? 0,
                ],
                ["Rulări oprite controlat", metrics?.failed ?? 0],
              ].map(([label, value]) => (
                <div className="pi-metric-row" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </section>
          </div>
          <p className="pi-footnote">
            Date exclusiv sintetice. „—” înseamnă că nu există încă măsurători;
            valorile nu reprezintă performanțe bancare reale.
          </p>
        </>
      ) : isAudit ? (
        <>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                PAYMENT INCIDENT INTELLIGENCE · AUDIT
              </div>
              <h1>Fiecare decizie are un fir al dovezilor.</h1>
              <p>
                Evenimente persistate pentru toate cele patru ramuri și General
                Human Review.
              </p>
            </div>
            <button
              className="button"
              onClick={() =>
                download(
                  "payment-incidents-audit.json",
                  incidents.flatMap((c) => c.audit),
                )
              }
            >
              <Download size={14} />
              Exportă auditul
            </button>
          </div>
          <section className="panel pi-audit pi-global-audit">
            <div className="pi-controls">
              <div className="search">
                <Search size={15} />
                <input
                  aria-label="Caută în auditul incidentelor"
                  placeholder="Referință, eveniment sau actor…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div>
              {incidents
                .flatMap((c) => c.audit.map((e) => ({ c, e })))
                .filter(({ c, e }) =>
                  [
                    c.reference,
                    e.event_type,
                    eventLabels[e.event_type],
                    e.actor_id,
                  ]
                    .join(" ")
                    .toLocaleLowerCase("ro")
                    .includes(search.toLocaleLowerCase("ro")),
                )
                .sort((a, b) => b.e.timestamp.localeCompare(a.e.timestamp))
                .map(({ c, e }) => (
                  <details key={e.event_id}>
                    <summary>
                      <span>{date(e.timestamp)}</span>
                      <strong>
                        {eventLabels[e.event_type] ?? e.event_type}
                      </strong>
                      <button
                        className="text-button"
                        onClick={(ev) => {
                          ev.preventDefault();
                          goCase(c);
                        }}
                      >
                        {c.reference}
                        <ArrowUpRight size={12} />
                      </button>
                      <ChevronDown size={12} />
                    </summary>
                    <pre>{JSON.stringify(e, null, 2)}</pre>
                  </details>
                ))}
            </div>
          </section>
        </>
      ) : detail ? (
        <>
          <button
            className="back-link"
            onClick={() => onNavigate("/b2c/incidents")}
          >
            <ArrowLeft size={14} />
            Centrul de incidente
          </button>
          <div className="pi-case-heading">
            <div>
              <div className="eyebrow">
                {detail.reference} · PAYMENT INCIDENT
              </div>
              <h1>
                {detail.payment_record?.descriptor ?? "Incident de clarificat"}
              </h1>
              <div>
                <span>{detail.customer_name}</span>
                <i>·</i>
                <RouteTag route={detail.primary_route} />
                <Status state={detail.status} />
              </div>
            </div>
            <aside>
              <strong>
                {detail.payment_record
                  ? money(detail.payment_record.amount_minor)
                  : detail.reported_amount_minor !== undefined
                    ? money(detail.reported_amount_minor)
                    : "—"}
              </strong>
              <span>
                v{detail.version} · {date(detail.updated_at)}
              </span>
            </aside>
          </div>
          <div className="pi-case-toolbar">
            <div>
              {[
                ["investigation", "Investigație"],
                ["history", `Rulări · ${detail.runs.length}`],
                ["audit", `Audit · ${detail.audit.length}`],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={detailTab === value ? "active" : ""}
                  onClick={() => setDetailTab(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              className="text-button"
              onClick={() =>
                onNavigate("/b2c/intake?customer=" + detail.customer_id)
              }
            >
              Profil canonic
              <UserRound size={13} />
            </button>
          </div>
          {detailTab === "audit" ? (
            <IncidentAudit incident={detail} />
          ) : detailTab === "history" ? (
            <section className="panel pi-run-history">
              {detail.runs.length ? (
                detail.runs.map((r, i) => (
                  <details key={r.id} open={i === detail.runs.length - 1}>
                    <summary>
                      <span>
                        <Layers3 size={16} />
                        Rularea {i + 1} · {routeLabels[r.primary_route]}
                      </span>
                      <span>
                        {r.status} · {date(r.started_at)}
                      </span>
                      <ChevronDown size={13} />
                    </summary>
                    <div>
                      <p>
                        {r.triage?.routing_reason ?? r.error ?? "În așteptare"}
                      </p>
                      <small>
                        {r.calls.length} apeluri · {r.duration_ms ?? 0} ms ·{" "}
                        {r.provider}
                      </small>
                      <pre>{JSON.stringify(r, null, 2)}</pre>
                    </div>
                  </details>
                ))
              ) : (
                <div className="pi-empty">Nicio rulare încă.</div>
              )}
            </section>
          ) : (
            <div className="pi-workspace">
              <aside className="pi-context">
                <section className="panel">
                  <div className="panel-header">
                    <h2>Operațiunea relevantă</h2>
                    <CreditCard size={17} />
                  </div>
                  <dl className="pi-facts-list">
                    <div>
                      <dt>Identificator</dt>
                      <dd>{detail.transaction_id ?? "Neidentificat"}</dd>
                    </div>
                    <div>
                      <dt>Canal</dt>
                      <dd>{detail.payment_record?.channel ?? "UNKNOWN"}</dd>
                    </div>
                    <div>
                      <dt>Status bancar</dt>
                      <dd>{detail.payment_record?.status ?? "UNKNOWN"}</dd>
                    </div>
                    <div>
                      <dt>Sumă</dt>
                      <dd>
                        {detail.payment_record
                          ? money(detail.payment_record.amount_minor)
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Prioritate</dt>
                      <dd
                        className={
                          detail.priority === "URGENT" ? "pi-urgent" : ""
                        }
                      >
                        {detail.priority === "URGENT"
                          ? "Urgentă"
                          : detail.priority === "HIGH"
                            ? "Ridicată"
                            : "Normală"}
                      </dd>
                    </div>
                  </dl>
                </section>
                <section className="panel pi-statement">
                  <div className="panel-header">
                    <h2>Declarația clientului</h2>
                    <MessageSquare size={16} />
                  </div>
                  <blockquote>„{detail.statement}”</blockquote>
                  <span>Declarație neconfirmată · date sintetice</span>
                </section>
                <section className="panel">
                  <div className="panel-header">
                    <h2>Evidence Hub</h2>
                    <span className="counter">{detail.evidence.length}</span>
                  </div>
                  <div className="pi-evidence-list">
                    {detail.evidence
                      .filter((e) => !run || e.run_id === run.id)
                      .map((e) => (
                        <button key={e.id} onClick={() => setEvidence(e)}>
                          <FileCheck2 size={16} />
                          <span>
                            <strong>{toolLabels[e.source] ?? e.source}</strong>
                            <small>{date(e.retrieved_at)}</small>
                          </span>
                          <ChevronRight size={12} />
                        </button>
                      ))}
                    {!detail.evidence.length && (
                      <p>
                        Dovezile sunt colectate de instrumentele
                        investigatorului.
                      </p>
                    )}
                  </div>
                </section>
              </aside>
              <section className="pi-investigation-column">
                <section className="panel pi-investigator">
                  <div className="panel-header">
                    <div>
                      <span className="spark-icon">
                        <Network size={18} />
                      </span>
                      <h2>
                        {detail.primary_route
                          ? routeLabels[detail.primary_route]
                          : "AI Payment Incident Triage"}
                      </h2>
                    </div>
                    <span className="tag muted">
                      {mode.includes("determinist")
                        ? "DEMO DETERMINIST"
                        : "LLM CONFIGURAT"}
                    </span>
                  </div>
                  {!run ? (
                    <div className="pi-investigation-start">
                      <span>
                        <Network size={34} />
                      </span>
                      <h2>Un orchestrator. Investigatorul potrivit.</h2>
                      <p>
                        Identifică tranzacția, verifică ruta, colectează dovezi
                        și propune un pas operațional pentru aprobarea
                        angajatului.
                      </p>
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() => start()}
                      >
                        <Play size={15} />
                        Pornește trierea și investigația
                      </button>
                      <small>
                        Execuție pe server · coadă persistentă · fără acțiuni
                        financiare
                      </small>
                    </div>
                  ) : (
                    <>
                      <div
                        className={"pi-run-state " + run.status.toLowerCase()}
                      >
                        {["RUNNING", "QUEUED"].includes(run.status) ? (
                          <LoaderCircle size={16} className="spin" />
                        ) : run.status === "FAILED" ? (
                          <TriangleAlert size={16} />
                        ) : (
                          <CheckCircle2 size={16} />
                        )}
                        <strong>
                          {run.status === "COMPLETED"
                            ? "Investigație finalizată"
                            : run.status === "FAILED"
                              ? "Investigație oprită controlat"
                              : run.status === "QUEUED"
                                ? "Job în coada persistentă"
                                : "Execuție pe server"}
                        </strong>
                        <span>
                          Runda {detail.runs.length}
                          {run.duration_ms !== undefined
                            ? " · " + (run.duration_ms / 1000).toFixed(2) + " s"
                            : ""}
                        </span>
                      </div>
                      {run.triage && (
                        <div className="pi-triage-result">
                          <span>
                            <GitBranch size={15} />
                            AI Payment Incident Triage
                          </span>
                          <RouteTag route={run.primary_route} />
                          <p>{run.triage.routing_reason}</p>
                          {run.secondary_routes.length > 0 && (
                            <small>
                              Rută secundară:{" "}
                              {run.secondary_routes
                                .map((r) => routeLabels[r])
                                .join(", ")}
                            </small>
                          )}
                        </div>
                      )}
                      <div className="pi-tool-timeline">
                        <div className="pi-section-heading">
                          <h3>Apeluri executate</h3>
                          <span>{run.calls.length} operații</span>
                        </div>
                        {run.calls.map((call) => (
                          <div
                            className={"pi-tool " + call.status.toLowerCase()}
                            key={call.id}
                          >
                            <span>
                              {call.status === "RUNNING" ? (
                                <LoaderCircle className="spin" size={12} />
                              ) : call.status === "COMPLETED" ? (
                                <Check size={12} />
                              ) : (
                                <X size={12} />
                              )}
                            </span>
                            <div>
                              <strong>
                                {toolLabels[call.name] ?? call.name}
                              </strong>
                              <small>
                                {call.agent === "PAYMENT_TRIAGE"
                                  ? "Triage"
                                  : (routeLabels[call.agent as Route] ??
                                    call.agent)}
                                {call.attempt > 1
                                  ? ` · reîncercare ${call.attempt}`
                                  : ""}
                              </small>
                            </div>
                            <b>
                              {call.status === "RUNNING"
                                ? "În execuție"
                                : call.status === "FAILED"
                                  ? "Eroare"
                                  : `${call.duration_ms ?? 0} ms`}
                            </b>
                          </div>
                        ))}
                      </div>
                      {run.error && (
                        <div className="callout danger pi-job-error">
                          <TriangleAlert size={17} />
                          <div>
                            <strong>Transferat către revizuire umană</strong>
                            <p>{run.error}</p>
                          </div>
                        </div>
                      )}
                      {run.known_facts.length > 0 && (
                        <div className="pi-known-facts">
                          <div className="pi-section-heading">
                            <h3>Fapte susținute de dovezi</h3>
                            <span>{run.known_facts.length}</span>
                          </div>
                          {run.known_facts.map((fact, i) => (
                            <div className="pi-fact" key={i}>
                              <CheckCircle2 size={15} />
                              <div>
                                <p>{fact.text}</p>
                                <div>
                                  {fact.evidence_ids.map((id) => (
                                    <button
                                      key={id}
                                      onClick={() =>
                                        setEvidence(
                                          detail.evidence.find(
                                            (e) => e.id === id,
                                          ) ?? null,
                                        )
                                      }
                                    >
                                      <FileText size={10} />
                                      {id.slice(0, 8)}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {run.customer_claims.length > 0 && (
                        <details className="pi-claims">
                          <summary>
                            <MessageSquare size={14} />
                            Declarații ale clientului <ChevronDown size={12} />
                          </summary>
                          <div>
                            {run.customer_claims.map((claim, i) => (
                              <p key={i}>{claim}</p>
                            ))}
                          </div>
                        </details>
                      )}
                      {run.unknowns.length > 0 && (
                        <div className="pi-unknowns">
                          <TriangleAlert size={16} />
                          <div>
                            <strong>Ce rămâne necunoscut</strong>
                            {run.unknowns.map((u, i) => (
                              <p key={i}>{u}</p>
                            ))}
                          </div>
                        </div>
                      )}
                      {run.contradictions.length > 0 && (
                        <div className="pi-contradictions">
                          <TriangleAlert size={16} />
                          <div>
                            <strong>Dovezi de revizuit</strong>
                            {run.contradictions.map((u, i) => (
                              <p key={i}>{u}</p>
                            ))}
                          </div>
                        </div>
                      )}
                      {run.rules.length > 0 && (
                        <div className="pi-rules">
                          <div className="pi-section-heading">
                            <h3>Motor de reguli deterministe</h3>
                            <span>{run.rulebook_version}</span>
                          </div>
                          {run.rules.map((r) => (
                            <details key={r.id}>
                              <summary>
                                <span
                                  className={
                                    "pi-rule-result " + r.result.toLowerCase()
                                  }
                                >
                                  {r.result === "PASS" ? (
                                    <CheckCircle2 size={13} />
                                  ) : (
                                    <TriangleAlert size={13} />
                                  )}
                                </span>
                                <code>{r.rule_id}</code>
                                <b>{r.result}</b>
                                <ChevronDown size={11} />
                              </summary>
                              <p>{r.explanation}</p>
                            </details>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  <div className="pi-investigator-footer">
                    <ShieldCheck size={12} />
                    Dovezi sintetice · propuneri validate · decizie umană
                  </div>
                </section>
                {detail.payment_record?.transfer && (
                  <section className="panel pi-intent">
                    <div className="panel-header">
                      <h2>Intenția clientului vs. plata efectuată</h2>
                      <ArrowUpRight size={18} />
                    </div>
                    <div>
                      <article>
                        <span>INTENȚIE DECLARATĂ</span>
                        <strong>
                          {detail.requests
                            .filter((r) => r.status === "ANSWERED")
                            .map((r) => r.answers?.intended_name)
                            .filter(Boolean)
                            .at(-1) ??
                            detail.payment_record.transfer.intended_name ??
                            "De clarificat"}
                        </strong>
                        <small>
                          {detail.payment_record.transfer.intended_alias ??
                            "Alias intenționat necunoscut"}
                        </small>
                      </article>
                      <ArrowRight size={18} />
                      <article>
                        <span>PLATĂ EFECTUATĂ</span>
                        <strong>
                          {detail.payment_record.transfer.beneficiary}
                        </strong>
                        <small>{detail.payment_record.transfer.alias}</small>
                      </article>
                    </div>
                    <footer>
                      <span>
                        {money(detail.payment_record.amount_minor)} ·{" "}
                        {date(detail.payment_record.occurred_at)}
                      </span>
                      <b>{detail.payment_record.status}</b>
                    </footer>
                    <p>
                      Beneficiarul greșit nu implică automat fraudă. Un transfer
                      decontat nu este anulat; recuperarea nu este garantată.
                    </p>
                  </section>
                )}
                {detail.payment_record?.atm && (
                  <section className="panel pi-atm">
                    <div className="panel-header">
                      <div>
                        <h2>ATM Event Replay</h2>
                        <p>
                          {detail.payment_record.atm.terminal_id} ·{" "}
                          {detail.payment_record.atm.location}
                        </p>
                      </div>
                      <Banknote size={18} />
                    </div>
                    <div className="pi-atm-replay">
                      {detail.payment_record.atm.events.map((e, i) => (
                        <button
                          key={i}
                          className={i === replayIndex ? "active" : ""}
                          onClick={() => setReplayIndex(i)}
                        >
                          <span>{i + 1}</span>
                          <strong>{e.type.replaceAll("_", " ")}</strong>
                          <small>{date(e.at)}</small>
                        </button>
                      ))}
                    </div>
                    <div className="pi-atm-current">
                      <span>
                        {detail.payment_record.atm.events[replayIndex]?.type}
                      </span>
                      <h3>
                        {detail.payment_record.atm.events[replayIndex]?.summary}
                      </h3>
                      <div>
                        <button
                          className="button"
                          disabled={replayIndex === 0}
                          onClick={() => setReplayIndex((i) => i - 1)}
                        >
                          <ArrowLeft size={13} />
                          Anterior
                        </button>
                        <span>
                          {replayIndex + 1} /{" "}
                          {detail.payment_record.atm.events.length} evenimente
                          reale din fixture
                        </span>
                        <button
                          className="button"
                          disabled={
                            replayIndex >=
                            detail.payment_record.atm.events.length - 1
                          }
                          onClick={() => setReplayIndex((i) => i + 1)}
                        >
                          Următor
                          <ArrowRight size={13} />
                        </button>
                      </div>
                    </div>
                  </section>
                )}
                {detail.runs.length > 1 && (
                  <section className="panel pi-evolution">
                    <div className="panel-header">
                      <h2>Evoluția incidentului</h2>
                      <GitBranch size={17} />
                    </div>
                    {detail.runs.map((r, i) => (
                      <div key={r.id}>
                        <span>{i + 1}</span>
                        <div>
                          <RouteTag route={r.primary_route} />
                          <p>
                            {r.recommended_status === "ESCALATED"
                              ? "Escaladare propusă"
                              : (r.triage?.routing_reason ??
                                r.error ??
                                "În execuție")}
                          </p>
                          <small>{date(r.started_at)}</small>
                        </div>
                      </div>
                    ))}
                  </section>
                )}
                {run?.customer_questions.length &&
                run.proposed_actions.some(
                  (a) => a.type === "ASK_CUSTOMER" && a.status === "PENDING",
                ) ? (
                  <section className="panel pi-question-composer">
                    <div className="panel-header">
                      <div>
                        <h2>Întrebări pentru client</h2>
                        <p>
                          Editează textul și verifică fiecare întrebare înainte
                          de aprobare.
                        </p>
                      </div>
                      <MessageSquare size={18} />
                    </div>
                    {run.customer_questions.map((q, i) => (
                      <div key={q.id}>
                        <label htmlFor={"edit-" + q.id}>
                          Întrebarea {i + 1} ·{" "}
                          {q.answer_type === "TEXT"
                            ? "Text sintetic"
                            : q.options?.map((o) => o.label).join(" / ")}
                        </label>
                        <textarea
                          id={"edit-" + q.id}
                          aria-label={`Întrebare incident ${i + 1}`}
                          value={edits[q.id] ?? q.text}
                          onChange={(e) =>
                            setEdits((x) => ({ ...x, [q.id]: e.target.value }))
                          }
                          maxLength={500}
                        />
                        <p>{q.reason}</p>
                      </div>
                    ))}
                    <footer>
                      <ShieldCheck size={13} />
                      Nicio întrebare nu este trimisă înainte de aprobarea
                      angajatului.
                    </footer>
                  </section>
                ) : null}
              </section>
              <aside className="pi-actions-column">
                <section className="panel pi-approval">
                  <div className="panel-header">
                    <h2>Human Approval</h2>
                    <ShieldCheck size={18} />
                  </div>
                  <div>
                    {!run ? (
                      <>
                        <span className="pi-action-icon">
                          <Network size={24} />
                        </span>
                        <h3>Pregătit pentru triere</h3>
                        <p>
                          Orchestratorul identifică investigatorul și
                          construiește dosarul.
                        </p>
                        <button
                          className="button primary full"
                          disabled={busy}
                          onClick={() => start()}
                        >
                          <Play size={14} />
                          Pornește investigația
                        </button>
                      </>
                    ) : detail.active_job_id ? (
                      <>
                        <LoaderCircle className="spin" size={24} />
                        <h3>Investigație în execuție</h3>
                        <p>
                          Progresul provine din evenimentele salvate pe server.
                        </p>
                        {detail.job &&
                          Date.parse(detail.job.lease_until) < Date.now() &&
                          detail.job.status === "RUNNING" && (
                            <button
                              className="button full"
                              disabled={busy}
                              onClick={() =>
                                act(
                                  () =>
                                    api(
                                      `incidents/jobs/${detail.job!.id}/resume`,
                                      {},
                                    ),
                                  "Rularea întreruptă a fost trimisă spre recuperare.",
                                )
                              }
                            >
                              Recuperează rularea
                            </button>
                          )}
                      </>
                    ) : run.status === "FAILED" ? (
                      <>
                        <span className="pi-action-icon danger">
                          <TriangleAlert size={23} />
                        </span>
                        <h3>Revizuire umană necesară</h3>
                        <p>
                          Rularea a fost oprită, iar eroarea și instrumentele au
                          rămas în audit.
                        </p>
                        <button
                          className="button primary full"
                          disabled={busy}
                          onClick={() => start()}
                        >
                          <RefreshCw size={14} />
                          Reîncearcă investigația
                        </button>
                        {detail.payment_record?.fault &&
                          role === "B2C_SUPERVISOR" && (
                            <button
                              className="button subtle full"
                              disabled={busy}
                              onClick={() => start(true)}
                            >
                              Elimină defecțiunea demo
                            </button>
                          )}
                      </>
                    ) : detail.status === "CLOSED_DEMO" ? (
                      <>
                        <span className="pi-action-icon">
                          <CheckCircle2 size={23} />
                        </span>
                        <h3>Incident închis demonstrativ</h3>
                        <p>
                          Rezultatul operațional a fost confirmat de supervizor.
                        </p>
                        <button
                          className="button full"
                          onClick={() => setDetailTab("audit")}
                        >
                          <FileText size={14} />
                          Deschide auditul
                        </button>
                      </>
                    ) : detail.status === "AWAITING_CUSTOMER" ? (
                      <>
                        <span className="pi-action-icon amber">
                          <MessageSquare size={23} />
                        </span>
                        <h3>Așteptăm răspunsul clientului</h3>
                        <p>
                          Solicitarea aprobată este disponibilă în simulatorul
                          comun.
                        </p>
                        <button
                          className="button primary full"
                          onClick={customerLoop}
                        >
                          <Smartphone size={15} />
                          Deschide Smart Mobile
                        </button>
                      </>
                    ) : (
                      <>
                        <span
                          className={
                            "pi-action-icon " +
                            (run.recommended_status === "ESCALATED"
                              ? "danger"
                              : "")
                          }
                        >
                          {run.recommended_status === "ESCALATED" ? (
                            <ShieldAlert size={24} />
                          ) : (
                            <FileCheck2 size={24} />
                          )}
                        </span>
                        <h3>
                          {run.recommended_status === "ESCALATED"
                            ? "Escaladare propusă"
                            : detail.primary_route === "HUMAN_REVIEW"
                              ? "Caz de clarificat"
                              : "Următorul pas operațional"}
                        </h3>
                        <p>
                          {detail.primary_route === "HUMAN_REVIEW"
                            ? "Cazul rămâne aici până când există suficiente dovezi pentru o rută validă."
                            : "Revizuiește dovezile, regulile și propunerea înainte de aprobare."}
                        </p>
                        {run.proposed_actions
                          .filter((a) => a.status === "PENDING")
                          .map((a) => (
                            <div className="pi-proposal" key={a.id}>
                              <strong>{actionLabels[a.type]}</strong>
                              <p>{a.reason}</p>
                              <button
                                className="button primary full"
                                disabled={busy}
                                onClick={() => approval("APPROVE", [a.id])}
                              >
                                <Check size={14} />
                                {a.type === "ASK_CUSTOMER"
                                  ? "Aprobă și trimite întrebările"
                                  : a.type === "ESCALATE"
                                    ? "Aprobă escaladarea"
                                    : a.type === "SEND_CUSTOMER_UPDATE"
                                      ? "Aprobă și trimite actualizarea"
                                      : "Aprobă pregătirea dosarului"}
                              </button>
                            </div>
                          ))}
                        {run.proposed_actions.some(
                          (a) => a.status === "APPROVED",
                        ) && (
                          <div className="pi-approved-note">
                            <CheckCircle2 size={15} />
                            {detail.status === "ESCALATED"
                              ? "Escaladare aprobată"
                              : "Pas operațional aprobat"}
                          </div>
                        )}
                        {detail.status === "READY_FOR_REVIEW" &&
                          run.proposed_actions.some(
                            (a) => a.status === "APPROVED",
                          ) && (
                            <button
                              className="button primary full"
                              disabled={busy || role !== "B2C_SUPERVISOR"}
                              onClick={() => approval("CLOSE")}
                            >
                              <CheckCircle2 size={14} />
                              Închide incidentul demo
                            </button>
                          )}
                        {detail.status === "ESCALATED" && (
                          <button
                            className="button full"
                            disabled={busy}
                            onClick={() => start()}
                          >
                            <RefreshCw size={14} />
                            Reinvestighează
                          </button>
                        )}
                        {run.proposed_actions.some(
                          (a) => a.status === "PENDING",
                        ) && (
                          <>
                            <label
                              className="field-label"
                              htmlFor="incident-approval-comment"
                            >
                              NOTĂ PENTRU AUDIT
                            </label>
                            <textarea
                              id="incident-approval-comment"
                              aria-label="Notă decizie incident"
                              placeholder="Motivul revizuirii sau respingerii…"
                              value={comment}
                              onChange={(e) => setComment(e.target.value)}
                              maxLength={2000}
                            />
                            <div className="pi-decision-actions">
                              <button
                                className="button"
                                disabled={busy}
                                onClick={() => approval("REVISION")}
                              >
                                <RefreshCw size={12} />
                                Revizuire
                              </button>
                              <button
                                className="button"
                                disabled={busy || comment.trim().length < 5}
                                onClick={() => approval("REJECT")}
                              >
                                <X size={12} />
                                Respinge
                              </button>
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </section>
                <div className="human-note">
                  <ShieldCheck size={18} />
                  <div>
                    <strong>Control comun pentru toate ramurile.</strong>
                    <p>
                      Fără refund, chargeback, transfer invers sau blocare
                      reală. Clientul vede numai comunicări aprobate.
                    </p>
                  </div>
                </div>
                {!detail.active_job_id && detail.status !== "CLOSED_DEMO" && (
                  <section className="panel pi-reassign">
                    <button onClick={() => setShowReassign((x) => !x)}>
                      <UserRound size={16} />
                      Reasignare / Human Review
                      <ChevronDown size={12} />
                    </button>
                    {showReassign && (
                      <div>
                        <label>
                          Investigator
                          <select
                            aria-label="Rută reasignare incident"
                            value={reassignRoute}
                            onChange={(e) =>
                              setReassignRoute(e.target.value as Route)
                            }
                          >
                            {routes.map((r) => (
                              <option value={r} key={r}>
                                {routeLabels[r]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Tranzacție identificată
                          <select
                            aria-label="Tranzacție reasignare incident"
                            value={reassignTx}
                            onChange={(e) => setReassignTx(e.target.value)}
                          >
                            <option value="">
                              Fără tranzacție identificată
                            </option>
                            {catalog
                              .filter(
                                (r) => r.customer_id === detail.customer_id,
                              )
                              .map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.id} · {r.channel} · {money(r.amount_minor)}
                                </option>
                              ))}
                          </select>
                        </label>
                        <label>
                          Motiv
                          <textarea
                            aria-label="Motiv reasignare incident"
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                          />
                        </label>
                        <button
                          className="button primary full"
                          disabled={busy || comment.trim().length < 5}
                          onClick={() =>
                            act(
                              () =>
                                api(`incidents/${detail.id}/reassign`, {
                                  expected_case_version: detail.version,
                                  route: reassignRoute,
                                  transaction_id: reassignTx || undefined,
                                  comment,
                                }),
                              "Reasignarea a fost salvată. Orchestratorul verifică noua rută.",
                            )
                          }
                        >
                          <GitBranch size={13} />
                          Reasignează și investighează
                        </button>
                      </div>
                    )}
                  </section>
                )}
                {detail.artifacts.map((a) => (
                  <section className="panel pi-artifact" key={a.id}>
                    <FileCheck2 size={20} />
                    <h3>Dosar pregătit și aprobat</h3>
                    <p>{a.summary}</p>
                    <button
                      className="button full"
                      onClick={() =>
                        download(detail.reference + "-dosar.json", {
                          data_classification: "SYNTHETIC",
                          incident_reference: detail.reference,
                          artifact: a,
                          facts: detail.runs.find((r) => r.id === a.run_id)
                            ?.known_facts,
                          evidence: detail.evidence.filter((e) =>
                            a.evidence_ids.includes(e.id),
                          ),
                        })
                      }
                    >
                      <Download size={13} />
                      Exportă dosarul JSON
                    </button>
                  </section>
                ))}
              </aside>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="page-heading">
            <div>
              <div className="eyebrow">PAYMENT INCIDENT INTELLIGENCE · B2C</div>
              <h1>
                {isDemo
                  ? "Un demo repetabil. Șaisprezece scenarii."
                  : "Patru investigatori. Un singur fir al dovezilor."}
              </h1>
              <p>
                {isDemo
                  ? "Scenarii sintetice pentru card, manipulare, transferuri, ATM și cazuri ambigue."
                  : "O singură triere coordonează investigația, aprobarea și dialogul cu clientul."}
              </p>
            </div>
            <button
              className="button primary"
              onClick={() => onNavigate("/b2c/incidents/new")}
            >
              <Plus size={15} />
              Incident nou
            </button>
          </div>
          {stats}
          <section className="pi-orchestration">
            <div className="pi-triage-hub">
              <span>
                <Network size={22} />
              </span>
              <div>
                <strong>AI Payment Incident Triage</strong>
                <p>Context → tranzacție → rută validată → investigator</p>
              </div>
              <span className="tag muted">
                {mode.includes("determinist")
                  ? "DEMO DETERMINIST"
                  : "LLM CONFIGURAT"}
              </span>
            </div>
            <div className="pi-agent-grid">
              {routes.map((route) => (
                <button
                  key={route}
                  className={filter === route ? "active" : ""}
                  onClick={() =>
                    setFilter((f) => (f === route ? "ALL" : route))
                  }
                >
                  <span>{icons[route]}</span>
                  <strong>{routeLabels[route]}</strong>
                  <small>{descriptions[route]}</small>
                  <b>
                    {metrics?.by_route[route] ?? 0}
                    <em> incidente rutate</em>
                  </b>
                </button>
              ))}
            </div>
            <div className="pi-shared-gate">
              <ShieldCheck size={14} />
              Human Approval
              <ArrowRight size={13} />
              <Smartphone size={14} />
              Smart Mobile / Chat
              <ArrowRight size={13} />
              <RefreshCw size={13} />
              Reinvestigare
            </div>
          </section>
          {isDemo ? (
            <div className="pi-demo-grid">
              {incidents
                .filter((c) => c.fixture_code)
                .sort((a, b) => a.reference.localeCompare(b.reference))
                .map((c) => (
                  <button
                    className="panel"
                    key={c.id}
                    onClick={() => goCase(c)}
                  >
                    <span className="pi-demo-code">
                      {c.fixture_code}
                      <ArrowUpRight size={16} />
                    </span>
                    <h3>
                      {sourceRecord(c)?.descriptor ?? "Incident de clarificat"}
                    </h3>
                    <p>{c.statement}</p>
                    <footer>
                      <RouteTag route={c.primary_route} />
                      <Status state={c.status} />
                    </footer>
                  </button>
                ))}
            </div>
          ) : (
            <section className="panel pi-inbox">
              <div className="pi-inbox-heading">
                <div>
                  <h2>
                    Incident Command Center{" "}
                    <span className="counter">{incidents.length}</span>
                  </h2>
                  <p>
                    Prioritizează dosarele și urmărește investigatorul,
                    aprobările și răspunsurile.
                  </p>
                </div>
                <span className="live-label">
                  <span />
                  Sincronizat
                </span>
              </div>
              <div className="pi-center-tabs">
                <button
                  className={centerTab === "inbox" ? "active" : ""}
                  onClick={() => setCenterTab("inbox")}
                >
                  Toate incidentele
                </button>
                <button
                  className={centerTab === "approvals" ? "active" : ""}
                  onClick={() => setCenterTab("approvals")}
                >
                  Aprobări în așteptare
                  <span>
                    {
                      incidents.filter((c) =>
                        c.runs
                          .at(-1)
                          ?.proposed_actions.some(
                            (a) => a.status === "PENDING",
                          ),
                      ).length
                    }
                  </span>
                </button>
                <button
                  className={centerTab === "human" ? "active" : ""}
                  onClick={() => setCenterTab("human")}
                >
                  General Human Review<span>{metrics?.human_review ?? 0}</span>
                </button>
              </div>
              <div className="pi-controls">
                <div className="search">
                  <Search size={16} />
                  <input
                    aria-label="Caută incidente"
                    placeholder="Client, referință sau descriere…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div>
                  <select
                    className="select"
                    aria-label="Filtrează investigator"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="ALL">Toți investigatorii</option>
                    <option value="UNCLASSIFIED">Neclasificate</option>
                    {routes.map((r) => (
                      <option key={r} value={r}>
                        {routeLabels[r]}
                      </option>
                    ))}
                  </select>
                  <select
                    className="select"
                    aria-label="Filtrează status incident"
                    value={stateFilter}
                    onChange={(e) => setStateFilter(e.target.value)}
                  >
                    <option value="ALL">Toate stările</option>
                    {Object.entries(stateLabels).map(([value, label]) => (
                      <option value={value} key={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="table-scroll">
                <table className="pi-case-table">
                  <thead>
                    <tr>
                      <th>Incident / client</th>
                      <th>Sesizare</th>
                      <th>Sumă</th>
                      <th>Investigator</th>
                      <th>Stare / prioritate</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {sorted
                      .filter((c) =>
                        centerTab === "approvals"
                          ? c.runs
                              .at(-1)
                              ?.proposed_actions.some(
                                (a) => a.status === "PENDING",
                              )
                          : centerTab === "human"
                            ? c.status === "HUMAN_REVIEW"
                            : true,
                      )
                      .map((c) => (
                        <tr key={c.id} onClick={() => goCase(c)}>
                          <td>
                            <a
                              href={"/b2c/incidents/" + c.id}
                              onClick={(e) => {
                                e.preventDefault();
                                goCase(c);
                              }}
                            >
                              {c.reference}
                            </a>
                            <small>{c.customer_name}</small>
                          </td>
                          <td>
                            <strong>
                              {sourceRecord(c)?.descriptor ??
                                "Tranzacție de clarificat"}
                            </strong>
                            <p>{c.statement}</p>
                          </td>
                          <td>
                            {sourceRecord(c)
                              ? money(sourceRecord(c)!.amount_minor)
                              : "—"}
                          </td>
                          <td>
                            <RouteTag route={c.primary_route} />
                          </td>
                          <td>
                            <Status state={c.status} />
                            <small
                              className={
                                c.priority === "URGENT" ? "pi-urgent" : ""
                              }
                            >
                              {c.priority === "URGENT"
                                ? "Prioritate urgentă"
                                : c.priority === "HIGH"
                                  ? "Prioritate ridicată"
                                  : "Prioritate normală"}
                            </small>
                          </td>
                          <td>
                            <ArrowUpRight size={16} />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {!sorted.length && (
                <div className="pi-empty">
                  <Search size={25} />
                  <h3>Niciun incident pentru filtrele selectate.</h3>
                </div>
              )}
              <footer>
                <span>{sorted.length} incidente afișate</span>
                <span>
                  <ShieldCheck size={12} />
                  Date sintetice · aprobare umană obligatorie
                </span>
              </footer>
            </section>
          )}
          <div className="pi-inbox-footer">
            <span>
              <Network size={14} />
              AI-ul triază. Specialistul investighează. Regulile validează.{" "}
              <b>Angajatul decide.</b>
            </span>
            <div>
              <button
                className="text-button"
                onClick={() =>
                  onNavigate(isDemo ? "/b2c/incidents" : "/b2c/demo")
                }
              >
                {isDemo ? "Înapoi la centru" : "Scenarii demo"}
                <ArrowRight size={12} />
              </button>
              <button
                className="text-button"
                disabled={role !== "B2C_SUPERVISOR" || busy}
                title="Necesită supervizor"
                onClick={() => setReset(true)}
              >
                <RefreshCw size={12} />
                Resetează incidentele demo
              </button>
            </div>
          </div>
        </>
      )}
      {evidence && (
        <EvidenceModal e={evidence} onClose={() => setEvidence(null)} />
      )}
      {reset && (
        <div className="modal-backdrop">
          <section
            className="modal compact"
            role="dialog"
            aria-modal="true"
            aria-label="Resetare incidente demo"
          >
            <RefreshCw size={25} />
            <h2>Pregătește un nou demo</h2>
            <p>
              Cele 16 scenarii revin la starea inițială. Istoricul de audit,
              incidentele create manual și celelalte module sunt păstrate.
            </p>
            <div className="modal-actions">
              <button className="button" onClick={() => setReset(false)}>
                Anulează
              </button>
              <button
                className="button primary"
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    await api("incidents/reset", {});
                    setReset(false);
                  }, "Cele 16 scenarii de incidente au fost resetate.")
                }
              >
                Resetează cele 16 scenarii
              </button>
            </div>
          </section>
        </div>
      )}
      {busy && (
        <div className="busy-indicator">
          <LoaderCircle className="spin" size={14} />
          Operațiune în curs…
        </div>
      )}
    </div>
  );
}
function Metric({
  title,
  value,
  note,
  icon,
}: {
  title: string;
  value: number;
  note: string;
  icon: ReactNode;
}) {
  return (
    <div>
      <span>
        {title}
        {icon}
      </span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
function IncidentAudit({ incident }: { incident: Incident }) {
  return (
    <section className="panel pi-audit">
      <div className="panel-header">
        <div>
          <h2>Aprobări și audit</h2>
          <p>
            Actor, versiune de caz, instrument, dovadă și identificator de
            corelare.
          </p>
        </div>
        <button
          className="text-button"
          onClick={() =>
            download(incident.reference + "-audit.json", incident.audit)
          }
        >
          <Download size={14} />
          Exportă auditul
        </button>
      </div>
      <div>
        {[...incident.audit].reverse().map((e) => (
          <details key={e.event_id}>
            <summary>
              <span>{date(e.timestamp)}</span>
              <strong>{eventLabels[e.event_type] ?? e.event_type}</strong>
              <small>
                {e.actor_type === "SYSTEM"
                  ? "Orchestrator"
                  : e.actor_type === "DEMO_CUSTOMER"
                    ? "Client"
                    : e.actor_type === "B2C_SUPERVISOR"
                      ? "Supervizor"
                      : "Angajat"}
              </small>
              <ChevronDown size={12} />
            </summary>
            <pre>{JSON.stringify(e, null, 2)}</pre>
          </details>
        ))}
      </div>
    </section>
  );
}
