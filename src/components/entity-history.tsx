import { and, desc, eq, or } from "drizzle-orm";
import { HistoryTable } from "@/components/history-table";
import { Card, CardHeader } from "@/components/ui";
import { lagosDateTime } from "@/domain/dates";
import { db } from "@/server/db/client";
import { auditLog } from "@/server/db/schema";

/** Every audited action on one record, newest first (item history, SPEC §19). */
export async function EntityHistory({ entityType, entityId, reference, description }: { entityType: string; entityId: string; reference?: string | null; description?: string }) {
  const rows = await db
    .select()
    .from(auditLog)
    .where(or(and(eq(auditLog.entityType, entityType), eq(auditLog.entityId, entityId)), reference ? eq(auditLog.reference, reference) : undefined))
    .orderBy(desc(auditLog.seq))
    .limit(200);
  return (
    <Card>
      <CardHeader title="History" description={description ?? "Every action and change on this record, newest first."} />
      <HistoryTable rows={rows.map((r) => ({ seq: r.seq, when: lagosDateTime(r.at), by: r.userName, action: r.action, detail: r.detail }))} />
    </Card>
  );
}
