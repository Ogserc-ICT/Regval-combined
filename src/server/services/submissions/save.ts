/**
 * Save submission (SPEC §6; modIntake.SaveSubmissionAt) and edit details.
 */
import { and, eq, inArray } from "drizzle-orm";
import { isLocalDate } from "@/domain/dates";
import { currentPricing } from "@/domain/registration/pricing";
import { FILING_LABELS, ST, type Filing } from "@/domain/registration/types";
import { validateCac, validateEmail, validatePhone, normaliseTin } from "@/domain/validators";
import { auditActor, authorize, type Actor } from "../../auth/actor";
import { writeAudit } from "../../audit";
import { all, type Db, type Tx } from "../../db/connect";
import { evaluations, submissionLicences, submissionOtherActivities, submissions } from "../../db/schema";
import { blocked, needsConfirmation, notFound, Problems } from "../../errors";
import { lagosToday } from "../../time";
import { checkReceipt, deemedFor, issueAck } from "../receipt";
import { listValues, loadRef } from "../reference";
import { getSettings } from "../settings";
import { CONDITION_COLUMNS, duplicateChecks, type SubmissionRow } from "./load";
import { tryRelease } from "./workflow";

export type SubmissionInput = {
  filingType: string;
  formFiled?: string | null;
  linkedRegistrationNo?: string | null;
  registeredName: string;
  tradingName?: string | null;
  /** Date received (YYYY-MM-DD), time received (HH:MM) and channel: para 10(3). */
  dateSubmitted: string;
  timeReceived?: string | null;
  submissionChannel?: string | null;
  registrantType?: string | null;
  cacNo?: string | null;
  tin?: string | null;
  registeredAddress?: string | null;
  principalLga?: string | null;
  otherLgas?: string | null;
  townsEstates?: string | null;
  primaryActivity?: string | null;
  otherActivities?: string[];
  installedCapacityMw?: number | null;
  customers?: number | null;
  licenceStatus?: string | null;
  licences?: { licenceNo?: string | null; expiryDate?: string | null }[];
  complianceOfficer?: string | null;
  phone?: string | null;
  email?: string | null;
  operatingOnEffectiveDate?: string | null;
  plannedStartDate?: string | null;
  /** Kobo. */
  approvedWaiver?: number | null;
  categoryOverride?: string | null;
  overrideReason?: string | null;
  /** Condition key → true (Y) / false (N) / null (blank = applies). */
  conditions?: Record<string, boolean | null>;
  formSectionsNotComplete?: string | null;
  capacityInSectionsMw?: number | null;
  remarks?: string | null;
};

export type SaveOptions = { confirmWarnings?: boolean };

const t = (v: string | null | undefined) => {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
};

type Columns = Omit<typeof submissions.$inferInsert, "id" | "ackNo" | "deemedReceiptDate" | "createdAt" | "updatedAt">;

/** Validate everything at once (SPEC §6). Returns the column values and child rows. */
async function validate(tx: Tx, input: SubmissionInput, selfId: string | null, today: string) {
  const p = new Problems();
  const [ref, lgas, licenceStatuses, channels, registrantTypes] = await all(tx, [
    () => loadRef(tx),
    () => listValues(tx, "lga"),
    () => listValues(tx, "licence_status"),
    () => listValues(tx, "submission_channel"),
    () => listValues(tx, "registrant_type"),
  ]);
  const filing = input.filingType as Filing;
  if (!(filing in FILING_LABELS)) p.field("filingType", "Choose the filing type from the list.");
  const name = t(input.registeredName);
  if (!name) p.field("registeredName", "Registered name is required.");
  const receipt = checkReceipt(p, { date: input.dateSubmitted, time: input.timeReceived, channel: input.submissionChannel }, channels);
  void today;
  const form = t(input.formFiled);
  if (!form) p.field("formFiled", "Form filed is required (REG-01A to REG-01K).");
  else if (form === "REG-01I") p.field("formFiled", "REG-01I is the own-use notification: record it under Own-use.");
  else if (!ref.forms.some((f) => f.form === form)) p.field("formFiled", "Form filed must be REG-01A to REG-01K.");
  const lga = t(input.principalLga);
  if (!lga || !lgas.includes(lga)) p.field("principalLga", "Principal LGA is required (from the list).");
  const primary = t(input.primaryActivity);
  if (!primary || !ref.activities.some((a) => a.code === primary)) p.field("primaryActivity", "Primary activity is required (from the list).");
  const others = (input.otherActivities ?? []).map((o) => o.trim()).filter(Boolean);
  const unknown = others.filter((o) => !ref.activities.some((a) => a.code === o));
  if (unknown.length) p.field("otherActivities", `Not in the activities list: ${unknown.join(", ")}`);
  const licence = t(input.licenceStatus);
  if (!licence || !licenceStatuses.includes(licence)) p.field("licenceStatus", "Licence status is required (from the list).");
  const operating = t(input.operatingOnEffectiveDate);
  const start = t(input.plannedStartDate);
  if (operating !== "Y" && operating !== "N") p.field("operatingOnEffectiveDate", "Operating on the Effective Date must be Y or N.");
  else if (operating === "N" && (!start || !isLocalDate(start))) p.field("plannedStartDate", "Planned start date is required for a new operator.");
  const regType = t(input.registrantType);
  if (regType && !registrantTypes.includes(regType)) p.field("registrantType", "Choose the registrant type from the list.");
  let cac = t(input.cacNo);
  if (cac) {
    const v = validateCac(cac);
    if (!v.ok) p.field("cacNo", v.message);
    else cac = v.value;
  }
  let phone = t(input.phone);
  if (phone) {
    const v = validatePhone(phone);
    if (!v.ok) p.field("phone", v.message);
    else phone = v.value;
  }
  const email = t(input.email);
  if (email && !validateEmail(email).ok) p.field("email", "Email address is not valid.");
  const waiver = input.approvedWaiver ?? 0;
  if (!Number.isFinite(waiver) || waiver < 0) p.field("approvedWaiver", "The waiver cannot be negative.");
  const cap = input.installedCapacityMw ?? null;
  if (cap !== null && (!Number.isFinite(cap) || cap < 0)) p.field("installedCapacityMw", "Capacity must be a number of MW (0 or more).");
  const override = t(input.categoryOverride);
  if (override && (override === "I" || !ref.fees.some((f) => f.category === override))) p.field("categoryOverride", "Choose a Schedule 3 category (A to K, not I).");
  const licences = (input.licences ?? [])
    .map((l) => ({ licenceNo: t(l.licenceNo), expiryDate: t(l.expiryDate) }))
    .filter((l) => l.licenceNo || l.expiryDate);
  if (licences.some((l) => l.expiryDate && !isLocalDate(l.expiryDate))) p.field("licences", "Licence expiry dates must be YYYY-MM-DD.");

  // Linked registration (updates and annual confirmations), Q15
  let linkedId: string | null = null;
  const linkedNo = t(input.linkedRegistrationNo);
  if (filing !== "NEW" && filing in FILING_LABELS) {
    if (!linkedNo) p.field("linkedRegistrationNo", "Quote the registration number this filing is for.");
    else {
      const [parent] = await tx.select().from(submissions).where(eq(submissions.registrationNo, linkedNo));
      if (!parent) p.field("linkedRegistrationNo", `No registration ${linkedNo} on the Register.`);
      else if (parent.status !== ST.REGISTERED || parent.filingType !== "NEW") p.field("linkedRegistrationNo", `${linkedNo} is not a Registered new registration.`);
      else linkedId = parent.id;
    }
  }

  const conditions: Record<string, boolean | null> = {};
  for (const [k, col] of Object.entries(CONDITION_COLUMNS)) conditions[col as string] = input.conditions?.[k] ?? null;

  const cols: Columns = {
    filingType: filing,
    formFiled: form,
    linkedSubmissionId: linkedId,
    linkedRegistrationNo: filing === "NEW" ? null : linkedNo,
    registeredName: name ?? "",
    tradingName: t(input.tradingName),
    dateSubmitted: receipt?.date ?? input.dateSubmitted,
    receivedAt: receipt?.receivedAt ?? new Date(0),
    submissionChannel: receipt?.channel ?? "",
    registrantType: regType,
    cacNo: cac,
    tin: input.tin ? normaliseTin(input.tin) || null : null,
    registeredAddress: t(input.registeredAddress),
    principalLga: lga,
    otherLgas: t(input.otherLgas),
    townsEstates: t(input.townsEstates),
    primaryActivity: primary,
    installedCapacityMw: cap,
    customers: input.customers ?? null,
    licenceStatus: licence,
    complianceOfficer: t(input.complianceOfficer),
    phone,
    email,
    operatingOnEffectiveDate: operating,
    plannedStartDate: operating === "N" ? start : t(input.plannedStartDate),
    approvedWaiver: Math.round(waiver),
    categoryOverride: override,
    overrideReason: t(input.overrideReason),
    ...conditions,
    formSectionsNotComplete: t(input.formSectionsNotComplete),
    capacityInSectionsMw: input.capacityInSectionsMw ?? null,
    remarks: t(input.remarks),
  };
  return { problems: p, cols, others, licences, ref, linkedId };
}

/** Checks that need the pricing: the waiver limit and the override reason (modIntake). */
function checkPricing(p: Problems, cols: Columns, ref: Awaited<ReturnType<typeof loadRef>>, settings: Awaited<ReturnType<typeof getSettings>>, others: string[]) {
  const facts = {
    categoryOverride: cols.categoryOverride ?? null,
    primaryActivity: cols.primaryActivity ?? null,
    otherActivities: others,
    installedCapacityMw: cols.installedCapacityMw ?? null,
    filingType: cols.filingType as Filing,
    operatingOnEffectiveDate: (cols.operatingOnEffectiveDate as "Y" | "N" | null) ?? null,
    plannedStartDate: cols.plannedStartDate ?? null,
  };
  const now = currentPricing(facts, ref, settings);
  const auto = currentPricing({ ...facts, categoryOverride: null }, ref, settings);
  if ((cols.approvedWaiver ?? 0) > (now?.fee ?? 0)) p.field("approvedWaiver", "The waiver cannot be more than the registration fee.");
  if (cols.categoryOverride && cols.categoryOverride !== auto?.category && !cols.overrideReason) {
    p.field("overrideReason", "Give the reason for the category override.");
  }
  return now;
}

async function writeChildren(tx: Tx, id: string, others: string[], licences: { licenceNo: string | null; expiryDate: string | null }[]) {
  await tx.delete(submissionOtherActivities).where(eq(submissionOtherActivities.submissionId, id));
  await tx.delete(submissionLicences).where(eq(submissionLicences.submissionId, id));
  if (others.length) await tx.insert(submissionOtherActivities).values(others.map((activity, i) => ({ submissionId: id, position: i + 1, activity })));
  if (licences.length) await tx.insert(submissionLicences).values(licences.map((l, i) => ({ submissionId: id, position: i + 1, ...l })));
}

/** A saved filing's receipt facts never change: they set its ACK and deemed receipt date. */
function keepReceipt(cols: Columns, row: { dateSubmitted: string; receivedAt: Date; submissionChannel: string }) {
  cols.dateSubmitted = row.dateSubmitted;
  cols.receivedAt = row.receivedAt;
  cols.submissionChannel = row.submissionChannel;
}

/** Saves the Register entry: snapshot, status, evaluation row, audit, gate. */
async function finishSave(tx: Tx, actor: Actor, id: string, ackNo: string, cols: Columns, others: string[], pricing: ReturnType<typeof currentPricing>, settings: Awaited<ReturnType<typeof getSettings>>, linkedId: string | null) {
  await tx
    .update(submissions)
    .set({
      status: ST.AWAITING,
      pricedCategory: pricing?.category ?? null,
      pricedFee: pricing?.fee ?? null,
      pricedLateInitial: pricing?.lateInitial ?? null,
      pricedLateDaily: pricing?.lateDaily ?? null,
      pricedLateCap: pricing?.lateCap ?? null,
      pricedDeadline: pricing?.deadline ?? null,
      pricedEffectiveDate: pricing ? settings.effectiveDate : null,
      createdBy: actor.id,
      createdByName: actor.name,
      savedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(submissions.id, id));
  await tx.insert(evaluations).values({ submissionId: id }).onConflictDoNothing();
  const label = FILING_LABELS[cols.filingType as Filing];
  if (linkedId) {
    const [parent] = await tx.select({ ackNo: submissions.ackNo }).from(submissions).where(eq(submissions.id, linkedId));
    await writeAudit(tx, {
      actor: auditActor(actor),
      action: "Filing received",
      module: "registration",
      entityType: "submission",
      entityId: linkedId,
      reference: parent?.ackNo,
      detail: `${label} ${ackNo} filed for ${cols.linkedRegistrationNo}`,
    });
  }
  await writeAudit(tx, {
    actor: auditActor(actor),
    action: "New submission",
    module: "registration",
    entityType: "submission",
    entityId: id,
    reference: ackNo,
    detail: `${cols.registeredName} - Category ${pricing?.category ?? "?"} - Form ${cols.formFiled}${linkedId ? `; ${label} of ${cols.linkedRegistrationNo}` : ""}`,
    data: { pricing, otherActivities: others },
  });
  await tryRelease(tx, actor, id);
}

async function warnings(tx: Tx, row: Pick<SubmissionRow, "id" | "linkedSubmissionId" | "cacNo" | "registeredName">): Promise<string[]> {
  const d = await duplicateChecks(tx, row);
  return d.cac ? [`CAC number ${row.cacNo} is already on ${d.cac.ack} (${d.cac.name}). One registration per person (para 11(4)). Save anyway?`] : [];
}

/** A new Register entry: computes the deemed receipt date (para 10(3)) and issues the ACK. */
export async function createSubmission(db: Db, actor: Actor | null, input: SubmissionInput, opts: SaveOptions = {}): Promise<{ id: string; ackNo: string }> {
  authorize(actor, "submission:save");
  const today = lagosToday();
  return db.transaction(async (tx) => {
    const settings = await getSettings(tx);
    const v = await validate(tx, input, null, today);
    const pricing = checkPricing(v.problems, v.cols, v.ref, settings, v.others);
    v.problems.throwIfAny();
    const w = await warnings(tx, { id: "00000000-0000-0000-0000-000000000000", linkedSubmissionId: v.linkedId, cacNo: v.cols.cacNo ?? null, registeredName: v.cols.registeredName });
    if (w.length && !opts.confirmWarnings) throw needsConfirmation(...w);

    const deemed = await deemedFor(tx, { receivedAt: v.cols.receivedAt, channel: v.cols.submissionChannel });
    const ackNo = await issueAck(tx, deemed);
    const [row] = await tx
      .insert(submissions)
      .values({ ...v.cols, ackNo, deemedReceiptDate: deemed })
      .returning({ id: submissions.id });
    await writeChildren(tx, row.id, v.others, v.licences);
    await finishSave(tx, actor, row.id, ackNo, v.cols, v.others, pricing, settings, v.linkedId);
    return { id: row.id, ackNo };
  });
}

/**
 * Completes a row created before Phase 9 by the Registry's intake and never saved: it keeps the
 * ACK and receipt facts it was given then. New entries are created whole by createSubmission.
 */
export async function saveDraftSubmission(db: Db, actor: Actor | null, id: string, input: SubmissionInput, opts: SaveOptions = {}): Promise<{ id: string; ackNo: string }> {
  authorize(actor, "submission:save");
  return db.transaction((tx) => saveDraftInTx(tx, actor, id, input, opts));
}

async function saveDraftInTx(tx: Tx, actor: Actor, id: string, input: SubmissionInput, opts: SaveOptions = {}): Promise<{ id: string; ackNo: string }> {
  authorize(actor, "submission:save");
  const today = lagosToday();
  const [row] = await tx.select().from(submissions).where(eq(submissions.id, id)).for("update");
  if (!row) throw notFound("Submission");
  if (row.status) throw blocked(`This submission is already saved as ${row.ackNo}.`);
  const settings = await getSettings(tx);
  const v = await validate(tx, { ...input, dateSubmitted: row.dateSubmitted, timeReceived: "00:00", submissionChannel: row.submissionChannel }, id, today);
  keepReceipt(v.cols, row);
  const pricing = checkPricing(v.problems, v.cols, v.ref, settings, v.others);
  v.problems.throwIfAny();
  const w = await warnings(tx, { id, linkedSubmissionId: v.linkedId, cacNo: v.cols.cacNo ?? null, registeredName: v.cols.registeredName });
  if (w.length && !opts.confirmWarnings) throw needsConfirmation(...w);
  await tx.update(submissions).set({ ...v.cols, updatedAt: new Date() }).where(eq(submissions.id, id));
  await writeChildren(tx, id, v.others, v.licences);
  await finishSave(tx, actor, id, row.ackNo, v.cols, v.others, pricing, settings, v.linkedId);
  return { id, ackNo: row.ackNo };
}

const FIELD_LABELS: Partial<Record<keyof Columns, string>> = {
  formFiled: "Form filed", linkedRegistrationNo: "Linked registration no.", registeredName: "Registered name", tradingName: "Trading name",
  registrantType: "Registrant type", cacNo: "CAC no.", tin: "TIN",
  registeredAddress: "Registered address", principalLga: "Principal LGA", otherLgas: "Other LGAs served", townsEstates: "Towns / estates served",
  primaryActivity: "Primary activity", installedCapacityMw: "Installed capacity (MW)", customers: "Customers", licenceStatus: "Licence status",
  complianceOfficer: "Compliance officer", phone: "Phone", email: "Email", operatingOnEffectiveDate: "Operating on Effective Date",
  plannedStartDate: "Planned start date", approvedWaiver: "Approved waiver (kobo)", categoryOverride: "Category override", overrideReason: "Override reason",
  formSectionsNotComplete: "Form sections not complete", capacityInSectionsMw: "Capacity stated in sections (MW)", remarks: "Remarks",
  condMultiState: "Multi-State licensee", condGenerationForSale: "Generation for sale", condGridConnected: "Grid connected",
  condInterconnectedMinigrid: "Interconnected mini-grid", condFDistribution: "Form F Part 1", condFTrading: "Form F Part 2",
  condDiscoBulkSupply: "DisCo bulk supply", condSubFranchise: "Sub-franchisee",
};

const show = (v: unknown) => (v === null || v === undefined || v === "" ? "(blank)" : v === true ? "Y" : v === false ? "N" : String(v));

/**
 * Edit the details of a saved, open submission (the workbook logs every edit
 * old → new). The pricing snapshot is not changed: differences raise
 * PRICING_OUT_OF_DATE until an admin recalculates.
 */
export async function updateSubmission(db: Db, actor: Actor | null, id: string, input: SubmissionInput, opts: SaveOptions = {}): Promise<string[]> {
  authorize(actor, "submission:save");
  const today = lagosToday();
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(submissions).where(eq(submissions.id, id)).for("update");
    if (!row) throw notFound("Submission");
    if (!row.status) throw blocked("Save the Register entry first.");
    if ([ST.REGISTERED, ST.REFUSED, ST.LAPSED, ST.CANCELLED, ST.APPLIED].includes(row.status as never)) {
      throw blocked(`The submission is closed (${row.status}); its details can no longer be changed.`);
    }
    const [ev] = await tx.select().from(evaluations).where(eq(evaluations.submissionId, id));
    if (ev?.finalDecision) throw blocked("A final decision is recorded; the details can no longer be changed.");
    if (input.filingType !== row.filingType) throw blocked("The filing type cannot be changed after saving.");
    const settings = await getSettings(tx);
    // The receipt facts are fixed at the first save; only the other details can be edited.
    const v = await validate(tx, { ...input, dateSubmitted: row.dateSubmitted, timeReceived: "00:00", submissionChannel: row.submissionChannel }, id, today);
    keepReceipt(v.cols, row);
    checkPricing(v.problems, v.cols, v.ref, settings, v.others);
    v.problems.throwIfAny();
    const w = row.cacNo?.toLowerCase() !== v.cols.cacNo?.toLowerCase()
      ? await warnings(tx, { id, linkedSubmissionId: v.linkedId, cacNo: v.cols.cacNo ?? null, registeredName: v.cols.registeredName })
      : [];
    if (w.length && !opts.confirmWarnings) throw needsConfirmation(...w);

    const [oldOthers, oldLics] = await all(tx, [
      () => tx.select().from(submissionOtherActivities).where(eq(submissionOtherActivities.submissionId, id)),
      () => tx.select().from(submissionLicences).where(eq(submissionLicences.submissionId, id)),
    ]);
    const changes: string[] = [];
    for (const [k, label] of Object.entries(FIELD_LABELS) as [keyof Columns, string][]) {
      const before = (row as Record<string, unknown>)[k];
      const after = (v.cols as Record<string, unknown>)[k];
      if (show(before) !== show(after)) changes.push(`${label}: ${show(before)} → ${show(after)}`);
    }
    const o1 = oldOthers.sort((a, b) => a.position - b.position).map((o) => o.activity).join(", ");
    const o2 = v.others.join(", ");
    if (o1 !== o2) changes.push(`Other activities: ${o1 || "(blank)"} → ${o2 || "(blank)"}`);
    const l1 = oldLics.sort((a, b) => a.position - b.position).map((l) => `${l.licenceNo ?? ""} ${l.expiryDate ?? ""}`.trim()).join("; ");
    const l2 = v.licences.map((l) => `${l.licenceNo ?? ""} ${l.expiryDate ?? ""}`.trim()).join("; ");
    if (l1 !== l2) changes.push(`Licences: ${l1 || "(blank)"} → ${l2 || "(blank)"}`);
    if (!changes.length) return [];

    const { filingType: _f, ...rest } = v.cols;
    void _f;
    await tx.update(submissions).set({ ...rest, updatedAt: new Date() }).where(eq(submissions.id, id));
    await writeChildren(tx, id, v.others, v.licences);
    await writeAudit(tx, {
      actor: auditActor(actor),
      action: "Edited",
      module: "registration",
      entityType: "submission",
      entityId: id,
      reference: row.ackNo,
      detail: changes.join("; "),
    });
    await tryRelease(tx, actor, id);
    return changes;
  });
}

export async function submissionIdsByAck(db: Db, acks: string[]) {
  return db.select({ id: submissions.id, ackNo: submissions.ackNo }).from(submissions).where(and(inArray(submissions.ackNo, acks)));
}
