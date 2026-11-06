import type { Metadata } from "next";
import Link from "next/link";
import { InwardStatusBadge } from "@/components/registry-badges";
import { Button, buttonVariants, Card, CardHeader, PageHeader, Select, Stat, Table, Td, Th } from "@/components/ui";
import { dateShort } from "@/lib/format";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { pendingActions, registryCtx } from "@/server/services/registry/load";

export const metadata: Metadata = { title: "Pending actions" };

export default async function PendingPage({ searchParams }: PageProps<"/pending">) {
  const actor = await requirePermission("registers:read");
  const sp = await searchParams;
  const ctx = await registryCtx(db);
  // Unit officers see their unit's list by default (SPEC §23).
  const unit = typeof sp.unit === "string" ? sp.unit : (actor.unitId ?? "");
  const { items, totals } = await pendingActions(db, unit || null, ctx);
  const unitName = ctx.ref.unit(unit)?.name;

  return (
    <>
      <PageHeader
        title="Pending actions"
        description="Every inward item that is Open, Overdue, or awaiting routing or forwarding, in the order received."
        actions={
          <a href={`/api/pdf/pending?unit=${unit}`} target="_blank" rel="noopener" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            PDF
          </a>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Pending" value={totals.pending} hint={unitName ?? "All units"} />
        <Stat label="Overdue" value={totals.overdue} />
        <Stat label="Awaiting routing" value={totals.awaitingRouting} />
        <Stat label="Awaiting forwarding" value={totals.awaitingForwarding} />
      </div>
      <Card>
        <CardHeader
          title={unitName ?? "All units"}
          actions={
            <form className="flex gap-2">
              <Select name="unit" defaultValue={unit} className="w-64" aria-label="Unit">
                <option value="">All units</option>
                {ctx.ref.units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
              <Button type="submit" variant="secondary">
                Show
              </Button>
            </form>
          }
        />
        <Table>
          <thead>
            <tr>
              <Th>ACK</Th>
              <Th>Deemed</Th>
              <Th>Sender / subject</Th>
              <Th>Unit · officer</Th>
              <Th>Action · priority</Th>
              <Th>Response due</Th>
              <Th className="text-right">Days open</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <Td colSpan={8} className="py-10 text-center text-muted">
                  Nothing pending.
                </Td>
              </tr>
            ) : (
              items.map((x) => (
                <tr key={x.row.id} className="hover:bg-surface-hover/50">
                  <Td className="whitespace-nowrap font-mono text-xs">
                    <Link href={`/inward/${x.row.id}`} className="text-info hover:underline">
                      {x.row.ackNo}
                    </Link>
                  </Td>
                  <Td className="tabular whitespace-nowrap">{dateShort(x.row.deemedReceiptDate)}</Td>
                  <Td>
                    <div className="font-medium">{x.row.sender}</div>
                    <div className="text-xs text-muted">
                      {x.row.subject} · {x.typeName}
                    </div>
                  </Td>
                  <Td className="text-xs">
                    <div>{x.unit?.name ?? "—"}</div>
                    <div className="text-muted">{x.row.actionOfficer ?? ""}</div>
                  </Td>
                  <Td className="text-xs">
                    <div>{x.row.actionRequired ?? "—"}</div>
                    <div className="text-muted">{x.row.priority ?? "Normal"}</div>
                  </Td>
                  <Td className="tabular whitespace-nowrap">{dateShort(x.a.responseDue)}</Td>
                  <Td className="tabular text-right">{x.a.workingDaysOpen}</Td>
                  <Td>
                    <InwardStatusBadge status={x.a.status} />
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
