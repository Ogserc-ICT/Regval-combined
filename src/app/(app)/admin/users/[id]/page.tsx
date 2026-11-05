import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { Card, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui";
import { lagosDateTime } from "@/domain/dates";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { auditLog } from "@/server/db/schema";
import { listUsers } from "@/server/services/users";
import { unitOptions } from "../units";
import { EditUserForm } from "./edit-user-form";

export const metadata: Metadata = { title: "Staff account" };

export default async function UserPage({ params }: PageProps<"/admin/users/[id]">) {
  await requirePermission("users:manage");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [user] = (await listUsers(db)).filter((u) => u.id === id);
  if (!user) notFound();
  const history = await db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entityType, "user"), eq(auditLog.entityId, id)))
    .orderBy(desc(auditLog.seq))
    .limit(50);

  return (
    <>
      <PageHeader
        title={user.name}
        description={user.notes ?? undefined}
        actions={
          <Link href="/admin/users" className="text-sm text-info hover:underline">
            All staff
          </Link>
        }
      />
      <EditUserForm user={{ id: user.id, name: user.name, email: user.email, active: user.active, pendingConfirmation: user.pendingConfirmation, roles: user.roles, unitId: user.unitId }} units={await unitOptions()} />
      <Card className="mt-6">
        <CardHeader title="History" />
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>By</Th>
              <Th>Action</Th>
              <Th>Detail</Th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.seq}>
                <Td className="tabular whitespace-nowrap text-muted">{lagosDateTime(h.at)}</Td>
                <Td>{h.userName}</Td>
                <Td>{h.action}</Td>
                <Td className="text-muted">{h.detail}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
