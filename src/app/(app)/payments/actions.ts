"use server";

import { revalidatePath } from "next/cache";
import { getCurrentActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { toResult, type ActionResult } from "@/server/errors";
import { markImported, prepareHandover } from "@/server/services/handover";

const s = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v : "";
};

const refresh = () => {
  revalidatePath("/payments");
  revalidatePath("/dashboard");
};

export async function prepareHandoverAction(): Promise<ActionResult<string>> {
  const actor = await getCurrentActor();
  const res = await toResult(async () => {
    const b = await prepareHandover(db, actor);
    return `${b.batchNo} prepared: ${b.paymentLines} payment(s), ${b.reversalLines} reversal(s). Download it below and import it into the Revenue Registry.`;
  });
  if (res.ok) {
    res.message = res.data;
    refresh();
  }
  return res;
}

export async function markImportedAction(_p: ActionResult<string> | undefined, f: FormData): Promise<ActionResult<string>> {
  const actor = await getCurrentActor();
  const res = await toResult(() => markImported(db, actor, s(f, "batchId"), s(f, "importedOn")));
  if (res.ok) {
    res.message = res.data;
    refresh();
  }
  return res;
}
