import type { Metadata } from "next";
import Link from "next/link";
import { FlagsBadge, InwardStatusBadge } from "@/components/registry-badges";
import { Card, CardHeader, Notice, PageHeader, Table, Td, Th } from "@/components/ui";
import { lagosDateTime } from "@/domain/dates";
import { dateShort } from "@/lib/format";
import { can } from "@/server/auth/actor";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { listInward, registryCtx, type InwardView } from "@/server/services/registry/load";

export const metadata: Metadata = { title: "Routing" };

function Queue({ title, description, items, empty }: { title: string; description: string; items: InwardView[]; empty: string }) {
  return (
    <Card>
      <CardHeader title={`${title} (${items.length})`} description={description} />
      <Table>
        <thead>
          <tr>
            <Th>ACK</Th>
            <Th>Received</Th>
            <Th>Sender / subject</Th>
            <Th>Type · suggested unit</Th>
            <Th>Status</Th>
            <Th className="text-right">Days at Registry</Th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <Td colSpan={6} className="py-8 text-center text-muted">
                {empty}
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
                <Td className="tabular whitespace-nowrap text-xs text-muted">
                  {lagosDateTime(x.row.receivedAt)}
                  <div>Deemed {dateShort(x.row.deemedReceiptDate)}</div>
                </Td>
                <Td>
                  <div className="font-medium">{x.row.sender}</div>
                  <div className="text-xs text-muted">{x.row.subject}</div>
                </Td>
                <Td className="text-xs">
                  <div>{x.typeName}</div>
                  <div className="text-muted">{x.unit?.name ?? "No unit"}</div>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    <InwardStatusBadge status={x.a.status} />
                    <FlagsBadge flags={x.a.flags} />
                  </div>
                </Td>
                <Td className="tabular text-right">{x.a.workingDaysAtRegistry}</Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
    </Card>
  );
}

export default async function RoutingPage() {
  const actor = await requirePermission("registers:read");
  const ctx = await registryCtx(db);
  const all = (await listInward(db, ctx)).filter((x) => !x.a.closedOn && !x.row.forwardedOn);
  const byAge = (a: InwardView, b: InwardView) => a.row.receivedAt.getTime() - b.row.receivedAt.getTime();
  const unrouted = all.filter((x) => !x.row.routedAt).sort(byAge);
  const routed = all.filter((x) => x.row.routedAt).sort(byAge);

  return (
    <>
      <PageHeader
        title="Routing"
        description={`Items waiting for the Router, oldest first, then routed items waiting to be forwarded. Forwarding target: ${ctx.settings.forwardingTargetDays} working days.`}
      />
      {!can(actor, "inward:route") ? (
        <Notice tone="info" className="mb-6">
          Only a Router (the Secretary to the Commission or the Head of Administration) can route items. You can see the queue.
        </Notice>
      ) : null}
      <div className="flex flex-col gap-6">
        <Queue title="Awaiting routing" description="Open an item to route it." items={unrouted} empty="Nothing to route." />
        <Queue title="Routed, awaiting forwarding" description="The Registry records the forwarding on the item." items={routed} empty="Nothing waiting to be forwarded." />
      </div>
    </>
  );
}
