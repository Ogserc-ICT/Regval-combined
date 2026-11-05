/**
 * Reference data for the registration rules and the forms' drop-downs.
 */
import { and, asc, eq } from "drizzle-orm";
import type { RefData } from "@/domain/registration/types";
import { all, type DbOrTx } from "../db/connect";
import {
  activities,
  correspondenceTypes,
  documentConditions,
  evalChecks,
  feeSchedule,
  formDocuments,
  forms,
  listItems,
  signatories,
} from "../db/schema";

export async function loadRef(db: DbOrTx): Promise<RefData> {
  const [fees, acts, fms, docs, conds, checks] = await all(db, [
    () => db.select().from(feeSchedule).orderBy(asc(feeSchedule.category)),
    () => db.select().from(activities).orderBy(asc(activities.sort)),
    () => db.select().from(forms).orderBy(asc(forms.form)),
    () => db.select().from(formDocuments).orderBy(asc(formDocuments.form), asc(formDocuments.no)),
    () => db.select().from(documentConditions).orderBy(asc(documentConditions.sort)),
    () => db.select().from(evalChecks).orderBy(asc(evalChecks.sort)),
  ]);
  return {
    fees: fees.map((f) => ({
      category: f.category,
      registrationFee: f.registrationFee,
      lateInitial: f.lateInitial,
      lateDaily: f.lateDaily,
      lateCap: f.lateCap,
      description: f.description,
    })),
    activities: acts,
    forms: fms,
    formDocs: docs,
    conditions: conds,
    checks,
  };
}

export async function listValues(db: DbOrTx, key: string): Promise<string[]> {
  const rows = await db
    .select({ value: listItems.value })
    .from(listItems)
    .where(and(eq(listItems.listKey, key), eq(listItems.active, true)))
    .orderBy(asc(listItems.sort));
  return rows.map((r) => r.value);
}

export async function listWithMeta(db: DbOrTx, key: string): Promise<{ value: string; meta: string | null }[]> {
  return db
    .select({ value: listItems.value, meta: listItems.meta })
    .from(listItems)
    .where(and(eq(listItems.listKey, key), eq(listItems.active, true)))
    .orderBy(asc(listItems.sort));
}

/** [G3] Whether active Chairman / CEO and Commissioner signatories exist. */
export async function signatoriesReady(db: DbOrTx): Promise<{ chairman: boolean; commissioner: boolean }> {
  const rows = await db.select({ role: signatories.role }).from(signatories).where(eq(signatories.active, true));
  return { chairman: rows.some((r) => r.role === "chairman_ceo"), commissioner: rows.some((r) => r.role === "commissioner") };
}

/** The correspondence type the Registry logs a filing under (Registry Lists G). */
export async function correspondenceTypeForFiling(db: DbOrTx, filing: "NEW" | "UPDATE" | "ANNUAL" | "OWNUSE") {
  const [t] = await db.select().from(correspondenceTypes).where(eq(correspondenceTypes.filingType, filing)).limit(1);
  return t ?? null;
}

/** All the drop-down lists the registration forms need, in one load. */
export async function registrationLists(db: DbOrTx) {
  const [lga, registrantType, licenceStatus, channel, paymentChannel, paymentPurpose, fuel, refusalGround, ref] = await all(db, [
    () => listValues(db, "lga"),
    () => listValues(db, "registrant_type"),
    () => listValues(db, "licence_status"),
    () => listValues(db, "submission_channel"),
    () => listValues(db, "payment_channel"),
    () => listValues(db, "payment_purpose"),
    () => listValues(db, "fuel"),
    () => listValues(db, "refusal_ground"),
    () => loadRef(db),
  ]);
  return { lga, registrantType, licenceStatus, channel, paymentChannel, paymentPurpose, fuel, refusalGround, ref };
}
