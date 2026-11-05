/**
 * Category (SPEC §7), fees, late charges and the pricing snapshot (SPEC §8),
 * registration deadlines (SPEC §9).
 */
import { addDays, diffDays, longDate, type LocalDate } from "../dates";
import { formatNaira } from "../money";
import { registrationDeadline, type Settings } from "../settings";
import type { Activity, Fee, Filing, Pricing, RefData, SubmissionFacts } from "./types";

// ---------------------------------------------------------------- category

/** Category of one activity at the submission's capacity (Cat Primary / Cat Other n). */
export function activityCategory(
  code: string | null | undefined,
  capacityMw: number | null,
  activities: Activity[],
  settings: Pick<Settings, "supplyRetailCategoryAt1MW">,
): string | null {
  if (!code) return null;
  const a = activities.find((x) => x.code === code);
  if (!a) return null;
  const c = capacityMw ?? 0;
  if (a.code === "SUP" && c >= 1) return settings.supplyRetailCategoryAt1MW;
  if (c >= 10) return a.cat10MwPlus;
  if (c >= 1) return a.cat1To10Mw;
  return a.catBelow1Mw;
}

/**
 * Category Auto: A wins, then B, then the highest registration fee; on a tie
 * the first in the order primary, other 1, other 2 … (XMATCH(MAX(f), f)).
 */
export function categoryAuto(
  primary: string | null,
  others: string[],
  capacityMw: number | null,
  ref: Pick<RefData, "activities" | "fees">,
  settings: Pick<Settings, "supplyRetailCategoryAt1MW">,
): string | null {
  const p = activityCategory(primary, capacityMw, ref.activities, settings);
  if (!p) return null;
  const cats = [p, ...others.map((o) => activityCategory(o, capacityMw, ref.activities, settings))];
  if (cats.includes("A")) return "A";
  if (cats.includes("B")) return "B";
  const feeOf = (c: string | null) => (c ? (ref.fees.find((f) => f.category === c)?.registrationFee ?? 0) : -1);
  let best = 0;
  for (let i = 1; i < cats.length; i++) if (feeOf(cats[i]) > feeOf(cats[best])) best = i;
  return cats[best];
}

/** Current Category: the override if set, else the calculated one; blank if not in the fee table. */
export function currentCategory(
  s: Pick<SubmissionFacts, "categoryOverride" | "primaryActivity" | "otherActivities" | "installedCapacityMw">,
  ref: Pick<RefData, "activities" | "fees">,
  settings: Pick<Settings, "supplyRetailCategoryAt1MW">,
): string | null {
  const c = s.categoryOverride || categoryAuto(s.primaryActivity, s.otherActivities, s.installedCapacityMw, ref, settings);
  return c && ref.fees.some((f) => f.category === c) ? c : null;
}

// ---------------------------------------------------------------- deadlines

/** Current Deadline (SPEC §9): existing operators by the Effective Date; new operators 30 days before start. */
export function deadlineFor(
  s: Pick<SubmissionFacts, "filingType" | "operatingOnEffectiveDate" | "plannedStartDate">,
  settings: Settings,
): LocalDate | null {
  if (s.filingType !== "NEW") return null;
  if (s.operatingOnEffectiveDate === "Y") return registrationDeadline(settings);
  if (!s.plannedStartDate) return null;
  return addDays(s.plannedStartDate, -settings.newOperatorLeadDays);
}

// ---------------------------------------------------------------- pricing

const feeRow = (fees: Fee[], c: string | null) => (c ? fees.find((f) => f.category === c) : undefined);

/** What the record would be priced at now, from the live fee table and settings. */
export function currentPricing(
  s: Pick<SubmissionFacts, "categoryOverride" | "primaryActivity" | "otherActivities" | "installedCapacityMw" | "filingType" | "operatingOnEffectiveDate" | "plannedStartDate">,
  ref: Pick<RefData, "activities" | "fees">,
  settings: Settings,
): Pricing | null {
  const category = currentCategory(s, ref, settings);
  if (!category) return null;
  const f = feeRow(ref.fees, category)!;
  const isNew = s.filingType === "NEW";
  return {
    category,
    fee: isNew || settings.feeOnUpdates === "Y" ? f.registrationFee : 0,
    lateInitial: isNew ? f.lateInitial : 0,
    lateDaily: isNew ? f.lateDaily : 0,
    lateCap: isNew ? f.lateCap : 0,
    deadline: deadlineFor(s, settings),
    effectiveDate: settings.effectiveDate,
  };
}

/**
 * [G14] Late charge = MIN(initial + daily × days late, cap). The Order caps
 * the whole charge; the workbook capped only the daily part.
 */
export function lateCharge(daysLate: number, initial: number, daily: number, cap: number): number {
  if (daysLate <= 0) return 0;
  return Math.min(initial + daily * daysLate, cap);
}

/** Days late = deemed receipt − deadline, in calendar days, never negative (Q3). */
export function daysLate(deemedReceipt: LocalDate | null, deadline: LocalDate | null): number {
  if (!deemedReceipt || !deadline) return 0;
  return Math.max(0, diffDays(deadline, deemedReceipt));
}

export type Money = {
  /** Snapshot if saved, else current. */
  pricing: Pricing | null;
  categoryApplied: string | null;
  deadline: LocalDate | null;
  effectiveDateUsed: LocalDate;
  daysLate: number;
  registrationFee: number;
  lateCharge: number;
  netFee: number;
  totalDue: number;
};

export function money(s: SubmissionFacts, ref: Pick<RefData, "activities" | "fees">, settings: Settings): Money {
  const pricing = s.priced ?? currentPricing(s, ref, settings);
  const deadline = pricing?.deadline ?? (s.priced ? null : deadlineFor(s, settings));
  const dl = daysLate(s.deemedReceiptDate, deadline);
  const fee = pricing?.fee ?? 0;
  const late = pricing ? lateCharge(dl, pricing.lateInitial, pricing.lateDaily, pricing.lateCap) : 0;
  const waiver = s.approvedWaiver ?? 0;
  const netFee = Math.max(0, fee - waiver);
  const totalDue = settings.waiverReducesLate === "Y" ? Math.max(0, fee + late - waiver) : netFee + late;
  return {
    pricing,
    categoryApplied: pricing?.category ?? null,
    deadline,
    effectiveDateUsed: s.priced?.effectiveDate ?? settings.effectiveDate,
    daysLate: dl,
    registrationFee: fee,
    lateCharge: late,
    netFee,
    totalDue,
  };
}

/** PRICING_OUT_OF_DATE: each difference between the snapshot and the live rules (SPEC §8.3). */
export function pricingDifferences(s: SubmissionFacts, ref: Pick<RefData, "activities" | "fees">, settings: Settings): string[] {
  if (!s.priced) return [];
  const now = currentPricing(s, ref, settings);
  if (!now) return ["category can no longer be determined"];
  const p = s.priced;
  const d: string[] = [];
  if (p.category !== now.category) d.push(`category ${p.category} → ${now.category}`);
  if (p.fee !== now.fee) d.push(`fee ${formatNaira(p.fee)} → ${formatNaira(now.fee)}`);
  if (p.lateInitial !== now.lateInitial) d.push(`late initial ${formatNaira(p.lateInitial)} → ${formatNaira(now.lateInitial)}`);
  if (p.lateDaily !== now.lateDaily) d.push(`late daily ${formatNaira(p.lateDaily)} → ${formatNaira(now.lateDaily)}`);
  if (p.lateCap !== now.lateCap) d.push(`late cap ${formatNaira(p.lateCap)} → ${formatNaira(now.lateCap)}`);
  if ((p.deadline ?? "") !== (now.deadline ?? "")) {
    d.push(`deadline ${p.deadline ? longDate(p.deadline) : "none"} → ${now.deadline ? longDate(now.deadline) : "none"}`);
  }
  if (p.effectiveDate !== settings.effectiveDate) d.push(`Effective Date ${longDate(p.effectiveDate)} → ${longDate(settings.effectiveDate)}`);
  return d;
}

export const FILING_FEE_NOTE: Record<Filing, string> = {
  NEW: "Registration fee and any late charge",
  UPDATE: "No late charge; fee only if charged on updates",
  ANNUAL: "No late charge; fee only if charged on updates",
};
