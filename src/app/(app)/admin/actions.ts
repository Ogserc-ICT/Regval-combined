"use server";

import { revalidatePath } from "next/cache";
import { DEFAULT_SETTINGS, SETTING_META, type SettingKey } from "@/domain/settings";
import { getCurrentActor } from "@/server/auth/session";
import { verifyAuditChain, type ChainCheck } from "@/server/audit";
import { authorize } from "@/server/auth/actor";
import { db } from "@/server/db/client";
import { toResult, type ActionResult } from "@/server/errors";
import { deleteHoliday, saveHoliday } from "@/server/services/holidays";
import { updateSettings, type SettingsChange } from "@/server/services/settings";
import { saveSignatory } from "@/server/services/signatories";
import { createUser, resetPassword, updateUser } from "@/server/services/users";

/** Turn a submitted form field into the setting's value type. */
function readSetting(key: SettingKey, form: FormData): unknown {
  const meta = SETTING_META[key];
  const raw = form.get(key);
  if (meta.kind === "boolean") return raw === "on" || raw === "true";
  const s = typeof raw === "string" ? raw.trim() : "";
  if (meta.nullable && s === "") return null;
  if (meta.kind === "days" || meta.kind === "number") return s === "" ? NaN : Number(s);
  return s;
}

export async function saveSettingsAction(_prev: ActionResult<SettingsChange[]> | undefined, form: FormData) {
  const actor = await getCurrentActor();
  const patch: Partial<Record<SettingKey, unknown>> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS) as SettingKey[]) {
    if (form.has(key) || SETTING_META[key].kind === "boolean") patch[key] = readSetting(key, form);
  }
  const res = await toResult(() => updateSettings(db, actor, patch));
  if (res.ok) {
    res.message = res.data.length ? `Saved ${res.data.length} change(s).` : "Nothing changed.";
    revalidatePath("/", "layout");
  }
  return res;
}

export async function saveHolidayAction(_prev: ActionResult | undefined, form: FormData) {
  const actor = await getCurrentActor();
  const res = await toResult(
    () =>
      saveHoliday(db, actor, {
        date: String(form.get("date") ?? ""),
        name: String(form.get("name") ?? ""),
        status: String(form.get("status") ?? ""),
        note: String(form.get("note") ?? ""),
      }),
    "Holiday saved.",
  );
  if (res.ok) revalidatePath("/admin/holidays");
  return res;
}

export async function deleteHolidayAction(form: FormData) {
  const actor = await getCurrentActor();
  await deleteHoliday(db, actor, String(form.get("date") ?? ""));
  revalidatePath("/admin/holidays");
}

export async function createUserAction(_prev: ActionResult<{ id: string; tempPassword: string | null }> | undefined, form: FormData) {
  const actor = await getCurrentActor();
  const res = await toResult(() =>
    createUser(db, actor, {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      roles: form.getAll("roles").map(String),
      unitId: String(form.get("unitId") ?? "") || null,
    }),
  );
  if (res.ok) revalidatePath("/admin/users");
  return res;
}

export async function updateUserAction(_prev: ActionResult | undefined, form: FormData) {
  const actor = await getCurrentActor();
  const id = String(form.get("id") ?? "");
  const res = await toResult(
    () =>
      updateUser(db, actor, id, {
        name: String(form.get("name") ?? ""),
        email: String(form.get("email") ?? ""),
        active: form.get("active") === "on",
        confirm: form.get("confirm") === "on",
        roles: form.getAll("roles").map(String),
      unitId: String(form.get("unitId") ?? "") || null,
      }),
    "Saved.",
  );
  if (res.ok) {
    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${id}`);
  }
  return res;
}

export async function resetPasswordAction(_prev: ActionResult<string> | undefined, form: FormData) {
  const actor = await getCurrentActor();
  return toResult(() => resetPassword(db, actor, String(form.get("id") ?? "")));
}

export async function saveSignatoryAction(_prev: ActionResult<string> | undefined, form: FormData) {
  const actor = await getCurrentActor();
  const res = await toResult(
    () =>
      saveSignatory(db, actor, String(form.get("id") ?? "") || null, {
        name: String(form.get("name") ?? ""),
        designation: String(form.get("designation") ?? ""),
        role: String(form.get("role") ?? ""),
        active: form.get("active") === "on",
        confirmed: form.get("confirmed") === "on",
      }),
    "Saved.",
  );
  if (res.ok) revalidatePath("/admin/signatories");
  return res;
}

export async function verifyAuditAction(): Promise<ActionResult<ChainCheck>> {
  const actor = await getCurrentActor();
  return toResult(async () => {
    authorize(actor, "settings:write");
    return verifyAuditChain(db);
  });
}
