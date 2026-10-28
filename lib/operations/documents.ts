import { now } from "../domain.ts";
import { uuid } from "../incidents/domain.ts";
import { definition, documentLabels } from "./catalog.ts";
import {
  hash,
  safe,
  type Case,
  type Document,
  type Run,
  type Value,
} from "./domain.ts";
export const escape = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function parseDocument(content: string) {
  safe(content);
  const result: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^([a-z_]+)\s*:\s*(.{1,500})$/);
    if (m) result[m[1]] = m[2].trim();
  }
  return result;
}
export function sampleDocument(
  c: Pick<Case, "customer_id" | "customer_name" | "input">,
  kind: string,
) {
  const income = Number(c.input.income_minor) || 650000;
  return (
    `DEMO / SYNTHETIC / NOT LEGALLY BINDING\ncustomer_id: ${c.customer_id}\nfull_name: ${c.input.full_name ?? c.customer_name}\nreference: DOC-DEMO-${kind}\n` +
    (kind === "IDENTITY"
      ? `expires_on: 2030-12-31\nage: ${c.input.age ?? 32}\n`
      : kind === "SALARY"
        ? `income_minor: ${income}\nemployer: NEXT EMPLOYER DEMO\n`
        : kind === "BANK_STATEMENT"
          ? `obligations_minor: ${c.input.obligations_minor ?? 70000}\nbalance_minor: 1250000\n`
          : kind === "PROPERTY"
            ? "property_reference: PROPERTY-DEMO-01\nowner_name: TITULAR SINTETIC\n"
            : "rights: REVIEW_REQUIRED\nvalidity: REQUIRES_HUMAN_SPECIALIST\n")
  );
}
export async function inputDocument(
  c: Case,
  data: { kind: string; name: string; content: string },
) {
  safe(data.content);
  return {
    id: uuid(),
    kind: data.kind,
    name: data.name,
    direction: "INPUT",
    content: data.content,
    version:
      c.documents.filter((d) => d.kind === data.kind && d.direction === "INPUT")
        .length + 1,
    status: "SUBMITTED",
    hash: await hash(data.content),
    created_at: now(),
    input_snapshot: {},
    profile_version: c.profile_version,
    fields: parseDocument(data.content),
  } as Document;
}
export function complaintDraft(c: Case, run: Run) {
  return `Stimate client,\n\nAm analizat sesizarea ${c.reference} în mediul demonstrativ. Tema este ${String(c.input.details ?? "servicii bancare").match(/comision/i) ? "comisioane" : String(c.input.details ?? "").match(/card|plată|transfer/i) ? "plăți și carduri" : "servicii și relația cu banca"}.\n\n${run.facts
    .slice(0, 5)
    .map((f) => f.text + " [dovezi: " + f.evidence_ids.join(", ") + "]")
    .join(
      "\n",
    )}\n\n${run.contradictions.length ? "Neconcordanțele necesită verificări suplimentare de către un specialist." : "Datele disponibile au fost consemnate pentru verificare; rezultatul este limitat la sursele sintetice."}\n\nAceastă comunicare demonstrativă nu inițiază operațiuni financiare și nu promite recuperarea unor fonduri.\nNEXT B2C · DEMO`;
}
export async function generateDocument(
  c: Case,
  run: Run,
  editedMessage?: string,
) {
  const def = definition(c.workflow_id)!;
  const kind = def.signature
    ? "CONTRACT"
    : c.workflow_id === "B2C-08"
      ? "RESPONSE"
      : "SUMMARY";
  const version =
    c.documents.filter((d) => d.direction === "OUTPUT" && d.kind === kind)
      .length + 1;
  const statement =
    editedMessage ??
    (c.workflow_id === "B2C-08" ? complaintDraft(c, run) : run.summary);
  safe(statement);
  const rows = Object.entries(c.input)
    .map(
      ([key, value]) =>
        `<tr><td>${escape(def.fields.find((f) => f.key === key)?.label ?? key)}</td><td>${escape(typeof value === "number" && key.endsWith("_minor") ? (value / 100).toFixed(2) + " RON" : value)}</td></tr>`,
    )
    .join("");
  const illustration = run.illustration
    ? `<h2>Simulare ilustrativă</h2><p>Dobândă nominală exemplificativă ${(run.illustration.annual_rate * 100).toFixed(2)}% pe an; rată ${(run.illustration.installment_minor / 100).toFixed(2)} RON, ${run.illustration.months} luni; total ilustrativ ${(run.illustration.total_minor / 100).toFixed(2)} RON. Nu este DAE, ofertă bancară sau decizie de credit. Nu include costuri auxiliare.</p>`
    : "";
  const content = `<!doctype html><html lang="ro"><head><meta charset="utf-8"><style>body{font:14px/1.7 Arial;color:#243c2d;max-width:760px;margin:35px auto;padding:20px}aside{background:#f5ecd3;border:2px solid #a77926;padding:14px;font-weight:bold}h1{font-size:25px}h2{font-size:17px}table{width:100%;border-collapse:collapse}td{padding:9px;border-bottom:1px solid #ddd}pre{white-space:pre-wrap;font:inherit}small{color:#526549}footer{margin-top:30px;border-top:1px solid #ccc;padding-top:15px}@media print{body{margin:0}}</style></head><body><aside>DEMO / SYNTHETIC / NOT LEGALLY BINDING</aside><h1>${escape(def.output)}</h1><p>${escape(c.reference)} · v${version} · ${escape(c.customer_name)}</p><p>Șablon NEXT-${escape(c.workflow_id)}-v1.0 · profil v${c.profile_version} · ${escape(now())}</p><h2>Date declarate și revizuite în demo</h2><table>${rows}</table>${illustration}<h2>Sumar pentru revizuire</h2><pre>${escape(statement)}</pre><h2>Dovezi și reguli</h2><ul>${run.facts.map((f) => `<li>${escape(f.text)} <small>[${f.evidence_ids.map(escape).join(", ")}]</small></li>`).join("")}</ul><ul>${run.rules.map((r) => `<li>${escape(r.id)}: ${escape(r.status)} — ${escape(r.detail)}</li>`).join("")}</ul><footer>Document demonstrativ, fără efect juridic. Semnarea este o simulare; nu deschide conturi reale, nu acordă finanțare și nu transferă fonduri.</footer></body></html>`;
  for (const old of c.documents)
    if (old.direction === "OUTPUT" && old.status !== "SIGNED_MOCK")
      old.status = "SUPERSEDED";
  const doc: Document = {
    id: uuid(),
    kind,
    name: def.output,
    direction: "OUTPUT",
    content,
    version,
    status: "DRAFT",
    hash: await hash(content),
    created_at: now(),
    input_snapshot: structuredClone(c.input),
    profile_version: c.profile_version,
  };
  c.documents.push(doc);
  return doc;
}
// Small, dependency-free PDF export. UTF-8 preview remains the canonical document;
// PDF uses a standard built-in font and transliterates Romanian diacritics.
export function pdf(content: string) {
  const raw = content
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<\/(?:p|h1|h2|tr|li|pre|aside|footer)>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(
      /&(?:amp|lt|gt|quot|#39);/g,
      (m) =>
        ({
          "&amp;": "&",
          "&lt;": "<",
          "&gt;": ">",
          "&quot;": '"',
          "&#39;": "'",
        })[m]!,
    )
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e\n]/g, " ");
  const lines = raw
    .split("\n")
    .flatMap((l) => l.trim().match(/.{1,92}(?:\s|$)|.{1,92}/g) ?? []);
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += 48) pages.push(lines.slice(i, i + 48));
  if (!pages.length) pages.push(["DEMO"]);
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const ids: number[] = [];
  for (const page of pages) {
    const pageId = objects.length + 1,
      streamId = pageId + 1;
    ids.push(pageId);
    const stream =
      "BT /F1 10 Tf 45 800 Td 14 TL " +
      page
        .map((l) => "(" + l.replace(/[\\()]/g, "\\$&") + ") Tj T*")
        .join("\n") +
      " ET";
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
  }
  objects[1] = `<< /Type /Pages /Count ${ids.length} /Kids [${ids.map((id) => id + " 0 R").join(" ")}] >>`;
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(output.length);
    output += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = output.length;
  output +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
      .join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(output);
}
