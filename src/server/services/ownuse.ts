/**
 * Own-use notifications, REG-01I (SPEC §15; modIntake.SaveOwnUseAt, RegisterOwnUseFor).
 */
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { isLocalDate, lagosInstant, yearOf } from "@/domain/dates";
import { formatNaira } from "@/domain/money";
import { assessOwnUse, installedKw, ownUseFee, type OwnUseAssessment } from "@/domain/registration/ownuse";
import { registrationDeadline } from "@/domain/settings";
import { validateCac, validateEmail, validatePhone } from "@/domain/validators";
import { auditActor, authorize, type Actor } from "../auth/actor";
import { writeAudit } from "../audit";
import { all, type Db, type DbOrTx, type Tx } from "../db/connect";
import { documentChecklist, ownUseNotifications, ownUseUnits, payments, submissions } from "../db/schema";
import { blocked, forbidden, needsConfirmation, notFound, Problems, ServiceError } from "../errors";
import { issueNumber } from "../numbering";
import { lagosToday } from "../time";
import { createInwardItem } from "./inward";
import { correspondenceTypeForFiling, listValues, loadRef, signatoriesReady } from "./reference";
import { getSettings } from "./settings";

export type OwnUseInput = {
  name: string;
  dateFiled: string;
  cacNo?: string | null;
  siteAddress?: string | null;
  lga?: string | null;
  natureOfBusiness?: string | null;
  gridConnected?: string | null;
  distributionLicensee?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  remarks?: string | null;
  units: { makeModel?: string | null; kw: number; fuel?: string | null; avgMwh?: number | null }[];
};

const t = (v: string | null | undefined) => (v ?? "").trim() || null;

async function validate(tx: Tx, input: OwnUseInput, today: string) {
  const p = new Problems();
  const lgas = await listValues(tx, "lga");
  if (!t(input.name)) p.field("name", "Name is required.");
  if (!isLocalDate(input.dateFiled)) p.field("dateFiled", "Date filed is required (YYYY-MM-DD).");
  else if (input.dateFiled > today) p.field("dateFiled", "Date filed cannot be in the future.");
  if (!input.lga || !lgas.includes(input.lga)) p.field("lga", "LGA is required (from the list).");
  const units = input.units.filter((u) => Number.isFinite(u.kw) && u.kw > 0);
  if (!units.length) p.field("units", "At least one generator unit (kW) is required.");
  if (input.units.some((u) => !Number.isFinite(u.kw) || u.kw <= 0)) p.field("units", "Every generator unit needs its kW (more than 0).");
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
  if (t(input.email) && !validateEmail(input.email!).ok) p.field("email", "Email address is not valid.");
  return { p, cac, phone, units };
}

/** Save a notification (direct entry): ACK from the shared series, then the OUN. */
export async function createOwnUse(db: Db, actor: Actor | null, input: OwnUseInput, opts: { confirmWarnings?: boolean } = {}): Promise<{ id: string; ounNo: string; ackNo: string }> {
  authorize(actor, "ownuse:save");
  const today = lagosToday();
  return db.transaction(async (tx) => {
    const settings = await getSettings(tx);
    const { p, cac, phone, units } = await validate(tx, input, today);
    p.throwIfAny();
    const kw = installedKw(units.map((u) => u.kw))!;
    if (kw >= 1000) throw blocked(`Register as captive generation (para 3(3)(c)): ${kw} kW is 1 MW or more.`);
    const warnings: string[] = [];
    if (kw < settings.ownUseThresholdKw) warnings.push(`Below ${settings.ownUseThresholdKw} kW: does not need to notify (para 3(4)). Save anyway?`);
    if (cac && t(input.siteAddress)) {
      const [dup] = await tx
        .select({ oun: ownUseNotifications.ounNo })
        .from(ownUseNotifications)
        .where(and(sql`lower(trim(${ownUseNotifications.cacNo})) = ${cac.toLowerCase()}`, sql`lower(trim(${ownUseNotifications.siteAddress})) = ${t(input.siteAddress)!.toLowerCase()}`))
        .limit(1);
      if (dup) warnings.push(`Another own-use notification (${dup.oun}) has the same CAC number and site address (one notification per site). Save anyway?`);
    }
    if (warnings.length && !opts.confirmWarnings) throw needsConfirmation(...warnings);

    const type = await correspondenceTypeForFiling(tx, "OWNUSE");
    const inward = await createInwardItem(tx, {
      receivedAt: lagosInstant(input.dateFiled, "00:00"),
      mode: "Hand delivery",
      correspondenceTypeId: type?.id ?? null,
      sender: t(input.name)!,
      subject: "Own-use notification (REG-01I)",
      cacNo: cac,
      lga: input.lga,
      contactPerson: t(input.contactPerson),
      phone,
      email: t(input.email),
      receivedByUserId: actor.id,
      source: "own_use_direct",
      remarks: "Saved directly on the Own-Use sheet",
    });
    const ref = await loadRef(tx);
    const fee = ownUseFee(kw, settings.ownUseThresholdKw, ref.fees);
    const { number: oun } = await issueNumber(tx, "OUN", { year: yearOf(input.dateFiled) });
    const [row] = await tx
      .insert(ownUseNotifications)
      .values({
        inwardItemId: inward.id,
        ackNo: inward.ackNo,
        ounNo: oun,
        name: t(input.name)!,
        dateFiled: input.dateFiled,
        cacNo: cac,
        siteAddress: t(input.siteAddress),
        lga: input.lga,
        natureOfBusiness: t(input.natureOfBusiness),
        gridConnected: t(input.gridConnected),
        distributionLicensee: t(input.distributionLicensee),
        contactPerson: t(input.contactPerson),
        phone,
        email: t(input.email),
        remarks: t(input.remarks),
        createdBy: actor.id,
        createdByName: actor.name,
        pricedFee: fee,
        pricedThresholdKw: settings.ownUseThresholdKw,
        savedAt: new Date(),
      })
      .returning({ id: ownUseNotifications.id });
    await tx.insert(ownUseUnits).values(
      units.map((u, i) => ({ notificationId: row.id, position: i + 1, makeModel: t(u.makeModel), kw: u.kw, fuel: t(u.fuel), avgMwh: u.avgMwh ?? null })),
    );
    const elig = kw >= 1000 ? "Register as operator" : kw < settings.ownUseThresholdKw ? "Not required" : "Notification required";
    await writeAudit(tx, {
      actor: auditActor(actor),
      action: "Own-use notification",
      module: "registration",
      entityType: "own_use",
      entityId: row.id,
      reference: oun,
      detail: `${t(input.name)} - ${kw} kW - ${elig} - fee ${formatNaira(fee)} - registry ack ${inward.ackNo}`,
    });
    return { id: row.id, ounNo: oun, ackNo: inward.ackNo };
  });
}

export type LoadedOwnUse = {
  row: typeof ownUseNotifications.$inferSelect;
  units: (typeof ownUseUnits.$inferSelect)[];
  payments: (typeof payments.$inferSelect)[];
  a: OwnUseAssessment;
};

export async function loadOwnUse(db: DbOrTx, id: string): Promise<LoadedOwnUse> {
  const [row] = await db.select().from(ownUseNotifications).where(eq(ownUseNotifications.id, id));
  if (!row) throw notFound("Own-use notification");
  const [units, pays, checklist, settings, ref, sigs] = await all(db, [
    () => db.select().from(ownUseUnits).where(eq(ownUseUnits.notificationId, id)).orderBy(asc(ownUseUnits.position)),
    () => db.select().from(payments).where(and(eq(payments.ownerType, "own_use"), eq(payments.ownerId, id))).orderBy(asc(payments.recordedAt)),
    () => db.select().from(documentChecklist).where(and(eq(documentChecklist.ownerType, "own_use"), eq(documentChecklist.ownerId, id))),
    () => getSettings(db),
    () => loadRef(db),
    () => signatoriesReady(db),
  ]);
  const cac = row.cacNo?.trim().toLowerCase();
  const site = row.siteAddress?.trim().toLowerCase();
  const [dupSite] =
    cac && site
      ? await db
          .select({ id: ownUseNotifications.id })
          .from(ownUseNotifications)
          .where(and(ne(ownUseNotifications.id, id), sql`lower(trim(${ownUseNotifications.cacNo})) = ${cac}`, sql`lower(trim(${ownUseNotifications.siteAddress})) = ${site}`))
          .limit(1)
      : [];
  const [onRegister] = cac ? await db.select({ id: submissions.id }).from(submissions).where(sql`lower(trim(${submissions.cacNo})) = ${cac}`).limit(1) : [];
  const a = assessOwnUse(
    {
      ounNo: row.ounNo,
      name: row.name,
      dateFiled: row.dateFiled,
      cacNo: row.cacNo,
      siteAddress: row.siteAddress,
      lga: row.lga,
      unitsKw: units.map((u) => u.kw),
      flagOverrideReason: row.flagOverrideReason,
      pricedFee: row.pricedFee,
      pricedThresholdKw: row.pricedThresholdKw,
      registrationNo: row.registrationNo,
      createdBy: row.createdBy,
    },
    {
      settings,
      ref,
      payments: pays.map((p) => ({ amount: p.amount, dateReceived: p.dateReceived, financeStatus: p.financeStatus, reversed: p.reversed })),
      checklist: Object.fromEntries(checklist.map((c) => [c.key, c.value])),
      duplicates: { site: !!dupSite, cacOnRegister: !!onRegister },
      registrationDeadline: registrationDeadline(settings),
      signatories: sigs,
    },
  );
  return { row, units, payments: pays, a };
}

export async function setOwnUseDocument(db: Db, actor: Actor | null, id: string, key: string, value: string | null): Promise<void> {
  authorize(actor, "documents:update");
  await db.transaction(async (tx) => {
    const l = await loadOwnUse(tx, id);
    const item = l.a.documents.items.find((i) => i.key === key);
    if (!item) throw blocked("That document is not on the REG-01I list.");
    if (item.automatic) throw blocked("This document is set automatically.");
    const v = (value ?? "").trim().toUpperCase();
    if (v && !["Y", "N", "N/A"].includes(v)) throw blocked("Choose Y, N or N/A.");
    await tx
      .insert(documentChecklist)
      .values({ ownerType: "own_use", ownerId: id, key, form: "REG-01I", value: v || null, updatedBy: actor.id })
      .onConflictDoUpdate({
        target: [documentChecklist.ownerType, documentChecklist.ownerId, documentChecklist.key],
        set: { value: v || null, updatedBy: actor.id, updatedAt: new Date() },
      });
    await writeAudit(tx, {
      actor: auditActor(actor),
      action: "Document",
      module: "registration",
      entityType: "own_use",
      entityId: id,
      reference: l.row.ounNo,
      detail: `${item.document}: ${item.entered || "(blank)"} → ${v || "(blank)"}`,
    });
  });
}

export async function setOwnUseFlagReason(db: Db, actor: Actor | null, id: string, reason: string): Promise<void> {
  authorize(actor, "evaluation:decide");
  await db.transaction(async (tx) => {
    const l = await loadOwnUse(tx, id);
    await tx.update(ownUseNotifications).set({ flagOverrideReason: reason.trim() || null, updatedAt: new Date() }).where(eq(ownUseNotifications.id, id));
    await writeAudit(tx, { actor: auditActor(actor), action: "Flag override reason", module: "registration", entityType: "own_use", entityId: id, reference: l.row.ounNo, detail: reason.trim() || "cleared" });
  });
}

/** Register an own-use notification with a certificate (when enabled; SPEC §15). */
export async function registerOwnUse(db: Db, actor: Actor | null, id: string): Promise<string> {
  authorize(actor, "evaluation:decide");
  return db.transaction(async (tx) => {
    await tx.select({ id: ownUseNotifications.id }).from(ownUseNotifications).where(eq(ownUseNotifications.id, id)).for("update");
    const l = await loadOwnUse(tx, id);
    const reasons = [...l.a.registrationBlockers];
    if (l.row.createdBy === actor.id) reasons.push("The approving officer cannot be the user who created the submission");
    if (reasons.length) {
      if (l.row.createdBy === actor.id && reasons.length === 1) throw forbidden(...reasons);
      throw new ServiceError("blocked", reasons);
    }
    const today = lagosToday();
    const { number } = await issueNumber(tx, "REG", { year: yearOf(today), scope: "I-CPT" });
    await tx
      .update(ownUseNotifications)
      .set({ registrationNo: number, certificateIssueDate: today, registeredBy: actor.id, updatedAt: new Date() })
      .where(eq(ownUseNotifications.id, id));
    await writeAudit(tx, {
      actor: auditActor(actor),
      action: "Registered",
      module: "registration",
      entityType: "own_use",
      entityId: id,
      reference: l.row.ounNo,
      detail: `${number} - approved by ${actor.name}`,
    });
    return `Registered as ${number}.`;
  });
}
