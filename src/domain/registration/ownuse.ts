/**
 * Own-use notifications, Form REG-01I (SPEC §15; tblOwnUse).
 */
import type { LocalDate } from "../dates";
import { formatNaira } from "../money";
import type { Settings } from "../settings";
import { checklistDocs, summariseDocs, type DocSummary } from "./documents";
import { paymentTotals, type PaymentTotals } from "./assess";
import type { PaymentFacts, RefData } from "./types";

export type OwnUseFacts = {
  ounNo: string | null;
  name: string;
  dateFiled: LocalDate;
  cacNo: string | null;
  siteAddress: string | null;
  lga: string | null;
  unitsKw: number[];
  flagOverrideReason: string | null;
  pricedFee: number | null;
  pricedThresholdKw: number | null;
  registrationNo: string | null;
  createdBy: string | null;
};

export type OwnUseContext = {
  settings: Settings;
  ref: Pick<RefData, "fees" | "formDocs" | "conditions">;
  payments: PaymentFacts[];
  checklist: Record<string, string | null>;
  duplicates: { site: boolean; cacOnRegister: boolean };
  /** The registration deadline for existing operators (information only). */
  registrationDeadline: LocalDate;
  signatories: { chairman: boolean; commissioner: boolean };
};

export type Eligibility = "" | "Register as operator" | "Not required" | "Notification required";

/** Sum of unit kW, rounded to 0.001 kW as the workbook does; null with no units. */
export function installedKw(unitsKw: number[]): number | null {
  if (!unitsKw.length) return null;
  return unitsKw.reduce((s, k) => s + Math.round(k * 1000), 0) / 1000;
}

export function eligibility(kw: number | null, thresholdKw: number): Eligibility {
  if (kw === null) return "";
  if (kw >= 1000) return "Register as operator";
  if (kw < thresholdKw) return "Not required";
  return "Notification required";
}

/** Category I fee when threshold ≤ kW < 1000, else 0. */
export function ownUseFee(kw: number | null, thresholdKw: number, fees: RefData["fees"]): number {
  if (kw === null || kw >= 1000 || kw < thresholdKw) return 0;
  return fees.find((f) => f.category === "I")?.registrationFee ?? 0;
}

export type OwnUseAssessment = {
  installedKw: number | null;
  thresholdUsed: number;
  eligibility: Eligibility;
  feeDue: number;
  currentFee: number;
  payments: PaymentTotals;
  balance: number;
  paymentStatus: "Nil" | "Paid" | "Part-paid" | "Unpaid";
  filedAfterDeadline: boolean;
  documents: DocSummary;
  flags: { code: string; text: string }[];
  registrationBlockers: string[];
};

export function assessOwnUse(o: OwnUseFacts, ctx: OwnUseContext): OwnUseAssessment {
  const kw = installedKw(o.unitsKw);
  const thresholdUsed = o.pricedThresholdKw ?? ctx.settings.ownUseThresholdKw;
  const currentFee = ownUseFee(kw, ctx.settings.ownUseThresholdKw, ctx.ref.fees);
  const feeDue = o.pricedThresholdKw !== null ? (o.pricedFee ?? 0) : currentFee;
  const pay = paymentTotals(ctx.payments);
  const balance = Math.round(feeDue - pay.amountPaid);
  const paymentStatus = feeDue === 0 ? "Nil" : balance <= 0 ? "Paid" : pay.amountPaid > 0 ? "Part-paid" : "Unpaid";
  const elig = eligibility(kw, thresholdUsed);
  const evidence = feeDue === 0 ? "N/A" : pay.amountPaid >= feeDue ? "Y" : "";
  const documents = summariseDocs(
    "REG-01I",
    checklistDocs("REG-01I", [], ctx.ref.formDocs),
    ctx.checklist,
    () => "",
    evidence,
    (k) => ctx.ref.conditions.find((c) => c.key === k)?.question ?? k,
  );

  const flags: OwnUseAssessment["flags"] = [];
  const missing = [!o.name.trim() && "name", !o.dateFiled && "date filed", !o.lga && "LGA", kw === null && "generator units"].filter(Boolean);
  if (missing.length) flags.push({ code: "OU_MISSING_REQUIRED", text: `Missing required field: ${missing.join(", ")}` });
  if (ctx.duplicates.site) flags.push({ code: "OU_DUPLICATE_SITE", text: "Another own-use notification has the same CAC number and site address" });
  if (ctx.duplicates.cacOnRegister) flags.push({ code: "OU_CAC_ON_REGISTER", text: "CAC number is also on the Register" });
  if (pay.amountPaid < feeDue) flags.push({ code: "OU_FEE_UNPAID", text: "Fee not fully paid" });
  if (o.pricedThresholdKw !== null && kw !== null) {
    const d: string[] = [];
    if ((o.pricedFee ?? 0) !== currentFee) d.push(`fee ${formatNaira(o.pricedFee ?? 0)} → ${formatNaira(currentFee)}`);
    if (o.pricedThresholdKw !== ctx.settings.ownUseThresholdKw) d.push(`threshold ${o.pricedThresholdKw} kW → ${ctx.settings.ownUseThresholdKw} kW`);
    if (d.length) flags.push({ code: "OU_PRICING_OUT_OF_DATE", text: `Saved pricing differs from current rules (${d.join("; ")})` });
  }

  const blockers: string[] = [];
  if (ctx.settings.ownUseCertificate !== "Y") blockers.push("Own-use certificates are switched off in Settings");
  if (!o.ounNo) blockers.push("The notification has not been saved");
  if (o.registrationNo) blockers.push(`Already registered as ${o.registrationNo}`);
  if (elig !== "Notification required") blockers.push(`Capacity ${kw ?? 0} kW: ${elig || "no generator units recorded"}`);
  if (pay.amountPaid < feeDue) blockers.push(`Fee not confirmed by Finance: ${formatNaira(pay.amountPaid)} of ${formatNaira(feeDue)}`);
  if (!documents.complete) blockers.push(`Documents outstanding: ${documents.outstandingText.join("; ")}`);
  const blocking = flags.filter((x) => x.code !== "OU_FEE_UNPAID");
  if (blocking.length) {
    const list = blocking.map((x) => x.text).join("; ");
    if (ctx.settings.flagsBlockApproval === "Y") blockers.push(`${blocking.length} unresolved data flag(s): ${list}`);
    else if (!o.flagOverrideReason?.trim()) blockers.push(`${blocking.length} unresolved data flag(s) with no written override reason: ${list}`);
  }
  const missingSig = [!ctx.signatories.chairman && "Chairman / CEO", !ctx.signatories.commissioner && "Commissioner"].filter(Boolean);
  if (missingSig.length) blockers.push(`Certificate signatory not set: ${missingSig.join(" and ")}. An admin must add it under Admin › Signatories.`);

  return {
    installedKw: kw,
    thresholdUsed,
    eligibility: elig,
    feeDue,
    currentFee,
    payments: pay,
    balance,
    paymentStatus,
    filedAfterDeadline: !!o.dateFiled && o.dateFiled > ctx.registrationDeadline,
    documents,
    flags,
    registrationBlockers: blockers,
  };
}
