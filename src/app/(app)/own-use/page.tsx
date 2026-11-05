import type { Metadata } from "next";
import Link from "next/link";
import { desc, isNotNull } from "drizzle-orm";
import { Plus } from "lucide-react";
import { PaymentBadge } from "@/components/badges";
import { Badge, buttonVariants, Card, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui";
import { dateShort, naira } from "@/lib/format";
import { can } from "@/server/auth/actor";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { ownUseNotifications } from "@/server/db/schema";
import { loadOwnUse } from "@/server/services/ownuse";

export const metadata: Metadata = { title: "Own-use" };

export default async function OwnUsePage() {
  const actor = await requirePermission("registers:read");
  const rows = await db.select({ id: ownUseNotifications.id }).from(ownUseNotifications).where(isNotNull(ownUseNotifications.ounNo)).orderBy(desc(ownUseNotifications.ounNo));
  const list = await Promise.all(rows.map((r) => loadOwnUse(db, r.id)));
  return (
    <>
      <PageHeader
        title="Own-use notifications"
        description="Form REG-01I: own-use generation from 200 kW to below 1 MW (para 3(4)), one notification per site."
        actions={
          can(actor, "ownuse:save") ? (
            <Link href="/own-use/new" className={buttonVariants()}>
              <Plus className="h-4 w-4" /> New notification
            </Link>
          ) : null
        }
      />
      <Card>
        <CardHeader title={`${list.length} notification(s)`} />
        <Table>
          <thead>
            <tr>
              <Th>OUN</Th>
              <Th>Name</Th>
              <Th>LGA</Th>
              <Th className="text-right">Capacity</Th>
              <Th>Eligibility</Th>
              <Th className="text-right">Fee due</Th>
              <Th>Payment</Th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <Td colSpan={7} className="py-10 text-center text-muted">
                  No notifications yet.
                </Td>
              </tr>
            ) : (
              list.map(({ row, a }) => (
                <tr key={row.id}>
                  <Td className="whitespace-nowrap font-mono text-xs">
                    <Link href={`/own-use/${row.id}`} className="text-info hover:underline">
                      {row.ounNo}
                    </Link>
                    <div className="font-sans text-faint">{dateShort(row.dateFiled)}</div>
                  </Td>
                  <Td>
                    {row.name}
                    {row.registrationNo ? <div className="text-xs text-accent">{row.registrationNo}</div> : null}
                  </Td>
                  <Td>{row.lga}</Td>
                  <Td className="tabular text-right">{a.installedKw ?? "—"} kW</Td>
                  <Td>
                    <Badge tone={a.eligibility === "Notification required" ? "accent" : "warn"}>{a.eligibility || "—"}</Badge>
                  </Td>
                  <Td className="tabular text-right">{naira(a.feeDue)}</Td>
                  <Td>
                    <PaymentBadge status={a.paymentStatus} />
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
