"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowDown,
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleHelp,
  Clock3,
  CreditCard,
  Download,
  FileCheck2,
  FileText,
  Fingerprint,
  FolderOpen,
  Inbox,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogIn,
  MessageSquare,
  MoreHorizontal,
  Play,
  Plus,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TriangleAlert,
  Workflow,
  X,
} from "lucide-react";
import {
  money,
  type Answer,
  type DisputeCase,
  type Evidence,
  type Role,
  type Status,
} from "../lib/domain";

const labels: Record<Status, string> = {
  OPEN: "Nou",
  INVESTIGATING: "În investigație",
  AWAITING_APPROVAL: "Necesită informații",
  AWAITING_CUSTOMER: "Așteaptă clientul",
  READY_FOR_REVIEW: "Gata de revizuire",
  ESCALATED: "Escaladat",
  CLOSED_DEMO: "Închis demo",
};
const categories: Record<string, string> = {
  UNRECOGNIZED_CARD_TRANSACTION: "Plată nerecunoscută",
  POSSIBLE_DUPLICATE: "Posibilă duplicare",
  REFUND_NOT_RECEIVED: "Rambursare neîncasată",
  CONFLICTING_EVIDENCE: "Dovezi contradictorii",
};
const routes: Record<string, string> = {
  UNRECOGNIZED_CNP: "Revizuire plată online nerecunoscută",
  MERCHANT_RECOGNIZED_REVIEW: "Comerciant recunoscut · revizuire",
  POSSIBLE_DUPLICATE_REVIEW: "Revizuire posibilă plată duplicată",
  INSUFFICIENT_DUPLICATE_EVIDENCE: "Verificare suplimentară a decontării",
  REFUND_REVIEW: "Revizuirea rambursării promise",
  CONFLICT_ESCALATE: "Escalare pentru dovezi contradictorii",
  PRIORITY_SECURITY_REVIEW: "Revizuire prioritară de securitate",
  ESCALATE_DATA_ISSUE: "Escalare pentru verificarea datelor",
  MANUAL_REVIEW: "Revizuire manuală",
};
const toolNames: Record<string, string> = {
  get_case: "Preluare declarație client",
  get_transaction: "Verificare tranzacție",
  get_auth_evidence: "Dovezi de autentificare",
  get_card_status: "Verificare card",
  get_case_history: "Istoric interacțiuni",
  find_possible_duplicates: "Căutare tranzacții duplicate",
  get_refund_evidence: "Verificare rambursare",
  get_rulebook: "Consultare reguli demo",
  get_customer_responses: "Preluare răspunsuri client",
};
const eventNames: Record<string, string> = {
  CASE_CREATED: "Caz creat",
  INVESTIGATION_STARTED: "Investigație pornită",
  REINVESTIGATION_STARTED: "Investigație reluată",
  TOOL_CALLED: "Instrument apelat",
  EVIDENCE_RETRIEVED: "Dovadă colectată",
  AI_CLASSIFICATION_GENERATED: "Clasificare generată",
  RULE_EVALUATED: "Regulă evaluată",
  CUSTOMER_QUESTIONS_PROPOSED: "Întrebări propuse",
  EMPLOYEE_APPROVED: "Aprobare angajat",
  CUSTOMER_REQUEST_CREATED: "Cerere trimisă clientului",
  CUSTOMER_RESPONDED: "Răspuns client primit",
  ROUTE_PROPOSED: "Traseu operațional propus",
  CASE_ESCALATED: "Caz escaladat",
  CASE_CLOSED_DEMO: "Caz închis demonstrativ",
  ROUTE_APPROVED: "Traseu aprobat",
  INVESTIGATION_FAILED: "Investigație eșuată",
  DEMO_RESET: "Scenariu resetat",
  QUESTIONS_REVISION_REQUESTED: "Revizuire solicitată",
  DEMO_FAULT_RECOVERED: "Defecțiune demo eliminată",
};
const date = (s: string, full = false) =>
  new Intl.DateTimeFormat("ro-RO", {
    ...(full ? { day: "2-digit", month: "short" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Bucharest",
  }).format(new Date(s));
const initials = (name: string) =>
  name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
function Badge({ status }: { status: Status }) {
  return (
    <span className={`badge status-${status.toLowerCase()}`}>
      <span />
      {labels[status]}
    </span>
  );
}
function Empty({
  icon = <Inbox size={25} />,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
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
type Session = { role: Role; mode: string };
type Profile = { customer_id: string; name: string; case_id: string };
type CustomerCase = Pick<
  DisputeCase,
  | "id"
  | "customer_id"
  | "customer_name"
  | "version"
  | "status"
  | "transaction"
  | "card_last4"
  | "requests"
>;
export default function Workspace() {
  const [path, setPath] = useState("/b2c/disputes");
  const [cases, setCases] = useState<DisputeCase[]>([]);
  const [role, setRole] = useState<Role>("B2C_AGENT");
  const [mode, setMode] = useState("Motor demo determinist");
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [sort, setSort] = useState("priority");
  const [tab, setTab] = useState("investigation");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [selectedQuestions, setSelectedQuestions] = useState<string[] | null>(
    null,
  );
  const [comment, setComment] = useState("");
  const [resetConfirm, setResetConfirm] = useState(false);
  const [help, setHelp] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState<Evidence | null>(
    null,
  );
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [customerCases, setCustomerCases] = useState<CustomerCase[]>([]);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [customerLoading, setCustomerLoading] = useState(false);
  const [analytics, setAnalytics] = useState<Record<string, number | null>>({});
  const initialized = useRef(false);
  const api = useCallback(
    async <T = unknown,>(endpoint: string, options: RequestInit = {}) => {
      const res = await fetch("/api/b2c/" + endpoint, {
        ...options,
        headers: { "Content-Type": "application/json", ...options.headers },
      });
      const json = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        if (json.error === "UNAUTHENTICATED") setAuthenticated(false);
        throw new Error(json.message ?? "Operațiunea a eșuat.");
      }
      return json as T;
    },
    [],
  );
  const post = useCallback(
    <T = unknown,>(endpoint: string, body: unknown) =>
      api<T>(endpoint, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Idempotency-Key": crypto.randomUUID() },
      }),
    [api],
  );
  const refresh = useCallback(async () => {
    const [data, metrics] = await Promise.all([
      api<DisputeCase[]>("disputes"),
      api<Record<string, number | null>>("analytics"),
    ]);
    setCases(data);
    setAnalytics(metrics);
  }, [api]);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    setPath(location.pathname === "/" ? "/b2c/disputes" : location.pathname);
    const initialCustomer = new URLSearchParams(location.search).get(
      "customer",
    );
    if (initialCustomer) setCustomerId(initialCustomer);
    (async () => {
      try {
        let session: Session;
        try {
          session = await api<Session>("session");
        } catch {
          session = await post<Session>("session", { role: "B2C_AGENT" });
        }
        setRole(session.role);
        setMode(session.mode);
        await refresh();
        const p = await api<Profile[]>("demo/profiles");
        setProfiles(p);
        setCustomerId((old) => old || p[0]?.customer_id || "");
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [api, post, refresh]);
  useEffect(() => {
    const pop = () => setPath(location.pathname);
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (loading || !authenticated) return;
    const t = setInterval(() => {
      refresh().catch(() => {});
    }, 1600);
    return () => clearInterval(t);
  }, [loading, authenticated, refresh]);
  const isCustomer = path.includes("/demo/customer");
  useEffect(() => {
    if (!isCustomer || !customerId) return;
    let cancelled = false;
    setCustomerLoading(true);
    setAnswers({});
    (async () => {
      try {
        await post("session", {
          role: "DEMO_CUSTOMER",
          customer_id: customerId,
        });
        const data = await api<CustomerCase[]>("customer-requests");
        if (!cancelled) setCustomerCases(data);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        if (!cancelled) setCustomerLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isCustomer, customerId, api, post]);
  useEffect(() => {
    if (!isCustomer || !customerId) return;
    const t = setInterval(
      () =>
        api<CustomerCase[]>("customer-requests")
          .then(setCustomerCases)
          .catch(() => {}),
      1800,
    );
    return () => clearInterval(t);
  }, [isCustomer, customerId, api]);
  const navigate = (p: string) => {
    window.history.pushState({}, "", p);
    setPath(p.split("?")[0]);
    setTab("investigation");
    setEdits({});
    setSelectedQuestions(null);
    setComment("");
    setError("");
    window.scrollTo(0, 0);
  };
  const openCustomer = (id?: string) => {
    if (id) setCustomerId(id);
    navigate("/b2c/demo/customer" + (id ? "?customer=" + id : ""));
  };
  const selectedId = path.match(/\/disputes\/([^/]+)/)?.[1];
  const selected = cases.find((c) => c.id === selectedId);
  const run = selected?.investigations.at(-1);
  const isAnalytics = path.includes("/analytics");
  const isAudit = path.includes("/audit");
  const act = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
      setToast(message);
    } catch (e) {
      setError((e as Error).message);
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  };
  const investigate = (recover = false) =>
    selected &&
    act(
      async () => {
        const result = await post<{status:string}>(`disputes/${selected.id}/investigations`, {
          expected_case_version: selected.version,
          ...(recover ? { recover_demo_fault: true } : {}),
        });
        if(result.status === 'FAILED') throw new Error('Investigația a fost oprită controlat. Consultă eroarea din dosar.');
        return result;
      },
      "Investigația s-a finalizat. Rezultatul este disponibil.",
    );
  const approve = (action: string) =>
    selected &&
    run &&
    act(
      () =>
        post(`disputes/${selected.id}/approvals`, {
          expected_case_version: selected.version,
          investigation_id: run.id,
          action,
          comment,
          ...(action === "APPROVE_CUSTOMER_QUESTIONS"
            ? {
                approved_question_ids:
                  selectedQuestions ?? run.questions.map((q) => q.id),
                questions: run.questions.map((q) => ({
                  ...q,
                  text: edits[q.id] ?? q.text,
                })),
              }
            : {}),
        }),
      action === "APPROVE_CUSTOMER_QUESTIONS"
        ? "Întrebările aprobate au ajuns în simulator."
        : action === "CLOSE_DEMO"
          ? "Cazul a fost închis demonstrativ."
          : "Acțiunea a fost înregistrată în audit.",
    );
  const count = (status: Status) =>
    cases.filter((c) => c.status === status).length;
  const filters = [
    ["ALL", "Toate cazurile", cases.length],
    ["AWAITING_APPROVAL", "Necesită informații", count("AWAITING_APPROVAL")],
    ["AWAITING_CUSTOMER", "Așteaptă clientul", count("AWAITING_CUSTOMER")],
    ["READY_FOR_REVIEW", "De revizuit", count("READY_FOR_REVIEW")],
    ["ESCALATED", "Escaladate", count("ESCALATED")],
    ["CLOSED_DEMO", "Închise", count("CLOSED_DEMO")],
  ];
  const filtered = cases
    .filter(
      (c) =>
        (filter === "ALL" || c.status === filter) &&
        (category === "ALL" || c.category === category) &&
        [
          c.id,
          c.customer_name,
          c.transaction?.merchant ?? "",
          categories[c.category],
        ]
          .join(" ")
          .toLocaleLowerCase("ro")
          .includes(search.toLocaleLowerCase("ro")),
    )
    .sort((a, b) =>
      sort === "amount"
        ? (b.transaction?.amount_minor ?? 0) -
          (a.transaction?.amount_minor ?? 0)
        : sort === "recent"
          ? Date.parse(b.updated_at) - Date.parse(a.updated_at)
          : { URGENT: 0, HIGH: 1, NORMAL: 2 }[a.priority] -
              { URGENT: 0, HIGH: 1, NORMAL: 2 }[b.priority] ||
            a.id.localeCompare(b.id),
    );
  const title = isCustomer
    ? "Simulator client"
    : isAnalytics
      ? "Analiză operațională"
      : isAudit
        ? "Jurnal de audit"
        : selected
          ? "Investigație caz"
          : "Cazuri de dispută";
  const customerCase = customerCases[0];
  const request = customerCase?.requests
    .filter((r) => r.status === "PENDING")
    .at(-1);
  const answered = customerCase?.requests.some((r) => r.status === "ANSWERED");
  const routeApproved = selected?.approvals.some(
    (a) => a.action === "APPROVE_ROUTE" && a.investigation_id === run?.id,
  );
  useEffect(() => {
    setEdits({});
    setSelectedQuestions(null);
  }, [run?.id]);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="/b2c/disputes"
          onClick={(e) => {
            e.preventDefault();
            navigate("/b2c/disputes");
          }}
        >
          <span className="brand-symbol">
            <Workflow size={23} />
          </span>
          <span>
            DisputePilot<span className="brand-country">RO</span>
          </span>
        </a>
        <div className="workspace-label">
          OPERAȚIUNI RETAIL <ChevronDown size={12} />
        </div>
        <div className="sidebar-section-label">SPAȚIUL TĂU DE LUCRU</div>
        <nav>
          <button
            className={
              !isCustomer && !isAnalytics && !isAudit
                ? "nav-item active"
                : "nav-item"
            }
            onClick={() => navigate("/b2c/disputes")}
          >
            <Inbox size={18} />
            Cazuri de dispută<span className="nav-count">{cases.length}</span>
          </button>
          <button
            className={isAnalytics ? "nav-item active" : "nav-item"}
            onClick={() => navigate("/b2c/analytics")}
          >
            <LayoutDashboard size={18} />
            Analiză operațională
          </button>
          <button
            className={isAudit ? "nav-item active" : "nav-item"}
            onClick={() => navigate("/b2c/audit")}
          >
            <FileText size={18} />
            Jurnal de audit
          </button>
          <div className="sidebar-section-label second">MEDIU DEMONSTRATIV</div>
          <button
            className={isCustomer ? "nav-item active" : "nav-item"}
            onClick={() => openCustomer()}
          >
            <Smartphone size={18} />
            Simulator client
            <ArrowUpRight size={14} className="nav-end" />
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-note">
            <ShieldCheck size={19} />
            <div>
              <strong>Un spațiu sigur pentru demo</strong>
              <p>
                Exclusiv date sintetice.
                <br />
                Nicio acțiune financiară reală.
              </p>
            </div>
          </div>
          <button className="help-button" onClick={() => setHelp(true)}>
            <CircleHelp size={17} />
            Ghid de demonstrație
            <ArrowUpRight size={14} />
          </button>
          <div className="profile">
            <span className="avatar">MI</span>
            <div>
              <strong>Operator demo</strong>
              <select
                aria-label="Rol demo"
                value={role}
                disabled={busy}
                onChange={(e) => {
                  const next = e.target.value as Role;
                  act(async () => {
                    const session = await post<Session>("session", {
                      role: next,
                    });
                    setRole(session.role);
                  }, "Rolul demo a fost actualizat.");
                }}
              >
                <option value="B2C_AGENT">Agent B2C</option>
                <option value="B2C_SUPERVISOR">Supervizor B2C</option>
              </select>
            </div>
            <span className="online-dot" />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Spațiu de lucru <ChevronRight size={13} />
            <span>{title}</span>
          </div>
          <div className="topbar-right">
            <select
              className="mobile-role"
              aria-label="Rol demo mobil"
              value={role}
              disabled={busy}
              onChange={(e) => {
                const next = e.target.value as Role;
                act(async () => {
                  const session = await post<Session>("session", {
                    role: next,
                  });
                  setRole(session.role);
                }, "Rolul demo a fost actualizat.");
              }}
            >
              <option value="B2C_AGENT">Agent</option>
              <option value="B2C_SUPERVISOR">Supervizor</option>
            </select>
            <span className="synthetic">
              <span /> Date sintetice
            </span>
            <span className="topbar-divider" />
            <span className="topbar-date">28 octombrie 2026</span>
            <button
              className="icon-button"
              aria-label="Deschide ghidul"
              onClick={() => setHelp(true)}
            >
              <CircleHelp size={18} />
            </button>
          </div>
        </header>
        <main>
          {error && (
            <div className="error-banner" role="alert">
              <TriangleAlert size={18} />
              <span>{error}</span>
              <button aria-label="Închide eroarea" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {!authenticated ? (
            <div className="signin-card">
              <ShieldCheck size={36} />
              <h1>Deschide spațiul tău de lucru</h1>
              <p>Autentifică-te pentru a accesa demo-ul privat DisputePilot.</p>
              <a
                className="button primary"
                href="/signin-with-chatgpt?return_to=/b2c/disputes"
                target="_top"
              >
                <LogIn size={16} />
                Autentificare cu ChatGPT
              </a>
            </div>
          ) : loading ? (
            <Empty
              icon={<LoaderCircle className="spin" size={26} />}
              title="Se pregătește spațiul de lucru…"
            >
              Se încarcă datele sintetice și sesiunea demo.
            </Empty>
          ) : isCustomer ? (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">BUCLA DIGITALĂ CU CLIENTUL</div>
                  <h1>O clarificare. Un pas înainte.</h1>
                  <p>
                    Întrebările aprobate ajung direct în simulatorul clientului.
                  </p>
                </div>
                <button
                  className="button"
                  onClick={() => navigate("/b2c/disputes")}
                >
                  <ArrowLeft size={16} />
                  Înapoi la cazuri
                </button>
              </div>
              <div className="simulator-layout">
                <section className="simulator-info">
                  <span className="tag">
                    <Smartphone size={14} /> MOBILE BANKING · DEMO
                  </span>
                  <h2>
                    Același caz.
                    <br />
                    Perspectiva clientului.
                  </h2>
                  <p>
                    Clientul vede doar întrebările revizuite și aprobate de
                    angajat. Răspunsurile sunt salvate și declanșează o nouă
                    investigație.
                  </p>
                  <label className="field-label" htmlFor="demo-profile">
                    PROFIL SINTETIC
                  </label>
                  <select
                    id="demo-profile"
                    className="select full"
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                  >
                    {profiles.map((p) => (
                      <option key={p.customer_id} value={p.customer_id}>
                        {p.name} · {p.case_id}
                      </option>
                    ))}
                  </select>
                  <div className="loop-steps">
                    <div>
                      <span>1</span>Aprobare angajat <Check size={16} />
                    </div>
                    <div>
                      <span>2</span>Răspunsuri structurate
                    </div>
                    <div>
                      <span>3</span>Reinvestigare automată
                    </div>
                  </div>
                  <div className="callout neutral">
                    <LockKeyhole size={17} />
                    <span>
                      Simulator demonstrativ independent. Nu este o integrare cu
                      o aplicație bancară reală.
                    </span>
                  </div>
                </section>
                <div className="phone">
                  <div className="phone-top">
                    <span>9:41</span>
                    <span>● ▰ ▰</span>
                  </div>
                  <div className="phone-island" />
                  <div className="phone-content">
                    <div className="mobile-brand">
                      <span className="brand-symbol small">
                        <Workflow size={17} />
                      </span>
                      Pilot banking<span>DEMO</span>
                    </div>
                    <div className="mobile-greeting">
                      Bună,{" "}
                      {customerCase?.customer_name.split(" ")[0] ?? "client"}.
                    </div>
                    <h2>
                      Hai să clarificăm
                      <br />
                      această plată.
                    </h2>
                    {customerCase?.transaction && (
                      <div className="mobile-transaction">
                        <span className="merchant-icon">
                          <CreditCard size={21} />
                        </span>
                        <div>
                          <strong>{customerCase.transaction.merchant}</strong>
                          <span>Card •••• {customerCase.card_last4}</span>
                        </div>
                        <b>{money(customerCase.transaction.amount_minor)}</b>
                      </div>
                    )}
                    {customerLoading ? (
                      <Empty
                        icon={<LoaderCircle className="spin" />}
                        title="Se încarcă…"
                      />
                    ) : request ? (
                      <>
                        <div className="mobile-request-meta">
                          <MessageSquare size={14} />
                          Solicitare de informații{" "}
                          <span>{request.questions.length} întrebări</span>
                        </div>
                        {request.questions.map((q, i) => (
                          <div className="mobile-question" key={q.id}>
                            <label>
                              {i + 1}. {q.text}
                            </label>
                            <div className="answer-buttons">
                              {(
                                [
                                  ["YES", "Da"],
                                  ["NO", "Nu"],
                                  ["UNSURE", "Nu știu"],
                                ] as const
                              ).map(([value, label]) => (
                                <button
                                  key={value}
                                  className={
                                    answers[q.key] === value ? "chosen" : ""
                                  }
                                  disabled={busy}
                                  onClick={() =>
                                    setAnswers((a) => ({
                                      ...a,
                                      [q.key]: value,
                                    }))
                                  }
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                        <button
                          className="button primary mobile-submit"
                          disabled={
                            busy ||
                            !request.questions.every((q) => answers[q.key])
                          }
                          onClick={() =>
                            act(async () => {
                              await post(
                                `customer-requests/${request.id}/responses`,
                                {
                                  expected_case_version: customerCase.version,
                                  answers,
                                },
                              );
                              setCustomerCases(
                                await api<CustomerCase[]>("customer-requests"),
                              );
                              setAnswers({});
                            }, "Răspunsurile au fost salvate. Cazul a fost reinvestigat.")
                          }
                        >
                          <Send size={16} />
                          {busy ? "Se trimit…" : "Trimite răspunsurile"}
                        </button>
                        <p className="mobile-fine">
                          Răspunsurile tale ajută echipa să investigheze cazul.
                        </p>
                      </>
                    ) : answered ? (
                      <div className="mobile-success">
                        <span>
                          <CheckCheck size={32} />
                        </span>
                        <h3>Mulțumim pentru răspunsuri.</h3>
                        <p>
                          Informațiile au fost salvate. Echipa noastră
                          revizuiește acum cazul.
                        </p>
                        <div className="mobile-case-ref">{customerCase.id}</div>
                      </div>
                    ) : (
                      <Empty
                        icon={<MessageSquare size={25} />}
                        title="Ești la zi"
                      >
                        Nicio cerere aprobată în acest moment. Solicitările vor
                        apărea aici după aprobarea angajatului.
                      </Empty>
                    )}
                  </div>
                  <div className="phone-bottom" />
                </div>
              </div>
            </>
          ) : isAnalytics ? (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">VIZIBILITATE OPERAȚIONALĂ</div>
                  <h1>Fiecare pas, măsurabil.</h1>
                  <p>
                    Indicatori calculați din investigațiile și cazurile acestui
                    spațiu demo.
                  </p>
                </div>
                <span className="live-label">
                  <span />
                  Actualizare automată
                </span>
              </div>
              <div className="metrics four">
                {[
                  [
                    "Cazuri sintetice",
                    analytics.total ?? 0,
                    <FolderOpen size={19} />,
                  ],
                  [
                    "Investigații executate",
                    analytics.runs ?? 0,
                    <Sparkles size={19} />,
                  ],
                  [
                    "Timp mediu / investigație",
                    analytics.avg_runtime_ms === null
                      ? "—"
                      : `${((analytics.avg_runtime_ms ?? 0) / 1000).toFixed(2)} s`,
                    <Clock3 size={19} />,
                  ],
                  [
                    "Acoperire dovezi",
                    analytics.grounding === null
                      ? "—"
                      : `${analytics.grounding}%`,
                    <ShieldCheck size={19} />,
                  ],
                ].map(([label, value, icon], i) => (
                  <div className="metric" key={i}>
                    <div>
                      {label}
                      {icon}
                    </div>
                    <strong>{value}</strong>
                    <span>
                      {i === 3
                        ? "Afirmații cu referințe la dovezi"
                        : "Exclusiv setul sintetic curent"}
                    </span>
                  </div>
                ))}
              </div>
              <div className="analytics-grid">
                <section className="panel">
                  <div className="panel-header">
                    <h2>Distribuția cazurilor</h2>
                    <span>{cases.length} cazuri</span>
                  </div>
                  <div className="bar-chart">
                    {Object.entries(labels)
                      .filter(([s]) => s !== "INVESTIGATING")
                      .map(([s, label]) => (
                        <div className="chart-row" key={s}>
                          <span>{label}</span>
                          <div>
                            <i
                              style={{
                                width: `${cases.length ? (count(s as Status) / cases.length) * 100 : 0}%`,
                              }}
                            />
                          </div>
                          <b>{count(s as Status)}</b>
                        </div>
                      ))}
                  </div>
                </section>
                <section className="panel">
                  <div className="panel-header">
                    <h2>Calitatea investigațiilor</h2>
                    <Activity size={18} />
                  </div>
                  <div className="quality-row">
                    <span>Concordanță traseu / rezultat așteptat</span>
                    <strong>
                      {analytics.routing_accuracy === null
                        ? "—"
                        : `${analytics.routing_accuracy}%`}
                    </strong>
                  </div>
                  <div className="quality-row">
                    <span>Apeluri de instrumente / investigație</span>
                    <strong>{analytics.avg_tools ?? "—"}</strong>
                  </div>
                  <div className="quality-row">
                    <span>Investigații cu erori controlate</span>
                    <strong>{analytics.failed ?? 0}</strong>
                  </div>
                  <div className="quality-row">
                    <span>Cazuri închise demonstrativ</span>
                    <strong>{analytics.closed ?? 0}</strong>
                  </div>
                  <p className="panel-footnote">
                    „—” indică lipsa măsurătorilor. Aceste valori nu reprezintă
                    performanțe reale ale unei bănci.
                  </p>
                </section>
              </div>
            </>
          ) : isAudit ? (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">TRASABILITATE COMPLETĂ</div>
                  <h1>Istoricul care explică decizia.</h1>
                  <p>
                    Evenimente persistate, cu actor, sursă și identificator de
                    corelare.
                  </p>
                </div>
                <button
                  className="button"
                  onClick={() =>
                    download(
                      "disputepilot-audit.json",
                      cases.flatMap((c) => c.audit),
                    )
                  }
                >
                  <Download size={16} />
                  Exportă JSON
                </button>
              </div>
              <AuditTable
                events={cases
                  .flatMap((c) => c.audit)
                  .sort(
                    (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp),
                  )}
                onCase={(id) => navigate("/b2c/disputes/" + id)}
              />
            </>
          ) : selected ? (
            <>
              <button
                className="back-link"
                onClick={() => navigate("/b2c/disputes")}
              >
                <ArrowLeft size={15} />
                Toate cazurile
              </button>
              <div className="case-heading">
                <div>
                  <div className="eyebrow">
                    {selected.id} <span>·</span> {categories[selected.category]}
                  </div>
                  <h1>
                    {selected.transaction?.merchant ??
                      "Tranzacție indisponibilă"}
                  </h1>
                  <div className="case-subtitle">
                    <span className="avatar tiny">
                      {initials(selected.customer_name)}
                    </span>
                    {selected.customer_name}
                    <span>·</span>Card •••• {selected.card_last4}
                    <span>·</span>
                    <Badge status={selected.status} />
                  </div>
                </div>
                <div className="case-heading-right">
                  <strong>
                    {selected.transaction
                      ? money(selected.transaction.amount_minor)
                      : "—"}
                  </strong>
                  <span>
                    {selected.transaction
                      ? date(selected.transaction.occurred_at, true)
                      : "Date lipsă"}{" "}
                    · v{selected.version}
                  </span>
                </div>
              </div>
              <div className="detail-toolbar">
                <div className="detail-tabs">
                  {[
                    ["investigation", "Investigație"],
                    ["audit", `Audit · ${selected.audit.length}`],
                    ["history", `Istoric · ${selected.investigations.length}`],
                  ].map(([value, label]) => (
                    <button
                      className={tab === value ? "active" : ""}
                      key={value}
                      onClick={() => setTab(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <select
                  className="scenario-select"
                  aria-label="Schimbă scenariul"
                  value={selected.id}
                  onChange={(e) => navigate("/b2c/disputes/" + e.target.value)}
                >
                  {cases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id} · {categories[c.category]}
                    </option>
                  ))}
                </select>
              </div>
              {tab === "audit" ? (
                <AuditTable events={[...selected.audit].reverse()} />
              ) : tab === "history" ? (
                <section className="panel">
                  {selected.investigations.length ? (
                    selected.investigations.map((r, i) => (
                      <details
                        className="run-history"
                        key={r.id}
                        open={i === selected.investigations.length - 1}
                      >
                        <summary>
                          <span>
                            <Sparkles size={17} />
                            Investigația {i + 1}
                          </span>
                          <span>
                            {r.status === "FAILED"
                              ? "Eșuată"
                              : r.status === "RUNNING"
                                ? "În execuție"
                                : "Finalizată"}{" "}
                            · {date(r.started_at, true)}
                          </span>
                        </summary>
                        <div>
                          <p>
                            {routes[r.suggested_route] ??
                              r.error ??
                              "În execuție"}
                          </p>
                          <small>
                            {r.provider} · {r.calls.length} instrumente ·{" "}
                            {r.duration_ms ?? 0} ms
                          </small>
                          <pre>{JSON.stringify(r, null, 2)}</pre>
                        </div>
                      </details>
                    ))
                  ) : (
                    <Empty title="Nicio investigație încă">
                      Pornește prima investigație pentru acest caz.
                    </Empty>
                  )}
                </section>
              ) : (
                <div className="investigation-grid">
                  <aside className="evidence-column">
                    <section className="panel">
                      <div className="panel-header">
                        <h2>Tranzacția contestată</h2>
                        <CreditCard size={17} />
                      </div>
                      <dl className="transaction-details">
                        <div>
                          <dt>Identificator</dt>
                          <dd>{selected.transaction?.id ?? "Indisponibil"}</dd>
                        </div>
                        <div>
                          <dt>Sumă</dt>
                          <dd>
                            {selected.transaction
                              ? money(selected.transaction.amount_minor)
                              : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt>Status</dt>
                          <dd>
                            <span className="settled">
                              {selected.transaction?.status ?? "NOT FOUND"}
                            </span>
                          </dd>
                        </div>
                        <div>
                          <dt>Canal</dt>
                          <dd>{selected.transaction?.channel ?? "—"}</dd>
                        </div>
                        <div>
                          <dt>Autentificare 3DS</dt>
                          <dd
                            className={
                              selected.auth.three_ds_status === "UNKNOWN"
                                ? "text-amber"
                                : ""
                            }
                          >
                            {selected.auth.three_ds_status === "UNKNOWN"
                              ? "Necunoscută"
                              : "Verificată"}
                          </dd>
                        </div>
                      </dl>
                    </section>
                    <section className="panel statement">
                      <div className="panel-header">
                        <h2>Declarația clientului</h2>
                        <MessageSquare size={17} />
                      </div>
                      <blockquote>„{selected.customer_statement}”</blockquote>
                      <span className="small-muted">
                        Date sintetice · declarație nevalidată
                      </span>
                    </section>
                    <section className="panel">
                      <div className="panel-header">
                        <h2>Dosarul de dovezi</h2>
                        <span className="counter">
                          {selected.evidence.length}
                        </span>
                      </div>
                      {selected.evidence.length ? (
                        <div className="evidence-list">
                          {selected.evidence.map((e) => (
                            <button
                              key={e.id}
                              onClick={() => setSelectedEvidence(e)}
                            >
                              <span className="evidence-icon">
                                {e.type === "authentication" ? (
                                  <Fingerprint size={17} />
                                ) : (
                                  <FileCheck2 size={17} />
                                )}
                              </span>
                              <div>
                                <strong>{toolNames[e.source] ?? e.type}</strong>
                                <span>
                                  {date(e.timestamp)} · sursă sintetică
                                </span>
                              </div>
                              <ChevronRight size={14} />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="panel-empty">
                          Dovezile vor fi colectate la pornirea investigației.
                        </p>
                      )}
                    </section>
                  </aside>
                  <section className="investigator-column">
                    <div className="panel investigator-panel">
                      <div className="panel-header investigator-title">
                        <div>
                          <span className="spark-icon">
                            <Sparkles size={18} />
                          </span>
                          <h2>Asistent de investigație</h2>
                        </div>
                        <span className="tag muted">
                          {mode === "Motor demo determinist"
                            ? "DEMO DETERMINIST"
                            : "LLM"}
                        </span>
                      </div>
                      {!run ? (
                        <div className="investigation-start">
                          <div className="investigation-graphic">
                            <span>
                              <Search size={30} />
                            </span>
                            <i className="graphic-node n1">
                              <CreditCard size={17} />
                            </i>
                            <i className="graphic-node n2">
                              <ShieldCheck size={17} />
                            </i>
                            <i className="graphic-node n3">
                              <FileText size={17} />
                            </i>
                          </div>
                          <h2>O investigație începe cu dovezile.</h2>
                          <p>
                            Colectează datele tranzacției, verifică sursele
                            disponibile și identifică următorul pas operațional.
                          </p>
                          <button
                            className="button primary"
                            disabled={busy}
                            onClick={() => investigate()}
                          >
                            {busy ? (
                              <LoaderCircle className="spin" size={16} />
                            ) : (
                              <Sparkles size={16} />
                            )}
                            Pornește investigația
                          </button>
                          <span className="small-muted">
                            Rezultatul necesită validarea unui angajat.
                          </span>
                        </div>
                      ) : (
                        <>
                          <div className="run-status">
                            <span
                              className={
                                run.status === "RUNNING"
                                  ? "run-state running"
                                  : run.status === "FAILED"
                                    ? "run-state failed"
                                    : "run-state"
                              }
                            >
                              {run.status === "RUNNING" ? (
                                <LoaderCircle className="spin" size={15} />
                              ) : run.status === "FAILED" ? (
                                <TriangleAlert size={15} />
                              ) : (
                                <CheckCircle2 size={15} />
                              )}
                              {run.status === "RUNNING"
                                ? "Investigație în execuție"
                                : run.status === "FAILED"
                                  ? "Investigație oprită controlat"
                                  : "Investigație finalizată"}
                            </span>
                            <span>
                              {run.duration_ms !== undefined
                                ? `${(run.duration_ms / 1000).toFixed(2)} s`
                                : "Evenimente live"}{" "}
                              · runda {selected.investigations.length}
                            </span>
                          </div>
                          <div className="tool-calls">
                            {run.calls.map((call, i) => (
                              <div key={i}>
                                <span
                                  className={
                                    call.status === "FAILED"
                                      ? "tool-dot fail"
                                      : "tool-dot"
                                  }
                                >
                                  {call.status === "COMPLETED" ? (
                                    <Check size={11} />
                                  ) : (
                                    <X size={11} />
                                  )}
                                </span>
                                <span>{toolNames[call.name] ?? call.name}</span>
                                <small>
                                  {call.status === "FAILED"
                                    ? "Eroare"
                                    : `${call.duration_ms} ms`}
                                </small>
                              </div>
                            ))}
                          </div>
                          {run.error && (
                            <div className="callout danger">
                              <TriangleAlert size={18} />
                              <div>
                                <strong>
                                  Este necesară intervenția angajatului
                                </strong>
                                <p>{run.error}</p>
                              </div>
                            </div>
                          )}
                          {run.findings.length > 0 && (
                            <div className="findings">
                              <div className="section-heading">
                                <h3>Ce știm din dovezi</h3>
                                <span>{run.findings.length} constatări</span>
                              </div>
                              {run.findings.map((f, i) => (
                                <div className="finding" key={i}>
                                  <CheckCircle2 size={16} />
                                  <div>
                                    <p>{f.claim}</p>
                                    <div className="evidence-refs">
                                      {f.evidence_refs.map((ref) => (
                                        <button
                                          key={ref}
                                          onClick={() =>
                                            setSelectedEvidence(
                                              selected.evidence.find(
                                                (e) => e.id === ref,
                                              ) ?? null,
                                            )
                                          }
                                        >
                                          <FileText size={10} />
                                          {ref.slice(0, 12)}…
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {run.unknowns.length > 0 && (
                            <div className="unknowns">
                              <TriangleAlert size={17} />
                              <div>
                                <strong>Ce rămâne necunoscut</strong>
                                {run.unknowns.map((u, i) => (
                                  <p key={i}>{u}</p>
                                ))}
                              </div>
                            </div>
                          )}
                          {run.rules.length > 0 && (
                            <div className="rules">
                              <div className="section-heading">
                                <h3>Validare prin reguli</h3>
                                <span>{selected.rulebook_version}</span>
                              </div>
                              {run.rules.map((rule) => (
                                <details
                                  key={rule.rule_id}
                                  className={"rule " + rule.severity}
                                >
                                  <summary>
                                    <span>
                                      {rule.severity === "block" ? (
                                        <TriangleAlert size={14} />
                                      ) : rule.severity === "warning" ? (
                                        <CircleHelp size={14} />
                                      ) : (
                                        <CheckCircle2 size={14} />
                                      )}
                                      <code>{rule.rule_id}</code>
                                    </span>
                                    <span>
                                      {rule.result
                                        .replaceAll("_", " ")
                                        .toLowerCase()}
                                    </span>
                                    <ChevronDown size={12} />
                                  </summary>
                                  <p>{rule.explanation}</p>
                                </details>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                      <div className="investigator-footer">
                        <LockKeyhole size={13} />
                        {run?.provider ?? mode} · Reguli sintetice · Decizie
                        umană
                      </div>
                    </div>
                    {run?.questions.length &&
                    selected.status === "AWAITING_APPROVAL" ? (
                      <section className="panel question-composer">
                        <div className="panel-header">
                          <div>
                            <h2>Clarificări pentru client</h2>
                            <p>
                              Revizuiește și editează întrebările înainte de
                              aprobare.
                            </p>
                          </div>
                          <MessageSquare size={18} />
                        </div>
                        {run.questions.map((q) => (
                          <div className="compose-question" key={q.id}>
                            <label>
                              <input
                                type="checkbox"
                                checked={(
                                  selectedQuestions ??
                                  run.questions.map((q) => q.id)
                                ).includes(q.id)}
                                onChange={(e) =>
                                  setSelectedQuestions((prev) =>
                                    e.target.checked
                                      ? [
                                          ...(prev ??
                                            run.questions.map((q) => q.id)),
                                          q.id,
                                        ]
                                      : (
                                          prev ?? run.questions.map((q) => q.id)
                                        ).filter((id) => id !== q.id),
                                  )
                                }
                              />
                              <span>{q.id} · Da / Nu / Nu știu</span>
                            </label>
                            <textarea
                              aria-label={`Întrebarea ${q.id}`}
                              value={edits[q.id] ?? q.text}
                              onChange={(e) =>
                                setEdits((v) => ({
                                  ...v,
                                  [q.id]: e.target.value,
                                }))
                              }
                              maxLength={500}
                            />
                            <p>{q.reason}</p>
                          </div>
                        ))}
                        <div className="composer-footer">
                          <ShieldCheck size={15} />
                          Trimiterea necesită aprobarea ta explicită.
                        </div>
                      </section>
                    ) : null}
                  </section>
                  <aside className="actions-column">
                    <section className="panel next-action">
                      <div className="panel-header">
                        <h2>Următorul pas</h2>
                        <ArrowUpRight size={18} />
                      </div>
                      <div className="action-content">
                        {!run ? (
                          <>
                            <span className="action-illustration">
                              <Play size={22} />
                            </span>
                            <h3>Pregătit de investigație</h3>
                            <p>
                              Pornește colectarea dovezilor pentru a primi o
                              recomandare.
                            </p>
                            <button
                              className="button primary full"
                              disabled={busy}
                              onClick={() => investigate()}
                            >
                              <Sparkles size={15} />
                              Investighează cazul
                            </button>
                          </>
                        ) : selected.status === "INVESTIGATING" ? (
                          <>
                            <LoaderCircle className="spin" />
                            <h3>Colectăm dovezile</h3>
                            <p>
                              Progresul afișat provine din evenimentele
                              orchestratorului.
                            </p>
                          </>
                        ) : selected.status === "AWAITING_APPROVAL" ? (
                          <>
                            <span className="action-illustration amber">
                              <MessageSquare size={22} />
                            </span>
                            <h3>Avem nevoie de client</h3>
                            <p>
                              Lipsesc confirmări esențiale. Verifică întrebările
                              propuse și aprobă trimiterea.
                            </p>
                            <label
                              className="field-label"
                              htmlFor="approval-comment"
                            >
                              NOTĂ INTERNĂ (OPȚIONAL)
                            </label>
                            <textarea
                              id="approval-comment"
                              value={comment}
                              onChange={(e) => setComment(e.target.value)}
                              placeholder="Context pentru audit…"
                            />
                            <button
                              className="button primary full"
                              disabled={busy || selectedQuestions?.length === 0}
                              onClick={() =>
                                approve("APPROVE_CUSTOMER_QUESTIONS")
                              }
                            >
                              <Send size={15} />
                              Aprobă și trimite
                            </button>
                            <button
                              className="button subtle full"
                              disabled={busy}
                              onClick={() => approve("REQUEST_REVISION")}
                            >
                              <RotateCcw size={14} />
                              Solicită revizuire
                            </button>
                          </>
                        ) : selected.status === "AWAITING_CUSTOMER" ? (
                          <>
                            <span className="action-illustration amber">
                              <Clock3 size={22} />
                            </span>
                            <h3>Așteptăm răspunsurile</h3>
                            <p>
                              Cererea aprobată este disponibilă în simulatorul
                              clientului.
                            </p>
                            <button
                              className="button primary full"
                              onClick={() => openCustomer(selected.customer_id)}
                            >
                              <Smartphone size={16} />
                              Deschide simulatorul
                            </button>
                            <div className="request-note">
                              {selected.requests.at(-1)?.questions.length}{" "}
                              întrebări trimise ·{" "}
                              {selected.requests.at(-1) &&
                                date(selected.requests.at(-1)!.created_at)}
                            </div>
                          </>
                        ) : selected.status === "READY_FOR_REVIEW" ? (
                          <>
                            <span className="action-illustration">
                              <FileCheck2 size={22} />
                            </span>
                            <span className="field-label">TRASEU PROPUS</span>
                            <h3>
                              {routes[run.suggested_route] ??
                                run.suggested_route}
                            </h3>
                            <p>
                              Verifică dovezile și regulile, apoi validează
                              traseul operațional.
                            </p>
                            {routeApproved ? (
                              <>
                                <div className="callout success">
                                  <Check size={15} />
                                  Traseu aprobat de angajat
                                </div>
                                <button
                                  className="button primary full"
                                  disabled={busy || role !== "B2C_SUPERVISOR"}
                                  onClick={() => approve("CLOSE_DEMO")}
                                >
                                  <CheckCheck size={15} />
                                  Închide cazul demo
                                </button>
                                {role !== "B2C_SUPERVISOR" && (
                                  <p className="small-muted">
                                    Închiderea necesită rolul Supervizor B2C.
                                  </p>
                                )}
                              </>
                            ) : (
                              <button
                                className="button primary full"
                                disabled={busy}
                                onClick={() => approve("APPROVE_ROUTE")}
                              >
                                <Check size={16} />
                                Aprobă traseul
                              </button>
                            )}
                            <button
                              className="button subtle full"
                              disabled={busy}
                              onClick={() => investigate()}
                            >
                              <RotateCcw size={14} />
                              Reinvestighează
                            </button>
                          </>
                        ) : selected.status === "ESCALATED" ? (
                          <>
                            <span className="action-illustration red">
                              <TriangleAlert size={22} />
                            </span>
                            <h3>
                              {run.error
                                ? "Revizuire tehnică necesară"
                                : (routes[run.suggested_route] ??
                                  "Revizuire specializată")}
                            </h3>
                            <p>
                              Cazul necesită intervenție umană. Dovezile și
                              evenimentele au fost păstrate.
                            </p>
                            <button
                              className="button primary full"
                              disabled={busy}
                              onClick={() => investigate()}
                            >
                              <RotateCcw size={15} />
                              Reîncearcă investigația
                            </button>
                            {selected.fault && role === "B2C_SUPERVISOR" && (
                              <button
                                className="button subtle full"
                                disabled={busy}
                                onClick={() => investigate(true)}
                              >
                                Elimină defecțiunea demo
                              </button>
                            )}
                          </>
                        ) : (
                          <>
                            <span className="action-illustration">
                              <CheckCheck size={23} />
                            </span>
                            <h3>Caz închis demonstrativ</h3>
                            <p>
                              Rezultatul a fost confirmat de supervizor și
                              păstrat în audit.
                            </p>
                            <button
                              className="button full"
                              onClick={() => setTab("audit")}
                            >
                              <FileText size={15} />
                              Consultă auditul
                            </button>
                          </>
                        )}
                        {run &&
                          ![
                            "OPEN",
                            "ESCALATED",
                            "CLOSED_DEMO",
                            "INVESTIGATING",
                          ].includes(selected.status) && (
                            <button
                              className="escalate-button"
                              disabled={busy}
                              onClick={() => approve("ESCALATE")}
                            >
                              <ArrowUpRight size={14} />
                              Escaladează cazul
                            </button>
                          )}
                      </div>
                    </section>
                    <div className="human-note">
                      <ShieldCheck size={18} />
                      <div>
                        <strong>Controlul rămâne la tine.</strong>
                        <p>
                          Asistentul propune. Angajatul validează fiecare pas cu
                          impact operațional.
                        </p>
                      </div>
                    </div>
                    <section className="mini-audit">
                      <div className="section-heading">
                        <h3>Activitate recentă</h3>
                        <button onClick={() => setTab("audit")}>
                          Vezi tot <ArrowRight size={12} />
                        </button>
                      </div>
                      {[...selected.audit]
                        .reverse()
                        .filter(
                          (e) =>
                            e.event_type !== "TOOL_CALLED" &&
                            e.event_type !== "RULE_EVALUATED",
                        )
                        .slice(0, 4)
                        .map((e) => (
                          <div className="mini-event" key={e.event_id}>
                            <span />
                            <div>
                              <p>{eventNames[e.event_type] ?? e.event_type}</p>
                              <small>
                                {date(e.timestamp)} ·{" "}
                                {e.actor_type === "SYSTEM"
                                  ? "Sistem"
                                  : e.actor_type === "DEMO_CUSTOMER"
                                    ? "Client"
                                    : "Angajat"}
                              </small>
                            </div>
                          </div>
                        ))}
                    </section>
                  </aside>
                </div>
              )}
            </>
          ) : selectedId ? (
            <Empty title="Cazul nu a fost găsit">
              <button
                className="button"
                onClick={() => navigate("/b2c/disputes")}
              >
                Înapoi la cazuri
              </button>
            </Empty>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">DISPUTE CU CARDUL, SUB CONTROL</div>
                  <h1>O perspectivă clară. Un pas sigur.</h1>
                  <p>
                    Investighează, clarifică și gestionează cazurile într-un
                    singur loc.
                  </p>
                </div>
                <button className="button" onClick={() => setHelp(true)}>
                  <Play size={15} />
                  Explorează demo-ul
                </button>
              </div>
              <div className="metrics four">
                <div className="metric">
                  <div>
                    Cazuri în lucru
                    <span className="metric-icon">
                      <FolderOpen size={18} />
                    </span>
                  </div>
                  <strong>
                    {cases.filter((c) => c.status !== "CLOSED_DEMO").length}
                    <span className="metric-unit">cazuri</span>
                  </strong>
                  <span>
                    <span className="tiny-dot green" />
                    Dosare sintetice disponibile
                  </span>
                </div>
                <div className="metric">
                  <div>
                    Necesită informații
                    <span className="metric-icon amber">
                      <MessageSquare size={18} />
                    </span>
                  </div>
                  <strong>
                    {count("AWAITING_APPROVAL") + count("AWAITING_CUSTOMER")}
                    <span className="metric-unit">cazuri</span>
                  </strong>
                  <span>
                    {count("AWAITING_CUSTOMER")} așteaptă răspunsul clientului
                  </span>
                </div>
                <div className="metric">
                  <div>
                    Gata de revizuire
                    <span className="metric-icon green">
                      <FileCheck2 size={18} />
                    </span>
                  </div>
                  <strong>
                    {count("READY_FOR_REVIEW")}
                    <span className="metric-unit">cazuri</span>
                  </strong>
                  <span>Dovezi colectate, decizie umană</span>
                </div>
                <div className="metric">
                  <div>
                    Escaladate
                    <span className="metric-icon red">
                      <ArrowUpRight size={18} />
                    </span>
                  </div>
                  <strong>
                    {count("ESCALATED")}
                    <span className="metric-unit">cazuri</span>
                  </strong>
                  <span>Necesită atenție specializată</span>
                </div>
              </div>
              <section className="cases-panel panel">
                <div className="cases-heading">
                  <div>
                    <h2>
                      Coada de investigații{" "}
                      <span className="counter">{cases.length}</span>
                    </h2>
                    <p>
                      Prioritizează cazurile și pornește investigația potrivită.
                    </p>
                  </div>
                  <span className="live-label">
                    <span />
                    Sincronizat
                  </span>
                </div>
                <div className="filter-tabs">
                  {filters.map(([value, label, n]) => (
                    <button
                      key={value}
                      className={filter === value ? "active" : ""}
                      onClick={() => setFilter(String(value))}
                    >
                      {label}
                      <span>{n}</span>
                    </button>
                  ))}
                </div>
                <div className="table-controls">
                  <div className="search">
                    <Search size={17} />
                    <input
                      aria-label="Caută cazuri"
                      placeholder="Caută client, comerciant sau ID caz…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    {search && (
                      <button
                        aria-label="Șterge căutarea"
                        onClick={() => setSearch("")}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                  <div className="table-selects">
                    <select
                      className="select"
                      aria-label="Categorie"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      <option value="ALL">Toate categoriile</option>
                      {Object.entries(categories).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <select
                      className="select sort"
                      aria-label="Sortează cazurile"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="priority">Prioritate</option>
                      <option value="recent">Activitate recentă</option>
                      <option value="amount">Sumă descrescător</option>
                    </select>
                  </div>
                </div>
                <div className="table-scroll">
                  <table className="cases-table">
                    <thead>
                      <tr>
                        <th>Caz / Client</th>
                        <th>Tranzacție contestată</th>
                        <th>
                          Sumă <ArrowDown size={11} />
                        </th>
                        <th>Status</th>
                        <th>Prioritate</th>
                        <th>Ultima activitate</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((c) => (
                        <tr
                          key={c.id}
                          onClick={() => navigate("/b2c/disputes/" + c.id)}
                        >
                          <td>
                            <a
                              className="case-id"
                              href={"/b2c/disputes/" + c.id}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                navigate("/b2c/disputes/" + c.id);
                              }}
                            >
                              {c.id}
                            </a>
                            <div className="customer-cell">
                              <span className="avatar tiny">
                                {initials(c.customer_name)}
                              </span>
                              {c.customer_name}
                            </div>
                          </td>
                          <td>
                            <strong className="merchant-name">
                              {c.transaction?.merchant ??
                                "Tranzacție indisponibilă"}
                            </strong>
                            <span className="cell-secondary">
                              {categories[c.category]}
                            </span>
                          </td>
                          <td className="amount-cell">
                            {c.transaction
                              ? money(c.transaction.amount_minor)
                              : "—"}
                          </td>
                          <td>
                            <Badge status={c.status} />
                          </td>
                          <td>
                            <span
                              className={"priority " + c.priority.toLowerCase()}
                            >
                              <i />
                              {c.priority === "URGENT"
                                ? "Urgentă"
                                : c.priority === "HIGH"
                                  ? "Ridicată"
                                  : "Normală"}
                            </span>
                          </td>
                          <td className="activity-cell">
                            {date(c.updated_at, true)}
                          </td>
                          <td>
                            <button
                              className="row-open"
                              aria-label={`Deschide ${c.id}`}
                            >
                              <ArrowUpRight size={17} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!filtered.length && (
                  <Empty icon={<Search size={24} />} title="Niciun caz găsit">
                    Modifică textul căutării sau filtrele.
                  </Empty>
                )}
                <div className="table-footer">
                  <span>
                    {filtered.length} din {cases.length} cazuri
                  </span>
                  <span>
                    <LockKeyhole size={12} />
                    Date exclusiv sintetice · Rulebook demo-v1
                  </span>
                </div>
              </section>
              <div className="inbox-bottom">
                <span>
                  <span className="spark-icon small">
                    <Sparkles size={14} />
                  </span>
                  AI-ul investighează. Regulile validează.{" "}
                  <strong>Tu decizi.</strong>
                </span>
                <button onClick={() => setHelp(true)}>
                  Cum funcționează <ArrowRight size={14} />
                </button>
                <button
                  className="reset-link"
                  disabled={role !== "B2C_SUPERVISOR" || busy}
                  title="Necesită rolul Supervizor B2C"
                  onClick={() => setResetConfirm(true)}
                >
                  <RotateCcw size={13} />
                  Resetează demo
                </button>
              </div>
            </>
          )}
        </main>
        <footer className="app-footer">
          <span>
            DisputePilot RO <span>·</span> VibeHack 2026
          </span>
          <span>
            <ShieldCheck size={12} />
            Demo controlat de angajat
          </span>
        </footer>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
          <button aria-label="Închide notificarea" onClick={() => setToast("")}>
            <X size={14} />
          </button>
        </div>
      )}
      {busy && (
        <div className="busy-indicator" role="status">
          <LoaderCircle className="spin" size={15} />
          Operațiune în curs…
        </div>
      )}
      {selectedEvidence && (
        <div
          className="modal-backdrop"
          onClick={() => setSelectedEvidence(null)}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Detalii dovadă"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              onClick={() => setSelectedEvidence(null)}
              aria-label="Închide dovada"
            >
              <X size={20} />
            </button>
            <span className="tag">
              <FileCheck2 size={14} />
              DOVADĂ SINTETICĂ
            </span>
            <h2>
              {toolNames[selectedEvidence.source] ?? selectedEvidence.type}
            </h2>
            <p>{selectedEvidence.summary}</p>
            <dl className="evidence-meta">
              <div>
                <dt>Sursă</dt>
                <dd>{selectedEvidence.source}</dd>
              </div>
              <div>
                <dt>Timestamp</dt>
                <dd>{selectedEvidence.timestamp}</dd>
              </div>
              <div>
                <dt>Referință</dt>
                <dd>{selectedEvidence.id}</dd>
              </div>
            </dl>
            <pre>{JSON.stringify(selectedEvidence.data, null, 2)}</pre>
          </section>
        </div>
      )}
      {resetConfirm && (
        <div className="modal-backdrop">
          <section
            className="modal compact"
            role="dialog"
            aria-modal="true"
            aria-label="Resetare demo"
          >
            <RotateCcw size={27} />
            <h2>Pregătește un demo nou</h2>
            <p>
              Cele 13 scenarii revin la datele inițiale. Evenimentele istorice
              de audit sunt păstrate și resetarea este înregistrată.
            </p>
            <div className="modal-actions">
              <button className="button" onClick={() => setResetConfirm(false)}>
                Anulează
              </button>
              <button
                className="button primary"
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    await post("demo/reset", {});
                    setResetConfirm(false);
                  }, "Cele 13 scenarii au fost resetate.")
                }
              >
                <RotateCcw size={15} />
                Resetează scenariile
              </button>
            </div>
          </section>
        </div>
      )}
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="modal guide"
            role="dialog"
            aria-modal="true"
            aria-label="Ghid demo"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="Închide ghidul"
              onClick={() => setHelp(false)}
            >
              <X size={20} />
            </button>
            <span className="tag">
              <Play size={12} />
              GHID DEMO · 4 MINUTE
            </span>
            <h2>
              Dintr-o contestație,
              <br />
              un proces clar.
            </h2>
            <p>
              Explorează cele trei scenarii principale, apoi verifică
              trasabilitatea fiecărui pas.
            </p>
            {[
              [
                "0187",
                "Plată nerecunoscută",
                "Investighează → aprobă întrebările → răspunde în simulator → revizuiește traseul.",
              ],
              [
                "0192",
                "Posibilă plată duplicată",
                "Compară două decontări distincte și verifică regula DSP-004.",
              ],
              [
                "0201",
                "Dovezi contradictorii",
                "Urmărește escaladarea controlată și dovezile care o justifică.",
              ],
            ].map(([id, title, body], i) => (
              <button
                className="guide-step"
                key={id}
                onClick={() => {
                  setHelp(false);
                  navigate("/b2c/disputes/DSP-2026-" + id);
                }}
              >
                <span>{i + 1}</span>
                <div>
                  <strong>{title}</strong>
                  <p>{body}</p>
                </div>
                <ArrowUpRight size={18} />
              </button>
            ))}
            <div className="callout neutral">
              <ShieldCheck size={17} />
              <span>
                Modul curent: {mode}. Rolurile sunt simulate; nu există
                conectare la sisteme bancare reale.
              </span>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
function AuditTable({
  events,
  onCase,
}: {
  events: DisputeCase["audit"];
  onCase?: (id: string) => void;
}) {
  return (
    <section className="panel audit-panel">
      <div className="panel-header">
        <h2>Evenimente de audit</h2>
        <button
          className="text-button"
          onClick={() => download("audit.json", events)}
        >
          <Download size={14} />
          Exportă JSON
        </button>
      </div>
      {events.length ? (
        <div className="table-scroll">
          <table className="audit-table">
            <thead>
              <tr>
                <th>Moment</th>
                <th>Eveniment</th>
                <th>Actor</th>
                <th>Caz / Detalii</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.event_id}>
                  <td>{date(e.timestamp, true)}</td>
                  <td>
                    <strong>{eventNames[e.event_type] ?? e.event_type}</strong>
                    <code>{e.event_type}</code>
                  </td>
                  <td>
                    {e.actor_type === "SYSTEM"
                      ? "Sistem"
                      : e.actor_type === "DEMO_CUSTOMER"
                        ? "Client"
                        : e.actor_type === "B2C_SUPERVISOR"
                          ? "Supervizor"
                          : "Agent"}
                  </td>
                  <td>
                    {onCase && (
                      <button
                        className="text-button"
                        onClick={() => onCase(e.case_id)}
                      >
                        {e.case_id}
                        <ArrowUpRight size={11} />
                      </button>
                    )}
                    <details>
                      <summary>
                        Detalii eveniment <ChevronDown size={11} />
                      </summary>
                      <pre>
                        {JSON.stringify(
                          {
                            event_id: e.event_id,
                            actor_id: e.actor_id,
                            correlation_id: e.correlation_id,
                            payload: e.payload,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="Niciun eveniment înregistrat" />
      )}
    </section>
  );
}
