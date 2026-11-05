/**
 * Registry reference data in one load: correspondence and document types,
 * units with their divisions and email addresses, and the drop-down lists
 * (Registry Lists sheet; SPEC §5.2).
 */
import { asc, eq } from "drizzle-orm";
import type { InwardType, OutwardDocType } from "@/domain/registry";
import { all, type DbOrTx } from "../../db/connect";
import { correspondenceTypes, divisions, signatories, units } from "../../db/schema";
import { listValues, listWithMeta } from "../reference";

export type UnitInfo = { id: string; name: string; email: string | null; divisionId: string | null; divisionName: string | null; divisionEmail: string | null; active: boolean };
export type CorrType = typeof correspondenceTypes.$inferSelect;

export async function loadRegistryRef(db: DbOrTx) {
  const [types, unitRows, divs, modes, senderCategories, actions, priorities, ackVia, fileClasses, outgoing, security, fileStatus, lgas, sigs] = await all(db, [
    () => db.select().from(correspondenceTypes).orderBy(asc(correspondenceTypes.sort)),
    () => db.select().from(units).orderBy(asc(units.sort)),
    () => db.select().from(divisions).orderBy(asc(divisions.sort)),
    () => listWithMeta(db, "mode_of_receipt"),
    () => listValues(db, "sender_category"),
    () => listValues(db, "action_required"),
    () => listValues(db, "priority"),
    () => listValues(db, "ack_issued_via"),
    () => listWithMeta(db, "file_class"),
    () => listWithMeta(db, "outgoing_type"),
    () => listValues(db, "security"),
    () => listValues(db, "file_status"),
    () => listValues(db, "registry_lga"),
    () => db.select().from(signatories).where(eq(signatories.active, true)).orderBy(asc(signatories.name)),
  ]);
  const unitInfo: UnitInfo[] = unitRows.map((u) => {
    const d = divs.find((x) => x.id === u.divisionId);
    return { id: u.id, name: u.name, email: u.email, divisionId: u.divisionId, divisionName: d?.name ?? null, divisionEmail: d?.email ?? null, active: u.active };
  });
  const outgoingTypes = outgoing.map((o) => {
    let meta: { responseExpected?: boolean; responseDays?: number } = {};
    try {
      meta = o.meta ? JSON.parse(o.meta) : {};
    } catch {
      meta = {};
    }
    return { name: o.value, responseExpected: !!meta.responseExpected, responseDays: Number(meta.responseDays) || 0 };
  });
  const r = {
    types,
    units: unitInfo,
    divisions: divs,
    modes: modes.map((m) => m.value),
    /** Mode of receipt → Register submission channel (Lists BU:BV). */
    channelForMode: (mode: string) => modes.find((m) => m.value === mode)?.meta ?? "By hand",
    senderCategories,
    actions,
    priorities,
    ackVia,
    fileClasses: fileClasses.map((c) => ({ name: c.value, code: c.meta ?? "" })),
    outgoingTypes,
    security,
    fileStatus,
    lgas,
    signatories: sigs,
    type: (id: string | null | undefined) => (id ? (types.find((t) => t.id === id) ?? null) : null),
    unit: (id: string | null | undefined) => (id ? (unitInfo.find((u) => u.id === id) ?? null) : null),
    outgoingType: (name: string | null | undefined) => outgoingTypes.find((o) => o.name === name) ?? null,
  };
  return r;
}

export type RegistryRef = Awaited<ReturnType<typeof loadRegistryRef>>;

/** The domain view of a correspondence type. */
export function inwardType(t: CorrType | null): InwardType {
  return t ? { name: t.name, responseTargetDays: t.responseTargetDays, filingType: t.filingType } : null;
}

export function outwardDocType(o: { responseExpected: boolean; responseDays: number } | null): OutwardDocType {
  return o ? { responseExpected: o.responseExpected, responseDays: o.responseDays } : null;
}

/** The unit an inward item is with: the routing override, else the type's default unit. */
export function effectiveUnitId(item: { unitOverrideId: string | null; correspondenceTypeId: string | null }, ref: RegistryRef): string | null {
  return item.unitOverrideId ?? ref.type(item.correspondenceTypeId)?.defaultUnitId ?? null;
}
