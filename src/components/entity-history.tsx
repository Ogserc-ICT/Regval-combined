import { and, desc, eq, or } from "drizzle-orm";
import { Card, CardHeader, Table, Td, Th } from "@/components/ui";
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
          {rows.length === 0 ? (
            <tr>
              <Td colSpan={4} className="py-6 text-center text-muted">
                Nothing yet.
              </Td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.seq}>
                <Td className="tabular whitespace-nowrap text-muted">{lagosDateTime(r.at)}</Td>
                <Td className="whitespace-nowrap">{r.userName}</Td>
                <Td className="whitespace-nowrap">{r.action}</Td>
                <Td className="text-muted">{r.detail}</Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
    </Card>
  );
}
