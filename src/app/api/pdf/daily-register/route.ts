/** Daily Register PDF for a date (default today, Lagos; SPEC §24.2). */
import { isLocalDate } from "@/domain/dates";
import { db } from "@/server/db/client";
import { renderDailyRegister } from "@/server/pdf/registers";
import { pdfActor, pdfResponse } from "@/server/pdf/respond";
import { lagosToday } from "@/server/time";

export async function GET(req: Request) {
  const actor = await pdfActor("reports:print");
  if (actor instanceof Response) return actor;
  const sp = new URL(req.url).searchParams;
  const date = sp.get("date") || lagosToday();
  if (!isLocalDate(date)) return new Response("Date must be YYYY-MM-DD.", { status: 400 });
  const buffer = await renderDailyRegister(db, date, actor.name);
  return pdfResponse(buffer, `Daily-Register-${date}.pdf`, sp.has("download"));
}
