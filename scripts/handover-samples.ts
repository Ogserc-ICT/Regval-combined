/**
 * Writes two sample handover batches (docs/handover-samples/) for the Revenue Registry's
 * developer to test an import against (docs/REVENUE-REGISTRY-CONTRACT.md §9). Sample data only:
 * the operators, people and numbers are made up. Run: pnpm tsx scripts/handover-samples.ts
 */
import { writeFileSync } from "node:fs";
import { byLineId, summarise, type HandoverLine } from "../src/domain/handover";
import { batchCsv, batchXlsx, type HandoverBatch } from "../src/server/services/handover";

const base = (payNo: string, batchNo: string, amountKobo: number, extra: Partial<HandoverLine>): HandoverLine => ({
  lineId: `${payNo}:P`,
  lineType: "Payment",
  payNo,
  batchNo,
  dateReceived: "2026-11-16",
  dateConfirmed: "2026-11-17",
  amountKobo,
  purpose: "Registration fee",
  revenueCode: "",
  channel: "Remita",
  rrr: "290012345678",
  payer: "SAMPLE Sunrise Power Ltd",
  paidFor: "Registration",
  filingType: "New registration",
  ackNo: "OGSERC/ACK/2026/00001",
  registrationNoOrOun: "",
  category: "D",
  lga: "Sagamu",
  recordedBy: "SAMPLE Registration Officer",
  confirmedBy: "SAMPLE Finance Officer",
  verifiedWithBank: "Y",
  reversedOn: "",
  reversedBy: "",
  reversalReason: "",
  ...extra,
});

function batch(batchNo: string, preparedAt: string, lines: HandoverLine[]): HandoverBatch {
  const sorted = lines.sort(byLineId);
  return { id: "00000000-0000-4000-8000-000000000000", batchNo, preparedAt: new Date(preparedAt), preparedBy: "00000000-0000-4000-8000-000000000000", preparedByName: "SAMPLE Finance Officer", ...summarise(sorted), lines: sorted, importedOn: null, importedBy: null, importedByName: null, importedAt: null };
}

const b1 = "OGSERC/EXP/2026/0001";
const one = batch(b1, "2026-11-18T08:30:00Z", [
  base("OGSERC/PAY/2026/00001", b1, 50_000_000, {}),
  base("OGSERC/PAY/2026/00002", b1, 2_500_000, { purpose: "Late registration charge", rrr: "290012345679" }),
  base("OGSERC/PAY/2026/00003", b1, 15_000_000, { payer: "SAMPLE Ifo Mini-Grid Co.", ackNo: "OGSERC/ACK/2026/00002", category: "G", lga: "Ifo", channel: "Bank transfer", rrr: "", dateConfirmed: "2026-11-18" }),
  base("OGSERC/PAY/2026/00004", b1, 10_000_000, { payer: "SAMPLE Ota Foods Ltd", paidFor: "Own-use notification", filingType: "Own-use notification", ackNo: "OGSERC/ACK/2026/00003", registrationNoOrOun: "OGSERC/OUN/2026/0001", category: "I", lga: "Ado-Odo/Ota", purpose: "Registration fee", rrr: "290012345680" }),
]);
const b2 = "OGSERC/EXP/2026/0002";
const two = batch(b2, "2026-11-20T09:00:00Z", [
  base("OGSERC/PAY/2026/00003", b2, -15_000_000, { lineId: "OGSERC/PAY/2026/00003:R", lineType: "Reversal", payer: "SAMPLE Ifo Mini-Grid Co.", ackNo: "OGSERC/ACK/2026/00002", category: "G", lga: "Ifo", channel: "Bank transfer", rrr: "", dateConfirmed: "2026-11-18", reversedOn: "2026-11-19", reversedBy: "SAMPLE Finance Officer", reversalReason: "Transfer recalled by the bank" }),
  base("OGSERC/PAY/2026/00005", b2, 50_000_000, { payer: "SAMPLE Abeokuta Grid Services Ltd", ackNo: "OGSERC/ACK/2026/00004", registrationNoOrOun: "OGSERC/REG/2026/D-DIS/0001", lga: "Abeokuta South", dateReceived: "2026-11-19", dateConfirmed: "2026-11-19", rrr: "290012345681" }),
]);

async function main() {
  for (const b of [one, two]) {
  const stem = `docs/handover-samples/${b.batchNo.replace(/\//g, "-")}`;
  writeFileSync(`${stem}.xlsx`, await batchXlsx(b));
  writeFileSync(`${stem}.csv`, batchCsv(b));
  console.log(stem, b.netTotal, b.checksum);
  }
}

void main();
