"use client";
import { useEffect, useState } from "react";
import {
  CheckCircle2,
  FileText,
  LoaderCircle,
  Network,
  Send,
  ShieldCheck,
  Signature,
  TriangleAlert,
  X,
} from "lucide-react";
import type { Document, Task, Value } from "../lib/operations/domain";
import { documentLabels, type Field } from "../lib/operations/catalog";
import {
  api,
  DocumentPreview,
  FormField,
  WorkflowState,
} from "./operations-hub";
type MobileCase = {
  id: string;
  reference: string;
  workflow_id: string;
  workflow_name: string;
  customer_id: string;
  customer_name: string;
  state: string;
  version: number;
  tasks: Task[];
  documents: Document[];
};
export default function OperationsMobile({
  customerId,
}: {
  customerId: string;
}) {
  const [rows, setRows] = useState<MobileCase[]>([]),
    [selected, setSelected] = useState(""),
    [answers, setAnswers] = useState<Record<string, Value>>({}),
    [documents, setDocuments] = useState<
      Record<string, { kind: string; name: string; content: string }>
    >({}),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [preview, setPreview] = useState<Document | null>(null),
    [checked, setChecked] = useState(false);
  async function refresh() {
    const rows = await api<MobileCase[]>("customer/tasks");
    setRows(rows);
    return rows;
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setAnswers({});
    setDocuments({});
    (async () => {
      try {
        await api("session", {
          role: "DEMO_CUSTOMER",
          customer_id: customerId,
        });
        const rows = await api<MobileCase[]>("customer/tasks");
        if (active) {
          setRows(rows);
          setSelected(
            new URLSearchParams(location.search).get("workflow_case") ??
              rows.find((c) => c.tasks.some((t) => t.status === "PENDING"))
                ?.id ??
              rows[0]?.id ??
              "",
          );
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    const t = setInterval(() => {
      if (document.visibilityState === "visible" && !busy)
        refresh().catch(() => {});
    }, 3000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [customerId]);
  const c = rows.find((c) => c.id === selected) ?? rows[0],
    task = c?.tasks.findLast((t) => t.status === "PENDING"),
    doc = c?.documents.find((d) => d.id === task?.document_id),
    expired = !!task && Date.parse(task.expires_at) < Date.now();
  useEffect(() => {
    setAnswers({});
    setDocuments({});
    setChecked(false);
    setError("");
    if (task) setNotice("");
  }, [task?.id]);
  async function respond(accept?: boolean) {
    if (!c || !task || busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`customer/tasks/${task.id}/respond`, {
        expected_version: c.version,
        ...(task.kind === "SIGNATURE"
          ? {
              accept,
              document_id: doc?.id,
              document_version: doc?.version,
              document_hash: doc?.hash,
            }
          : { answers, documents: Object.values(documents) }),
      });
      await refresh();
      setNotice(
        task.kind === "SIGNATURE"
          ? accept
            ? "Semnarea mock a fost înregistrată."
            : "Refuzul semnării a fost înregistrat. Nu a fost activat niciun produs."
          : "Răspunsul a fost salvat. Dosarul a fost reanalizat.",
      );
      setAnswers({});
      setDocuments({});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ops-customer-panel">
      {loading ? (
        <div className="ops-empty">
          <LoaderCircle className="spin" size={25} />
          <p>Se încarcă dosarele clientului…</p>
        </div>
      ) : (
        <>
          <div className="ops-mobile-case-picker">
            <label>
              Dosar operațional
              <select
                aria-label="Dosar client workflow"
                value={c?.id ?? ""}
                onChange={(e) => setSelected(e.target.value)}
              >
                {rows.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.reference} · {c.workflow_name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="phone pi-phone ops-workflow-phone">
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
                NEXT Mobile<span>DEMO</span>
              </div>
              <div className="mobile-greeting">
                Bună, {c?.customer_name.split(" ")[0] ?? "client"}.
              </div>
              <h2>
                {task?.kind === "SIGNATURE"
                  ? "Revizuiește. Alege."
                  : "Dosarul tău, mai aproape."}
              </h2>
              {c && (
                <div className="ops-mobile-context">
                  <span>
                    {c.reference} · {c.workflow_name}
                  </span>
                  <WorkflowState state={c.state} />
                </div>
              )}
              {error && (
                <div className="ops-mobile-error" role="alert">
                  <TriangleAlert size={15} />
                  <p>{error}</p>
                </div>
              )}
              {notice && (
                <div className="ops-mobile-success" role="status">
                  <CheckCircle2 size={17} />
                  <p>{notice}</p>
                </div>
              )}
              {!c ? (
                <div className="pi-mobile-empty">
                  <FileText size={27} />
                  <h3>Niciun dosar operațional.</h3>
                  <p>Solicitările apar după aprobarea angajatului.</p>
                </div>
              ) : task ? (
                <>
                  <div className="ops-mobile-task">
                    <ShieldCheck size={14} />
                    <span>Solicitare aprobată de angajat</span>
                  </div>
                  <p className="ops-mobile-message">{task.message}</p>
                  {expired ? (
                    <div className="ops-mobile-error">
                      <TriangleAlert size={15} />
                      <p>
                        Solicitarea a expirat. Angajatul trebuie să revizuiască
                        dosarul.
                      </p>
                    </div>
                  ) : task.kind === "SIGNATURE" && doc ? (
                    <>
                      <button
                        className="ops-sign-document"
                        onClick={() => setPreview(doc)}
                      >
                        <FileText size={26} />
                        <span>
                          <strong>{doc.name}</strong>
                          <small>
                            Versiunea {doc.version} · document aprobat
                          </small>
                          <small>SHA-256 {doc.hash.slice(0, 12)}</small>
                        </span>
                      </button>
                      <p className="ops-mobile-legal">
                        DEMO / SYNTHETIC / NOT LEGALLY BINDING. Semnarea
                        simulată nu are efect juridic și nu inițiază operațiuni
                        reale.
                      </p>
                      <label className="ops-sign-check">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => setChecked(e.target.checked)}
                        />
                        Am revizuit versiunea {doc.version} și înțeleg că
                        aceasta este o simulare.
                      </label>
                      <button
                        className="button primary full"
                        disabled={busy || !checked}
                        onClick={() => respond(true)}
                      >
                        <Signature size={15} />
                        {busy ? "Se salvează…" : "Accept și semnez mock"}
                      </button>
                      <button
                        className="button full"
                        disabled={busy}
                        onClick={() => respond(false)}
                      >
                        <X size={14} />
                        Refuz semnarea
                      </button>
                    </>
                  ) : task.kind === "INFORMATION" ? (
                    <>
                      <div className="ops-mobile-fields">
                        {task.questions.map((q) => (
                          <FormField
                            key={q.key}
                            field={{ ...q, type: q.type as Field["type"] }}
                            value={answers[q.key]}
                            onChange={(v) =>
                              setAnswers((s) => ({ ...s, [q.key]: v }))
                            }
                          />
                        ))}
                      </div>
                      {task.required_documents.map((kind) => (
                        <section className="ops-mobile-upload" key={kind}>
                          <label>{documentLabels[kind]}</label>
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={async () => {
                              try {
                                const s = await api<{
                                  name: string;
                                  content: string;
                                }>(
                                  `customer/tasks/${task.id}/sample?kind=${kind}`,
                                );
                                setDocuments((d) => ({
                                  ...d,
                                  [kind]: { kind, ...s },
                                }));
                              } catch (e) {
                                setError((e as Error).message);
                              }
                            }}
                          >
                            Completează exemplul sintetic
                          </button>
                          <textarea
                            aria-label={
                              "Document client " + documentLabels[kind]
                            }
                            placeholder="TXT demonstrativ…"
                            value={documents[kind]?.content ?? ""}
                            onChange={(e) =>
                              setDocuments((d) => ({
                                ...d,
                                [kind]: {
                                  kind,
                                  name: kind + "-DEMO.txt",
                                  content: e.target.value,
                                },
                              }))
                            }
                            maxLength={15000}
                          />
                          <input
                            type="file"
                            aria-label={"Încarcă " + documentLabels[kind]}
                            accept=".txt,text/plain"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                if (file.size > 15000) {
                                  setError("Documentul depășește 15 KB.");
                                  return;
                                }
                                setDocuments((d) => ({
                                  ...d,
                                  [kind]: {
                                    kind,
                                    name: file.name,
                                    content: "",
                                  },
                                }));
                                const text = await file.text();
                                setDocuments((d) => ({
                                  ...d,
                                  [kind]: {
                                    kind,
                                    name: file.name,
                                    content: text,
                                  },
                                }));
                              }
                            }}
                          />
                        </section>
                      ))}
                      <button
                        className="button primary full"
                        disabled={
                          busy ||
                          !task.questions.every(
                            (q) =>
                              answers[q.key] !== undefined &&
                              answers[q.key] !== "",
                          ) ||
                          !task.required_documents.every((k) =>
                            documents[k]?.content.trim(),
                          )
                        }
                        onClick={() => respond()}
                      >
                        <Send size={14} />
                        {busy
                          ? "Se salvează…"
                          : "Trimite datele și documentele"}
                      </button>
                      <p className="mobile-fine">
                        Exclusiv date sintetice. Nu introduce PIN, CVV, OTP sau
                        parole.
                      </p>
                    </>
                  ) : null}
                </>
              ) : (
                <div className="pi-mobile-empty">
                  <CheckCircle2 size={29} />
                  <h3>
                    {c.state === "CUSTOMER_DECLINED"
                      ? "Refuzul tău a fost consemnat."
                      : "Nicio acțiune nouă."}
                  </h3>
                  <p>
                    Angajatul verifică dosarul. Vei vedea aici următoarea
                    solicitare aprobată.
                  </p>
                </div>
              )}
              {c?.tasks
                .filter((t) => t.kind === "UPDATE" && t.status === "DELIVERED")
                .map((t) => (
                  <div className="pi-mobile-update" key={t.id}>
                    <ShieldCheck size={15} />
                    <p>{t.message}</p>
                  </div>
                ))}
              {c?.documents
                .filter(
                  (d) =>
                    d.status === "SIGNED_MOCK" ||
                    (d.kind === "OFFER" && d.status === "APPROVED"),
                )
                .map((d) => (
                  <button
                    className="ops-signed-download"
                    key={d.id}
                    onClick={() => setPreview(d)}
                  >
                    <FileCheck2Icon />
                    <span>
                      {d.name}
                      <small>
                        {d.status === "SIGNED_MOCK"
                          ? "Semnat mock"
                          : "Aprobat pentru simulare"}{" "}
                        · v{d.version}
                      </small>
                    </span>
                  </button>
                ))}
            </div>
            <div className="phone-bottom" />
          </div>
        </>
      )}
      {preview && (
        <DocumentPreview doc={preview} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}
function FileCheck2Icon() {
  return <CheckCircle2 size={18} />;
}
