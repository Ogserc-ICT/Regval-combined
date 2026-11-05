"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { toResult, type ActionResult } from "@/server/errors";
import { createOwnUse, registerOwnUse, setOwnUseDocument, setOwnUseFlagReason } from "@/server/services/ownuse";
import { parseOwnUseUnits } from "./parse";

const s = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v : "";
};

export async function createOwnUseAction(_p: ActionResult<unknown> | undefined, f: FormData) {
  const actor = await getCurrentActor();
  const units = parseOwnUseUnits(f);
  const res = await toResult(() =>
    createOwnUse(
      db,
      actor,
      {
        name: s(f, "name"),
        dateFiled: s(f, "dateFiled"),
        cacNo: s(f, "cacNo"),
        siteAddress: s(f, "siteAddress"),
        lga: s(f, "lga"),
        natureOfBusiness: s(f, "natureOfBusiness"),
        gridConnected: s(f, "gridConnected"),
        distributionLicensee: s(f, "distributionLicensee"),
        contactPerson: s(f, "contactPerson"),
        phone: s(f, "phone"),
        email: s(f, "email"),
        remarks: s(f, "remarks"),
        units,
      },
      { confirmWarnings: f.get("confirmWarnings") === "yes" },
    ),
  );
  if (res.ok) {
    revalidatePath("/own-use");
    redirect(`/own-use/${res.data.id}?saved=1`);
  }
  return res;
}

const done = (id: string) => {
  revalidatePath(`/own-use/${id}`);
  revalidatePath("/own-use");
};

export async function ownUseDocumentAction(_p: ActionResult<unknown> | undefined, f: FormData) {
  const actor = await getCurrentActor();
  const res = await toResult(() => setOwnUseDocument(db, actor, s(f, "id"), s(f, "key"), s(f, "value")), "Saved.");
  if (res.ok) done(s(f, "id"));
  return res;
}

export async function ownUseFlagAction(_p: ActionResult<unknown> | undefined, f: FormData) {
  const actor = await getCurrentActor();
  const res = await toResult(() => setOwnUseFlagReason(db, actor, s(f, "id"), s(f, "reason")), "Saved.");
  if (res.ok) done(s(f, "id"));
  return res;
}

export async function registerOwnUseAction(_p: ActionResult<unknown> | undefined, f: FormData) {
  const actor = await getCurrentActor();
  const res = await toResult(() => registerOwnUse(db, actor, s(f, "id")));
  if (res.ok) {
    res.message = String(res.data);
    done(s(f, "id"));
  }
  return res;
}
