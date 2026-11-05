/**
 * Registry rules (SPEC §17–§23). Pure: callers pass the stored record, the
 * facts it depends on, settings, holidays and "today". The same functions feed
 * the registers, item pages, pending actions and (Phase 4/5) PDFs and the
 * dashboard, so each workbook formula is written once.
 */
import { compareDates, lagosDate, type LocalDate } from "./dates";
import type { Settings } from "./settings";
import { addWorkingDays, workingDaysElapsed, type HolidaySet } from "./workdays";

type RegistrySettings = Pick<
  Settings,
  | "forwardingTargetDays"
  | "dispatchTargetDays"
  | "podChaseDays"
  | "urgentResponseDays"
  | "defaultResponseDays"
  | "fileReturnDays"
>;

/** Actions that need no response (Registry Lists R). */
export const NO_RESPONSE_ACTIONS: ReadonlySet<string> = new Set(["For information", "File only"]);

// ------------------------------------------------------------------ front desk

/** Working days an FD item has waited for the Registry: NETWORKDAYS(received, today) − 1. */
export function frontDeskWaiting(receivedAt: Date, today: LocalDate, holidays: HolidaySet): number {
  return workingDaysElapsed(lagosDate(receivedAt), today, holidays);
}

// ------------------------------------------------------------------ inward

export const INWARD_STATUSES = ["Closed", "Overdue", "Awaiting routing", "Awaiting forwarding", "Noted / filed", "Open"] as const;
export type InwardStatus = (typeof INWARD_STATUSES)[number];

/** Statuses listed on Pending actions (SPEC §23). */
export const PENDING_STATUSES: ReadonlySet<InwardStatus> = new Set(["Open", "Overdue", "Awaiting forwarding", "Awaiting routing"]);

export type InwardType = {
  name: string;
  responseTargetDays: number;
  /** NEW | UPDATE | ANNUAL | OWNUSE when the type is a registration filing. */
  filingType: string | null;
} | null;

export type InwardFacts = {
  deemedReceiptDate: LocalDate;
  type: InwardType;
  sender: string | null;
  senderCategory: string | null;
  subject: string | null;
  mode: string | null;
  relatedOgsercNo: string | null;
  cacNo: string | null;
  schedule2Count: number | null;
  /** Documents on the Schedule 2 list of the form filed, when the form is known (Q16 default). */
  schedule2Expected?: number | null;
  feeEvidence: boolean | null;
  ackIssuedVia: string | null;
  actionRequired: string | null;
  priority: string | null;
  responseDueOverride: LocalDate | null;
  routedAt: Date | null;
  forwardedOn: LocalDate | null;
  closedManualOn: LocalDate | null;
  /** Dispatch date of the outward item quoting this ACK as "In reply to" (earliest). */
  replyDispatchedOn: LocalDate | null;
};

export type InwardContext = {
  settings: RegistrySettings;
  holidays: HolidaySet;
  today: LocalDate;
  /** Global registration deadline (Effective Date + period + extension) [G1]. */
  registrationDeadline: LocalDate;
  /** Another REG-01 inward item has the same CAC number. */
  duplicateRegCac?: boolean;
};

export type InwardAssessment = {
  responseDue: LocalDate | null;
  closedOn: LocalDate | null;
  status: InwardStatus;
  workingDaysAtRegistry: number;
  workingDaysOpen: number;
  filedAfterDeadline: boolean | null;
  flags: string[];
};

/** Response due (Inward Register AN). */
export function inwardResponseDue(f: InwardFacts, s: RegistrySettings, holidays: HolidaySet): LocalDate | null {
  if (f.responseDueOverride) return f.responseDueOverride;
  if (f.actionRequired && NO_RESPONSE_ACTIONS.has(f.actionRequired)) return null;
  if (f.priority === "Urgent") return addWorkingDays(f.deemedReceiptDate, s.urgentResponseDays, holidays);
  if (!f.type) return addWorkingDays(f.deemedReceiptDate, s.defaultResponseDays, holidays);
  if (f.type.responseTargetDays > 0) return addWorkingDays(f.deemedReceiptDate, f.type.responseTargetDays, holidays);
  return null;
}

export function inwardClosedOn(f: Pick<InwardFacts, "closedManualOn" | "replyDispatchedOn">): LocalDate | null {
  return f.closedManualOn ?? f.replyDispatchedOn;
}

/** Status (Inward Register AS), first match. */
export function inwardStatus(f: InwardFacts, due: LocalDate | null, closedOn: LocalDate | null, today: LocalDate): InwardStatus {
  if (closedOn) return "Closed";
  if (due && compareDates(today, due) > 0) return "Overdue";
  if (!f.forwardedOn && !f.routedAt) return "Awaiting routing";
  if (!f.forwardedOn) return "Awaiting forwarding";
  if (f.actionRequired && NO_RESPONSE_ACTIONS.has(f.actionRequired)) return "Noted / filed";
  return "Open";
}

const RELATED_REQUIRED = new Set(["UPDATE", "ANNUAL"]);

export function assessInward(f: InwardFacts, ctx: InwardContext): InwardAssessment {
  const { settings: s, holidays, today } = ctx;
  const responseDue = inwardResponseDue(f, s, holidays);
  const closedOn = inwardClosedOn(f);
  const status = inwardStatus(f, responseDue, closedOn, today);
  const workingDaysAtRegistry = workingDaysElapsed(f.deemedReceiptDate, f.forwardedOn ?? today, holidays);
  const workingDaysOpen = workingDaysElapsed(f.deemedReceiptDate, closedOn ?? today, holidays);
  const isNew = f.type?.filingType === "NEW";
  const filedAfterDeadline = isNew ? compareDates(f.deemedReceiptDate, ctx.registrationDeadline) > 0 : null;

  const flags: string[] = [];
  const missing = [
    ["type", f.type],
    ["sender", f.sender],
    ["sender category", f.senderCategory],
    ["subject", f.subject],
    ["mode", f.mode],
    ["acknowledgement issued via", f.ackIssuedVia],
  ].filter(([, v]) => v === null || v === undefined || v === "");
  if (missing.length) flags.push(`Missing: ${missing.map(([k]) => k).join(", ")}`);
  if (isNew && ctx.duplicateRegCac) flags.push(`Possible duplicate REG-01: CAC ${f.cacNo} already filed`);
  if (isNew && f.feeEvidence !== true) flags.push("No fee evidence with REG-01");
  const expected = f.schedule2Expected ?? null;
  if (f.schedule2Count !== null && expected !== null && f.schedule2Count < expected) flags.push(`Schedule 2 documents incomplete at receipt (${f.schedule2Count} of ${expected})`);
  const needsRelated = (f.type?.filingType && RELATED_REQUIRED.has(f.type.filingType)) || f.type?.name === "Deficiency response";
  if (needsRelated && !f.relatedOgsercNo) flags.push("Related OGSERC number missing");
  if (workingDaysAtRegistry > s.forwardingTargetDays && !closedOn) {
    flags.push(`Not forwarded within ${s.forwardingTargetDays} working days`);
  } else if (f.forwardedOn && workingDaysElapsed(f.deemedReceiptDate, f.forwardedOn, holidays) > s.forwardingTargetDays) {
    flags.push(`Forwarded after ${s.forwardingTargetDays} working days`);
  }
  if (!f.ackIssuedVia || f.ackIssuedVia === "Not yet issued") flags.push("Acknowledgement not yet issued");
  if (status === "Overdue") flags.push("Response overdue");
  if (closedOn && responseDue && compareDates(closedOn, responseDue) > 0) flags.push("Closed after the due date");
  return { responseDue, closedOn, status, workingDaysAtRegistry, workingDaysOpen, filedAfterDeadline, flags };
}

/**
 * Register / Own-Use entry state of an inward item whose type is a
 * registration filing (Inward Register BN; SPEC §18.2).
 */
export type EntryState = "Not a filing" | "Awaiting Register entry" | "Register row started – complete and save it" | "Saved on Register" | "Saved on Own-Use";

export function registerEntryState(
  type: InwardType,
  entry: { kind: "submission" | "own_use"; saved: boolean } | null,
): EntryState {
  if (!type?.filingType) return "Not a filing";
  if (!entry) return "Awaiting Register entry";
  if (!entry.saved) return "Register row started – complete and save it";
  return entry.kind === "own_use" ? "Saved on Own-Use" : "Saved on Register";
}

// ------------------------------------------------------------------ outward

export const OUTWARD_STATUSES = ["Not yet dispatched", "Response received", "Response overdue", "Awaiting response", "Delivered", "Dispatched"] as const;
export type OutwardStatus = (typeof OUTWARD_STATUSES)[number];

/** Dispatch modes that never get a proof of delivery (Outward Register AG). */
export const NO_POD_MODES: ReadonlySet<string> = new Set(["Publication / gazette", "Internal mail"]);

export type OutwardDocType = { responseExpected: boolean; responseDays: number } | null;

export type OutwardFacts = {
  documentDate: LocalDate;
  docType: OutwardDocType;
  subject: string | null;
  addressee: string | null;
  recipientCategory: string | null;
  dispatchMode: string | null;
  dispatchedOn: LocalDate | null;
  deliveryConfirmed: boolean;
  responseExpected: boolean | null;
  responseDueOverride: LocalDate | null;
  /** Deemed receipt date of the first inward item quoting this OUT number. */
  responseReceivedOn: LocalDate | null;
};

export type OutwardAssessment = {
  responseExpected: boolean;
  responseDue: LocalDate | null;
  status: OutwardStatus;
  workingDaysToDispatch: number;
  flags: string[];
};

export function outwardResponseDue(f: OutwardFacts, s: RegistrySettings, holidays: HolidaySet): LocalDate | null {
  if (f.responseDueOverride) return f.responseDueOverride;
  const expected = f.responseExpected ?? f.docType?.responseExpected ?? false;
  if (!expected || !f.dispatchedOn) return null;
  const days = f.docType && f.docType.responseDays > 0 ? f.docType.responseDays : s.defaultResponseDays;
  return addWorkingDays(f.dispatchedOn, days, holidays);
}

export function assessOutward(f: OutwardFacts, ctx: { settings: RegistrySettings; holidays: HolidaySet; today: LocalDate }): OutwardAssessment {
  const { settings: s, holidays, today } = ctx;
  const responseExpected = f.responseExpected ?? f.docType?.responseExpected ?? false;
  const responseDue = outwardResponseDue(f, s, holidays);
  let status: OutwardStatus;
  if (!f.dispatchedOn) status = "Not yet dispatched";
  else if (f.responseReceivedOn) status = "Response received";
  else if (responseDue && compareDates(today, responseDue) > 0) status = "Response overdue";
  else if (responseExpected) status = "Awaiting response";
  else if (f.deliveryConfirmed) status = "Delivered";
  else status = "Dispatched";
  const workingDaysToDispatch = workingDaysElapsed(f.documentDate, f.dispatchedOn ?? today, holidays);

  const flags: string[] = [];
  const missing = [
    ["subject", f.subject],
    ["addressee", f.addressee],
    ["recipient category", f.recipientCategory],
    ["dispatch mode", f.dispatchMode],
  ].filter(([, v]) => !v);
  if (missing.length) flags.push(`Missing: ${missing.map(([k]) => k).join(", ")}`);
  if (workingDaysToDispatch > s.dispatchTargetDays) flags.push(f.dispatchedOn ? `Dispatched after ${s.dispatchTargetDays} working days` : `Not dispatched within ${s.dispatchTargetDays} working days`);
  if (
    f.dispatchedOn &&
    !f.deliveryConfirmed &&
    !(f.dispatchMode && NO_POD_MODES.has(f.dispatchMode)) &&
    workingDaysElapsed(f.dispatchedOn, today, holidays) > s.podChaseDays
  ) {
    flags.push(`Delivery not confirmed after ${s.podChaseDays} working days`);
  }
  if (status === "Response overdue") flags.push("Response overdue");
  if (f.dispatchedOn && compareDates(f.dispatchedOn, f.documentDate) < 0) flags.push("Dispatched before the document date");
  return { responseExpected, responseDue, status, workingDaysToDispatch, flags };
}

// ------------------------------------------------------------------ files

export type MovementStatus = "Returned" | "Overdue" | "Out";

export type MovementFacts = { outAt: Date; returnByOverride: LocalDate | null; returnedAt: Date | null };

export function movementReturnDue(m: MovementFacts, s: Pick<RegistrySettings, "fileReturnDays">, holidays: HolidaySet): LocalDate {
  return m.returnByOverride ?? addWorkingDays(lagosDate(m.outAt), s.fileReturnDays, holidays);
}

export function movementStatus(m: MovementFacts, due: LocalDate, today: LocalDate): MovementStatus {
  if (m.returnedAt) return "Returned";
  return compareDates(today, due) > 0 ? "Overdue" : "Out";
}

export type FileFacts = {
  title: string | null;
  status: string;
  closedOn: LocalDate | null;
  /** Movements of this file, any order. */
  movements: (MovementFacts & { issuedTo: string; unitName: string | null })[];
  /** Deemed dates of inward items and document dates of outward items quoting the file. */
  correspondenceDates: LocalDate[];
};

export type FileAssessment = {
  currentlyWith: string;
  currentUnit: string | null;
  outSince: LocalDate | null;
  returnDue: LocalDate | null;
  workingDaysOut: number | null;
  isOut: boolean;
  overdue: boolean;
  lastCorrespondence: LocalDate | null;
  flags: string[];
};

export function assessFile(f: FileFacts, ctx: { settings: Pick<RegistrySettings, "fileReturnDays">; holidays: HolidaySet; today: LocalDate }): FileAssessment {
  const open = f.movements.filter((m) => !m.returnedAt).sort((a, b) => b.outAt.getTime() - a.outAt.getTime());
  const latest = open[0];
  const lastCorrespondence = f.correspondenceDates.length ? f.correspondenceDates.reduce((a, b) => (a > b ? a : b)) : null;
  const flags: string[] = [];
  if (!f.title) flags.push("Title missing");
  let returnDue: LocalDate | null = null;
  let overdue = false;
  if (latest) {
    returnDue = movementReturnDue(latest, ctx.settings, ctx.holidays);
    overdue = movementStatus(latest, returnDue, ctx.today) === "Overdue";
    if (overdue) flags.push("Out beyond its return date");
  }
  if (open.length > 1) flags.push("An earlier movement was not returned");
  if (f.closedOn && lastCorrespondence && compareDates(lastCorrespondence, f.closedOn) > 0) flags.push("Correspondence after the file was closed");
  return {
    currentlyWith: latest ? latest.issuedTo : "Registry",
    currentUnit: latest ? latest.unitName : null,
    outSince: latest ? lagosDate(latest.outAt) : null,
    returnDue,
    workingDaysOut: latest ? workingDaysElapsed(lagosDate(latest.outAt), ctx.today, ctx.holidays) : null,
    isOut: !!latest,
    overdue,
    lastCorrespondence,
    flags,
  };
}

// ------------------------------------------------------------------ email recipients

/**
 * Acknowledgement / routing email recipients (SPEC §25): the unit's and its
 * division's addresses, merged without duplicates. Cells may hold several
 * addresses separated by ";" or ",".
 */
export function unitRecipients(unitEmail: string | null | undefined, divisionEmail: string | null | undefined): string[] {
  const out: string[] = [];
  for (const cell of [unitEmail, divisionEmail]) {
    for (const a of (cell ?? "").split(/[;,]/)) {
      const v = a.trim();
      if (v && !out.some((o) => o.toLowerCase() === v.toLowerCase())) out.push(v);
    }
  }
  return out;
}
