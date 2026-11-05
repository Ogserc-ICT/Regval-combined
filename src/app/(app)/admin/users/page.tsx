import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui";
import { ROLE_LABELS } from "@/domain/roles";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { listUsers } from "@/server/services/users";
import { NewUserForm } from "./new-user-form";

export const metadata: Metadata = { title: "Staff & roles" };

export default async function UsersPage() {
  await requirePermission("users:manage");
  const users = await listUsers(db);
  const pending = users.filter((u) => u.pendingConfirmation).length;
  return (
    <>
      <PageHeader
        title="Staff & roles"
        description="Every officer field (received, released, dispatched, recorded by) comes from these accounts. A person can hold several roles; separation of duties is still checked on each record."
      />
      <NewUserForm />
      <Card className="mt-6">
        <CardHeader
          title={`${users.length} account(s)`}
          description={pending ? `${pending} seeded from the workbook and awaiting confirmation: add the work email, check the roles, confirm and activate.` : undefined}
        />
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Roles</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-surface-hover/50">
                <Td>
                  <Link href={`/admin/users/${u.id}`} className="font-medium text-info hover:underline">
                    {u.name}
                  </Link>
                </Td>
                <Td className="text-muted">{u.email.endsWith("@invalid.ogserc.local") ? <span className="text-warn">No work email yet</span> : u.email}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {u.roles.length ? u.roles.map((r) => <Badge key={r}>{ROLE_LABELS[r]}</Badge>) : <span className="text-faint">None</span>}
                  </div>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {u.active ? <Badge tone="accent">Active</Badge> : <Badge>Inactive</Badge>}
                    {u.pendingConfirmation ? <Badge tone="warn">Confirm</Badge> : null}
                    {u.active && u.mustChangePassword ? <Badge tone="info">Must set password</Badge> : null}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
