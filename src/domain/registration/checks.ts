/**
 * EVAL-01 checks (SPEC §12): automatic values, applicability, counts and the
 * recommended outcome. Mirrors tblEvaluation's Satisfied / Failed / N/A /
 * Pending columns and the per-check formulas.
 */
import { diffDays } from "../dates";
import type { Settings } from "../settings";
import { MULTI_STATE_LICENCE, ST, UNLICENSED, type Status } from "./types";

export type CheckValue = "Y" | "N" | "N/A" | "";

/** When a check applies; otherwise it is N/A automatically (grey). */
export type Applicability = "always" | "ms" | "lic" | "unlic" | "docs" | "nonco" | "waiver" | "notlinked";

/** The 56 decision checks in order (1.1 … 7.6) and the 7 post-approval checks (9.1 … 9.7). */
export const DECISION_CHECKS = [
  "1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "1.8", "1.9", "1.10",
  "2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8", "2.9", "2.10", "2.11", "2.12", "2.13", "2.14", "2.15",
  "3.0", "3.1", "3.2",
  "4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.8", "4.9", "4.10", "4.11", "4.12", "4.13",
  "5.1", "5.2", "5.3", "5.4", "5.5",
  "6.1", "6.2", "6.3", "6.4",
  "7.1", "7.2", "7.3", "7.4", "7.5", "7.6",
] as const;
export const POST_APPROVAL_CHECKS = ["9.1", "9.2", "9.3", "9.4", "9.5", "9.6", "9.7"] as const;

export const AUTO_CHECKS: ReadonlySet<string> = new Set([
  "1.1", "1.3", "1.4", "1.5", "1.8", "1.9", "1.10", "3.0", "4.3", "5.4", "5.5", "7.5", "7.6", "9.1", "9.2",
]);

const APPLIES: Record<string, Applicability> = {
  "1.7": "ms", "2.4": "lic", "3.1": "docs", "3.2": "nonco", "4.2": "lic", "4.9": "unlic",
  "5.3": "waiver", "7.1": "unlic", "7.3": "ms", "9.3": "notlinked", "9.4": "notlinked", "9.5": "notlinked",
};

export function applicability(id: string): Applicability {
  return APPLIES[id] ?? "always";
}

export type CheckInputs = {
  hasAck: boolean;
  activityCode: string | null;
  capacityMw: number;
  duplicateCac: boolean;
  daysLate: number;
  lateCharge: number;
  formCategory: string | null;
  confirmedCategory: string | null;
  confirmedReason: string | null;
  documentsComplete: boolean;
  nearestExpiry: string | null;
  effectiveDateUsed: string;
  balance: number;
  flagCount: number;
  flagOverrideReason: string | null;
  linked: boolean;
  status: Status | null;
  certificateIssueDate: string | null;
  registrationNo: string | null;
  licenceStatus: string | null;
  registrantType: string | null;
  waiver: number;
};

function applies(a: Applicability, x: CheckInputs): boolean {
  switch (a) {
    case "always": return true;
    case "ms": return x.activityCode === "MSL" || x.licenceStatus === MULTI_STATE_LICENCE;
    case "lic": return x.licenceStatus !== UNLICENSED;
    case "unlic": return x.licenceStatus === UNLICENSED;
    case "docs": return !x.documentsComplete;
    case "nonco": return !!x.registrantType?.trim() && x.registrantType !== "Company";
    case "waiver": return x.waiver > 0;
    case "notlinked": return !x.linked;
  }
}

function autoValue(id: string, x: CheckInputs, settings: Pick<Settings, "licenceExpiryWindowDays" | "wrongFormHandling">): CheckValue {
  switch (id) {
    case "1.1": return x.hasAck ? "Y" : "N";
    case "1.3": return x.activityCode ? "Y" : "N";
    case "1.4": return x.activityCode === "CPT" && x.capacityMw < 1 ? "N" : "Y";
    case "1.5": return x.duplicateCac ? "N" : "Y";
    case "1.8": return x.daysLate === 0 ? "Y" : "N";
    case "1.9":
    case "5.4": return x.daysLate === 0 ? "N/A" : x.lateCharge > 0 ? "Y" : "N";
    case "1.10": {
      if (!x.formCategory) return "N";
      if (!x.confirmedCategory) return "";
      if (x.formCategory === x.confirmedCategory) return "Y";
      return settings.wrongFormHandling === "Accept and re-categorise" && x.confirmedReason?.trim() ? "Y" : "N";
    }
    case "3.0": return x.documentsComplete ? "Y" : "N";
    case "4.3":
      if (!x.nearestExpiry) return "N/A";
      return diffDays(x.effectiveDateUsed, x.nearestExpiry) <= settings.licenceExpiryWindowDays ? "N" : "Y";
    case "5.5": return x.balance <= 0 ? "Y" : "N";
    case "7.5": return "N/A";
    case "7.6": return x.flagCount === 0 || !!x.flagOverrideReason?.trim() ? "Y" : "N";
    case "9.1": return x.linked ? "N/A" : x.certificateIssueDate && x.status === ST.REGISTERED ? "Y" : "";
    case "9.2": return x.linked ? "N/A" : x.registrationNo ? "Y" : "";
    default: return "";
  }
}

export type CheckResult = { id: string; value: CheckValue; automatic: boolean; applicable: boolean };

export type CheckSummary = {
  results: CheckResult[];
  satisfied: number;
  failed: number;
  notApplicable: number;
  pending: number;
  progress: number;
  fileClosed: boolean;
};

function normalise(v: string | undefined): CheckValue {
  const u = (v ?? "").trim().toUpperCase();
  return u === "Y" || u === "N" || u === "N/A" ? (u as CheckValue) : "";
}

export function evaluateChecks(
  x: CheckInputs,
  answers: Record<string, string>,
  settings: Pick<Settings, "licenceExpiryWindowDays" | "wrongFormHandling">,
): CheckSummary {
  const all = [...DECISION_CHECKS, ...POST_APPROVAL_CHECKS];
  const results: CheckResult[] = all.map((id) => {
    const applicable = applies(applicability(id), x);
    const automatic = AUTO_CHECKS.has(id);
    if (!applicable) return { id, value: "N/A", automatic: true, applicable };
    return { id, value: automatic ? autoValue(id, x, settings) : normalise(answers[id]), automatic, applicable };
  });
  const decision = results.slice(0, DECISION_CHECKS.length);
  const post = results.slice(DECISION_CHECKS.length);
  const count = (v: CheckValue) => decision.filter((r) => r.value === v).length;
  const satisfied = count("Y");
  const failed = count("N");
  const notApplicable = count("N/A");
  return {
    results,
    satisfied,
    failed,
    notApplicable,
    pending: count(""),
    progress: (satisfied + failed + notApplicable) / DECISION_CHECKS.length,
    fileClosed: post.every((r) => r.value === "Y" || r.value === "N/A"),
  };
}

export const OUTCOMES = {
  REDIRECT: "Redirect to REG-01I / outside scope",
  AWAITING_FINANCE: "Awaiting Finance confirmation",
  LAPSE: "Treat as lapsed (13(2))",
  PROVISIONAL: "Provisional registration (13(4))",
  DEFICIENCY: "Issue deficiency notice (13(1)(b))",
  IN_PROGRESS: "Evaluation in progress",
  APPLY: "Accept filing and apply changes (para 16)",
  REGISTER: "Register (13(1)(a))",
  REFUSE: "Refuse (13(3)) - after show-cause",
} as const;

/** Recommended Outcome (SPEC §12.2), first match. */
export function recommendedOutcome(args: {
  checks: CheckSummary;
  status: Status | null;
  gateCleared: boolean;
  deficiencyDue: string | null;
  determinationDue: string | null;
  finalDecision: string | null;
  linked: boolean;
  today: string;
}): string {
  const v = (id: string) => args.checks.results.find((r) => r.id === id)?.value;
  if (v("1.3") === "N" || v("1.4") === "N") return OUTCOMES.REDIRECT;
  if (args.status === ST.AWAITING && !args.gateCleared) return OUTCOMES.AWAITING_FINANCE;
  if (args.status === ST.DEFICIENCY && args.deficiencyDue && args.today > args.deficiencyDue) return OUTCOMES.LAPSE;
  if (args.determinationDue && !args.finalDecision && args.today > args.determinationDue) return OUTCOMES.PROVISIONAL;
  if (args.checks.failed > 0) return OUTCOMES.DEFICIENCY;
  if (args.checks.pending > 0) return OUTCOMES.IN_PROGRESS;
  return args.linked ? OUTCOMES.APPLY : OUTCOMES.REGISTER;
}
