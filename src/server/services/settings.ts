/**
 * Settings service (SPEC §2; [G1]). One set of settings for both modules,
 * admin-only writes, every change audited as "Setting changed" old → new.
 */
import { inArray } from "drizzle-orm";
import {
  DEFAULT_SETTINGS,
  displaySetting,
  registrationDeadline,
  resolveSettings,
  SETTING_META,
  settingsSchema,
  type SettingKey,
  type Settings,
} from "@/domain/settings";
import { auditActor, authorize, type Actor } from "../auth/actor";
import { writeAudit } from "../audit";
import type { Db, DbOrTx } from "../db/connect";
import { settings as settingsTable } from "../db/schema";
import { Problems } from "../errors";

export async function getSettings(db: DbOrTx): Promise<Settings> {
  const rows = await db.select().from(settingsTable);
  const stored: Record<string, unknown> = {};
  for (const r of rows) stored[r.key] = r.value;
  return resolveSettings(stored);
}

export type SettingsChange = { key: SettingKey; label: string; from: string; to: string };

/**
 * Update some settings. Validates every given value and reports every problem
 * at once. Returns the changes made (unchanged values are skipped).
 */
export async function updateSettings(
  db: Db,
  actor: Actor | null,
  patch: Partial<Record<SettingKey, unknown>>,
): Promise<SettingsChange[]> {
  authorize(actor, "settings:write");
  const problems = new Problems();
  const parsed: Partial<Settings> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in DEFAULT_SETTINGS)) {
      problems.reason(`Unknown setting "${k}".`);
      continue;
    }
    const key = k as SettingKey;
    const result = settingsSchema.shape[key].safeParse(v);
    if (result.success) (parsed as Record<string, unknown>)[key] = result.data;
    else problems.field(key, `${SETTING_META[key].label}: ${result.error.issues[0]?.message ?? "invalid value"}`);
  }
  problems.throwIfAny();

  return db.transaction(async (tx) => {
    const current = await getSettings(tx);
    const changes: SettingsChange[] = [];
    for (const [k, v] of Object.entries(parsed)) {
      const key = k as SettingKey;
      if (JSON.stringify(current[key]) === JSON.stringify(v)) continue;
      changes.push({
        key,
        label: SETTING_META[key].label,
        from: displaySetting(key, current[key]),
        to: displaySetting(key, v),
      });
      await tx
        .insert(settingsTable)
        .values({ key, value: v, updatedBy: actor.id, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: settingsTable.key,
          set: { value: v, updatedBy: actor.id, updatedAt: new Date() },
        });
    }
    for (const c of changes) {
      await writeAudit(tx, {
        actor: auditActor(actor),
        action: "Setting changed",
        module: "admin",
        entityType: "setting",
        entityId: c.key,
        detail: `${c.label}: ${c.from} → ${c.to}`,
        data: { key: c.key, from: current[c.key], to: (parsed as Record<string, unknown>)[c.key] },
      });
    }
    const touchesDeadline = changes.some((c) =>
      ["effectiveDate", "registrationPeriodDays", "extensionDays"].includes(c.key),
    );
    if (touchesDeadline) {
      const before = registrationDeadline(current);
      const after = registrationDeadline({ ...current, ...parsed });
      if (before !== after) {
        await writeAudit(tx, {
          actor: auditActor(actor),
          action: "Registration deadline moved",
          module: "admin",
          entityType: "setting",
          entityId: "registrationDeadline",
          detail: `Registration deadline: ${before} → ${after}`,
          data: { from: before, to: after },
        });
      }
    }
    return changes;
  });
}

/** Remove stored values so the given keys fall back to their defaults (admin). */
export async function resetSettings(db: Db, actor: Actor | null, keys: SettingKey[]): Promise<void> {
  authorize(actor, "settings:write");
  await db.transaction(async (tx) => {
    const current = await getSettings(tx);
    await tx.delete(settingsTable).where(inArray(settingsTable.key, keys));
    for (const key of keys) {
      await writeAudit(tx, {
        actor: auditActor(actor),
        action: "Setting changed",
        module: "admin",
        entityType: "setting",
        entityId: key,
        detail: `${SETTING_META[key].label}: ${displaySetting(key, current[key])} → ${displaySetting(key, DEFAULT_SETTINGS[key])} (default)`,
      });
    }
  });
}
