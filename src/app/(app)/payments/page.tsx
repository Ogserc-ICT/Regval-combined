import type { Metadata } from "next";
import Link from "next/link";
import { PaymentsTable } from "@/components/payments-table";
import { RecordPaymentForm } from "@/components/record-payment-form";
import { Card, CardBody, CardHeader, PageHeader, Stat } from "@/components/ui";
import { cn } from "@/lib/cn";
import { naira } from "@/lib/format";
import { diffDays, lagosDate } from "@/domain/dates";
import { can } from "@/server/auth/actor";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { listPayments } from "@/server/services/payments";
import { listValues } from "@/server/services/reference";
import { lagosToday } from "@/server/time";

export const metadata: Metadata = { title: "Payments & Finance" };

export default async function PaymentsPage({ searchParams }: PageProps<"/payments">) {
  const actor = await requirePermission("registers:read");
  const sp = await searchParams;
  const view = sp.view === "ledger" ? "ledger" : "finance";
  const today = lagosToday();
  const [pending, all, channels, purposes] = await Promise.all([
    listPayments(db, { status: "Pending" }),
    view === "ledger" ? listPayments(db, { limit: 500 }) : Promise.resolve([]),
    listValues(db, "payment_channel"),
    listValues(db, "payment_purpose"),
  ]);
  const href = (p: { ownerType: string; ownerId: string }) => (p.ownerType === "submission" ? `/register/${p.ownerId}?tab=payments` : `/own-use/${p.ownerId}`);
  const oldest = pending[0] ? diffDays(lagosDate(pending[0].recordedAt), today) : 0;

  return (
    <>
      <PageHeader
        title="Payments & Finance"
        description="Payments are recorded against an ACK or OUN and count only once a Finance officer confirms them against the bank or Remita. The officer who recorded a payment cannot confirm or reject it. Payments are never deleted: they are reversed."
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Waiting for Finance" value={pending.length} />
        <Stat label="Amount waiting" value={naira(pending.reduce((s, p) => s + p.amount, 0))} />
        <Stat label="Oldest waiting" value={pending.length ? `${oldest} day(s)` : "—"} />
      </div>
      <nav className="mb-4 flex gap-1 border-b border-border">
        {(
          [
            ["finance", "Finance Desk"],
            ["ledger", "Ledger"],
          ] as const
        ).map(([k, label]) => (
          <Link
            key={k}
            href={`/payments?view=${k}`}
            className={cn("-mb-px border-b-2 px-3 py-2 text-sm", view === k ? "border-accent font-medium" : "border-transparent text-muted hover:text-text")}
          >
            {label}
          </Link>
        ))}
      </nav>
      {view === "finance" ? (
        <Card>
          <CardHeader title="Finance Desk" description="Payments waiting for confirmation, oldest first." />
          <PaymentsTable rows={pending} actor={actor} ownerHref={href} />
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {can(actor, "payment:record") ? (
            <Card>
              <CardHeader title="Record a payment" />
              <CardBody>
                <RecordPaymentForm today={today} channels={channels} purposes={purposes} />
              </CardBody>
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Ledger" description="Latest 500 payments, newest first." />
            <PaymentsTable rows={all} actor={actor} ownerHref={href} />
          </Card>
        </div>
      )}
    </>
  );
}
