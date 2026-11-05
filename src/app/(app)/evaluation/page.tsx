import type { Metadata } from "next";
import Link from "next/link";
import { isNotNull } from "drizzle-orm";
import { SlaBadge, StatusBadge } from "@/components/badges";
import { Card, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui";
import { dateShort } from "@/lib/format";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { submissions } from "@/server/db/schema";
import { assessMany, type ListedSubmission } from "@/server/services/submissions/load";

export const metadata: Metadata = { title: "Evaluation" };

function Queue({ title, description, rows, empty }: { title: string; description?: string; rows: ListedSubmission[]; empty: string }) {
  return (
    <Card>
      <CardHeader title={`${title} (${rows.length})`} description={description} />
      <Table>
        <thead>
          <tr>
            <Th>ACK</Th>
            <Th>Registrant</Th>
            <Th>Status</Th>
            <Th>Determination due</Th>
            <Th>SLA</Th>
            <Th>Recommended outcome</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <Td colSpan={6} className="py-6 text-center text-muted">
                {empty}
              </Td>
            </tr>
          ) : (
            rows.map(({ row, a }) => (
              <tr key={row.id}>
                <Td className="whitespace-nowrap font-mono text-xs">
                  <Link href={`/register/${row.id}?tab=evaluation`} className="text-info hover:underline">
                    {row.ackNo}
                  </Link>
                </Td>
                <Td>{row.registeredName}</Td>
                <Td>
                  <StatusBadge status={row.status} />
                </Td>
                <Td className="tabular whitespace-nowrap">{dateShort(a.determinationDue)}</Td>
                <Td>
                  <SlaBadge sla={a.sla} />
                </Td>
                <Td className="text-xs text-muted">{a.recommendedOutcome}</Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
    </Card>
  );
}

export default async function EvaluationPage() {
  const actor = await requirePermission("registers:read");
  const rows = await db.select().from(submissions).where(isNotNull(submissions.status));
  const open = (await assessMany(db, rows)).filter((x) => !x.a.closed && x.row.status !== "Acknowledged - Awaiting Payment");
  const mine = open.filter((x) => [x.evaluation?.evaluatingOfficerId, x.evaluation?.reviewingSupervisorId, x.evaluation?.approvingOfficerId].includes(actor.id));
  const byDue = (a: ListedSubmission, b: ListedSubmission) => (a.a.determinationDue ?? "9999").localeCompare(b.a.determinationDue ?? "9999");
  return (
    <>
      <PageHeader
        title="Evaluation"
        description="Submissions released for evaluation (Finance has confirmed the fee). Open one to assign officers, answer the EVAL-01 checks and decide."
      />
      <div className="flex flex-col gap-6">
        <Queue title="Assigned to me" rows={mine.sort(byDue)} empty="Nothing is assigned to you." />
        <Queue title="Ready for decision" description="All checks answered, by determination date." rows={open.filter((x) => x.a.evaluationStatus === "Ready for decision").sort(byDue)} empty="None." />
        <Queue title="Not assigned" rows={open.filter((x) => x.a.evaluationStatus === "Not assigned")} empty="Every released submission has an evaluating officer." />
        <Queue title="In progress" rows={open.filter((x) => x.a.evaluationStatus === "In progress").sort(byDue)} empty="None." />
      </div>
    </>
  );
}
