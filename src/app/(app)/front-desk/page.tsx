import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, CardBody, CardHeader, Notice, PageHeader, Table, Td, Th } from "@/components/ui";
import { lagosDateTime } from "@/domain/dates";
import { can } from "@/server/auth/actor";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { listFrontDesk, registryCtx } from "@/server/services/registry/load";
import { lagosTimeNow, lagosToday } from "@/server/time";
import { FrontDeskForm } from "./front-desk-form";

export const metadata: Metadata = { title: "Front desk" };

export default async function FrontDeskPage() {
  const actor = await requirePermission("registers:read");
  const ctx = await registryCtx(db);
  const all = await listFrontDesk(db, {}, ctx);
  const awaiting = all.filter((x) => x.status === "Awaiting registry").sort((a, b) => a.row.receivedAt.getTime() - b.row.receivedAt.getTime());
  const recent = all.filter((x) => x.status === "Registered").slice(0, 30);
  const canLog = can(actor, "frontdesk:log");
  const canRegister = can(actor, "inward:write");

  return (
    <>
      <PageHeader
        title="Front desk"
        description="Log what is handed in. The front desk issues an FD number, not an acknowledgement: the Registry registers each item on New Inward or Registry Intake, and the front-desk time becomes its receipt time."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        {canLog ? (
          <Card className="self-start">
            <CardHeader title="Log a delivery" description={`Received by: ${actor.name}`} />
            <CardBody>
              <FrontDeskForm types={ctx.ref.types.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name }))} modes={ctx.ref.modes} today={lagosToday()} now={lagosTimeNow()} />
            </CardBody>
          </Card>
        ) : (
          <Notice tone="info" className="self-start">
            Only a Front desk or Registry officer can log deliveries.
          </Notice>
        )}

        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader title={`Awaiting registry (${awaiting.length})`} description="Oldest first, with working days waiting." />
            <Table>
              <thead>
                <tr>
                  <Th>FD no.</Th>
                  <Th>Received</Th>
                  <Th>Sender / subject</Th>
                  <Th className="text-right">Waiting</Th>
                  {canRegister ? <Th /> : null}
                </tr>
              </thead>
              <tbody>
                {awaiting.length === 0 ? (
                  <tr>
                    <Td colSpan={5} className="py-8 text-center text-muted">
                      Nothing waiting.
                    </Td>
                  </tr>
                ) : (
                  awaiting.map((x) => (
                    <tr key={x.row.id}>
                      <Td className="whitespace-nowrap font-mono text-xs">{x.row.fdNo}</Td>
                      <Td className="tabular whitespace-nowrap text-muted">{lagosDateTime(x.row.receivedAt)}</Td>
                      <Td>
                        <div className="font-medium">{x.row.sender}</div>
                        <div className="text-xs text-muted">
                          {x.row.subject}
                          {x.typeName ? ` · ${x.typeName}` : ""} · {x.row.mode}
                        </div>
                      </Td>
                      <Td className="tabular text-right">
                        {(x.waiting ?? 0) > 0 ? <Badge tone={(x.waiting ?? 0) > 1 ? "warn" : "neutral"}>{x.waiting} day(s)</Badge> : "Today"}
                      </Td>
                      {canRegister ? (
                        <Td className="whitespace-nowrap text-right text-xs">
                          <Link href={`/inward/new?fd=${x.row.id}`} className="text-info hover:underline">
                            New inward
                          </Link>
                          <span className="text-faint"> · </span>
                          <Link href={`/registry-intake?fd=${x.row.id}`} className="text-info hover:underline">
                            Intake
                          </Link>
                        </Td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </Card>

          <Card>
            <CardHeader title="Recently registered" />
            <Table>
              <thead>
                <tr>
                  <Th>FD no.</Th>
                  <Th>Sender / subject</Th>
                  <Th>Registered as</Th>
                </tr>
              </thead>
              <tbody>
                {recent.length === 0 ? (
                  <tr>
                    <Td colSpan={3} className="py-6 text-center text-muted">
                      None yet.
                    </Td>
                  </tr>
                ) : (
                  recent.map((x) => (
                    <tr key={x.row.id}>
                      <Td className="whitespace-nowrap font-mono text-xs">{x.row.fdNo}</Td>
                      <Td>
                        <div>{x.row.sender}</div>
                        <div className="text-xs text-muted">{x.row.subject}</div>
                      </Td>
                      <Td className="whitespace-nowrap font-mono text-xs">
                        {x.row.inwardItemId ? (
                          <Link href={`/inward/${x.row.inwardItemId}`} className="text-info hover:underline">
                            {x.ackNo}
                          </Link>
                        ) : null}
                        {x.row.registeredAt ? <div className="mt-0.5 font-sans text-faint">{lagosDateTime(x.row.registeredAt)}</div> : null}
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </Card>
        </div>
      </div>
    </>
  );
}
