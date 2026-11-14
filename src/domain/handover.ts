/**
 * Payment handover to the Revenue Registry: the file format of
 * docs/REVENUE-REGISTRY-CONTRACT.md (format version 1) as code. Change the contract first.
 */
import { createHash } from "node:crypto";

export const HANDOVER_LINE_TYPES = ["Payment", "Reversal"] as const;
export type HandoverLineType = (typeof HANDOVER_LINE_TYPES)[number];

/** A line as handed over (contract §4.1); `amountKobo` is negative on a reversal. */
export type HandoverLine = {
  lineId: string;
  lineType: HandoverLineType;
  payNo: string;
  batchNo: string;
  dateReceived: string;
  dateConfirmed: string;
  amountKobo: number;
  purpose: string;
  revenueCode: string;
  channel: string;
  rrr: string;
  payer: string;
  paidFor: "Registration" | "Own-use notification";
  filingType: string;
  ackNo: string;
  registrationNoOrOun: string;
  category: string;
  lga: string;
  recordedBy: string;
  confirmedBy: string;
  verifiedWithBank: "Y" | "N";
  reversedOn: string;
  reversedBy: string;
  reversalReason: string;
};


export const HANDOVER_FORMAT = "OGSERC payment handover";
export const HANDOVER_FORMAT_VERSION = 1;
export const HANDOVER_SOURCE = "OGSERC Registration & Evaluation";

export const lineId = (payNo: string, type: HandoverLineType) => `${payNo}:${type === "Payment" ? "P" : "R"}`;

/** `OGSERC/EXP/2026/0001` → `OGSERC-EXP-2026-0001` (file names and URLs). */
export const batchSlug = (batchNo: string) => batchNo.replace(/\//g, "-");
export const batchNoFromSlug = (slug: string) => (/^OGSERC-EXP-\d{4}-\d{4,}$/.test(slug) ? slug.replace(/-/g, "/") : null);

/** Contract §4.3. */
export function handoverChecksum(lines: Pick<HandoverLine, "lineId" | "amountKobo">[]): string {
  return createHash("sha256")
    .update(lines.map((l) => `${l.lineId}|${l.amountKobo}`).join("\n"), "utf8")
    .digest("hex");
}

/** Contract §4.1, in order. `kind` money/integer are number cells; everything else is text. */
export const PAYMENT_COLUMNS: { header: string; kind: "text" | "money" | "integer"; value: (l: HandoverLine) => string | number }[] = [
  { header: "Line ID", kind: "text", value: (l) => l.lineId },
  { header: "Line type", kind: "text", value: (l) => l.lineType },
  { header: "PAY no.", kind: "text", value: (l) => l.payNo },
  { header: "Batch no.", kind: "text", value: (l) => l.batchNo },
  { header: "Date received", kind: "text", value: (l) => l.dateReceived },
  { header: "Date confirmed", kind: "text", value: (l) => l.dateConfirmed },
  { header: "Amount (NGN)", kind: "money", value: (l) => l.amountKobo / 100 },
  { header: "Amount (kobo)", kind: "integer", value: (l) => l.amountKobo },
  { header: "Purpose", kind: "text", value: (l) => l.purpose },
  { header: "Revenue code", kind: "text", value: (l) => l.revenueCode },
  { header: "Channel", kind: "text", value: (l) => l.channel },
  { header: "RRR", kind: "text", value: (l) => l.rrr },
  { header: "Payer", kind: "text", value: (l) => l.payer },
  { header: "Paid for", kind: "text", value: (l) => l.paidFor },
  { header: "Filing type", kind: "text", value: (l) => l.filingType },
  { header: "ACK no.", kind: "text", value: (l) => l.ackNo },
  { header: "Registration no. / OUN", kind: "text", value: (l) => l.registrationNoOrOun },
  { header: "Category", kind: "text", value: (l) => l.category },
  { header: "LGA", kind: "text", value: (l) => l.lga },
  { header: "Recorded by", kind: "text", value: (l) => l.recordedBy },
  { header: "Confirmed by", kind: "text", value: (l) => l.confirmedBy },
  { header: "Verified with bank", kind: "text", value: (l) => l.verifiedWithBank },
  { header: "Reversed on", kind: "text", value: (l) => l.reversedOn },
  { header: "Reversed by", kind: "text", value: (l) => l.reversedBy },
  { header: "Reversal reason", kind: "text", value: (l) => l.reversalReason },
];

export type BatchSummary = {
  batchNo: string;
  preparedAt: string;
  preparedBy: string;
  confirmedFrom: string;
  confirmedTo: string;
  paymentLines: number;
  reversalLines: number;
  paymentTotal: number;
  reversalTotal: number;
  netTotal: number;
  checksum: string;
};

/** Contract §4.2, in order. */
export function batchFields(b: BatchSummary): [string, string | number][] {
  return [
    ["Format", HANDOVER_FORMAT],
    ["Format version", HANDOVER_FORMAT_VERSION],
    ["Source", HANDOVER_SOURCE],
    ["Batch no.", b.batchNo],
    ["Prepared at", b.preparedAt],
    ["Prepared by", b.preparedBy],
    ["Confirmed from", b.confirmedFrom],
    ["Confirmed to", b.confirmedTo],
    ["Payment lines", b.paymentLines],
    ["Reversal lines", b.reversalLines],
    ["Payment total (kobo)", b.paymentTotal],
    ["Reversal total (kobo)", b.reversalTotal],
    ["Net total (kobo)", b.netTotal],
    ["Checksum (SHA-256)", b.checksum],
  ];
}

/** Totals and checksum of a set of lines (sorted by Line ID). */
export function summarise(lines: HandoverLine[]) {
  const pay = lines.filter((l) => l.lineType === "Payment");
  const rev = lines.filter((l) => l.lineType === "Reversal");
  const dates = pay.map((l) => l.dateConfirmed).sort();
  const sum = (ls: HandoverLine[]) => ls.reduce((s, l) => s + l.amountKobo, 0);
  return {
    paymentLines: pay.length,
    reversalLines: rev.length,
    paymentTotal: sum(pay),
    reversalTotal: sum(rev),
    netTotal: sum(lines),
    confirmedFrom: dates[0] ?? null,
    confirmedTo: dates[dates.length - 1] ?? null,
    checksum: handoverChecksum(lines),
  };
}

/** Line ID order, as the file and the checksum use (plain code-unit comparison, not locale). */
export const byLineId = (a: HandoverLine, b: HandoverLine) => (a.lineId < b.lineId ? -1 : a.lineId > b.lineId ? 1 : 0);

/** ISO 8601 with the Lagos offset (+01:00, no daylight saving). */
export function lagosIso(d: Date): string {
  const t = new Date(d.getTime() + 60 * 60 * 1000).toISOString().slice(0, 19);
  return `${t}+01:00`;
}
