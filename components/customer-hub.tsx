"use client";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  FileCheck2,
  FileText,
  Fingerprint,
  GitBranch,
  LoaderCircle,
  LockKeyhole,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { money, type Role } from "../lib/domain";
import {
  fieldKeys,
  fieldLabels,
  goalLabels,
  purposeLabels,
  type CustomerProfile,
  type ProfileField,
  type FieldKey,
  type Purpose,
  type Proposal,
  type Document,
  type Value,
  type ProductResult,
} from "../lib/frontdoor/domain";
import { hasConsent, missingQuestions } from "../lib/frontdoor/rules";
import { sampleStatement } from "../lib/frontdoor/extraction";

type Brief = {
  id: string;
  timestamp: string;
  facts: ProfileField[];
  missing_fields: FieldKey[];
  missing_documents: string[];
  stale: boolean;
  goal: string;
  linked_case_id: string;
};
type View = CustomerProfile & { handoff_view: Brief | null };
type Summary = {
  id: string;
  name: string;
  goal: CustomerProfile["goal"];
  fields_count: number;
  documents_count: number;
  exceptions: { code: string; message: string }[];
  appointment?: CustomerProfile["appointments"][number];
  linked_case_id: string;
};
type Overview = { profiles: Summary[]; metrics: Record<string, number> };
type Slot = { id: string; branch: string; starts_at: string };
const docLabels: Record<Document["kind"], string> = {
  IDENTITY: "Identitate demo",
  SALARY: "Adeverință salarială",
  BANK_STATEMENT: "Extras de cont",
};
const verifyLabels: Record<ProfileField["verified"], string> = {
  DECLARED: "Declarat",
  DOCUMENT_EXTRACTED: "Extras din document",
  HUMAN_CONFIRMED: "Confirmat de operator",
  SYNTHETIC_VERIFIED: "Verificat sintetic",
  CONFLICT: "Contradicție",
};
const eventLabels: Record<string, string> = {
  INTAKE_COMPLETED: "Intake procesat",
  PROFILE_FIELDS_CONFIRMED: "Date confirmate",
  PROFILE_FIELDS_UPDATED: "Profil completat",
  CONSENT_CHANGED: "Consimțământ actualizat",
  DOCUMENT_EXTRACTED: "Document extras",
  DOCUMENT_REJECTED: "Document respins",
  ELIGIBILITY_EVALUATED: "Eligibilitate evaluată",
  AGENT_FIELDS_ACCESSED: "Acces agent la câmpuri",
  BANKER_BRIEF_PREPARED: "Dosar consilier pregătit",
  APPOINTMENT_BOOKED: "Programare confirmată",
  APPOINTMENT_CANCELLED: "Programare anulată",
  CUSTOMER_CHECKED_IN: "Sosire confirmată",
  HANDOFF_OUTCOME_RECORDED: "Rezultat consemnat",
  CUSTOMER_PROFILE_RESET: "Profil demo resetat",
  UNTRUSTED_STATEMENT_IGNORED: "Instrucțiune neîncredere ignorată",
  HANDOFF_INVALIDATED: "Dosar marcat pentru actualizare",
};
const outcomeLabels: Record<ProductResult["outcome"], string> = {
  POTENTIAL_MATCH: "Compatibil preliminar",
  NEEDS_INFO: "Informații insuficiente",
  NOT_MATCH: "Criterii demo neîndeplinite",
  MANUAL_REVIEW: "Revizuire specializată",
};
const display = (key: FieldKey, value: Value) =>
  key.endsWith("_minor")
    ? money(Number(value))
    : key === "identity_verified"
      ? value
        ? "Da · verificare sintetică"
        : "Nu"
      : key === "employment_type"
        ? ({
            PERMANENT: "Nedeterminat",
            FIXED_TERM: "Determinat",
            SELF_EMPLOYED: "Activitate independentă",
            UNEMPLOYED: "Fără angajare",
          }[String(value)] ?? String(value))
        : String(value);
const stamp = (value: string) =>
  new Intl.DateTimeFormat("ro-RO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Bucharest",
  }).format(new Date(value));
function exportJson(name: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
function FieldInput({
  field,
  value,
  onChange,
  label,
}: {
  field: FieldKey;
  value: Value;
  onChange: (value: Value) => void;
  label: string;
}) {
  if (field === "employment_type")
    return (
      <select
        aria-label={label}
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="PERMANENT">Nedeterminat</option>
        <option value="FIXED_TERM">Determinat</option>
        <option value="SELF_EMPLOYED">Activitate independentă</option>
        <option value="UNEMPLOYED">Fără angajare</option>
      </select>
    );
  if (["identity_verified", "identity_expiry", "full_name"].includes(field))
    return <span className="protected-value">{display(field, value)}</span>;
  return (
    <input
      aria-label={label}
      type="number"
      min="0"
      step={field.endsWith("_minor") ? "0.01" : "1"}
      value={field.endsWith("_minor") ? Number(value) / 100 : Number(value)}
      onChange={(e) =>
        onChange(
          field.endsWith("_minor")
            ? Math.round(Number(e.target.value) * 100)
            : Number(e.target.value),
        )
      }
    />
  );
}
export default function CustomerHub({
  view,
  role,
  onNavigate,
}: {
  view: "intake" | "branch";
  role: Role;
  onNavigate: (path: string) => void;
}) {
  const [overview, setOverview] = useState<Overview>({
    profiles: [],
    metrics: {},
  });
  const [id, setId] = useState("");
  const [profile, setProfile] = useState<View | null>(null);
  const [tab, setTab] = useState("conversation");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [edits, setEdits] = useState<Record<string, Value>>({});
  const [reuseEligibility, setReuseEligibility] = useState(false);
  const [reuseBranch, setReuseBranch] = useState(false);
  const [manualKey, setManualKey] = useState<FieldKey>("budget_minor");
  const [manualValue, setManualValue] = useState<Value>(6500000);
  const [docKind, setDocKind] = useState<Document["kind"]>("IDENTITY");
  const [docName, setDocName] = useState("document-demo.txt");
  const [docText, setDocText] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotId, setSlotId] = useState("");
  const [checkCode, setCheckCode] = useState("");
  const [outcome, setOutcome] = useState("FOLLOW_UP");
  const [outcomeNote, setOutcomeNote] = useState("");
  const [source, setSource] = useState<ProfileField | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const api = async <T,>(endpoint: string, body?: unknown): Promise<T> => {
    const r = await fetch("/api/b2c/frontdoor" + endpoint, {
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
  async function load(customer: string) {
    const [next, all, available] = await Promise.all([
      api<View>("/" + customer),
      api<Overview>(""),
      api<Slot[]>("/" + customer + "/slots"),
    ]);
    setProfile(next);
    setOverview(all);
    setSlots(available);
    const pending = next.proposals.filter((p) => p.status === "PENDING");
    const latest = new Map(pending.map((p) => [p.key, p.id]));
    setSelected([...latest.values()]);
    setEdits({});
  }
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await api("/bootstrap", {});
        const all = await api<Overview>("");
        if (!active) return;
        setOverview(all);
        const query = new URLSearchParams(location.search).get("customer");
        setId(
          all.profiles.some((p) => p.id === query)
            ? query!
            : (all.profiles[0]?.id ?? ""),
        );
      } catch (e) {
        setError((e as Error).message);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const next = await api<View>("/" + id);
        const available = await api<Slot[]>("/" + id + "/slots");
        if (!active) return;
        setProfile(next);
        setSlots(available);
        setSelected([
          ...new Map(
            next.proposals
              .filter((p) => p.status === "PENDING")
              .map((p) => [p.key, p.id]),
          ).values(),
        ]);
        setEdits({});
        setCheckCode("");
        setSlotId("");
      } catch (e) {
        setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);
  const act = async (action: Record<string, unknown>, message: string) => {
    if (!profile || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/" + id + "/actions", {
        ...action,
        expected_version: profile.version,
      });
      await load(id);
      setNotice(message);
      return true;
    } catch (e) {
      setError((e as Error).message);
      await load(id).catch(() => {});
      return false;
    } finally {
      setBusy(false);
    }
  };
  const changeCustomer = (next: string) => {
    setId(next);
    setNotice("");
    setDocText("");
    setTab("conversation");
    history.replaceState(
      {},
      "",
      `/b2c/${view === "intake" ? "intake" : "branch"}?customer=${next}`,
    );
  };
  const reuse: Purpose[] = [
    ...(reuseEligibility ? ["ELIGIBILITY" as const] : []),
    ...(reuseBranch ? ["BRANCH_HANDOFF" as const] : []),
  ];
  const pending =
    profile?.proposals.filter((p) => p.status === "PENDING") ?? [];
  const evaluation = profile?.evaluations.at(-1);
  const evaluationIndex =
    profile?.audit.findLastIndex(
      (e) =>
        e.event_type === "ELIGIBILITY_EVALUATED" &&
        e.payload.evaluation_id === evaluation?.id,
    ) ?? -1;
  const evaluationStale =
    !!evaluation &&
    profile!.audit
      .slice(evaluationIndex + 1)
      .some((e) =>
        [
          "CONSENT_CHANGED",
          "PROFILE_FIELDS_CONFIRMED",
          "PROFILE_FIELDS_UPDATED",
          "DOCUMENT_REJECTED",
          "INTAKE_COMPLETED",
          "DOCUMENT_EXTRACTED",
        ].includes(e.event_type),
      );
  const activeAppointment = profile?.appointments
    .filter((a) => ["BOOKED", "CHECKED_IN"].includes(a.status))
    .at(-1);
  const latestAppointment = profile?.appointments.at(-1);
  const brief = profile?.handoff_view;
  const reusableControls = (
    <div className="reuse-controls">
      <span>Permite reutilizarea câmpurilor confirmate pentru:</span>
      <label>
        <input
          type="checkbox"
          checked={reuseEligibility}
          onChange={(e) => setReuseEligibility(e.target.checked)}
        />
        Eligibilitate demo
      </label>
      <label>
        <input
          type="checkbox"
          checked={reuseBranch}
          onChange={(e) => setReuseBranch(e.target.checked)}
        />
        Pregătirea consilierului
      </label>
    </div>
  );
  const proposalPanel = pending.length ? (
    <section className="panel review-panel">
      <div className="panel-header">
        <div>
          <h2>Confirmă informațiile extrase</h2>
          <p>
            {pending.length} propuneri · nimic nu este aplicat fără confirmare.
          </p>
        </div>
        <span className="counter">{selected.length} selectate</span>
      </div>
      <div className="proposal-list">
        {pending.map((p) => (
          <div
            className={
              "proposal " +
              (p.conflicts_with !== undefined ? "conflicting" : "")
            }
            key={p.id}
          >
            <label>
              <input
                type="checkbox"
                checked={selected.includes(p.id)}
                onChange={(e) =>
                  setSelected((prev) =>
                    e.target.checked
                      ? [
                          ...prev.filter(
                            (id) =>
                              pending.find((q) => q.id === id)?.key !== p.key,
                          ),
                          p.id,
                        ]
                      : prev.filter((id) => id !== p.id),
                  )
                }
              />
              <strong>{fieldLabels[p.key]}</strong>
              <span>
                {p.source_type === "DOCUMENT" ? "Document" : "Declarație"}
              </span>
            </label>
            <FieldInput
              field={p.key}
              value={edits[p.id] ?? p.value}
              label={`Propunere ${fieldLabels[p.key]}`}
              onChange={(v) => setEdits((x) => ({ ...x, [p.id]: v }))}
            />
            {p.conflicts_with !== undefined && (
              <p className="conflict-hint">
                <TriangleAlert size={12} />
                Valoare existentă: {display(p.key, p.conflicts_with)}. Alege
                sursa corectă.
              </p>
            )}
          </div>
        ))}
      </div>
      {reusableControls}
      <div className="review-actions">
        <ShieldCheck size={14} />
        <span>Confirmare umană și sursă păstrate în audit.</span>
        <button
          className="button primary"
          disabled={busy || !selected.length}
          onClick={() =>
            act(
              {
                action: "CONFIRM_FIELDS",
                proposals: selected.map((id) => ({
                  id,
                  ...(edits[id] !== undefined ? { value: edits[id] } : {}),
                })),
                purposes: reuse,
              },
              "Câmpurile confirmate au fost salvate în profilul unic.",
            )
          }
        >
          Confirmă câmpurile selectate
          <Check size={14} />
        </button>
      </div>
    </section>
  ) : null;
  const products = (
    <section className="panel eligibility-panel">
      <div className="panel-header">
        <div>
          <h2>Trasee posibile, verificate prin reguli</h2>
          <p>
            Reguli sintetice · nicio decizie de credit sau ofertă financiară.
          </p>
        </div>
        <button
          className="button"
          disabled={busy || !profile}
          onClick={() =>
            act(
              { action: "EVALUATE" },
              "Evaluarea demonstrativă a fost salvată.",
            )
          }
        >
          <GitBranch size={14} />
          Evaluează traseele
        </button>
      </div>
      {evaluation ? (
        <>
          {evaluationStale && (
            <div className="callout neutral" style={{ margin: "16px 20px 0" }}>
              <Clock3 size={15} />
              Datele s-au schimbat după această evaluare. Rulează din nou
              regulile pentru un rezultat actual.
            </div>
          )}
          <div className="product-grid">
            {evaluation.products.map((product) => (
              <div className="product-result" key={product.id}>
                <div>
                  <span
                    className={"result-badge " + product.outcome.toLowerCase()}
                  >
                    {outcomeLabels[product.outcome]}
                  </span>
                  <h3>{product.name}</h3>
                </div>
                <div className="product-rules">
                  {product.rules.map((rule) => (
                    <details key={rule.id}>
                      <summary>
                        <span
                          className={"rule-marker " + rule.status.toLowerCase()}
                        >
                          {rule.status === "PASS" ? (
                            <Check size={12} />
                          ) : rule.status === "FAIL" ? (
                            <X size={12} />
                          ) : (
                            <Clock3 size={12} />
                          )}
                        </span>
                        <span>{rule.label}</span>
                        <code>{rule.id}</code>
                      </summary>
                      <p>{rule.detail}</p>
                    </details>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {evaluation.exceptions.length > 0 && (
            <div className="hub-exceptions">
              {evaluation.exceptions.map((e) => (
                <div key={e.code}>
                  <TriangleAlert size={15} />
                  <span>
                    <strong>{e.code}</strong>
                    {e.message}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="eligibility-meta">
            <span>
              {evaluation.rulebook_version} · {stamp(evaluation.timestamp)}
            </span>
            <span>
              {evaluation.missing_documents.length} documente lipsă ·{" "}
              {evaluation.missing_fields.length} câmpuri indisponibile
            </span>
          </div>
        </>
      ) : (
        <div className="hub-empty">
          <GitBranch size={25} />
          <h3>Întâi dovezile, apoi traseul.</h3>
          <p>
            Evaluarea citește numai câmpurile permise. Datele lipsă sau
            contradictorii devin excepții explicite.
          </p>
        </div>
      )}
    </section>
  );
  return (
    <div className="customer-hub">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {view === "intake"
              ? "ONEFRONT DOOR · PROFIL UNIC"
              : "SMART BRANCH HANDOFF · DOSAR PREGĂTIT"}
          </div>
          <h1>
            {view === "intake"
              ? "Spune o dată. Continuă de oriunde."
              : "Consilierul este pregătit înainte să ajungi."}
          </h1>
          <p>
            {view === "intake"
              ? "O singură memorie a clientului. Agenți specializați, cu acces doar la datele necesare."
              : "De la intenție și documente la programare, check-in și predare către un angajat."}
          </p>
        </div>
        <button
          className="button"
          onClick={() =>
            onNavigate(
              `/b2c/${view === "intake" ? "branch" : "intake"}${id ? "?customer=" + id : ""}`,
            )
          }
        >
          {view === "intake" ? (
            <CalendarDays size={15} />
          ) : (
            <UserRound size={15} />
          )}{" "}
          {view === "intake"
            ? "Deschide Branch Handoff"
            : "Deschide profilul unic"}
          <ArrowRight size={14} />
        </button>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          <TriangleAlert size={17} />
          {error}
          <button
            onClick={() => setError("")}
            aria-label="Închide eroarea modulului"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {notice && (
        <div className="hub-notice" role="status">
          <CheckCircle2 size={16} />
          {notice}
          <button
            onClick={() => setNotice("")}
            aria-label="Închide confirmarea"
          >
            <X size={13} />
          </button>
        </div>
      )}
      <div className="hub-metrics">
        {[
          [
            view === "intake" ? "Profiluri canonice" : "Programări active",
            overview.metrics[
              view === "intake" ? "total" : "active_appointments"
            ] ?? 0,
            view === "intake" ? (
              <UserRound size={18} />
            ) : (
              <CalendarDays size={18} />
            ),
          ],
          [
            "Câmpuri confirmate",
            overview.metrics.verified_fields ?? 0,
            <ShieldCheck size={18} />,
          ],
          [
            "Parcursuri finalizate",
            overview.metrics.completed ?? 0,
            <CheckCircle2 size={18} />,
          ],
          [
            "Profiluri cu excepții",
            overview.metrics.exceptions ?? 0,
            <TriangleAlert size={18} />,
          ],
        ].map(([label, value, icon], i) => (
          <div key={i}>
            <span>
              {label}
              {icon}
            </span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="hub-selector panel">
        <div>
          <span className="avatar">
            {profile?.name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2) ?? "CL"}
          </span>
          <label htmlFor="canonical-customer">
            PROFIL SINTETIC
            <select
              id="canonical-customer"
              aria-label="Profil canonic"
              value={id}
              onChange={(e) => changeCustomer(e.target.value)}
            >
              {overview.profiles.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name} · {p.id}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="hub-selector-meta">
          <span className="tag">
            {profile ? goalLabels[profile.goal] : "Se încarcă"}
          </span>
          <span>v{profile?.version ?? "—"} · AES-256-GCM</span>
          <button
            className="text-button"
            onClick={() =>
              profile && onNavigate("/b2c/disputes/" + profile.linked_case_id)
            }
          >
            Dosarul de dispută
            <ArrowUpRight size={13} />
          </button>
          <button
            className="icon-button"
            aria-label="Reîncarcă profilul"
            disabled={busy || !id}
            onClick={() => load(id).catch((e) => setError(e.message))}
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>
      {loading ? (
        <div className="hub-empty">
          <LoaderCircle className="spin" />
          <h3>Se încarcă profilul securizat…</h3>
        </div>
      ) : !profile ? (
        <div className="hub-empty">Niciun profil disponibil.</div>
      ) : (
        <>
          <div className="journey-progress">
            {[
              ["Intake", profile.messages.length > 0],
              ["Profil unic", Object.keys(profile.fields).length > 1],
              [
                "Documente",
                profile.documents.some((d) => d.status === "CONFIRMED"),
              ],
              ["Reguli", !!evaluation],
              ["Predare", !!profile.brief],
            ].map(([label, done], i) => (
              <div key={i} className={done ? "done" : ""}>
                <span>{done ? <Check size={11} /> : i + 1}</span>
                {label}
                {i < 4 && <i />}
              </div>
            ))}
          </div>
          {view === "intake" ? (
            <>
              <div className="hub-tabs">
                {[
                  ["conversation", "Intake & clarificări"],
                  ["profile", "Profil & acorduri"],
                  ["documents", "Documente"],
                  ["agents", "Agenți & audit"],
                ].map(([key, label]) => (
                  <button
                    className={tab === key ? "active" : ""}
                    key={key}
                    onClick={() => setTab(key)}
                  >
                    {label}
                    {key === "documents" && profile.documents.length > 0 && (
                      <span>{profile.documents.length}</span>
                    )}
                  </button>
                ))}
              </div>
              {tab === "conversation" ? (
                <>
                  <div className="intake-columns">
                    <section className="panel intake-conversation">
                      <div className="panel-header">
                        <div>
                          <h2>
                            <MessageSquare size={16} />
                            Un singur punct de intrare
                          </h2>
                          <p>
                            Conversația este separată de datele confirmate ale
                            profilului.
                          </p>
                        </div>
                        <span className="tag muted">DEMO SINTETIC</span>
                      </div>
                      <div className="intake-messages">
                        {profile.messages.length ? (
                          profile.messages.map((message) => (
                            <div
                              className={
                                "intake-bubble " + message.role.toLowerCase()
                              }
                              key={message.id}
                            >
                              <span>
                                {message.role === "CUSTOMER"
                                  ? profile.name
                                  : "Asistent intake"}
                              </span>
                              <p>{message.text}</p>
                              <small>{stamp(message.timestamp)}</small>
                            </div>
                          ))
                        ) : (
                          <div className="conversation-intro">
                            <span>
                              <Sparkles size={26} />
                            </span>
                            <h2>Cu ce te putem ajuta astăzi?</h2>
                            <p>
                              Descrie-ne ce s-a schimbat și ce vrei să faci.
                              Cerem doar informațiile care lipsesc.
                            </p>
                            <button
                              className="example-prompt"
                              onClick={() => setText(sampleStatement)}
                            >
                              „Mi-am schimbat jobul, plătesc chirie și vreau să
                              cumpăr o mașină.”
                              <ArrowUpRight size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="intake-compose">
                        <textarea
                          aria-label="Mesaj intake"
                          placeholder="Scrie intenția și informațiile relevante…"
                          value={text}
                          onChange={(e) => setText(e.target.value)}
                          maxLength={5000}
                        />
                        <div>
                          <button
                            className="text-button"
                            onClick={() => setText(sampleStatement)}
                          >
                            Folosește exemplul sintetic
                          </button>
                          <button
                            className="button primary"
                            disabled={busy || text.trim().length < 5}
                            onClick={async () => {
                              if (
                                await act(
                                  { action: "INTAKE", text },
                                  "Intenția și informațiile propuse au fost procesate.",
                                )
                              )
                                setText("");
                            }}
                          >
                            {busy ? (
                              <LoaderCircle className="spin" size={14} />
                            ) : (
                              <Send size={14} />
                            )}
                            Procesează mesajul
                          </button>
                        </div>
                      </div>
                    </section>
                    <aside className="panel missing-panel">
                      <div className="panel-header">
                        <h2>Doar ce mai lipsește</h2>
                        <span className="counter">
                          {missingQuestions(profile).length}
                        </span>
                      </div>
                      <p className="hub-description">
                        Câmpurile existente sunt reutilizate; nu sunt cerute din
                        nou.
                      </p>
                      <div className="missing-fields">
                        {missingQuestions(profile).map((q) => (
                          <button
                            key={q.key}
                            onClick={() => {
                              setManualKey(
                                q.key.startsWith("identity_") ? "age" : q.key,
                              );
                              setManualValue(
                                q.key === "employment_type" ? "PERMANENT" : 0,
                              );
                              if (q.key.startsWith("identity_"))
                                setTab("documents");
                            }}
                          >
                            <CircleDot />
                            {fieldLabels[q.key]}
                            <ArrowRight size={12} />
                          </button>
                        ))}
                        {!missingQuestions(profile).length && (
                          <p>
                            <CheckCircle2 size={15} />
                            {profile.goal === "UNKNOWN"
                              ? "Începe prin clarificarea intenției."
                              : profile.goal === "BUSINESS"
                                ? "Transfer către echipa B2B."
                                : "Toate câmpurile necesare sunt cunoscute."}
                          </p>
                        )}
                      </div>
                      <div className="manual-fields">
                        <label htmlFor="manual-field">
                          Completează sau corectează un câmp
                        </label>
                        <select
                          id="manual-field"
                          value={manualKey}
                          onChange={(e) => {
                            setManualKey(e.target.value as FieldKey);
                            setManualValue(
                              e.target.value === "employment_type"
                                ? "PERMANENT"
                                : 0,
                            );
                          }}
                        >
                          {fieldKeys
                            .filter(
                              (k) =>
                                ![
                                  "full_name",
                                  "identity_verified",
                                  "identity_expiry",
                                ].includes(k),
                            )
                            .map((k) => (
                              <option value={k} key={k}>
                                {fieldLabels[k]}
                                {k.endsWith("_minor") ? " (RON)" : ""}
                              </option>
                            ))}
                        </select>
                        <FieldInput
                          field={manualKey}
                          value={manualValue}
                          onChange={setManualValue}
                          label="Valoare câmp manual"
                        />
                        {reusableControls}
                        <button
                          className="button full"
                          disabled={busy}
                          onClick={() =>
                            act(
                              {
                                action: "UPDATE_FIELDS",
                                fields: [
                                  { key: manualKey, value: manualValue },
                                ],
                                purposes: reuse,
                              },
                              "Informația a fost salvată cu proveniență și confirmare umană.",
                            )
                          }
                        >
                          <Check size={14} />
                          Salvează în profil
                        </button>
                      </div>
                    </aside>
                  </div>
                  {proposalPanel}
                  {products}
                </>
              ) : null}
              {tab === "profile" ? (
                <>
                  <section className="panel canonical-panel">
                    <div className="panel-header">
                      <div>
                        <h2>Profilul canonic al clientului</h2>
                        <p>
                          Fiecare câmp păstrează sursa, starea verificării și
                          istoricul corecțiilor.
                        </p>
                      </div>
                      <span className="tag">
                        <LockKeyhole size={12} />
                        CRIPTAT
                      </span>
                    </div>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Câmp</th>
                            <th>Valoare</th>
                            <th>Verificare</th>
                            <th>Proveniență</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.values(profile.fields).map(
                            (f) =>
                              f && (
                                <tr key={f.key}>
                                  <td>{fieldLabels[f.key]}</td>
                                  <td>
                                    <strong>{display(f.key, f.value)}</strong>
                                  </td>
                                  <td>
                                    <span className="verification-tag">
                                      {verifyLabels[f.verified]}
                                    </span>
                                  </td>
                                  <td>
                                    <button
                                      className="text-button"
                                      onClick={() => setSource(f)}
                                    >
                                      {f.source_type === "DOCUMENT"
                                        ? "Document"
                                        : f.source_type === "STATEMENT"
                                          ? "Declarație"
                                          : f.source_type === "FORM"
                                            ? "Formular"
                                            : "Identitate sintetică"}
                                      <ArrowUpRight size={12} />
                                    </button>
                                    <small>{stamp(f.updated_at)}</small>
                                  </td>
                                </tr>
                              ),
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>
                  <section className="panel consent-panel">
                    <div className="panel-header">
                      <div>
                        <h2>Datele tale, scopuri explicite</h2>
                        <p>
                          O permisiune se aplică unui câmp și unui scop. Poți
                          revoca accesul oricând.
                        </p>
                      </div>
                      <ShieldCheck size={18} />
                    </div>
                    <div className="consent-bulk">
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() =>
                          act(
                            {
                              action: "CONSENT",
                              field_keys: Object.keys(profile.fields),
                              purpose: "ELIGIBILITY",
                              granted: true,
                            },
                            "Accesul la câmpurile existente pentru eligibilitate a fost permis.",
                          )
                        }
                      >
                        Permite pentru eligibilitate
                      </button>
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() =>
                          act(
                            {
                              action: "CONSENT",
                              field_keys: Object.keys(profile.fields),
                              purpose: "BRANCH_HANDOFF",
                              granted: true,
                            },
                            "Accesul consilierului la câmpurile existente a fost permis.",
                          )
                        }
                      >
                        Permite pentru consilier
                      </button>
                      <span>Câmpurile viitoare necesită acord separat.</span>
                    </div>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Câmp</th>
                            {(
                              [
                                "INTAKE",
                                "ELIGIBILITY",
                                "BRANCH_HANDOFF",
                                "DISPUTE_SUPPORT",
                              ] as Purpose[]
                            ).map((p) => (
                              <th key={p}>{purposeLabels[p]}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {Object.values(profile.fields).map(
                            (f) =>
                              f && (
                                <tr key={f.key}>
                                  <td>{fieldLabels[f.key]}</td>
                                  {(
                                    [
                                      "INTAKE",
                                      "ELIGIBILITY",
                                      "BRANCH_HANDOFF",
                                      "DISPUTE_SUPPORT",
                                    ] as Purpose[]
                                  ).map((purpose) => (
                                    <td key={purpose}>
                                      <input
                                        type="checkbox"
                                        aria-label={`${fieldLabels[f.key]} · ${purposeLabels[purpose]}`}
                                        checked={hasConsent(
                                          profile,
                                          f.key,
                                          purpose,
                                        )}
                                        disabled={busy}
                                        onChange={(e) =>
                                          act(
                                            {
                                              action: "CONSENT",
                                              field_keys: [f.key],
                                              purpose,
                                              granted: e.target.checked,
                                            },
                                            e.target.checked
                                              ? "Permisiunea a fost acordată."
                                              : "Permisiunea a fost revocată. Dosarul consilierului va reflecta schimbarea.",
                                          )
                                        }
                                      />
                                    </td>
                                  ))}
                                </tr>
                              ),
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>
                  {products}
                </>
              ) : null}
              {tab === "documents" ? (
                <>
                  <div className="document-type-cards">
                    {Object.entries(docLabels).map(([kind, label]) => {
                      const doc = profile.documents
                        .filter((d) => d.kind === kind)
                        .at(-1);
                      return (
                        <button
                          key={kind}
                          className={docKind === kind ? "selected" : ""}
                          onClick={() => {
                            setDocKind(kind as Document["kind"]);
                            setDocText("");
                          }}
                        >
                          <span>
                            {kind === "IDENTITY" ? (
                              <Fingerprint size={22} />
                            ) : kind === "SALARY" ? (
                              <FileCheck2 size={22} />
                            ) : (
                              <FileText size={22} />
                            )}
                          </span>
                          <strong>{label}</strong>
                          <small>
                            {doc?.status === "CONFIRMED"
                              ? "Confirmat"
                              : doc?.status === "EXTRACTED"
                                ? "Așteaptă confirmarea"
                                : doc?.status === "REJECTED"
                                  ? "Respins"
                                  : "Lipsește"}
                          </small>
                        </button>
                      );
                    })}
                  </div>
                  <section className="panel upload-panel">
                    <div className="panel-header">
                      <div>
                        <h2>Extrage informații din documente</h2>
                        <p>
                          Parser pentru documente sintetice TXT. Fără verificare
                          KYC sau OCR bancar real.
                        </p>
                      </div>
                      <Upload size={18} />
                    </div>
                    <div className="upload-actions">
                      <label className="button">
                        <Upload size={14} />
                        Încarcă fișier TXT
                        <input
                          type="file"
                          aria-label="Document sintetic TXT"
                          accept=".txt,text/plain"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              if (file.size > 20000) {
                                setError("Fișierul depășește 20 KB.");
                                return;
                              }
                              setDocName(file.name);
                              setDocText(await file.text());
                            }
                          }}
                        />
                      </label>
                      <button
                        className="button"
                        disabled={busy}
                        onClick={async () => {
                          try {
                            const sample = await api<{
                              name: string;
                              content: string;
                            }>(`/${id}/sample?kind=${docKind}`);
                            setDocName(sample.name);
                            setDocText(sample.content);
                          } catch (e) {
                            setError((e as Error).message);
                          }
                        }}
                      >
                        <FileText size={14} />
                        Încarcă exemplul sintetic
                      </button>
                      <span>{docName}</span>
                    </div>
                    <textarea
                      aria-label="Conținut document sintetic"
                      value={docText}
                      onChange={(e) => setDocText(e.target.value)}
                      placeholder="Conținutul documentului sintetic sau un exemplu generat pentru profilul selectat…"
                      maxLength={20000}
                    />
                    <div className="upload-footer">
                      <span>
                        <LockKeyhole size={13} />
                        Conținutul și câmpurile sunt criptate pe server.
                      </span>
                      <button
                        className="button primary"
                        disabled={busy || docText.length < 5}
                        onClick={async () => {
                          if (
                            await act(
                              {
                                action: "UPLOAD_DOCUMENT",
                                kind: docKind,
                                name: docName,
                                content: docText,
                              },
                              "Documentul a fost extras. Confirmă separat câmpurile propuse.",
                            )
                          )
                            setDocText("");
                        }}
                      >
                        <Sparkles size={14} />
                        Extrage documentul
                      </button>
                    </div>
                  </section>
                  {proposalPanel}
                  {profile.documents.length > 0 && (
                    <section className="panel document-history">
                      <div className="panel-header">
                        <h2>Documente și versiuni</h2>
                        <span>{profile.documents.length} surse</span>
                      </div>
                      {[...profile.documents].reverse().map((d) => (
                        <div key={d.id}>
                          <FileText size={17} />
                          <span>
                            <strong>{d.name}</strong>
                            <small>
                              {docLabels[d.kind]} · {stamp(d.created_at)}
                            </small>
                          </span>
                          <span className="verification-tag">
                            {d.status === "CONFIRMED"
                              ? "Confirmat"
                              : d.status === "REJECTED"
                                ? "Respins"
                                : "Extras"}
                          </span>
                          {d.status !== "REJECTED" && (
                            <button
                              className="text-button"
                              disabled={busy}
                              onClick={() =>
                                act(
                                  {
                                    action: "REJECT_DOCUMENT",
                                    document_id: d.id,
                                  },
                                  "Documentul a fost respins. Câmpurile care depindeau de el au fost retrase.",
                                )
                              }
                            >
                              Respinge
                            </button>
                          )}
                        </div>
                      ))}
                    </section>
                  )}
                </>
              ) : null}
              {tab === "agents" ? (
                <>
                  <section className="panel agent-architecture">
                    <div className="panel-header">
                      <div>
                        <h2>O memorie comună, acces specializat</h2>
                        <p>
                          Politici de acces executate pe server, la nivel de
                          câmp și scop.
                        </p>
                      </div>
                      <GitBranch size={18} />
                    </div>
                    <div className="architecture-flow">
                      <span>Intake</span>
                      <ArrowRight size={16} />
                      <strong>Profil canonic criptat</strong>
                      <ArrowRight size={16} />
                      <span>Reguli deterministe</span>
                      <ArrowRight size={16} />
                      <strong>Angajat</strong>
                    </div>
                    <div className="agent-step-list">
                      {profile.agent_steps.length ? (
                        [...profile.agent_steps].reverse().map((step) => (
                          <details key={step.id}>
                            <summary>
                              <span>
                                <ShieldCheck size={15} />
                                {step.agent}
                              </span>
                              <span>
                                {step.fields_read.length} citite ·{" "}
                                {step.denied_fields.length} protejate
                              </span>
                              <ChevronDown size={13} />
                            </summary>
                            <div>
                              <p>Scop: {purposeLabels[step.purpose]}</p>
                              <p>
                                Citite:{" "}
                                {step.fields_read
                                  .map((k) => fieldLabels[k])
                                  .join(", ") || "Niciun câmp"}
                              </p>
                              <p>
                                Blocate:{" "}
                                {step.denied_fields
                                  .map((k) => fieldLabels[k])
                                  .join(", ") || "Niciun câmp"}
                              </p>
                              <small>{stamp(step.timestamp)}</small>
                            </div>
                          </details>
                        ))
                      ) : (
                        <div className="hub-empty">
                          Procesează un mesaj sau o evaluare pentru a vedea
                          apelurile reale.
                        </div>
                      )}
                    </div>
                  </section>
                  <HubAudit profile={profile} />
                </>
              ) : null}
            </>
          ) : (
            <>
              <div className="branch-layout">
                <div className="branch-main">
                  <section className="panel banker-brief">
                    <div className="panel-header">
                      <div>
                        <h2>
                          <FileCheck2 size={17} />
                          Banker Copilot · dosarul întâlnirii
                        </h2>
                        <p>
                          Rezumat din câmpuri cu permisiune, dovezi și
                          informații lipsă.
                        </p>
                      </div>
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() =>
                          act(
                            { action: "PREPARE_HANDOFF" },
                            "Dosarul consilierului a fost pregătit din datele permise.",
                          )
                        }
                      >
                        <Sparkles size={14} />
                        {brief ? "Actualizează dosarul" : "Pregătește dosarul"}
                      </button>
                    </div>
                    {brief ? (
                      <div className="brief-content">
                        {brief.stale && (
                          <div className="callout danger">
                            <TriangleAlert size={16} />
                            Profilul sau acordurile s-au schimbat. Actualizează
                            dosarul înainte de continuare.
                          </div>
                        )}
                        <div className="brief-summary">
                          <span className="tag">
                            {goalLabels[profile.goal]}
                          </span>
                          <h2>{profile.name}</h2>
                          <p>
                            {brief.facts.length} informații disponibile pentru
                            consilier ·{" "}
                            {
                              profile.documents.filter(
                                (d) => d.status === "CONFIRMED",
                              ).length
                            }{" "}
                            documente confirmate.
                          </p>
                        </div>
                        <div className="brief-facts">
                          {brief.facts.map((f) => (
                            <button key={f.key} onClick={() => setSource(f)}>
                              <span>{fieldLabels[f.key]}</span>
                              <strong>{display(f.key, f.value)}</strong>
                              <small>
                                {verifyLabels[f.verified]}
                                <ArrowUpRight size={11} />
                              </small>
                            </button>
                          ))}
                        </div>
                        {brief.missing_fields.length > 0 && (
                          <div className="brief-missing">
                            <h3>De clarificat în întâlnire</h3>
                            {brief.missing_fields.map((k) => (
                              <p key={k}>
                                <MessageSquare size={13} />
                                {profile.fields[k]
                                  ? `Confirmă permisiunea de utilizare: ${fieldLabels[k]}.`
                                  : `Clarifică ${fieldLabels[k].toLocaleLowerCase("ro")}.`}
                              </p>
                            ))}
                          </div>
                        )}
                        <div className="brief-docs">
                          <h3>Pregătirea documentelor</h3>
                          {Object.entries(docLabels).map(([kind, label]) => (
                            <div key={kind}>
                              {profile.documents.some(
                                (d) =>
                                  d.kind === kind && d.status === "CONFIRMED",
                              ) ? (
                                <CheckCircle2 size={15} />
                              ) : (
                                <Clock3 size={15} />
                              )}
                              <span>{label}</span>
                              <small>
                                {profile.documents.some(
                                  (d) =>
                                    d.kind === kind && d.status === "CONFIRMED",
                                )
                                  ? "Confirmat"
                                  : "De completat"}
                              </small>
                            </div>
                          ))}
                        </div>
                        <div className="brief-footer">
                          <ShieldCheck size={13} />
                          Sursele și accesul agenților sunt înregistrate.{" "}
                          <button
                            onClick={() =>
                              onNavigate("/b2c/intake?customer=" + id)
                            }
                          >
                            Revizuiește profilul
                            <ArrowRight size={11} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="hub-empty">
                        <FileCheck2 size={30} />
                        <h3>Un dosar pregătit, o conversație mai bună.</h3>
                        <p>
                          Confirmă acordul pentru pregătirea consilierului în
                          profilul unic, apoi generează dosarul. Informațiile
                          necunoscute rămân întrebări explicite.
                        </p>
                      </div>
                    )}
                  </section>
                  {products}
                  {evaluation?.exceptions.length ? (
                    <section className="panel branch-exceptions">
                      <div className="panel-header">
                        <h2>Coada de excepții pentru acest client</h2>
                        <TriangleAlert size={17} />
                      </div>
                      {evaluation.exceptions.map((e) => (
                        <div key={e.code}>
                          <TriangleAlert size={17} />
                          <span>
                            <strong>{e.code}</strong>
                            <p>{e.message}</p>
                          </span>
                          <button
                            className="text-button"
                            onClick={() =>
                              onNavigate("/b2c/intake?customer=" + id)
                            }
                          >
                            Revizuiește
                            <ArrowRight size={12} />
                          </button>
                        </div>
                      ))}
                    </section>
                  ) : null}
                </div>
                <aside className="branch-side">
                  <section className="panel appointment-panel">
                    <div className="panel-header">
                      <h2>Programare în sucursală</h2>
                      <CalendarDays size={17} />
                    </div>
                    {activeAppointment ? (
                      <div className="appointment-content">
                        <span className="tag">
                          {activeAppointment.status === "CHECKED_IN"
                            ? "CLIENT SOSIT"
                            : "PROGRAMARE DEMO"}
                        </span>
                        <h3>{activeAppointment.branch}</h3>
                        <p>
                          <CalendarDays size={15} />
                          {stamp(activeAppointment.starts_at)}
                        </p>
                        <div className="checkin-code">
                          <span>COD DE CONFIRMARE ÎN APLICAȚIE</span>
                          <strong>{activeAppointment.code}</strong>
                          <small>
                            Cod sintetic pentru a demonstra check-in-ul.
                          </small>
                        </div>
                        {activeAppointment.status === "BOOKED" ? (
                          <>
                            <label
                              className="field-label"
                              htmlFor="check-in-code"
                            >
                              CONFIRMĂ SOSIREA CLIENTULUI
                            </label>
                            <input
                              id="check-in-code"
                              aria-label="Cod check-in"
                              placeholder="Introdu codul de mai sus"
                              value={checkCode}
                              onChange={(e) => setCheckCode(e.target.value)}
                              maxLength={20}
                            />
                            <button
                              className="button primary full"
                              disabled={busy || !checkCode.trim()}
                              onClick={() =>
                                act(
                                  {
                                    action: "CHECK_IN",
                                    appointment_id: activeAppointment.id,
                                    code: checkCode,
                                  },
                                  "Sosirea clientului a fost confirmată.",
                                )
                              }
                            >
                              <Check size={14} />
                              Confirmă check-in
                            </button>
                            <button
                              className="button subtle full"
                              disabled={busy}
                              onClick={() =>
                                act(
                                  {
                                    action: "CANCEL_APPOINTMENT",
                                    appointment_id: activeAppointment.id,
                                  },
                                  "Programarea a fost anulată. Intervalul este disponibil din nou.",
                                )
                              }
                            >
                              Anulează programarea demo
                            </button>
                          </>
                        ) : (
                          <>
                            <div className="callout success">
                              <CheckCircle2 size={16} />
                              Clientul a confirmat sosirea.
                            </div>
                            <label
                              className="field-label"
                              htmlFor="handoff-outcome"
                            >
                              REZULTAT DECIS DE ANGAJAT
                            </label>
                            <select
                              id="handoff-outcome"
                              value={outcome}
                              onChange={(e) => setOutcome(e.target.value)}
                            >
                              <option value="FOLLOW_UP">
                                Clarificări / urmărire ulterioară
                              </option>
                              <option value="APPLICATION_DEMO">
                                Continuă cu o cerere demo
                              </option>
                              <option value="ESCALATED">
                                Escalare către specialist
                              </option>
                            </select>
                            <textarea
                              aria-label="Notă rezultat întâlnire"
                              value={outcomeNote}
                              onChange={(e) => setOutcomeNote(e.target.value)}
                              placeholder="Consemnează rezultatul întâlnirii…"
                              maxLength={2000}
                            />
                            <button
                              className="button primary full"
                              disabled={
                                busy || outcomeNote.trim().length < 5 || !brief
                              }
                              onClick={() =>
                                act(
                                  {
                                    action: "COMPLETE_HANDOFF",
                                    appointment_id: activeAppointment.id,
                                    outcome,
                                    note: outcomeNote,
                                  },
                                  "Rezultatul întâlnirii a fost salvat în audit.",
                                )
                              }
                            >
                              <CheckCircle2 size={14} />
                              Salvează rezultatul
                            </button>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="appointment-content">
                        {latestAppointment && (
                          <div className="previous-appointment">
                            <CheckCircle2 size={17} />
                            <div>
                              <strong>
                                {latestAppointment.status === "CANCELLED"
                                  ? "Programare anulată"
                                  : latestAppointment.status === "ESCALATED"
                                    ? "Întâlnire escaladată"
                                    : "Întâlnire finalizată"}
                              </strong>
                              <p>
                                {latestAppointment.note ??
                                  latestAppointment.branch}
                              </p>
                            </div>
                          </div>
                        )}
                        <p className="hub-description">
                          Alege un interval sintetic. Programarea nu rezervă o
                          întâlnire la o bancă reală.
                        </p>
                        <label
                          className="field-label"
                          htmlFor="appointment-slot"
                        >
                          INTERVALE DISPONIBILE
                        </label>
                        <select
                          id="appointment-slot"
                          aria-label="Interval programare"
                          value={slotId}
                          onChange={(e) => setSlotId(e.target.value)}
                        >
                          <option value="">Selectează intervalul</option>
                          {slots.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.branch} · {stamp(s.starts_at)}
                            </option>
                          ))}
                        </select>
                        <button
                          className="button primary full"
                          disabled={busy || !slotId}
                          onClick={() =>
                            act(
                              { action: "BOOK_APPOINTMENT", slot_id: slotId },
                              "Programarea demonstrativă a fost confirmată.",
                            )
                          }
                        >
                          <CalendarDays size={15} />
                          Confirmă programarea demo
                        </button>
                        <span className="appointment-fine">
                          <LockKeyhole size={12} />
                          Necesită acordul pentru nume în scopul predării către
                          consilier.
                        </span>
                      </div>
                    )}
                  </section>
                  <div className="human-note">
                    <ShieldCheck size={18} />
                    <div>
                      <strong>Angajatul decide următorul pas.</strong>
                      <p>
                        Compatibilitatea cu regulile sintetice este doar
                        preliminară. Nicio cerere de credit reală nu este
                        inițiată.
                      </p>
                    </div>
                  </div>
                  <section className="panel mini-queue">
                    <div className="panel-header">
                      <h2>Alte programări</h2>
                      <span>{overview.metrics.active_appointments ?? 0}</span>
                    </div>
                    {overview.profiles
                      .filter((p) => p.appointment && p.id !== id)
                      .map((p) => (
                        <button key={p.id} onClick={() => changeCustomer(p.id)}>
                          <UserRound size={15} />
                          <span>
                            <strong>{p.name}</strong>
                            <small>{stamp(p.appointment!.starts_at)}</small>
                          </span>
                          <ArrowRight size={13} />
                        </button>
                      ))}
                    {!overview.profiles.some(
                      (p) => p.appointment && p.id !== id,
                    ) && (
                      <p className="panel-empty">
                        Nicio altă programare activă.
                      </p>
                    )}
                  </section>
                </aside>
              </div>
              <HubAudit profile={profile} />
            </>
          )}
          <div className="hub-footer">
            <span>
              <LockKeyhole size={13} />
              Date sintetice · Criptare pe server · Acces pe câmpuri
            </span>
            {role === "B2C_SUPERVISOR" && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => setResetConfirm(true)}
              >
                <RefreshCw size={12} />
                Resetează acest profil demo
              </button>
            )}
          </div>
        </>
      )}
      {source && (
        <div className="modal-backdrop" onClick={() => setSource(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Proveniență câmp"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="Închide proveniența"
              onClick={() => setSource(null)}
            >
              <X size={18} />
            </button>
            <span className="tag">
              <FileCheck2 size={13} />
              PROVENIENȚĂ VERIFICABILĂ
            </span>
            <h2>{fieldLabels[source.key]}</h2>
            <p>{display(source.key, source.value)}</p>
            <dl className="evidence-meta">
              <div>
                <dt>Referință</dt>
                <dd>{source.source_id}</dd>
              </div>
              <div>
                <dt>Verificare</dt>
                <dd>{verifyLabels[source.verified]}</dd>
              </div>
              <div>
                <dt>Moment</dt>
                <dd>{source.updated_at}</dd>
              </div>
            </dl>
            {profile?.documents.find((d) => d.id === source.source_id) && (
              <pre>
                {
                  profile.documents.find((d) => d.id === source.source_id)!
                    .content
                }
              </pre>
            )}
            {profile?.messages.find((m) => m.id === source.source_id) && (
              <blockquote className="source-statement">
                {profile.messages.find((m) => m.id === source.source_id)!.text}
              </blockquote>
            )}
            <p className="small-muted">
              {profile?.field_history.filter((f) => f.key === source.key)
                .length ?? 0}{" "}
              valori anterioare păstrate pentru acest câmp.
            </p>
          </section>
        </div>
      )}
      {resetConfirm && (
        <div className="modal-backdrop">
          <section
            className="modal compact"
            role="dialog"
            aria-modal="true"
            aria-label="Resetare profil"
          >
            <RefreshCw size={25} />
            <h2>Resetează profilul sintetic</h2>
            <p>
              Datele și programările acestui profil revin la starea inițială.
              Auditul rămâne păstrat. Dosarul de dispută nu este modificat.
            </p>
            <div className="modal-actions">
              <button className="button" onClick={() => setResetConfirm(false)}>
                Anulează
              </button>
              <button
                className="button primary"
                disabled={busy}
                onClick={async () => {
                  if (
                    await act(
                      { action: "RESET_PROFILE" },
                      "Profilul sintetic a fost resetat.",
                    )
                  )
                    setResetConfirm(false);
                }}
              >
                Resetează profilul
              </button>
            </div>
          </section>
        </div>
      )}
      {busy && (
        <div className="busy-indicator" role="status">
          <LoaderCircle size={14} className="spin" />
          Se salvează operațiunea…
        </div>
      )}
    </div>
  );
}
function CircleDot() {
  return <span className="missing-dot" />;
}
function HubAudit({ profile }: { profile: CustomerProfile }) {
  return (
    <section className="panel hub-audit">
      <div className="panel-header">
        <div>
          <h2>Auditul parcursului</h2>
          <p>
            Evenimente persistente; valorile câmpurilor nu sunt copiate în
            jurnal.
          </p>
        </div>
        <button
          className="text-button"
          onClick={() =>
            exportJson("journey-audit-" + profile.id + ".json", profile.audit)
          }
        >
          <Download size={14} />
          Exportă auditul
        </button>
      </div>
      {profile.audit.length ? (
        <div className="hub-audit-rows">
          {[...profile.audit]
            .reverse()
            .slice(0, 60)
            .map((e) => (
              <details key={e.event_id}>
                <summary>
                  <span>{stamp(e.timestamp)}</span>
                  <strong>{eventLabels[e.event_type] ?? e.event_type}</strong>
                  <small>
                    {e.actor_type === "SYSTEM"
                      ? "Orchestrator"
                      : "Angajat demo"}
                  </small>
                  <ChevronDown size={12} />
                </summary>
                <pre>
                  {JSON.stringify(
                    {
                      event_id: e.event_id,
                      correlation_id: e.correlation_id,
                      payload: e.payload,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
            ))}
        </div>
      ) : (
        <p className="panel-empty">
          Evenimentele vor apărea după prima acțiune.
        </p>
      )}
    </section>
  );
}
