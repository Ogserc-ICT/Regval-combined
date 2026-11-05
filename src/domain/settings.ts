/**
 * The one set of settings for both modules (SPEC §2; [G1]).
 * Stored as key/value rows; any key not stored takes its default here.
 */
import { z } from "zod";
import { addDays, isLocalDate, type LocalDate } from "./dates";

const yn = z.enum(["Y", "N"]);
const localDate = z.string().refine(isLocalDate, "Enter a date as YYYY-MM-DD");
const days = (max = 3650) => z.number().int().min(0).max(max);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a time as HH:MM");

export const CATEGORIES = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"] as const;

export const settingsSchema = z.object({
  // Order parameters
  effectiveDate: localDate,
  effectiveDatePlaceholder: z.boolean(),
  registrationPeriodDays: days(),
  extensionDays: days(),
  newOperatorLeadDays: days(),
  determinationDays: days(),
  deficiencyResponseDays: days(),
  licenceApplicationDays: days(),
  licenceExpiryWindowDays: days(),
  amberWarningDays: days(),
  ownUseThresholdKw: z.number().min(0).max(1000),
  showCauseDays: days(),
  annualConfirmationDueMonth: z.number().int().min(1).max(12),
  annualConfirmationDueDay: z.number().int().min(1).max(31),
  feesRevisedOn: localDate.nullable(),
  // Policy settings (Settings rows 33–42; Q11)
  lateBlocksComplete: yn,
  waiverReducesLate: yn,
  flagsBlockApproval: yn,
  lateRequiredForRelease: yn,
  unpaidReminderDays: days().nullable(),
  supplyRetailCategoryAt1MW: z.enum(CATEGORIES).exclude(["I"]),
  wrongFormHandling: z.enum(["Accept and re-categorise", "Require the correct form"]),
  otherActivityDocs: yn,
  ownUseCertificate: yn,
  feeOnUpdates: yn,
  // Registry
  officeClosingTime: time,
  forwardingTargetDays: days(365),
  dispatchTargetDays: days(365),
  podChaseDays: days(365),
  urgentResponseDays: days(365),
  defaultResponseDays: days(365),
  fileReturnDays: days(365),
  ackEmailMode: z.enum(["Send", "Preview", "Off"]),
  ackEmailCc: z.string().max(500),
  registryAddress: z.string().min(1).max(300),
});

export type Settings = z.infer<typeof settingsSchema>;
export type SettingKey = keyof Settings;

export const DEFAULT_SETTINGS: Settings = {
  effectiveDate: "2026-10-22",
  effectiveDatePlaceholder: true,
  registrationPeriodDays: 60,
  extensionDays: 0,
  newOperatorLeadDays: 30,
  determinationDays: 30,
  deficiencyResponseDays: 14,
  licenceApplicationDays: 90,
  licenceExpiryWindowDays: 183,
  amberWarningDays: 7,
  ownUseThresholdKw: 200,
  showCauseDays: 14,
  annualConfirmationDueMonth: 1,
  annualConfirmationDueDay: 31,
  feesRevisedOn: null,
  lateBlocksComplete: "N",
  waiverReducesLate: "N",
  flagsBlockApproval: "N",
  lateRequiredForRelease: "N",
  unpaidReminderDays: null,
  supplyRetailCategoryAt1MW: "K",
  wrongFormHandling: "Accept and re-categorise",
  otherActivityDocs: "N",
  ownUseCertificate: "N",
  feeOnUpdates: "N",
  officeClosingTime: "17:00",
  forwardingTargetDays: 2,
  dispatchTargetDays: 2,
  podChaseDays: 5,
  urgentResponseDays: 1,
  defaultResponseDays: 10,
  fileReturnDays: 3,
  ackEmailMode: "Preview",
  ackEmailCc: "",
  registryAddress: "Registry · 5th & 6th Floors, OPIC Building, Oke-Ilewo, Abeokuta",
};

export type SettingKind = "date" | "boolean" | "days" | "number" | "yn" | "choice" | "time" | "text";

export type SettingMeta = {
  label: string;
  group: "Order parameters" | "Policy settings" | "Registry" | "Acknowledgement email";
  kind: SettingKind;
  note: string;
  source: string;
  choices?: readonly string[];
  nullable?: boolean;
};

export const SETTING_META: Record<SettingKey, SettingMeta> = {
  effectiveDate: { label: "Effective Date of the Order", group: "Order parameters", kind: "date", note: "Para 2. Every deadline in both modules derives from this one date.", source: "Settings B7 (Registry Settings B14 dropped, G1)" },
  effectiveDatePlaceholder: { label: "Effective Date is a placeholder", group: "Order parameters", kind: "boolean", note: "Untick once the gazetted Effective Date is entered.", source: "Settings C7" },
  registrationPeriodDays: { label: "Registration period (days)", group: "Order parameters", kind: "days", note: "Para 11(1).", source: "Settings B8" },
  extensionDays: { label: "Extension of registration period (days)", group: "Order parameters", kind: "days", note: "Para 25: any extension granted by public notice.", source: "Settings B9" },
  newOperatorLeadDays: { label: "New operators: register at least (days) before start", group: "Order parameters", kind: "days", note: "Para 11(2).", source: "Settings B11" },
  determinationDays: { label: "Determination period (days)", group: "Order parameters", kind: "days", note: "Para 13(1); provisional registration after this (para 13(4)).", source: "Settings B12" },
  deficiencyResponseDays: { label: "Deficiency response period (days)", group: "Order parameters", kind: "days", note: "Para 13(1)(b).", source: "Settings B13" },
  licenceApplicationDays: { label: "Unlicensed: licence application within (days)", group: "Order parameters", kind: "days", note: "Para 18(1).", source: "Settings B14" },
  licenceExpiryWindowDays: { label: "Licence expiry window for the renewal flag (days)", group: "Order parameters", kind: "days", note: "Para 8(5): six months.", source: "Settings B15" },
  amberWarningDays: { label: "Amber warning: days before determination due", group: "Order parameters", kind: "days", note: "Traffic light.", source: "Settings B16" },
  ownUseThresholdKw: { label: "Own-use notification threshold (kW)", group: "Order parameters", kind: "number", note: "Para 3(4): 200 kW to below 1 MW.", source: "Settings B17" },
  showCauseDays: { label: "Show-cause period before refusal (days)", group: "Order parameters", kind: "days", note: "Para 20.", source: "Settings B18" },
  annualConfirmationDueMonth: { label: "Annual confirmation due: month (1–12)", group: "Order parameters", kind: "number", note: "Para 16(2): 31 January.", source: "Settings B19" },
  annualConfirmationDueDay: { label: "Annual confirmation due: day", group: "Order parameters", kind: "number", note: "Para 16(2).", source: "Settings B20" },
  feesRevisedOn: { label: "Fees revised on", group: "Order parameters", kind: "date", note: "Informational.", source: "Settings A21", nullable: true },
  lateBlocksComplete: { label: "Unpaid late charge blocks “submission complete”", group: "Policy settings", kind: "yn", note: "Undecided by the Commission (Q11).", source: "Settings B33" },
  waiverReducesLate: { label: "Waiver also reduces the late charge", group: "Policy settings", kind: "yn", note: "Undecided by the Commission (Q11).", source: "Settings B34" },
  flagsBlockApproval: { label: "Unresolved data flags block approval outright", group: "Policy settings", kind: "yn", note: "N = an approver may override unresolved flags with a written reason, which is logged. Y = flags block approval. To be confirmed before Phase 2 (Q11).", source: "Settings B35" },
  lateRequiredForRelease: { label: "Late charge required to release for evaluation", group: "Policy settings", kind: "yn", note: "Finance gate (Q11).", source: "Settings B36" },
  unpaidReminderDays: { label: "Unpaid acknowledgement reminder after (days)", group: "Policy settings", kind: "days", note: "Blank = no reminder. Counted in the daily review; nothing is sent.", source: "Settings B37", nullable: true },
  supplyRetailCategoryAt1MW: { label: "Supply / retail category at 1 MW or more", group: "Policy settings", kind: "choice", note: "Default K.", source: "Settings B38", choices: CATEGORIES.filter((c) => c !== "I") },
  wrongFormHandling: { label: "Wrong form handling", group: "Policy settings", kind: "choice", note: "When the confirmed category differs from the form filed.", source: "Settings B39", choices: ["Accept and re-categorise", "Require the correct form"] },
  otherActivityDocs: { label: "Other activities require their form's documents", group: "Policy settings", kind: "yn", note: "Q11.", source: "Settings B40" },
  ownUseCertificate: { label: "Own-use gets a certificate", group: "Policy settings", kind: "yn", note: "Q11.", source: "Settings B41" },
  feeOnUpdates: { label: "Registration fee on updates and annual confirmations", group: "Policy settings", kind: "yn", note: "Q11.", source: "Settings B42" },
  officeClosingTime: { label: "Office closing time", group: "Registry", kind: "time", note: "Para 10(3): email and portal items at or after this time are received the next working day.", source: "Registry Settings B7" },
  forwardingTargetDays: { label: "Registry forwarding target (working days)", group: "Registry", kind: "days", note: "Internal service standard.", source: "Registry Settings B8" },
  dispatchTargetDays: { label: "Dispatch target: document date to dispatch (working days)", group: "Registry", kind: "days", note: "Outgoing items not dispatched within this are flagged.", source: "Registry Settings B9" },
  podChaseDays: { label: "Chase proof of delivery after (working days)", group: "Registry", kind: "days", note: "Dispatched items without confirmed delivery after this are flagged.", source: "Registry Settings B10" },
  urgentResponseDays: { label: "Response target for Urgent items (working days)", group: "Registry", kind: "days", note: "Overrides the type's target when Priority = Urgent.", source: "Registry Settings B11" },
  defaultResponseDays: { label: "Default response target (working days)", group: "Registry", kind: "days", note: "Used when a type has no target set.", source: "Registry Settings B12" },
  fileReturnDays: { label: "File return target (working days)", group: "Registry", kind: "days", note: "Files not returned within this are flagged.", source: "Registry Settings B13" },
  ackEmailMode: { label: "Acknowledgement email", group: "Acknowledgement email", kind: "choice", note: "Send = sent on save · Preview = the officer reviews before sending · Off.", source: "Registry Settings B18 (G9)", choices: ["Send", "Preview", "Off"] },
  ackEmailCc: { label: "Acknowledgement email: copy to (CC)", group: "Acknowledgement email", kind: "text", note: "Optional, e.g. the Secretary's mailbox. Separate addresses with ;", source: "Registry Settings B17" },
  registryAddress: { label: "Registry address on slips", group: "Registry", kind: "text", note: "Printed under the Commission's name.", source: "Acknowledgement Slip B4" },
};

/** Merge stored values over the defaults; a stored value that no longer validates falls back to its default. */
export function resolveSettings(stored: Partial<Record<string, unknown>>): Settings {
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as SettingKey[]) {
    if (key in stored) {
      const field = settingsSchema.shape[key];
      const parsed = field.safeParse(stored[key]);
      if (parsed.success) merged[key] = parsed.data;
    }
  }
  return merged as Settings;
}

/**
 * Registration deadline for existing operators:
 * Effective Date + registration period + extension (Settings B10; [G1]).
 * The one deadline used by the Register, the inward "filed after deadline"
 * flag and the dashboard.
 */
export function registrationDeadline(s: Pick<Settings, "effectiveDate" | "registrationPeriodDays" | "extensionDays">): LocalDate {
  return addDays(s.effectiveDate, s.registrationPeriodDays + s.extensionDays);
}

/** Display a stored value the way the settings screen and audit log show it. */
export function displaySetting(key: SettingKey, value: unknown): string {
  if (value === null || value === undefined || value === "") return "(blank)";
  const meta = SETTING_META[key];
  if (meta.kind === "boolean") return value ? "Yes" : "No";
  return String(value);
}
