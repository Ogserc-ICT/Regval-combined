import { and, desc, eq, or } from "drizzle-orm";
import { Card, CardHeader, Table, Td, Th } from "@/components/ui";
import { lagosDateTime } from "@/domain/dates";
import { db } from "@/server/db/client";
import { auditLog } from "@/server/db/schema";
import type { LoadedSubmission } from "@/server/services/submissions/load";

export async function HistoryTab({ l }: { l: LoadedSubmission }) {
  const rows = await db
    .select()
    .from(auditLog)
    .where(or(and(eq(auditLog.entityType, "submission"), eq(auditLog.entityId, l.row.id)), eq(auditLog.reference, l.row.ackNo)))
    .orderBy(desc(auditLog.seq))
    .limit(300);
  return (
    <Card>
      <CardHeader title="History" description="Every action and edit on this submission, newest first." />
      <Table>
        <thead>
          <tr>
            <Th>When (Lagos)</Th>
            <Th>By</Th>
            <Th>Action</Th>
            <Th>Detail</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.seq}>
              <Td className="tabular whitespace-nowrap text-muted">{lagosDateTime(r.at)}</Td>
              <Td className="whitespace-nowrap">{r.userName}</Td>
              <Td className="whitespace-nowrap">{r.action}</Td>
              <Td className="text-muted">{r.detail}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
