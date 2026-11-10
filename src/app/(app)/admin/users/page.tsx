import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, CardHeader, Notice, PageHeader, Table, Td, Th } from "@/components/ui";
import { lagosDateTime } from "@/domain/dates";
import { ROLE_LABELS } from "@/domain/roles";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { listUsers } from "@/server/services/users";
import { NewUserForm } from "./new-user-form";
import { unitOptions } from "./units";

export const metadata: Metadata = { title: "Staff & roles" };

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  await requirePermission("users:manage");
  const sp = await searchParams;
  const deletedName = typeof sp.deleted === "string" ? sp.deleted : null;
  const all = await listUsers(db);
  const users = all.filter((u) => !u.removedAt);
  const removed = all.filter((u) => u.removedAt);
  const pending = users.filter((u) => u.pendingConfirmation).length;
  return (
    <>
      <PageHeader
        title="Staff & roles"
        description="Every officer field (received, released, dispatched, recorded by) comes from these accounts. A person can hold several roles; separation of duties is still checked on each record."
      />
      {deletedName ? (
        <Notice tone="accent" className="mb-6">
          {deletedName} was deleted. Their name stays on the records they worked on.
        </Notice>
      ) : null}
      <NewUserForm units={await unitOptions()} />
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
      {removed.length ? (
        <Card className="mt-6">
          <CardHeader title={`Deleted staff (${removed.length})`} description="They cannot sign in and are on no officer list. Kept so the records they worked on still show their name." />
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Deleted</Th>
              </tr>
            </thead>
            <tbody>
              {removed.map((u) => (
                <tr key={u.id}>
                  <Td>
                    <Link href={`/admin/users/${u.id}`} className="text-muted hover:text-text hover:underline">
                      {u.name}
                    </Link>
                  </Td>
                  <Td className="tabular whitespace-nowrap text-muted">{lagosDateTime(u.removedAt!)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}
    </>
  );
}
