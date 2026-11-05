import type { Metadata } from "next";
import { Trash2 } from "lucide-react";
import { Badge, Card, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui";
import { isoWeekday, longDate } from "@/domain/dates";
import { can } from "@/server/auth/actor";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { listHolidays } from "@/server/services/holidays";
import { lagosToday } from "@/server/time";
import { deleteHolidayAction } from "../actions";
import { HolidayForm } from "./holiday-form";

export const metadata: Metadata = { title: "Holidays" };

const DAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function HolidaysPage() {
  const actor = await requirePermission("registers:read");
  const editable = can(actor, "lists:write");
  const rows = await listHolidays(db);
  const today = lagosToday();
  const lastYear = rows.length ? rows[rows.length - 1].date.slice(0, 4) : null;

  return (
    <>
      <PageHeader
        title="Public holidays"
        description="Non-working days for deemed receipt (para 10(3)) and every working-day target. Every holiday counts, whatever its status; confirm Estimated and Provisional dates when the Federal Government declares them, and add State-declared ones."
      />
      {editable ? <HolidayForm /> : null}
      <Card className="mt-6">
        <CardHeader title={`${rows.length} holiday(s)`} description={lastYear ? `The list runs to the end of ${lastYear}. Add the next year's dates before then.` : "No holidays set."} />
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Holiday</Th>
              <Th>Status</Th>
              <Th>Note</Th>
              {editable ? <Th className="w-12" /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.date} className={h.date < today ? "opacity-55" : undefined}>
                <Td className="tabular whitespace-nowrap">
                  {DAY[isoWeekday(h.date)]} {longDate(h.date)}
                </Td>
                <Td>{h.name}</Td>
                <Td>
                  <Badge tone={h.status === "Fixed" ? "accent" : h.status === "State-declared" ? "info" : "warn"}>{h.status}</Badge>
                </Td>
                <Td className="text-muted">{h.note}</Td>
                {editable ? (
                  <Td>
                    <form action={deleteHolidayAction}>
                      <input type="hidden" name="date" value={h.date} />
                      <button type="submit" className="rounded-md p-1.5 text-faint hover:bg-danger-soft hover:text-danger" aria-label={`Remove ${h.name}`}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </form>
                  </Td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
