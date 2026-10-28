import type { BankRecord } from "./domain.ts";
// These are claims extracted from text, never bank-confirmed facts or instructions.
export function extractEntities(statement: string) {
  const text = statement.normalize("NFC");
  const amounts = [
    ...text.matchAll(
      /\b(\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?|\d+(?:[,.]\d{1,2})?)\s*(?:lei|RON)\b/gi,
    ),
  ]
    .map((m) => {
      const number = m[1].replace(/\s/g, "");
      const normalized = number.includes(",")
        ? number.replaceAll(".", "").replace(",", ".")
        : /\.\d{3}(?:\.|$)/.test(number)
          ? number.replaceAll(".", "")
          : number;
      return Math.round(Number(normalized) * 100);
    })
    .filter((n) => Number.isSafeInteger(n) && n >= 0 && n <= 1000000000);
  const atm = /\batm\b|bancomat|numerar/i.test(text);
  const transfer = /transfer|\bRoPay\b|alias|beneficiar/i.test(text);
  const card = /card|comerciant|plată online/i.test(text);
  const channel: BankRecord["channel"] | undefined =
    atm && !transfer
      ? "ATM"
      : transfer && !atm && !card
        ? "TRANSFER"
        : card && !atm && !transfer
          ? "CARD"
          : undefined;
  return {
    amount_minor: new Set(amounts).size === 1 ? amounts[0] : undefined,
    channel,
    date: text.match(/\b(?:\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4})\b/)?.[0],
    beneficiary: text
      .match(/beneficiar(?:ul)?\s*[:=]\s*([^;\n.]{2,80})/i)?.[1]
      ?.trim(),
    source: "CUSTOMER_CLAIM" as const,
  };
}
