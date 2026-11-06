/**
 * Vercel Cron: the daily review at 07:00 Lagos (06:00 UTC; vercel.json).
 * Protected by CRON_SECRET, which Vercel sends as a Bearer token.
 */
import { timingSafeEqual } from "node:crypto";
import { db } from "@/server/db/client";
import { runDailyReview } from "@/server/services/daily-review";

export const dynamic = "force-dynamic";

function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(req: Request) {
  if (!authorised(req)) return Response.json({ error: "Unauthorised" }, { status: 401 });
  const result = await runDailyReview(db, "cron");
  return Response.json(result);
}
