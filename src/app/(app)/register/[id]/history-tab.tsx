import { and, desc, eq, or } from "drizzle-orm";
import { HistoryTable } from "@/components/history-table";
import { Card, CardHeader } from "@/components/ui";
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
      <HistoryTable rows={rows.map((r) => ({ seq: r.seq, when: lagosDateTime(r.at), by: r.userName, action: r.action, detail: r.detail }))} initial={20} />
    </Card>
  );
}
