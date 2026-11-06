"use server";

import { revalidatePath } from "next/cache";
import { getCurrentActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { toResult, type ActionResult } from "@/server/errors";
import { runDailyReview } from "@/server/services/daily-review";

export async function runDailyReviewAction(): Promise<ActionResult<unknown>> {
  const actor = await getCurrentActor();
  const res = await toResult(() => runDailyReview(db, "manual", actor));
  if (res.ok) {
    const r = res.data;
    res.message = r.ran ? `Done. ${r.summary.text}.` : r.reason;
    for (const p of ["/admin/daily-review", "/register", "/dashboard", "/evaluation"]) revalidatePath(p);
  }
  return res;
}
