import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { BarList, MonthColumns } from "@/components/bar-list";
import { Badge, Card, CardBody, CardHeader, Notice, PageHeader, Stat, Table, Td, Th } from "@/components/ui";
import { diffDays, longDate } from "@/domain/dates";
import { formatNaira } from "@/domain/money";
import { ROLE_LABELS } from "@/domain/roles";
import { dateShort } from "@/lib/format";
import { can } from "@/server/auth/actor";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { dashboardData } from "@/server/services/dashboard";
import { listHolidays } from "@/server/services/holidays";

export const metadata: Metadata = { title: "Dashboard" };

/** A compact figure list: label, value, optional link. */
function Figures({ items }: { items: [string, ReactNode, string?][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
      {items.map(([label, value, href]) => (
        <div key={label} className="flex items-baseline justify-between gap-3 border-b border-border/50 py-1.5 text-sm">
          <dt className="text-muted">{href ? <Link href={href} className="hover:text-text hover:underline">{label}</Link> : label}</dt>
          <dd className="tabular font-medium text-text">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Queue({ title, href, empty, children, count }: { title: string; href?: string; empty: string; children: ReactNode; count: number }) {
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            {title} <Badge tone={count ? "warn" : "neutral"}>{count}</Badge>
          </span>
        }
        actions={
          href ? (
            <Link href={href} className="text-xs text-info hover:underline">
              Open
            </Link>
          ) : undefined
        }
      />
      <CardBody className="py-2">{count ? <ul className="divide-y divide-border/50 text-sm">{children}</ul> : <p className="py-2 text-sm text-muted">{empty}</p>}</CardBody>
    </Card>
  );
}

function Item({ href, ack, name, note }: { href: string; ack: string; name: string; note?: ReactNode }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="min-w-0 truncate">
        <Link href={href} className="font-mono text-xs text-info hover:underline">
          {ack}
        </Link>{" "}
        <span className="text-text">{name}</span>
      </span>
      {note ? <span className="shrink-0 text-xs text-muted">{note}</span> : null}
    </li>
  );
}

export default async function DashboardPage() {
  const actor = await requireActor();
  const [d, holidays] = await Promise.all([dashboardData(db, actor), listHolidays(db)]);
  const { registry: r, registration: g, queues: q, settings, today } = d;
  const daysLeft = diffDays(today, g.deadline);
  const upcoming = holidays.filter((h) => h.date >= today).slice(0, 4);
  const naira = (k: number) => formatNaira(k);
  const showRegistry = actor.roles.some((x) => ["front_desk", "registry", "router", "unit_officer", "admin", "viewer"].includes(x));
  const showFinance = can(actor, "payment:decide") || can(actor, "payment:record");

  return (
    <>
      <PageHeader
        title={`Good day, ${actor.name.split(" ")[0]}`}
        description={`${longDate(today)} · ${actor.roles.map((x) => ROLE_LABELS[x]).join(", ") || "No roles yet: ask an admin."}`}
      />
      {settings.effectiveDatePlaceholder && can(actor, "settings:write") ? (
        <Notice tone="warn" className="mb-6" title="The Effective Date is a placeholder">
          {longDate(settings.effectiveDate)} is used until the Order is gazetted. Update it under{" "}
          <Link href="/admin/settings" className="text-info hover:underline">
            Admin › Settings
          </Link>
          ; every deadline moves with it.
        </Notice>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Received today" value={r.receivedToday} hint={`${r.receivedLast7} in the last 7 days`} />
        <Stat label="Dispatched today" value={r.dispatchedToday} hint={`${r.dispatchedLast7} in the last 7 days`} />
        <Stat label="Awaiting routing" value={r.awaitingRouting} hint={`${r.awaitingForwarding} awaiting forwarding`} />
        <Stat label="Incoming overdue" value={r.incomingOverdue} hint={`${r.repliesOverdueToUs} replies overdue to us`} />
        <Stat label="Submissions" value={g.total} hint={`${g.registered} registered · ${g.ownUse} own-use`} />
        <Stat label="Days to deadline" value={daysLeft >= 0 ? daysLeft : `${-daysLeft} past`} hint={longDate(g.deadline)} />
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-faint">Work queues</h2>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {q.myEvaluations.length || can(actor, "evaluation:check") || can(actor, "evaluation:decide") ? (
          <Queue title="My evaluations" href="/evaluation" count={q.myEvaluations.length} empty="Nothing assigned to you.">
            {q.myEvaluations.slice(0, 8).map((x) => (
              <Item key={x.id} href={`/register/${x.id}?tab=evaluation`} ack={x.ack} name={x.name} />
            ))}
          </Queue>
        ) : null}
        {q.myUnit ? (
          <Queue title="Items for my unit" href="/pending" count={q.myUnit.length} empty="Nothing open for your unit.">
            {q.myUnit.slice(0, 8).map((x) => (
              <Item key={x.id} href={`/inward/${x.id}`} ack={x.ack} name={x.name} note={x.status === "Overdue" ? <Badge tone="danger">Overdue</Badge> : x.due ? `due ${dateShort(x.due)}` : x.status} />
            ))}
          </Queue>
        ) : null}
        {showRegistry ? (
          <Queue title="Awaiting routing" href="/routing" count={r.awaitingRouting} empty="Nothing to route.">
            {q.awaitingRouting.map((x) => (
              <Item key={x.id} href={`/inward/${x.id}`} ack={x.ack} name={x.name} note={`${x.days} wd`} />
            ))}
          </Queue>
        ) : null}
        <Queue title="Awaiting payment" href="/register?status=Acknowledged+-+Awaiting+Payment" count={g.awaitingPayment} empty="No submission is waiting for payment.">
          {q.awaitingPayment.map((x) => (
            <Item key={x.id} href={`/register/${x.id}?tab=payments`} ack={x.ack} name={x.name} note={x.reminder ? <Badge tone="warn">{x.days} days · remind</Badge> : `${x.days} days`} />
          ))}
        </Queue>
        {showFinance ? (
          <Queue title="Finance Desk" href="/payments" count={q.financeDesk} empty="No payment waits for Finance.">
            {q.oldestPayment ? <li className="py-1.5 text-muted">Oldest: <span className="font-mono text-xs text-text">{q.oldestPayment.payNo}</span> for {q.oldestPayment.reference}</li> : null}
          </Queue>
        ) : null}
        <Queue title="Ready for decision" href="/evaluation" count={q.readyForDecision.length} empty="Nothing ready for a decision.">
          {q.readyForDecision.slice(0, 8).map((x) => (
            <Item key={x.id} href={`/register/${x.id}?tab=evaluation`} ack={x.ack} name={x.name} />
          ))}
        </Queue>
        <Queue title="Deficiency responses overdue" href="/register?status=Deficiency+Notice+Issued" count={q.overdueDeficiency.length} empty="None overdue. (They are never lapsed automatically.)">
          {q.overdueDeficiency.slice(0, 8).map((x) => (
            <Item key={x.id} href={`/register/${x.id}`} ack={x.ack} name={x.name} note={`due ${dateShort(x.due)}`} />
          ))}
        </Queue>
      </div>

      {showRegistry ? (
        <>
          <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-faint">Registry</h2>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Correspondence" />
              <CardBody>
                <Figures
                  items={[
                    ["Items logged", r.itemsLogged, "/inward"],
                    ["Open", r.open, "/pending"],
                    ["Closed", r.closed],
                    ["Noted / filed", r.noted],
                    ["Closed on time", r.closedOnTimePct === null ? "—" : `${r.closedOnTimePct}%`],
                    ["Acknowledgement not yet issued", r.ackNotIssued],
                    ["Received after hours / non-working day", r.afterHours],
                    ["REG-01 filed after the deadline", r.reg01AfterDeadline, "/inward?view=late"],
                    ["Items with flags", r.withFlags, "/inward?view=flags"],
                    ["At the front desk", r.atFrontDesk, "/front-desk"],
                    ["Awaiting Register entry", r.awaitingRegisterEntry, "/registry-intake"],
                    ["Outgoing logged", r.outLogged, "/outward"],
                    ["Not yet dispatched", r.notYetDispatched, "/outward?status=Not+yet+dispatched"],
                    ["Delivery not confirmed", r.deliveryNotConfirmed],
                    ["Awaiting response", r.awaitingResponse],
                    ["Responses received", r.responsesReceived],
                    ["Files out", r.filesOut, "/files?view=out"],
                    ["Files overdue back", r.filesOverdue, "/files?view=overdue"],
                  ]}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Open items by unit" />
              <CardBody>
                <BarList bars={r.byUnit} caption="Open inward items by unit" empty="Nothing open." />
              </CardBody>
            </Card>
          </div>
        </>
      ) : null}

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-faint">Registration</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total due" value={naira(g.money.totalDue)} hint="Fees and late charges, less waivers" />
        <Stat label="Collected" value={naira(g.money.collected)} hint={g.money.collectionRate === null ? "Finance-confirmed" : `${g.money.collectionRate}% of the total due`} />
        <Stat label="With Finance" value={naira(g.money.withFinance)} hint="Recorded, not yet confirmed" />
        <Stat label="Outstanding" value={naira(g.money.outstanding)} hint="Open and registered submissions" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="By status" />
          <CardBody>
            <BarList bars={g.byStatus} caption="Submissions by status" />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Service levels" description={`Average ${g.avgDaysInQueue ?? 0} days in the queue (open submissions).`} />
          <CardBody>
            <Figures
              items={[
                ["Overdue (red)", g.red, "/register?view=red"],
                ["Due soon (amber)", g.amber],
                ["Open with data flags", g.withFlags, "/register?view=flags"],
                ["Filed late", g.late],
                ["In progress", g.inProgress],
                ["Provisionally registered", g.provisional],
              ]}
            />
            <div className="mt-4">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-faint">Open evaluations</p>
              <BarList bars={g.byEvaluation} caption="Open submissions by evaluation status" empty="No open submissions." />
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Submissions by month" description="12 months from the Effective Date (date submitted)." />
          <CardBody>
            <MonthColumns bars={g.monthly} caption="Submissions by month" />
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="By category" description="Schedule 3. Amounts in naira; collected is Finance-confirmed." />
        <Table>
          <thead>
            <tr>
              <Th>Cat.</Th>
              <Th className="text-right">Submissions</Th>
              <Th className="text-right">Registered</Th>
              <Th className="text-right">Fees</Th>
              <Th className="text-right">Late charges</Th>
              <Th className="text-right">Waivers</Th>
              <Th className="text-right">Collected</Th>
              <Th className="text-right">Outstanding</Th>
            </tr>
          </thead>
          <tbody>
            {g.byCategory.map((c) => (
              <tr key={c.category} className={c.submissions ? undefined : "text-faint"}>
                <Td className="font-semibold">{c.category}</Td>
                <Td className="tabular text-right">{c.submissions}</Td>
                <Td className="tabular text-right">{c.registered}</Td>
                <Td className="tabular text-right">{c.fees ? naira(c.fees) : "—"}</Td>
                <Td className="tabular text-right">{c.late ? naira(c.late) : "—"}</Td>
                <Td className="tabular text-right">{c.waivers ? naira(c.waivers) : "—"}</Td>
                <Td className="tabular text-right">{c.collected ? naira(c.collected) : "—"}</Td>
                <Td className="tabular text-right">{c.outstanding ? naira(c.outstanding) : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="By primary activity" />
          <CardBody>
            <BarList bars={g.byActivity} caption="Submissions by primary activity" />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="By LGA" description="Registrants and own-use notifications." />
          <CardBody>
            <BarList bars={g.byLga} caption="Registrants by LGA" />
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Next public holidays"
            actions={
              <Link href="/admin/holidays" className="text-xs text-info hover:underline">
                All holidays
              </Link>
            }
          />
          <CardBody className="space-y-2">
            {upcoming.length ? (
              upcoming.map((h) => (
                <div key={h.date} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    <span className="tabular text-muted">{longDate(h.date)}</span> · {h.name}
                  </span>
                  {h.status !== "Fixed" ? <Badge tone="warn">{h.status}</Badge> : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-warn">No holidays ahead are set. Add them under Admin › Holidays.</p>
            )}
            <p className="pt-2 text-xs text-muted">
              Effective Date {longDate(settings.effectiveDate)}
              {settings.effectiveDatePlaceholder ? " (placeholder)" : ""} · office closes {settings.officeClosingTime}
            </p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
