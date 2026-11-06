import type { Metadata } from "next";
import { Badge, Card, CardBody, CardHeader, Notice, PageHeader, Table, Td, Th } from "@/components/ui";
import { lagosDateTime, longDate } from "@/domain/dates";
import { can } from "@/server/auth/actor";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { listReviewRuns, type ReviewSummary } from "@/server/services/daily-review";
import { lagosToday } from "@/server/time";
import { RunReviewForm } from "./run-form";

export const metadata: Metadata = { title: "Daily review" };

export default async function DailyReviewPage() {
  const actor = await requirePermission("registers:read");
  const runs = await listReviewRuns(db);
  const today = lagosToday();
  const ranToday = runs.some((r) => r.lagosDate === today);

  return (
    <>
      <PageHeader
        title="Daily review"
        description="Runs every morning at 07:00 Lagos time, at most once per date: releases paid submissions for evaluation, makes new registrations past their 30-day determination provisional (para 13(4)), lists deficiency responses past due (never lapsed automatically) and counts SLA, unpaid and reminder figures."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Today" description={longDate(today)} />
          <CardBody>
            {ranToday ? (
              <Notice tone="accent">Already run today. It runs once per Lagos date.</Notice>
            ) : can(actor, "dailyreview:run") ? (
              <RunReviewForm />
            ) : (
              <Notice tone="info">Not run yet today. The scheduled run is at 07:00; an admin can run it sooner.</Notice>
            )}
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Runs" description="Latest first." />
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Trigger</Th>
                <Th>Finished</Th>
                <Th>Summary</Th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 ? (
                <tr>
                  <Td colSpan={4} className="py-8 text-center text-muted">
                    No runs yet.
                  </Td>
                </tr>
              ) : (
                runs.map((r) => {
                  const sm = r.summary as ReviewSummary | null;
                  return (
                    <tr key={r.lagosDate}>
                      <Td className="tabular whitespace-nowrap">{longDate(r.lagosDate)}</Td>
                      <Td>
                        <Badge tone={r.trigger === "cron" ? "info" : "neutral"}>{r.trigger === "cron" ? "Scheduled" : "Run now"}</Badge>
                        {r.userName && r.trigger === "manual" ? <div className="mt-1 text-xs text-muted">{r.userName}</div> : null}
                      </Td>
                      <Td className="tabular whitespace-nowrap text-xs text-muted">{r.finishedAt ? lagosDateTime(r.finishedAt) : "—"}</Td>
                      <Td className="text-xs">
                        {sm?.text ?? "—"}
                        {sm?.provisional.length ? <div className="mt-1 text-muted">Provisional: {sm.provisional.join(", ")}</div> : null}
                        {sm?.overdueDeficiency.length ? <div className="mt-1 text-warn">Overdue deficiency responses: {sm.overdueDeficiency.join(", ")}</div> : null}
                        {sm?.reminderDue.length ? <div className="mt-1 text-muted">Unpaid reminders due: {sm.reminderDue.join(", ")}</div> : null}
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
