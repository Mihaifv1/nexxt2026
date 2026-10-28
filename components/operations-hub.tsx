"use client";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Activity,
  Banknote,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  FileCheck2,
  FileText,
  GitBranch,
  Layers3,
  LoaderCircle,
  MessageSquare,
  Network,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Signature,
  Smartphone,
  Sparkles,
  TriangleAlert,
  UserRound,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { money, type Role } from "../lib/domain";
import {
  workflows,
  definition,
  familyLabels,
  documentLabels,
  type Definition,
  type Field,
  type Family,
} from "../lib/operations/catalog";
import {
  stateLabels,
  terminal,
  type Case,
  type Document,
  type Task,
  type Value,
  type Product,
} from "../lib/operations/domain";
type Row = {
  id: string;
  reference: string;
  workflow_id: string;
  workflow_name: string;
  customer_id: string;
  customer_name: string;
  state: string;
  priority: string;
  source: string;
  href: string;
  updated_at: string;
  needs_approval: boolean;
  task_count: number;
  completed: boolean;
};
type Client = {
  id: string;
  name: string;
  version: number;
  kyc_status: string;
  products: Product[];
  fields_count: number;
};
type ClientDetail = {
  id: string;
  name: string;
  version: number;
  fields: Record<string, { value: Value; verified: string; source_id: string }>;
  operations: {
    contact: Record<string, Value>;
    kyc_status: string;
    products: Product[];
  };
  cases: Row[];
  workflow_documents: (Document & { case_id: string; reference: string })[];
  audit: Case["audit"];
};
type Detail = Case & { definition: Definition; response_draft?: string };
type Metrics = {
  total: number;
  active: number;
  awaiting_customer: number;
  awaiting_approval: number;
  completed: number;
  escalated: number;
  workflow_reuse: number;
  available_workflows: number;
  runs: number;
  tool_calls: number;
  documents: number;
  signatures: number;
  avg_run_ms: number | null;
  grounding: number | null;
  operations: number;
  payments: number;
};
export const api = async <T,>(path: string, body?: unknown): Promise<T> => {
  const r = await fetch("/api/b2c/" + path, {
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify(body),
        }),
  });
  const result = (await r.json()) as { message?: string };
  if (!r.ok)
    throw new Error(result.message ?? "Operațiunea nu a putut fi finalizată.");
  return result as T;
};
const date = (s: string) =>
  new Intl.DateTimeFormat("ro-RO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(s));
const icons: Record<Family, ReactNode> = {
  IDENTITY: <UserRound size={19} />,
  CONTRACT: <Signature size={19} />,
  CREDIT: <Banknote size={19} />,
  PAYMENT: <ShieldCheck size={19} />,
  SERVICE: <MessageSquare size={19} />,
  SPECIALIST: <Users size={19} />,
};
export function WorkflowState({ state }: { state: string }) {
  return (
    <span className={"ops-state " + state.toLowerCase()}>
      <i />
      {stateLabels[state as keyof typeof stateLabels] ??
        {
          NEW: "Nou",
          HUMAN_REVIEW: "Revizuire umană",
          AWAITING_APPROVAL: "Așteaptă aprobarea",
          CLOSED_DEMO: "Închis demo",
          TRIAGING: "În triere",
          INVESTIGATING: "În investigație",
        }[state] ??
        state}
    </span>
  );
}
export function FormField({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: Value | undefined;
  onChange: (value: Value) => void;
}) {
  const shown =
    field.type === "money" && typeof value === "number"
      ? value / 100
      : (value ?? "");
  return (
    <label className="ops-field">
      <span>{field.label}</span>
      {field.options ? (
        <select
          aria-label={field.label}
          value={String(shown)}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Selectează…</option>
          {field.options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : field.key === "details" ? (
        <textarea
          aria-label={field.label}
          value={String(shown)}
          onChange={(e) => onChange(e.target.value)}
          maxLength={5000}
          rows={4}
        />
      ) : (
        <input
          aria-label={field.label}
          type={
            field.type === "money" || field.type === "number"
              ? "number"
              : field.type === "date"
                ? "date"
                : "text"
          }
          step={field.type === "money" ? "0.01" : undefined}
          value={String(shown)}
          min={
            field.min !== undefined
              ? field.type === "money"
                ? field.min / 100
                : field.min
              : undefined
          }
          max={
            field.max !== undefined
              ? field.type === "money"
                ? field.max / 100
                : field.max
              : undefined
          }
          onChange={(e) =>
            onChange(
              e.target.value === ""
                ? ""
                : field.type === "money"
                  ? Math.round(Number(e.target.value) * 100)
                  : field.type === "number"
                    ? Number(e.target.value)
                    : e.target.value,
            )
          }
        />
      )}
    </label>
  );
}
export function DocumentPreview({
  doc,
  onClose,
  caseId,
}: {
  doc: Document;
  onClose: () => void;
  caseId?: string;
}) {
  return (
    <div className="modal-backdrop ops-preview-backdrop">
      <section
        className="ops-document-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Previzualizare document demonstrativ"
      >
        <header>
          <div>
            <FileText size={20} />
            <span>
              <strong>{doc.name}</strong>
              <small>
                v{doc.version} · {doc.status} · SHA-256 {doc.hash.slice(0, 12)}
              </small>
            </span>
          </div>
          <div>
            {caseId && (
              <a
                className="button"
                href={`/api/b2c/cases/${caseId}/documents/${doc.id}/pdf`}
                target="_blank"
                rel="noreferrer"
              >
                <Download size={14} />
                PDF demo
              </a>
            )}
            <button
              className="icon-button"
              aria-label="Închide documentul"
              onClick={onClose}
            >
              <X size={19} />
            </button>
          </div>
        </header>
        <div className="ops-document-warning">
          <ShieldCheck size={14} />
          DEMO / SYNTHETIC / NOT LEGALLY BINDING
        </div>
        <iframe
          title="Document demonstrativ"
          sandbox=""
          srcDoc={
            doc.direction === "OUTPUT"
              ? doc.content
              : `<pre>${doc.content.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</pre>`
          }
        />
      </section>
    </div>
  );
}
function Stat({
  title,
  value,
  note,
  icon,
}: {
  title: string;
  value: number | string;
  note: string;
  icon: ReactNode;
}) {
  return (
    <article>
      <span>
        {title}
        {icon}
      </span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
function exampleInput(
  def: Definition,
  customer?: Client,
): Record<string, Value> {
  const today = new Date().toISOString().slice(0, 10);
  const defaults: Record<string, Value> = {
    full_name: customer?.name ?? "Alex Client Demo",
    age: 32,
    address: "Strada Exemplu 10, București · DEMO",
    email: "client.demo@example.test",
    tax_residence: "RO",
    amount_minor: 5000000,
    term_months: 60,
    income_minor: 650000,
    obligations_minor: 70000,
    details:
      "Solicitare demonstrativă pentru verificarea datelor și pregătirea dosarului.",
    received_date: today,
    existing_installment_minor: 110000,
    loan_id: "LOAN-DEMO-01",
    merchant: "STREAM-DEMO",
    refund_reference: "REF-DEMO-01",
    fee_reference: "FEE-DEMO-01",
    source_bank: "BANCA SURSĂ DEMO",
    representative: "Reprezentant Sintetic",
    restriction_reference: "RESTRICTION-DEMO-01",
    minor_name: "Minor Sintetic",
    minor_age: 15,
    property_value_minor: 45000000,
    period_from: today.slice(0, 7) + "-01",
    period_to: today,
    contract_id:
      customer?.products.find((p) => p.contract_id)?.contract_id ??
      "CONTRACT-DEMO",
    contract_version:
      customer?.products.find((p) => p.contract_id)?.version ?? 1,
    account_id:
      customer?.products.find((p) => p.kind === "ACCOUNT")?.id ??
      "DEMO-ACCOUNT-NEIDENTIFICAT",
  };
  return Object.fromEntries(
    def.fields.map((f) => [
      f.key,
      defaults[f.key] ?? f.options?.[0] ?? "Exemplu sintetic",
    ]),
  );
}
export default function OperationsHub({
  path,
  role,
  onNavigate,
}: {
  path: string;
  role: Role;
  onNavigate: (p: string) => void;
}) {
  const [clients, setClients] = useState<Client[]>([]),
    [rows, setRows] = useState<Row[]>([]),
    [metrics, setMetrics] = useState<Metrics | null>(null),
    [detail, setDetail] = useState<Detail | null>(null),
    [client, setClient] = useState<ClientDetail | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [search, setSearch] = useState(""),
    [family, setFamily] = useState("ALL"),
    [priority, setPriority] = useState("ALL"),
    [tab, setTab] = useState("analysis"),
    [draft, setDraft] = useState<Record<string, Value>>({}),
    [comment, setComment] = useState(""),
    [message, setMessage] = useState(""),
    [preview, setPreview] = useState<Document | null>(null),
    [docKind, setDocKind] = useState("IDENTITY"),
    [docContent, setDocContent] = useState(""),
    [docName, setDocName] = useState("synthetic.txt"),
    [selectedWorkflow, setSelectedWorkflow] = useState("B2C-01"),
    [selectedClient, setSelectedClient] = useState(""),
    [newName, setNewName] = useState("Alex Client Demo"),
    [scenario, setScenario] = useState<Case["scenario"]>("NORMAL"),
    [newInput, setNewInput] = useState<Record<string, Value>>({}),
    [reuse, setReuse] = useState(false),
    [inputOpen, setInputOpen] = useState(true);
  const [globalAudit, setGlobalAudit] = useState<Case["audit"]>([]);
  const caseId = path.endsWith("/new")
    ? undefined
    : path.match(/^\/b2c\/cases\/([^/]+)$/)?.[1];
  const clientId = path.match(/^\/b2c\/clients\/([^/]+)$/)?.[1];
  const isNew = path.endsWith("/new");
  const isCatalog = path === "/b2c/workflows";
  const isClients = path === "/b2c/clients";
  const isApprovals = path === "/b2c/approvals";
  const isCases = [
    "/b2c/cases",
    "/b2c/contracts",
    "/b2c/credits",
    "/b2c/complaints",
  ].includes(path);
  const isAnalytics = path === "/b2c/operations-analytics";
  const isAudit = path === "/b2c/operations-audit";
  const newDef = definition(selectedWorkflow)!;
  async function refresh() {
    const [c, r, m] = await Promise.all([
      api<Client[]>("clients"),
      api<Row[]>("cases"),
      api<Metrics>("operations/metrics"),
    ]);
    setClients(c);
    setRows(r);
    setMetrics(m);
    if (isAudit) setGlobalAudit(await api<Case["audit"]>("operations/audit"));
    if (caseId) {
      const d = await api<Detail>("cases/" + caseId);
      setDetail(d);
      return d;
    }
    if (clientId) setClient(await api<ClientDetail>("clients/" + clientId));
  }
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await api("operations/bootstrap", {});
        if (!active) return;
        const [c, r, m] = await Promise.all([
          api<Client[]>("clients"),
          api<Row[]>("cases"),
          api<Metrics>("operations/metrics"),
        ]);
        if (!active) return;
        setClients(c);
        setRows(r);
        setMetrics(m);
        if (isAudit)
          setGlobalAudit(await api<Case["audit"]>("operations/audit"));
        setSelectedClient(
          new URLSearchParams(location.search).get("customer") ??
            c[0]?.id ??
            "",
        );
        const requested =
          new URLSearchParams(location.search).get("workflow") ??
          (path.startsWith("/b2c/contracts")
            ? "B2C-02"
            : path.startsWith("/b2c/credits")
              ? "B2C-03"
              : path.startsWith("/b2c/complaints")
                ? "B2C-08"
                : "B2C-01");
        setSelectedWorkflow(requested);
        if (caseId) {
          const d = await api<Detail>("cases/" + caseId);
          if (active) {
            setDetail(d);
            setDraft(d.input);
            setDocKind(d.definition.documents[0] ?? "IDENTITY");
            setMessage(d.response_draft ?? "");
          }
        }
        if (clientId) {
          const p = await api<ClientDetail>("clients/" + clientId);
          if (active) setClient(p);
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
  }, [path, caseId, clientId]);
  useEffect(() => {
    if (loading || isNew) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && !busy)
        refresh().catch(() => {});
    }, 3500);
    return () => clearInterval(timer);
  }, [loading, busy, path]);
  async function act(fn: () => Promise<unknown>, text: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      const d = await refresh();
      if (d) {
        setDraft(d.input);
        if (d.response_draft) setMessage(d.response_draft);
      }
      setNotice(text);
    } catch (e) {
      setError((e as Error).message);
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  const action = (action: string, extra: Record<string, unknown> = {}) =>
    detail &&
    act(
      () =>
        api("cases/" + detail.id + "/actions", {
          action,
          expected_version: detail.version,
          comment,
          ...extra,
        }),
      "Acțiunea a fost salvată în dosar și audit.",
    );
  async function analyze() {
    if (!detail) return;
    await act(async () => {
      let current = detail;
      if (JSON.stringify(draft) !== JSON.stringify(detail.input)) {
        await api("cases/" + detail.id + "/actions", {
          action: "SAVE",
          expected_version: detail.version,
          input: draft,
        });
        current = await api<Detail>("cases/" + detail.id);
      }
      await api("cases/" + detail.id + "/actions", {
        action: "RUN",
        expected_version: current.version,
      });
    }, "Analiza a fost executată și salvată.");
  }
  async function launch(def: Definition, customer?: string) {
    if (def.family === "PAYMENT") {
      await act(async () => {
        await api("incidents/bootstrap", {});
        const all =
          await api<{ id: string; fixture_code: string }[]>("incidents");
        const codes: Record<string, string> = {
          DISPUTE_PILOT: "D01",
          SCAM_RESCUE: "S01",
          ROPAY_RESCUE: "R03",
          ATM_TRACE: "A01",
        };
        const c = all.find((c) => c.fixture_code === codes[def.paymentRoute!]);
        onNavigate(c ? "/b2c/incidents/" + c.id : "/b2c/incidents");
      }, "Investigatorul este pregătit.");
    } else
      onNavigate(
        "/b2c/cases/new?workflow=" +
          def.id +
          (customer ? "&customer=" + customer : ""),
      );
  }
  const filtered = rows.filter(
    (c) =>
      [c.reference, c.customer_name, c.workflow_name]
        .join(" ")
        .toLocaleLowerCase("ro")
        .includes(search.toLocaleLowerCase("ro")) &&
      (priority === "ALL" || c.state === priority) &&
      (path !== "/b2c/contracts" ||
        definition(c.workflow_id)?.family === "CONTRACT") &&
      (path !== "/b2c/credits" ||
        definition(c.workflow_id)?.family === "CREDIT") &&
      (path !== "/b2c/complaints" || c.workflow_id === "B2C-08") &&
      (!isApprovals || c.needs_approval),
  );
  const run = detail?.runs.at(-1),
    output = detail?.documents
      .filter((d) => d.direction === "OUTPUT" && d.status !== "SUPERSEDED")
      .at(-1),
    pending = detail?.tasks.findLast((t) => t.status === "PENDING");
  const stats = (
    <div className="ops-stats">
      <Stat
        title="Cazuri active"
        value={metrics?.active ?? 0}
        note="Workflow-uri și incidente într-un singur hub"
        icon={<Layers3 size={18} />}
      />
      <Stat
        title="De aprobat"
        value={metrics?.awaiting_approval ?? 0}
        note="Decizia rămâne la angajat"
        icon={<ShieldCheck size={18} />}
      />
      <Stat
        title="Așteaptă clientul"
        value={metrics?.awaiting_customer ?? 0}
        note="Clarificări sau semnare simulată"
        icon={<Smartphone size={18} />}
      />
      <Stat
        title="Semnături mock"
        value={metrics?.signatures ?? 0}
        note="Documente versionate · fără efect juridic"
        icon={<Signature size={18} />}
      />
    </div>
  );
  function caseTable(data: Row[]) {
    return (
      <div className="table-scroll">
        <table className="ops-table">
          <thead>
            <tr>
              <th>Caz / client</th>
              <th>Flux operațional</th>
              <th>Stare</th>
              <th>Ultima activitate</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.map((c) => (
              <tr key={c.id} onClick={() => onNavigate(c.href)}>
                <td>
                  <a
                    href={c.href}
                    onClick={(e) => {
                      e.preventDefault();
                      onNavigate(c.href);
                    }}
                  >
                    {c.reference}
                  </a>
                  <small>{c.customer_name}</small>
                </td>
                <td>
                  <strong>{c.workflow_name}</strong>
                  <small>
                    {c.workflow_id} ·{" "}
                    {c.source === "PAYMENT"
                      ? "Investigație plată"
                      : "Workflow v1.0"}
                  </small>
                </td>
                <td>
                  <WorkflowState state={c.state} />
                  {c.priority === "URGENT" && (
                    <small className="ops-urgent">Prioritate urgentă</small>
                  )}
                </td>
                <td>{date(c.updated_at)}</td>
                <td>
                  <ArrowUpRight size={15} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.length && (
          <div className="ops-empty">
            <InboxIcon />
            <h3>Niciun caz pentru această selecție.</h3>
            <p>Pornește un flux din catalog sau creează un caz nou.</p>
          </div>
        )}
      </div>
    );
  }
  function catalogCards(data: Definition[]) {
    return (
      <div className="ops-workflow-grid">
        {data.map((w) => (
          <button
            key={w.id}
            className="panel ops-workflow-card"
            onClick={() => launch(w, clientId)}
          >
            <div>
              <span className={"ops-family-icon " + w.family.toLowerCase()}>
                {icons[w.family]}
              </span>
              <span className={"ops-priority " + w.priority.toLowerCase()}>
                {w.priority}
              </span>
            </div>
            <small>
              {w.id} · {familyLabels[w.family]}
            </small>
            <h3>{w.name}</h3>
            <p>{w.description}</p>
            <footer>
              <span>
                {w.family === "PAYMENT"
                  ? "Investigator specializat"
                  : w.signature
                    ? "Document + semnare mock"
                    : w.specialist
                      ? "Review specializat"
                      : "Dosar + aprobare"}
              </span>
              <ArrowUpRight size={15} />
            </footer>
          </button>
        ))}
      </div>
    );
  }
  if (loading)
    return (
      <div className="ops-empty">
        <LoaderCircle className="spin" size={27} />
        <h3>Se pregătește NEXT B2C…</h3>
      </div>
    );
  return (
    <div className="operations-hub">
      {error && (
        <div className="error-banner" role="alert">
          <TriangleAlert size={17} />
          <span>{error}</span>
          <button
            onClick={() => setError("")}
            aria-label="Închide eroarea workflow"
          >
            <X size={15} />
          </button>
        </div>
      )}
      {notice && (
        <div className="pi-notice" role="status">
          <CheckCircle2 size={16} />
          <span>{notice}</span>
          <button
            onClick={() => setNotice("")}
            aria-label="Închide confirmarea workflow"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {isNew ? (
        <>
          <button
            className="back-link"
            onClick={() => onNavigate("/b2c/workflows")}
          >
            <ArrowLeft size={14} />
            Catalogul de fluxuri
          </button>
          <div className="page-heading">
            <div>
              <div className="eyebrow">NEXT · WORKFLOW INTAKE</div>
              <h1>Un client. Următorul pas potrivit.</h1>
              <p>
                Caz persistent, reguli și documente pe infrastructura comună
                B2C.
              </p>
            </div>
          </div>
          <div className="ops-new-layout">
            <section className="panel ops-form">
              <div className="ops-form-top">
                <label className="ops-field">
                  <span>Flux operațional</span>
                  <select
                    aria-label="Flux operațional nou"
                    value={selectedWorkflow}
                    onChange={(e) => {
                      setSelectedWorkflow(e.target.value);
                      setNewInput({});
                    }}
                  >
                    {workflows.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.id} · {w.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="ops-field">
                  <span>Client</span>
                  <select
                    aria-label="Client workflow nou"
                    value={selectedClient}
                    onChange={(e) => {
                      setSelectedClient(e.target.value);
                      setNewInput({});
                    }}
                  >
                    {newDef.id === "B2C-01" && (
                      <option value="NEW">＋ Client sintetic nou</option>
                    )}
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} · {c.id}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedClient === "NEW" && (
                  <label className="ops-field">
                    <span>Nume client nou</span>
                    <input
                      aria-label="Nume client nou"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      maxLength={100}
                    />
                  </label>
                )}
              </div>
              {newDef.family === "PAYMENT" ? (
                <div className="ops-empty">
                  <ShieldCheck size={30} />
                  <h3>
                    {newDef.name} folosește orchestratorul comun de incidente.
                  </h3>
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={() => launch(newDef)}
                  >
                    Deschide investigatorul
                    <ArrowRight size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="ops-form-heading">
                    <h2>Date inițiale</h2>
                    <button
                      className="text-button"
                      onClick={() =>
                        setNewInput(
                          exampleInput(
                            newDef,
                            clients.find((c) => c.id === selectedClient),
                          ),
                        )
                      }
                    >
                      <Sparkles size={13} />
                      Completează exemplul sintetic
                    </button>
                  </div>
                  <div className="ops-fields-grid">
                    {newDef.fields.map((f) => (
                      <FormField
                        key={f.key}
                        field={f}
                        value={newInput[f.key]}
                        onChange={(v) =>
                          setNewInput((s) => ({ ...s, [f.key]: v }))
                        }
                      />
                    ))}
                  </div>
                  <label className="ops-check">
                    <input
                      type="checkbox"
                      checked={reuse}
                      onChange={(e) => setReuse(e.target.checked)}
                    />
                    Reutilizează datele confirmate și permise din profil pentru
                    acest dosar.
                  </label>
                  <label className="ops-field">
                    <span>Scenariu demonstrativ</span>
                    <select
                      aria-label="Scenariu workflow"
                      value={scenario}
                      onChange={(e) =>
                        setScenario(e.target.value as Case["scenario"])
                      }
                    >
                      <option value="NORMAL">Normal</option>
                      <option value="MISSING">Date / documente lipsă</option>
                      <option value="CONFLICT">
                        Neconcordanță în exemplul documentului
                      </option>
                      <option value="TOOL_ERROR">
                        Adaptor mock indisponibil
                      </option>
                      <option value="EXPIRED">
                        Solicitare client expirată
                      </option>
                      <option value="SPECIALIST">Revizuire specializată</option>
                    </select>
                  </label>
                  <div className="ops-form-footer">
                    <span>
                      <ShieldCheck size={13} />
                      Exclusiv date sintetice.
                    </span>
                    <button
                      className="button primary"
                      disabled={busy || !selectedClient}
                      onClick={() =>
                        act(async () => {
                          const created = await api<{ case_id: string }>(
                            "cases",
                            {
                              workflow_id: selectedWorkflow,
                              ...(selectedClient === "NEW"
                                ? { customer_name: newName }
                                : { customer_id: selectedClient }),
                              input: { ...newInput, reuse_profile: reuse },
                              scenario,
                            },
                          );
                          onNavigate("/b2c/cases/" + created.case_id);
                        }, "Dosarul a fost creat.")
                      }
                    >
                      <Plus size={14} />
                      Creează dosarul
                    </button>
                  </div>
                </>
              )}
            </section>
            <aside className="ops-new-summary">
              <span className="ops-family-icon">{icons[newDef.family]}</span>
              <h2>{newDef.name}</h2>
              <p>{newDef.description}</p>
              <h3>Pe același motor</h3>
              {[
                "Tool-uri și dovezi reale din mock adapters",
                "Reguli deterministe, versionate",
                "Documente și aprobări persistente",
                "Simulator comun pentru client",
                "Istoric și audit păstrate",
              ].map((t) => (
                <p key={t}>
                  <CheckCircle2 size={14} />
                  {t}
                </p>
              ))}
              {newDef.documents.length > 0 && (
                <div className="ops-required">
                  <strong>Documente necesare</strong>
                  {newDef.documents.map((k) => (
                    <span key={k}>
                      <FileText size={12} />
                      {documentLabels[k]}
                    </span>
                  ))}
                </div>
              )}
            </aside>
          </div>
        </>
      ) : detail ? (
        <>
          <button
            className="back-link"
            onClick={() => onNavigate("/b2c/cases")}
          >
            <ArrowLeft size={14} />
            Toate cazurile
          </button>
          <div className="ops-case-heading">
            <div>
              <div className="eyebrow">
                {detail.reference} · {detail.workflow_id}
              </div>
              <h1>{detail.definition.name}</h1>
              <div>
                <button
                  className="text-button"
                  onClick={() =>
                    onNavigate("/b2c/clients/" + detail.customer_id)
                  }
                >
                  <UserRound size={13} />
                  {detail.customer_name}
                </button>
                <WorkflowState state={detail.state} />
                <span>
                  v{detail.version} · profil v{detail.profile_version}
                </span>
              </div>
            </div>
            <button
              className="button"
              onClick={() =>
                onNavigate(
                  `/b2c/customer-demo?customer=${detail.customer_id}&workflow_case=${detail.id}&channel=workflows`,
                )
              }
            >
              <Smartphone size={15} />
              Deschide simulatorul
            </button>
          </div>
          <div className="ops-tabs">
            {[
              ["analysis", "Dosar & agenți"],
              ["documents", "Documente · " + detail.documents.length],
              ["timeline", "Audit · " + detail.audit.length],
            ].map(([k, label]) => (
              <button
                key={k}
                className={tab === k ? "active" : ""}
                onClick={() => setTab(k)}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "timeline" ? (
            <section className="panel ops-audit">
              <div className="panel-header">
                <h2>Auditul dosarului</h2>
                <button
                  className="text-button"
                  onClick={() => {
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(
                      new Blob([JSON.stringify(detail.audit, null, 2)], {
                        type: "application/json",
                      }),
                    );
                    a.download = detail.reference + "-audit.json";
                    a.click();
                    URL.revokeObjectURL(a.href);
                  }}
                >
                  <Download size={13} />
                  Exportă
                </button>
              </div>
              {[...detail.audit].reverse().map((e) => (
                <details key={e.event_id}>
                  <summary>
                    <span>{date(e.timestamp)}</span>
                    <strong>
                      {e.event_type.replace("b2c.", "").replaceAll("_", " ")}
                    </strong>
                    <small>{e.actor_type}</small>
                    <ChevronDown size={12} />
                  </summary>
                  <pre>{JSON.stringify(e, null, 2)}</pre>
                </details>
              ))}
            </section>
          ) : tab === "documents" ? (
            <>
              <div className="ops-document-grid">
                {detail.documents.map((d) => (
                  <button
                    className="panel ops-document-card"
                    key={d.id}
                    onClick={() => setPreview(d)}
                  >
                    <FileText size={24} />
                    <span>
                      {d.direction === "INPUT"
                        ? "DOCUMENT SURSĂ"
                        : "DOCUMENT GENERAT"}{" "}
                      · v{d.version}
                    </span>
                    <h3>{d.name}</h3>
                    <WorkflowState state={d.status} />
                    <small>
                      {date(d.created_at)} · SHA-256 {d.hash.slice(0, 12)}
                    </small>
                    <footer>
                      Previzualizare
                      <ArrowUpRight size={14} />
                    </footer>
                  </button>
                ))}
              </div>
              {detail.documents.filter(
                (d) => d.direction === "OUTPUT" && d.kind !== "OFFER",
              ).length > 1 && (
                <section className="panel ops-version-diff">
                  <div className="panel-header">
                    <h2>Comparație între ultimele versiuni</h2>
                    <GitBranch size={17} />
                  </div>
                  {(() => {
                    const docs = detail.documents.filter(
                      (d) => d.direction === "OUTPUT" && d.kind !== "OFFER",
                    );
                    const before = docs.at(-2)!,
                      after = docs.at(-1)!;
                    return (
                      <table className="ops-table">
                        <thead>
                          <tr>
                            <th>Câmp</th>
                            <th>v{before.version}</th>
                            <th>v{after.version}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            ...new Set([
                              ...Object.keys(before.input_snapshot),
                              ...Object.keys(after.input_snapshot),
                            ]),
                          ].map((key) => (
                            <tr
                              className={
                                before.input_snapshot[key] !==
                                after.input_snapshot[key]
                                  ? "changed"
                                  : ""
                              }
                              key={key}
                            >
                              <td>
                                {detail.definition.fields.find(
                                  (f) => f.key === key,
                                )?.label ?? key}
                              </td>
                              <td>
                                {String(before.input_snapshot[key] ?? "—")}
                              </td>
                              <td>
                                {String(after.input_snapshot[key] ?? "—")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </section>
              )}
            </>
          ) : (
            <div className="ops-workspace">
              <aside className="ops-context">
                <section className="panel">
                  <div className="panel-header">
                    <h2>Context</h2>
                    <UserRound size={16} />
                  </div>
                  <dl>
                    <div>
                      <dt>Client canonic</dt>
                      <dd>{detail.customer_id}</dd>
                    </div>
                    <div>
                      <dt>Familie</dt>
                      <dd>{familyLabels[detail.definition.family]}</dd>
                    </div>
                    <div>
                      <dt>Scenariu</dt>
                      <dd>{detail.scenario}</dd>
                    </div>
                    <div>
                      <dt>Workflow / reguli</dt>
                      <dd>v1.0 · NEXT-DEMO-v1</dd>
                    </div>
                  </dl>
                  <button
                    className="text-button"
                    onClick={() =>
                      onNavigate("/b2c/clients/" + detail.customer_id)
                    }
                  >
                    Customer 360
                    <ArrowUpRight size={12} />
                  </button>
                </section>
                <section className="panel ops-evidence">
                  <div className="panel-header">
                    <h2>Evidence Vault</h2>
                    <span className="counter">{detail.evidence.length}</span>
                  </div>
                  {detail.evidence.slice(-12).map((e) => (
                    <details key={e.id}>
                      <summary>
                        <FileCheck2 size={13} />
                        <span>
                          {e.source.replaceAll("_", " ")}
                          <small>
                            {e.kind} · {date(e.timestamp)}
                          </small>
                        </span>
                        <ChevronDown size={10} />
                      </summary>
                      <p>{e.summary}</p>
                      <pre>{JSON.stringify(e.payload, null, 2)}</pre>
                    </details>
                  ))}
                  {!detail.evidence.length && (
                    <p>Instrumentele vor colecta dovezile la prima analiză.</p>
                  )}
                </section>
              </aside>
              <div className="ops-main-column">
                <section className="panel ops-input">
                  <button
                    className="ops-panel-toggle"
                    onClick={() => setInputOpen((x) => !x)}
                  >
                    <h2>Datele dosarului</h2>
                    <span>
                      {detail.definition.fields.length} câmpuri
                      <ChevronDown size={14} />
                    </span>
                  </button>
                  {inputOpen && (
                    <div>
                      <div className="ops-input-actions">
                        <button
                          className="text-button"
                          disabled={terminal.includes(detail.state)}
                          onClick={() =>
                            setDraft(
                              exampleInput(
                                detail.definition,
                                clients.find(
                                  (c) => c.id === detail.customer_id,
                                ),
                              ),
                            )
                          }
                        >
                          <Sparkles size={12} />
                          Exemplu sintetic
                        </button>
                        <small>
                          Modificările invalidează aprobările și solicitările
                          curente.
                        </small>
                      </div>
                      <div className="ops-fields-grid">
                        {detail.definition.fields.map((f) => (
                          <FormField
                            key={f.key}
                            field={f}
                            value={draft[f.key]}
                            onChange={(v) =>
                              setDraft((s) => ({ ...s, [f.key]: v }))
                            }
                          />
                        ))}
                      </div>
                      <button
                        className="button"
                        disabled={busy || terminal.includes(detail.state)}
                        onClick={() => action("SAVE", { input: draft })}
                      >
                        Salvează modificările
                      </button>
                    </div>
                  )}
                </section>
                {detail.definition.documents.length > 0 &&
                  !terminal.includes(detail.state) && (
                    <section className="panel ops-upload">
                      <div className="panel-header">
                        <div>
                          <h2>Documente sursă sintetice</h2>
                          <p>
                            TXT structurat · fără documente personale reale.
                          </p>
                        </div>
                        <FileText size={17} />
                      </div>
                      <div>
                        <div className="ops-upload-controls">
                          <select
                            aria-label="Tip document workflow"
                            value={docKind}
                            onChange={(e) => {
                              setDocKind(e.target.value);
                              setDocContent("");
                            }}
                          >
                            {detail.definition.documents.map((k) => (
                              <option value={k} key={k}>
                                {documentLabels[k]}
                              </option>
                            ))}
                          </select>
                          <button
                            className="button"
                            disabled={busy}
                            onClick={() =>
                              act(async () => {
                                const s = await api<{
                                  name: string;
                                  content: string;
                                }>(`cases/${detail.id}/sample?kind=${docKind}`);
                                setDocName(s.name);
                                setDocContent(s.content);
                              }, "Exemplul sintetic este pregătit pentru revizuire.")
                            }
                          >
                            <Sparkles size={13} />
                            Exemplu sintetic
                          </button>
                        </div>
                        <textarea
                          aria-label="Conținut document workflow"
                          placeholder="Încarcă un TXT demonstrativ sau folosește exemplul sintetic…"
                          value={docContent}
                          onChange={(e) => setDocContent(e.target.value)}
                          maxLength={15000}
                        />
                        <footer>
                          <input
                            aria-label="Încarcă TXT workflow"
                            type="file"
                            accept=".txt,text/plain"
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              if (f) {
                                if (f.size > 15000) {
                                  setError("Documentul depășește 15 KB.");
                                  return;
                                }
                                setDocName(f.name);
                                setDocContent(await f.text());
                              }
                            }}
                          />
                          <button
                            className="button primary"
                            disabled={busy || !docContent.trim()}
                            onClick={() =>
                              action("ADD_DOCUMENT", {
                                document: {
                                  kind: docKind,
                                  name: docName,
                                  content: docContent,
                                },
                              })
                            }
                          >
                            <Plus size={13} />
                            Adaugă documentul
                          </button>
                        </footer>
                        <div className="ops-submitted-docs">
                          {detail.definition.documents.map((k) => {
                            const d = detail.documents
                              .filter(
                                (d) => d.direction === "INPUT" && d.kind === k,
                              )
                              .at(-1);
                            return (
                              <span key={k} className={d ? "ready" : "missing"}>
                                {d ? (
                                  <CheckCircle2 size={12} />
                                ) : (
                                  <TriangleAlert size={12} />
                                )}{" "}
                                {documentLabels[k]}
                                {d ? " · v" + d.version : " · lipsește"}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </section>
                  )}
                <section className="panel ops-agent-panel">
                  <div className="panel-header">
                    <div>
                      <span className="spark-icon">
                        <Network size={18} />
                      </span>
                      <h2>Workflow Orchestrator</h2>
                    </div>
                    <span className="tag muted">
                      {run?.provider ?? "Demo determinist"}
                    </span>
                  </div>
                  {!run ? (
                    <div className="ops-agent-empty">
                      <Network size={35} />
                      <h3>Un singur motor. Un dosar complet.</h3>
                      <p>
                        Intake, Evidence, Policy, Document și Quality lucrează
                        pe același context verificabil.
                      </p>
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={analyze}
                      >
                        <Sparkles size={14} />
                        Rulează agenții
                      </button>
                    </div>
                  ) : (
                    <>
                      <div
                        className={
                          "ops-run-summary " +
                          (run.status === "FAILED" ? "failed" : "")
                        }
                      >
                        <span>
                          {run.status === "FAILED" ? (
                            <TriangleAlert size={17} />
                          ) : (
                            <CheckCircle2 size={17} />
                          )}
                        </span>
                        <div>
                          <strong>{run.summary}</strong>
                          <small>
                            Runda {detail.runs.length} ·{" "}
                            {(run.duration_ms / 1000).toFixed(2)} s ·{" "}
                            {run.calls.length} apeluri executate
                          </small>
                        </div>
                      </div>
                      <div className="ops-tool-list">
                        {run.calls.map((call) => (
                          <div key={call.id}>
                            <span className={call.status.toLowerCase()}>
                              {call.status === "FAILED" ? (
                                <X size={12} />
                              ) : (
                                <Check size={12} />
                              )}
                            </span>
                            <div>
                              <strong>{call.tool.replaceAll("_", " ")}</strong>
                              <small>{call.agent}</small>
                            </div>
                            <small>{call.duration_ms} ms</small>
                          </div>
                        ))}
                      </div>
                      {run.error && (
                        <div className="ops-block">
                          <TriangleAlert size={16} />
                          <p>{run.error}</p>
                        </div>
                      )}
                      {run.missing.length > 0 && (
                        <div className="ops-block">
                          <TriangleAlert size={16} />
                          <div>
                            <strong>Informații necesare</strong>
                            <ul>
                              {run.missing.map((k) => (
                                <li key={k}>
                                  {k.startsWith("doc:")
                                    ? documentLabels[k.slice(4)]
                                    : (detail.definition.fields.find(
                                        (f) => f.key === k,
                                      )?.label ?? "Onboarding / KYC verificat")}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                      {run.contradictions.length > 0 && (
                        <div className="ops-block danger">
                          <TriangleAlert size={16} />
                          <div>
                            <strong>Neconcordanțe de clarificat</strong>
                            {run.contradictions.map((s, i) => (
                              <p key={i}>{s}</p>
                            ))}
                          </div>
                        </div>
                      )}
                      {run.illustration && (
                        <div className="ops-illustration">
                          <div>
                            <span>RATĂ ILUSTRATIVĂ</span>
                            <strong>
                              {money(run.illustration.installment_minor)}
                            </strong>
                            <small>
                              {run.illustration.months} luni · 8% nominal / an,
                              exemplificativ
                            </small>
                          </div>
                          <div>
                            <span>RAPORT OBLIGAȚII / VENIT</span>
                            <strong>
                              {(run.illustration.ratio * 100).toFixed(1)}%
                            </strong>
                            <small>
                              Prag demo: 40% · review uman obligatoriu
                            </small>
                          </div>
                          {run.illustration.saving_minor !== undefined && (
                            <p>
                              Diferență ilustrativă față de rata declarată:{" "}
                              {money(run.illustration.saving_minor)} / lună.
                            </p>
                          )}
                          <footer>
                            Nu este DAE, ofertă sau decizie de credit. Fără
                            tragere de fonduri.
                          </footer>
                        </div>
                      )}
                      <details className="ops-facts">
                        <summary>
                          <FileCheck2 size={14} />
                          Fapte și referințe · {run.facts.length}
                          <ChevronDown size={12} />
                        </summary>
                        {run.facts.map((f, i) => (
                          <p key={i}>
                            {f.text}
                            <small>{f.evidence_ids.join(" · ")}</small>
                          </p>
                        ))}
                      </details>
                      <div className="ops-rule-list">
                        <h3>Reguli deterministe</h3>
                        {run.rules.map((r, i) => (
                          <details key={r.id + i}>
                            <summary>
                              <span className={r.status.toLowerCase()}>
                                {r.status === "PASS" ? (
                                  <CheckCircle2 size={12} />
                                ) : (
                                  <TriangleAlert size={12} />
                                )}
                              </span>
                              <code>{r.id}</code>
                              <b>{r.status}</b>
                              <ChevronDown size={11} />
                            </summary>
                            <p>{r.detail}</p>
                          </details>
                        ))}
                      </div>
                    </>
                  )}
                </section>
                {detail.workflow_id === "B2C-08" &&
                  output &&
                  ["READY_FOR_REVIEW", "INTERNAL_REVIEW"].includes(
                    detail.state,
                  ) && (
                    <section className="panel ops-response">
                      <div className="panel-header">
                        <h2>Draft răspuns către client</h2>
                        <MessageSquare size={16} />
                      </div>
                      <textarea
                        aria-label="Draft răspuns reclamație"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        maxLength={5000}
                      />
                      <p>
                        Textul editat este versionat și livrat numai la
                        aprobare.
                      </p>
                    </section>
                  )}
              </div>
              <aside className="ops-actions">
                <section className="panel">
                  <div className="panel-header">
                    <h2>Human Approval</h2>
                    <ShieldCheck size={18} />
                  </div>
                  <div className="ops-action-body">
                    {terminal.includes(detail.state) ? (
                      <>
                        <span className="ops-success-icon">
                          <CheckCircle2 size={27} />
                        </span>
                        <h3>Flux finalizat demonstrativ</h3>
                        <p>
                          Deciziile, documentele și evenimentele sunt salvate.
                        </p>
                        <button
                          className="button full"
                          onClick={() =>
                            onNavigate("/b2c/clients/" + detail.customer_id)
                          }
                        >
                          Deschide Customer 360
                          <ArrowRight size={13} />
                        </button>
                      </>
                    ) : detail.state === "AWAITING_CUSTOMER" ||
                      detail.state === "AWAITING_SIGNATURE" ? (
                      <>
                        <Smartphone size={28} />
                        <h3>
                          {detail.state === "AWAITING_SIGNATURE"
                            ? "Documentul așteaptă semnarea mock."
                            : "Așteptăm informațiile clientului."}
                        </h3>
                        <p>{pending?.message}</p>
                        <button
                          className="button primary full"
                          onClick={() =>
                            onNavigate(
                              `/b2c/customer-demo?customer=${detail.customer_id}&workflow_case=${detail.id}&channel=workflows`,
                            )
                          }
                        >
                          Deschide Smart Mobile
                          <ArrowUpRight size={13} />
                        </button>
                        <button
                          className="button full"
                          disabled={busy}
                          onClick={() => action("REVISE")}
                        >
                          Revizuiește dosarul
                        </button>
                      </>
                    ) : detail.state === "NEEDS_CLARIFICATION" ? (
                      <>
                        <TriangleAlert size={28} />
                        <h3>Clarificări înainte de continuare</h3>
                        <p>
                          Doar câmpurile și documentele lipsă sunt solicitate.
                        </p>
                        {run?.missing.includes("identity_verified") && (
                          <button
                            className="button full"
                            onClick={() =>
                              launch(definition("B2C-01")!, detail.customer_id)
                            }
                          >
                            Pornește onboarding / KYC
                            <ArrowRight size={13} />
                          </button>
                        )}
                        {run?.missing.some(
                          (k) => k !== "identity_verified",
                        ) && (
                          <button
                            className="button primary full"
                            disabled={busy}
                            onClick={() => action("REQUEST_INFO")}
                          >
                            Aprobă solicitarea către client
                            <Send size={13} />
                          </button>
                        )}
                        <button
                          className="button full"
                          disabled={busy}
                          onClick={analyze}
                        >
                          <RefreshCw size={13} />
                          Reanalizează dosarul
                        </button>
                      </>
                    ) : ["READY_FOR_REVIEW", "INTERNAL_REVIEW"].includes(
                        detail.state,
                      ) ? (
                      <>
                        <FileCheck2 size={28} />
                        <h3>
                          {detail.definition.signature
                            ? "Document pregătit pentru aprobare"
                            : "Dosar pregătit pentru review"}
                        </h3>
                        <p>
                          {detail.definition.family === "CREDIT"
                            ? "Continuarea simulării necesită supervizor. Nu se acordă un credit real."
                            : "Verifică dovezile, regulile și documentul înainte de continuare."}
                        </p>
                        {output && (
                          <button
                            className="button full"
                            onClick={() => setPreview(output)}
                          >
                            <FileText size={13} />
                            Previzualizează documentul
                          </button>
                        )}
                        <button
                          className="button primary full"
                          disabled={
                            busy ||
                            (["CREDIT", "SPECIALIST"].includes(
                              detail.definition.family,
                            ) &&
                              role !== "B2C_SUPERVISOR")
                          }
                          onClick={() =>
                            action(
                              "APPROVE",
                              detail.workflow_id === "B2C-08"
                                ? { message }
                                : {},
                            )
                          }
                        >
                          <Check size={13} />
                          {detail.definition.signature
                            ? "Aprobă și trimite la semnare mock"
                            : detail.workflow_id === "B2C-08"
                              ? "Aprobă și livrează răspunsul"
                              : "Aprobă finalizarea demo"}
                        </button>
                        <label className="ops-field">
                          <span>Notă decizie</span>
                          <textarea
                            aria-label="Notă decizie workflow"
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="Motivul respingerii sau revizuirii…"
                          />
                        </label>
                        <div className="ops-dual-actions">
                          <button
                            className="button"
                            disabled={busy}
                            onClick={() => action("REVISE")}
                          >
                            Revizuire
                          </button>
                          <button
                            className="button"
                            disabled={busy || comment.trim().length < 5}
                            onClick={() => action("REJECT")}
                          >
                            Respinge
                          </button>
                        </div>
                      </>
                    ) : detail.state === "ESCALATED" ? (
                      <>
                        <Users size={28} />
                        <h3>Review specializat necesar</h3>
                        <p>
                          Agentul nu înlocuiește verificarea umană, juridică sau
                          de credit.
                        </p>
                        <label className="ops-field">
                          <span>Concluzia verificării demo</span>
                          <textarea
                            aria-label="Notă specialist workflow"
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                          />
                        </label>
                        <button
                          className="button primary full"
                          disabled={
                            busy ||
                            role !== "B2C_SUPERVISOR" ||
                            comment.trim().length < 8 ||
                            run?.status === "FAILED"
                          }
                          onClick={() => action("SPECIALIST_REVIEW")}
                        >
                          Consemnează review și reanalizează
                        </button>
                        <button
                          className="button full"
                          disabled={busy}
                          onClick={() => action("REVISE")}
                        >
                          Revizuiește datele
                        </button>
                      </>
                    ) : (
                      <>
                        <Network size={29} />
                        <h3>Pregătit pentru analiză</h3>
                        <p>
                          Completează datele și documentele sau lasă agenții să
                          identifice lipsurile.
                        </p>
                        <button
                          className="button primary full"
                          disabled={busy}
                          onClick={analyze}
                        >
                          <Sparkles size={14} />
                          Rulează agenții
                        </button>
                      </>
                    )}
                    {output && (
                      <div className="ops-approved-document">
                        <FileText size={15} />
                        <div>
                          <strong>{output.name}</strong>
                          <small>
                            v{output.version} · {output.status}
                          </small>
                        </div>
                        <button
                          aria-label="Deschide documentul curent"
                          onClick={() => setPreview(output)}
                        >
                          <ArrowUpRight size={15} />
                        </button>
                      </div>
                    )}
                  </div>
                </section>
                <div className="human-note">
                  <ShieldCheck size={18} />
                  <div>
                    <strong>Decizie umană, efect demonstrativ.</strong>
                    <p>
                      Fără plăți, scoring real sau semnătură cu efect juridic.
                    </p>
                  </div>
                </div>
                {role === "B2C_SUPERVISOR" && (
                  <button
                    className="text-button ops-reset"
                    disabled={busy}
                    onClick={() => action("RESET")}
                  >
                    <RefreshCw size={12} />
                    Resetează acest dosar demo
                  </button>
                )}
              </aside>
            </div>
          )}
        </>
      ) : client ? (
        <>
          <button
            className="back-link"
            onClick={() => onNavigate("/b2c/clients")}
          >
            <ArrowLeft size={14} />
            Clienți
          </button>
          <div className="ops-client-heading">
            <div className="ops-client-avatar">
              {client.name
                .split(" ")
                .slice(0, 2)
                .map((s) => s[0])
                .join("")}
            </div>
            <div>
              <div className="eyebrow">CUSTOMER 360 · {client.id}</div>
              <h1>{client.name}</h1>
              <p>
                Un profil canonic · v{client.version} ·{" "}
                <b>
                  {client.operations.kyc_status === "VERIFIED_DEMO"
                    ? "KYC verificat demonstrativ"
                    : "KYC de verificat"}
                </b>
              </p>
            </div>
            <button
              className="button primary"
              onClick={() => onNavigate("/b2c/cases/new?customer=" + client.id)}
            >
              <Plus size={14} />
              Flux nou
            </button>
          </div>
          <div className="ops-client-grid">
            <section className="panel">
              <div className="panel-header">
                <h2>Profil și proveniență</h2>
                <FingerprintIcon />
              </div>
              <dl className="ops-profile-values">
                {Object.entries({
                  ...Object.fromEntries(
                    Object.entries(client.fields).map(([k, f]) => [
                      k,
                      {
                        value: f.value,
                        source: f.source_id,
                        verified: f.verified,
                      },
                    ]),
                  ),
                  ...Object.fromEntries(
                    Object.entries(client.operations.contact).map(
                      ([k, value]) => [
                        k,
                        {
                          value,
                          source: "Workflow aprobat",
                          verified: "HUMAN_APPROVED",
                        },
                      ],
                    ),
                  ),
                }).map(([k, v]) => (
                  <div key={k}>
                    <dt>
                      {workflows
                        .flatMap((w) => w.fields)
                        .find((f) => f.key === k)?.label ??
                        k.replaceAll("_", " ")}
                    </dt>
                    <dd>
                      {String(v.value)}
                      <small>
                        {v.verified} · {v.source}
                      </small>
                    </dd>
                  </div>
                ))}
              </dl>
              <button
                className="text-button"
                onClick={() => onNavigate("/b2c/intake?customer=" + client.id)}
              >
                Profil, documente și acorduri OneFront Door
                <ArrowUpRight size={12} />
              </button>
            </section>
            <section className="panel">
              <div className="panel-header">
                <h2>Produse demonstrative</h2>
                <Wallet size={17} />
              </div>
              <div className="ops-products">
                {client.operations.products.map((p) => (
                  <article key={p.id}>
                    <span>
                      {p.kind.includes("LOAN") || p.kind === "MORTGAGE" ? (
                        <Banknote size={20} />
                      ) : (
                        <Wallet size={20} />
                      )}
                    </span>
                    <div>
                      <h3>{p.name}</h3>
                      <p>{p.id}</p>
                      <small>
                        {p.status} · v{p.version}
                      </small>
                      {p.amount_minor !== undefined && (
                        <strong>{money(p.amount_minor)}</strong>
                      )}
                    </div>
                    <button
                      className="icon-button"
                      aria-label={"Deschide dosarul " + p.name}
                      onClick={() =>
                        onNavigate("/b2c/cases/" + p.source_case_id)
                      }
                    >
                      <ArrowUpRight size={15} />
                    </button>
                  </article>
                ))}
                {!client.operations.products.length && (
                  <div className="ops-empty">
                    <Wallet size={25} />
                    <p>Produsele apar după aprobarea și semnarea mock.</p>
                  </div>
                )}
              </div>
            </section>
          </div>
          <section className="panel ops-client-cases">
            <div className="panel-header">
              <h2>Cazuri și taskuri legate de client</h2>
              <Layers3 size={17} />
            </div>
            {caseTable(client.cases)}
          </section>
          <section className="panel ops-client-documents">
            <div className="panel-header">
              <h2>Documente din toate fluxurile</h2>
              <FileText size={17} />
            </div>
            {client.workflow_documents.length ? (
              <div className="ops-document-grid">
                {client.workflow_documents.map((d) => (
                  <button
                    className="ops-mini-doc"
                    key={d.id}
                    onClick={() => setPreview(d)}
                  >
                    <FileText size={18} />
                    <span>
                      <strong>{d.name}</strong>
                      <small>
                        {d.reference} · v{d.version} · {d.status}
                      </small>
                    </span>
                    <ArrowUpRight size={14} />
                  </button>
                ))}
              </div>
            ) : (
              <p className="ops-muted-pad">Niciun document operațional încă.</p>
            )}
          </section>
        </>
      ) : isClients ? (
        <>
          <div className="page-heading">
            <div>
              <div className="eyebrow">NEXT · CUSTOMER 360</div>
              <h1>Relația cu clientul, într-un singur loc.</h1>
              <p>
                Profilul canonic leagă documentele, produsele, cazurile și
                interacțiunile.
              </p>
            </div>
            <button
              className="button primary"
              onClick={() => onNavigate("/b2c/onboarding/new")}
            >
              <Plus size={14} />
              Onboarding nou
            </button>
          </div>
          <div className="ops-search-bar">
            <Search size={16} />
            <input
              aria-label="Caută clienți 360"
              placeholder="Nume sau identificator…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="ops-client-list">
            {clients
              .filter((c) =>
                [c.name, c.id]
                  .join(" ")
                  .toLocaleLowerCase("ro")
                  .includes(search.toLocaleLowerCase("ro")),
              )
              .map((c) => (
                <button
                  className="panel"
                  key={c.id}
                  onClick={() => onNavigate("/b2c/clients/" + c.id)}
                >
                  <span className="ops-client-avatar small">
                    {c.name
                      .split(" ")
                      .slice(0, 2)
                      .map((s) => s[0])
                      .join("")}
                  </span>
                  <div>
                    <h3>{c.name}</h3>
                    <p>{c.id}</p>
                    <small>
                      {c.kyc_status === "VERIFIED_DEMO"
                        ? "KYC verificat demo"
                        : "KYC de verificat"}{" "}
                      ·{" "}
                      {
                        c.products.filter((p) => p.status === "ACTIVE_DEMO")
                          .length
                      }{" "}
                      produse active
                    </small>
                  </div>
                  <ArrowUpRight size={17} />
                </button>
              ))}
          </div>
        </>
      ) : isAudit ? (
        <>
          <div className="page-heading">
            <div>
              <div className="eyebrow">NEXT · SHARED AUDIT TRAIL</div>
              <h1>Decizii, documente și dovezi. Același istoric.</h1>
              <p>
                Audit persistent pentru workflow-uri, incidente și profilul
                canonic.
              </p>
            </div>
          </div>
          <div className="ops-search-bar">
            <Search size={15} />
            <input
              aria-label="Caută în auditul comun"
              placeholder="Eveniment, caz sau actor…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <section className="panel ops-audit">
            {globalAudit
              .filter((e) =>
                [e.case_id, e.event_type, e.actor_id]
                  .join(" ")
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((e) => (
                <details key={e.event_id}>
                  <summary>
                    <span>{date(e.timestamp)}</span>
                    <strong>
                      {e.event_type.replace("b2c.", "").replaceAll("_", " ")}
                    </strong>
                    <small>{e.actor_type}</small>
                    <ChevronDown size={12} />
                  </summary>
                  <pre>{JSON.stringify(e, null, 2)}</pre>
                  {rows.find((c) => c.id === e.case_id) && (
                    <button
                      className="text-button"
                      onClick={() =>
                        onNavigate(rows.find((c) => c.id === e.case_id)!.href)
                      }
                    >
                      Deschide dosarul
                      <ArrowUpRight size={12} />
                    </button>
                  )}
                </details>
              ))}
          </section>
        </>
      ) : isCatalog ? (
        <>
          <div className="page-heading">
            <div>
              <div className="eyebrow">NEXT · WORKFLOW CATALOG</div>
              <h1>29 de fluxuri. Aceeași infrastructură.</h1>
              <p>Acquire & Contract · Borrow & Manage · Protect & Resolve.</p>
            </div>
            <span className="tag">
              <Network size={13} />
              WORKFLOW ENGINE v1.0
            </span>
          </div>
          <div className="ops-catalog-filters">
            <div className="search">
              <Search size={15} />
              <input
                aria-label="Caută fluxuri"
                placeholder="Onboarding, credit, contract…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="select"
              aria-label="Familie flux"
              value={family}
              onChange={(e) => setFamily(e.target.value)}
            >
              <option value="ALL">Toate familiile</option>
              {Object.entries(familyLabels).map(([k, l]) => (
                <option value={k} key={k}>
                  {l}
                </option>
              ))}
            </select>
            <select
              className="select"
              aria-label="Prioritate flux"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option value="ALL">P0 + P1 + P2</option>
              <option>P0</option>
              <option>P1</option>
              <option>P2</option>
            </select>
          </div>
          {catalogCards(
            workflows.filter(
              (w) =>
                (family === "ALL" || family === w.family) &&
                (priority === "ALL" || priority === w.priority) &&
                [w.id, w.name, w.description]
                  .join(" ")
                  .toLocaleLowerCase("ro")
                  .includes(search.toLocaleLowerCase("ro")),
            ),
          )}
          <div className="ops-catalog-note">
            <ShieldCheck size={17} />
            <p>
              Toate fluxurile folosesc date și reguli demonstrative. Situațiile
              juridice și sensibile sunt organizate pentru review specializat;
              AI nu stabilește validitatea juridică.
            </p>
          </div>
        </>
      ) : isCases || isApprovals ? (
        <>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                NEXT · {isApprovals ? "HUMAN APPROVAL" : "CASE MANAGEMENT"}
              </div>
              <h1>
                {isApprovals
                  ? "Deciziile care au nevoie de tine."
                  : path === "/b2c/contracts"
                    ? "Contracte & produse."
                    : path === "/b2c/credits"
                      ? "Credite & administrare."
                      : path === "/b2c/complaints"
                        ? "Reclamații & sesizări."
                        : "Fiecare caz, următorul pas clar."}
              </h1>
              <p>
                Workflow-uri și incidente legate de aceeași identitate de
                client.
              </p>
            </div>
            <button
              className="button primary"
              onClick={() =>
                onNavigate(
                  "/b2c/cases/new" +
                    (path === "/b2c/complaints"
                      ? "?workflow=B2C-08"
                      : path === "/b2c/contracts"
                        ? "?workflow=B2C-02"
                        : path === "/b2c/credits"
                          ? "?workflow=B2C-03"
                          : ""),
                )
              }
            >
              <Plus size={14} />
              Caz nou
            </button>
          </div>
          {stats}
          <section className="panel">
            <div className="ops-case-controls">
              <div className="search">
                <Search size={15} />
                <input
                  aria-label="Caută cazuri hub"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Referință, client sau flux…"
                />
              </div>
              <select
                className="select"
                aria-label="Stare caz hub"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                <option value="ALL">Toate stările</option>
                {Object.entries(stateLabels).map(([k, l]) => (
                  <option value={k} key={k}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            {caseTable(filtered)}
          </section>
        </>
      ) : isAnalytics ? (
        <>
          <div className="page-heading">
            <div>
              <div className="eyebrow">NEXT · OPERATIONS ANALYTICS</div>
              <h1>Activitate măsurată în aplicație.</h1>
              <p>
                Doar date sintetice și evenimente persistate; fără estimări de
                business prezentate ca rezultate.
              </p>
            </div>
          </div>
          {stats}
          <div className="ops-analytics">
            <section className="panel">
              <div className="panel-header">
                <h2>Motorul comun</h2>
                <Network size={17} />
              </div>
              {[
                ["Fluxuri operaționale pornite", metrics?.workflow_reuse ?? 0],
                ["Cazuri de workflow", metrics?.operations ?? 0],
                ["Incidente de plată", metrics?.payments ?? 0],
                ["Rulări de agenți", metrics?.runs ?? 0],
                ["Apeluri de instrumente", metrics?.tool_calls ?? 0],
                ["Documente / versiuni", metrics?.documents ?? 0],
                [
                  "Timp mediu de analiză",
                  metrics?.avg_run_ms == null
                    ? "—"
                    : metrics.avg_run_ms + " ms",
                ],
                [
                  "Fapte cu dovezi",
                  metrics?.grounding == null ? "—" : metrics.grounding + "%",
                ],
              ].map(([l, v]) => (
                <div className="ops-metric-row" key={l}>
                  <span>{l}</span>
                  <strong>{v}</strong>
                </div>
              ))}
            </section>
            <section className="panel">
              <div className="panel-header">
                <h2>Distribuție pe familii</h2>
                <Layers3 size={17} />
              </div>
              {Object.entries(familyLabels).map(([k, label]) => (
                <div className="ops-family-metric" key={k}>
                  {icons[k as Family]}
                  <span>{label}</span>
                  <strong>
                    {
                      rows.filter(
                        (c) => definition(c.workflow_id)?.family === k,
                      ).length
                    }
                  </strong>
                </div>
              ))}
            </section>
          </div>
        </>
      ) : (
        <>
          <div className="page-heading">
            <div>
              <div className="eyebrow">NEXT B2C OPERATIONS HUB</div>
              <h1>Un client. Toate operațiunile. Un singur fir.</h1>
              <p>
                Agenții pregătesc. Regulile verifică. Tu aprobi următorul pas.
              </p>
            </div>
            <button
              className="button primary"
              onClick={() => onNavigate("/b2c/cases/new")}
            >
              <Plus size={15} />
              Caz nou
            </button>
          </div>
          {stats}
          <section className="ops-hero">
            <div>
              <span className="tag">WORKFLOW OPERATING SYSTEM · DEMO</span>
              <h2>
                De la primul contact
                <br />
                la ultima clarificare.
              </h2>
              <p>
                Onboarding, contracte, credit și soluționarea incidentelor
                folosesc același profil, documente, aprobări și dialog cu
                clientul.
              </p>
              <button
                className="button primary"
                onClick={() => onNavigate("/b2c/workflows")}
              >
                Explorează cele 29 de fluxuri
                <ArrowRight size={15} />
              </button>
            </div>
            <div className="ops-journey">
              <article>
                <UserRound size={20} />
                <span>
                  Acquire & Contract
                  <small>Onboarding → KYC → contract → semnare mock</small>
                </span>
              </article>
              <article>
                <Banknote size={20} />
                <span>
                  Borrow & Manage
                  <small>Dosar → simulare → review → contract draft</small>
                </span>
              </article>
              <article>
                <ShieldCheck size={20} />
                <span>
                  Protect & Resolve
                  <small>Plăți → dovezi → clarificări → rezoluție demo</small>
                </span>
              </article>
              <footer>
                <Network size={13} />
                Un motor · Customer 360 · Human Approval · Audit
              </footer>
            </div>
          </section>
          <div className="ops-section-title">
            <div>
              <h2>Pornește un flux principal</h2>
              <p>Cele opt trasee P0, conectate prin aceeași platformă.</p>
            </div>
            <button
              className="text-button"
              onClick={() => onNavigate("/b2c/workflows")}
            >
              Vezi toate fluxurile
              <ArrowRight size={13} />
            </button>
          </div>
          {catalogCards(workflows.filter((w) => w.priority === "P0"))}
          <section className="panel ops-recent">
            <div className="panel-header">
              <h2>Ultimele cazuri</h2>
              <button
                className="text-button"
                onClick={() => onNavigate("/b2c/cases")}
              >
                Vezi toate
                <ArrowRight size={13} />
              </button>
            </div>
            {caseTable(rows.slice(0, 6))}
          </section>
          <div className="ops-footer-note">
            <ShieldCheck size={14} />
            Prototip demonstrativ · fără operațiuni bancare reale · documente
            fără efect juridic.
          </div>
        </>
      )}
      {preview && (
        <DocumentPreview
          doc={preview}
          caseId={
            detail?.id ?? (preview as Document & { case_id?: string }).case_id
          }
          onClose={() => setPreview(null)}
        />
      )}
      {busy && (
        <div className="busy-indicator">
          <LoaderCircle className="spin" size={14} />
          Se salvează operațiunea…
        </div>
      )}
    </div>
  );
}
function InboxIcon() {
  return <Layers3 size={27} />;
}
function FingerprintIcon() {
  return <UserRound size={17} />;
}
