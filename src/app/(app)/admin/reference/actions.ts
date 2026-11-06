"use server";

import { revalidatePath } from "next/cache";
import { parseNairaToKobo } from "@/lib/format";
import { getCurrentActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { toResult, type ActionResult } from "@/server/errors";
import {
  addListItem,
  saveCorrespondenceType,
  saveDivision,
  saveUnit,
  updateActivity,
  updateFee,
  updateListItem,
} from "@/server/services/reference-admin";

type R = ActionResult<unknown>;
const s = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v : "";
};
const int = (f: FormData, k: string) => {
  const v = s(f, k).trim();
  return v === "" ? 0 : Number(v);
};
const on = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "Y";
const changed = (c: unknown) => (Array.isArray(c) && c.length === 0 ? "Nothing changed." : "Saved.");

function refresh() {
  revalidatePath("/admin/reference", "layout");
  revalidatePath("/admin/settings");
}

export async function updateFeeAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  const res = await toResult(() =>
    updateFee(db, actor, s(f, "category"), {
      registrationFee: parseNairaToKobo(f.get("registrationFee")),
      lateInitial: parseNairaToKobo(f.get("lateInitial")),
      lateDaily: parseNairaToKobo(f.get("lateDaily")),
      lateCap: parseNairaToKobo(f.get("lateCap")),
      description: s(f, "description"),
    }),
  );
  if (res.ok) {
    res.message = changed(res.data) === "Saved." ? "Saved. Saved submissions keep their frozen pricing and are flagged where it now differs." : "Nothing changed.";
    refresh();
  }
  return res;
}

export async function updateActivityAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  const res = await toResult(() =>
    updateActivity(db, actor, s(f, "code"), {
      cat10MwPlus: s(f, "cat10MwPlus"),
      cat1To10Mw: s(f, "cat1To10Mw"),
      catBelow1Mw: s(f, "catBelow1Mw"),
      capacityBased: on(f, "capacityBased"),
      active: on(f, "active"),
    }),
  );
  if (res.ok) {
    res.message = changed(res.data);
    refresh();
  }
  return res;
}

export async function saveDivisionAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  const res = await toResult(() => saveDivision(db, actor, s(f, "id") || null, { name: s(f, "name"), email: s(f, "email") }), "Saved.");
  if (res.ok) refresh();
  return res;
}

export async function saveUnitAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  const res = await toResult(
    () =>
      saveUnit(db, actor, s(f, "id") || null, {
        name: s(f, "name"),
        divisionId: s(f, "divisionId") || null,
        unitGroup: s(f, "unitGroup"),
        email: s(f, "email"),
        active: s(f, "id") ? on(f, "active") : true,
      }),
    "Saved.",
  );
  if (res.ok) refresh();
  return res;
}

export async function saveTypeAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  const res = await toResult(
    () =>
      saveCorrespondenceType(db, actor, s(f, "id") || null, {
        name: s(f, "name"),
        category: s(f, "category"),
        defaultUnitId: s(f, "defaultUnitId") || null,
        orderRef: s(f, "orderRef"),
        responseTargetDays: int(f, "responseTargetDays"),
        para103Wording: on(f, "para103Wording"),
        active: s(f, "id") ? on(f, "active") : true,
      }),
    "Saved.",
  );
  if (res.ok) refresh();
  return res;
}

const listInput = (f: FormData) => ({
  value: s(f, "value"),
  active: f.has("activeField") ? on(f, "active") : undefined,
  code: s(f, "code"),
  channel: s(f, "channel"),
  responseExpected: on(f, "responseExpected"),
  responseDays: int(f, "responseDays"),
});

export async function addListItemAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  const res = await toResult(() => addListItem(db, actor, s(f, "listKey"), listInput(f)), "Added.");
  if (res.ok) refresh();
  return res;
}

export async function updateListItemAction(_p: R | undefined, f: FormData) {
  const actor = await getCurrentActor();
  const res = await toResult(() => updateListItem(db, actor, s(f, "listKey"), s(f, "value"), listInput(f)));
  if (res.ok) {
    res.message = changed(res.data);
    refresh();
  }
  return res;
}
