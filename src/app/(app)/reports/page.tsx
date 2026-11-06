import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { Button, Card, CardBody, CardHeader, Field, Input, Notice, PageHeader, Select } from "@/components/ui";
import { can } from "@/server/auth/actor";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { inwardItems } from "@/server/db/schema";
import { registryCtx } from "@/server/services/registry/load";
import { lagosToday } from "@/server/time";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const actor = await requirePermission("registers:read");
  const sp = await searchParams;
  const ctx = await registryCtx(db);
  const canPrint = can(actor, "reports:print");
  const ack = typeof sp.ack === "string" ? sp.ack.trim().toUpperCase() : "";
  const [found] = ack ? await db.select({ id: inwardItems.id, ackNo: inwardItems.ackNo, sender: inwardItems.sender }).from(inwardItems).where(eq(inwardItems.ackNo, ack)) : [];

  return (
    <>
      <PageHeader title="Reports" description="PDFs generated on request from the current records. Nothing is kept on a local disk." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Acknowledgement slip" description="A4, two copies (sender's and Registry's), para 10(3) wording for registration filings." />
          <CardBody>
            {canPrint ? (
              <form className="flex flex-col gap-3">
                <Field label="ACK number" htmlFor="ack">
                  <Input id="ack" name="ack" defaultValue={ack} placeholder="OGSERC/ACK/2026/00001" />
                </Field>
                <div className="flex justify-end">
                  <Button type="submit" variant="secondary" size="sm">
                    Find
                  </Button>
                </div>
                {ack && !found ? <Notice tone="warn">{ack} is not in the Inward Register.</Notice> : null}
                {found ? (
                  <Notice tone="accent" title={found.ackNo}>
                    {found.sender} ·{" "}
                    <a href={`/api/pdf/slip/${found.id}`} target="_blank" rel="noopener" className="text-info hover:underline">
                      Open slip
                    </a>{" "}
                    ·{" "}
                    <a href={`/api/pdf/slip/${found.id}?download=1`} className="text-info hover:underline">
                      Download
                    </a>
                  </Notice>
                ) : null}
              </form>
            ) : (
              <p className="text-sm text-muted">Registry officers and admins print slips.</p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Daily Register" description="Everything received (by date received) and dispatched on a day, for the end-of-day count and sign-off." />
          <CardBody>
            {canPrint ? (
              <form action="/api/pdf/daily-register" target="_blank" className="flex flex-col gap-3">
                <Field label="Date" htmlFor="date">
                  <Input id="date" name="date" type="date" defaultValue={lagosToday()} />
                </Field>
                <div className="flex justify-end">
                  <Button type="submit" variant="secondary" size="sm">
                    Open PDF
                  </Button>
                </div>
              </form>
            ) : (
              <p className="text-sm text-muted">Registry officers and admins print the Daily Register.</p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Pending actions" description="Open, overdue and waiting items in the order received." />
          <CardBody>
            <form action="/api/pdf/pending" target="_blank" className="flex flex-col gap-3">
              <Field label="Unit" htmlFor="unit">
                <Select id="unit" name="unit" defaultValue={actor.unitId ?? ""}>
                  <option value="">All units</option>
                  {ctx.ref.units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex justify-end">
                <Button type="submit" variant="secondary" size="sm">
                  Open PDF
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      </div>
      <p className="mt-6 text-sm text-muted">
        Slips are also on each item page in the{" "}
        <Link href="/inward" className="text-info hover:underline">
          Inward Register
        </Link>
        .
      </p>
    </>
  );
}
