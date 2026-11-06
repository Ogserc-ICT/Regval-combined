"use server";

import { revalidatePath } from "next/cache";
import { getCurrentActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { blocked, toResult, type ActionResult } from "@/server/errors";
import { formatReport, importWorkbook } from "@/server/services/import";

export async function importAction(_p: ActionResult<string> | undefined, f: FormData): Promise<ActionResult<string>> {
  const actor = await getCurrentActor();
  const file = f.get("file");
  const res = await toResult(async () => {
    if (!(file instanceof File) || file.size === 0) throw blocked("Choose the workbook file (.xlsm).");
    if (!/\.xls[xm]$/i.test(file.name)) throw blocked("The file must be the .xlsm (or .xlsx) workbook.");
    const buffer = Buffer.from(await file.arrayBuffer());
    const report = await importWorkbook(db, actor, { buffer, sourceName: file.name, mode: "real", dryRun: f.get("commit") !== "yes" });
    return formatReport(report);
  });
  if (res.ok) {
    revalidatePath("/admin/import");
    revalidatePath("/admin/go-live");
    revalidatePath("/dashboard");
  }
  return res;
}
