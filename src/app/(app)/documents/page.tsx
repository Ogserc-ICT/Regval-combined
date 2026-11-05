import type { Metadata } from "next";
import Link from "next/link";
import { isNotNull } from "drizzle-orm";
import { Card, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { submissions } from "@/server/db/schema";
import { assessMany } from "@/server/services/submissions/load";

export const metadata: Metadata = { title: "Documents" };

export default async function DocumentsPage() {
  await requirePermission("registers:read");
  const rows = await db.select().from(submissions).where(isNotNull(submissions.status));
  const list = (await assessMany(db, rows)).filter((x) => !x.a.closed && !x.a.documents.complete).sort((a, b) => a.row.ackNo.localeCompare(b.row.ackNo));
  return (
    <>
      <PageHeader
        title="Documents"
        description="Open submissions whose Schedule 2 checklist is not complete. Record each document on the submission's Documents tab; evidence of payment ticks itself once Finance confirms the fee."
      />
      <Card>
        <CardHeader title={`${list.length} open submission(s) with documents outstanding or pending`} />
        <Table>
          <thead>
            <tr>
              <Th>ACK</Th>
              <Th>Registrant</Th>
              <Th>Form</Th>
              <Th>Progress</Th>
              <Th>Outstanding or pending</Th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <Td colSpan={5} className="py-10 text-center text-muted">
                  Every open submission has its documents.
                </Td>
              </tr>
            ) : (
              list.map(({ row, a }) => (
                <tr key={row.id}>
                  <Td className="whitespace-nowrap font-mono text-xs">
                    <Link href={`/register/${row.id}?tab=documents`} className="text-info hover:underline">
                      {row.ackNo}
                    </Link>
                  </Td>
                  <Td>{row.registeredName}</Td>
                  <Td className="whitespace-nowrap">{a.documents.form ?? "—"}</Td>
                  <Td className="tabular whitespace-nowrap">
                    {a.documents.listed - a.documents.outstanding - a.documents.pending}/{a.documents.listed}
                  </Td>
                  <Td className="text-xs text-muted">{a.documents.outstandingText.join("; ")}</Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
