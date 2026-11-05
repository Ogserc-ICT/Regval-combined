import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, CardBody, CardHeader, PageHeader, Stat } from "@/components/ui";
import { diffDays, longDate } from "@/domain/dates";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/domain/roles";
import { registrationDeadline } from "@/domain/settings";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { listHolidays } from "@/server/services/holidays";
import { getSettings } from "@/server/services/settings";
import { lagosToday } from "@/server/time";

export const metadata: Metadata = { title: "Dashboard" };

const PHASES = [
  { n: 0, name: "Spec and plan", status: "done" },
  { n: 1, name: "Scaffold and foundations", status: "done" },
  { n: 2, name: "Registration module", status: "current" },
  { n: 3, name: "Registry module", status: "next" },
  { n: 4, name: "Outputs and automation", status: "later" },
  { n: 5, name: "Dashboard and admin", status: "later" },
  { n: 6, name: "Import and go-live", status: "later" },
] as const;

export default async function DashboardPage() {
  const actor = await requireActor();
  const [settings, holidays] = await Promise.all([getSettings(db), listHolidays(db)]);
  const today = lagosToday();
  const deadline = registrationDeadline(settings);
  const daysLeft = diffDays(today, deadline);
  const upcoming = holidays.filter((h) => h.date >= today).slice(0, 4);

  return (
    <>
      <PageHeader
        title={`Good day, ${actor.name.split(" ")[0]}`}
        description="Registry counters and registration figures appear here as the modules are built."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Effective Date"
          value={longDate(settings.effectiveDate)}
          hint={settings.effectiveDatePlaceholder ? "Placeholder until gazetted" : "Gazetted"}
        />
        <Stat label="Registration deadline" value={longDate(deadline)} hint={`Effective Date + ${settings.registrationPeriodDays} + ${settings.extensionDays} days`} />
        <Stat label="Days to deadline" value={daysLeft >= 0 ? daysLeft : `${-daysLeft} past`} hint="Calendar days, Lagos time" />
        <Stat label="Office closing time" value={settings.officeClosingTime} hint="Email and portal filings after this are received next working day" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Build progress" description="Phases from docs/COMBINED_BUILD.md" />
          <CardBody>
            <ol className="space-y-2.5">
              {PHASES.map((p) => (
                <li key={p.n} className="flex items-center gap-3 text-sm">
                  <span className="tabular w-16 shrink-0 text-faint">Phase {p.n}</span>
                  <span className="flex-1">{p.name}</span>
                  {p.status === "done" ? (
                    <Badge tone="accent">Done</Badge>
                  ) : p.status === "current" ? (
                    <Badge tone="info">This phase</Badge>
                  ) : p.status === "next" ? (
                    <Badge tone="warn">Next</Badge>
                  ) : (
                    <Badge>Later</Badge>
                  )}
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Your roles" />
            <CardBody className="space-y-3">
              {actor.roles.length ? (
                actor.roles.map((r) => (
                  <div key={r}>
                    <p className="text-sm font-medium">{ROLE_LABELS[r]}</p>
                    <p className="text-xs text-muted">{ROLE_DESCRIPTIONS[r]}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted">No roles yet. Ask an admin.</p>
              )}
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
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
