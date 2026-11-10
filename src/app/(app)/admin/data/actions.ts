"use server";

/** Admin › Data management. Each action re-reads the signed-in user; the service checks the admin role. */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { toResult, type ActionResult } from "@/server/errors";
import { clearData, deleteOwnUse, deletePayment, deleteSubmission, type ClearResult } from "@/server/services/data-admin";

const s = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v : "";
};

const refreshAll = () => revalidatePath("/", "layout");

export async function clearDataAction(_p: ActionResult<ClearResult> | undefined, f: FormData) {
  const actor = await getCurrentActor();
  const groups = f.getAll("groups").map(String);
  const res = await toResult(() => clearData(db, actor, groups, s(f, "password")));
  if (res.ok) refreshAll();
  return res;
}

export async function deleteSubmissionAction(_p: ActionResult<string> | undefined, f: FormData) {
  const actor = await getCurrentActor();
  const res = await toResult(() => deleteSubmission(db, actor, s(f, "id"), s(f, "confirmAck")));
  if (res.ok) {
    refreshAll();
    redirect(`/register?deleted=${encodeURIComponent(res.data)}`);
  }
  return res;
}

export async function deleteOwnUseAction(_p: ActionResult<string> | undefined, f: FormData) {
  const actor = await getCurrentActor();
  const res = await toResult(() => deleteOwnUse(db, actor, s(f, "id"), s(f, "confirmAck")));
  if (res.ok) {
    refreshAll();
    redirect(`/own-use?deleted=${encodeURIComponent(res.data)}`);
  }
  return res;
}

export async function deletePaymentAction(_p: ActionResult<string> | undefined, f: FormData) {
  const actor = await getCurrentActor();
  const res = await toResult(() => deletePayment(db, actor, s(f, "paymentId")), undefined);
  if (res.ok) {
    res.message = `${res.data} deleted.`;
    refreshAll();
  }
  return res;
}
