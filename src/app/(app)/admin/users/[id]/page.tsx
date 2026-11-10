import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { HistoryTable } from "@/components/history-table";
import { Card, CardHeader, Notice, PageHeader } from "@/components/ui";
import { lagosDateTime } from "@/domain/dates";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { auditLog } from "@/server/db/schema";
import { listUsers } from "@/server/services/users";
import { DeleteUserCard } from "./delete-user-card";
import { EditUserForm } from "./edit-user-form";

export const metadata: Metadata = { title: "Staff account" };

export default async function UserPage({ params }: PageProps<"/admin/users/[id]">) {
  const me = await requirePermission("users:manage");
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
      {user.removedAt ? (
        <Notice tone="info" title={`Deleted on ${lagosDateTime(user.removedAt)}`}>
          This account cannot sign in or be changed. Its name stays on the records the person worked on. To have them back, create a new account.
        </Notice>
      ) : (
        <>
          <EditUserForm user={{ id: user.id, name: user.name, email: user.email, active: user.active, pendingConfirmation: user.pendingConfirmation, roles: user.roles }} />
          <div className="mt-6">
            <DeleteUserCard id={user.id} name={user.name} isSelf={user.id === me.id} />
          </div>
        </>
      )}
      <Card className="mt-6">
        <CardHeader title="History" />
        <HistoryTable rows={history.map((h) => ({ seq: h.seq, when: lagosDateTime(h.at), by: h.userName, action: h.action, detail: h.detail }))} />
      </Card>
    </>
  );
}
