import type { Metadata } from "next";
import Link from "next/link";
import { desc, isNotNull } from "drizzle-orm";
import { Plus } from "lucide-react";
import { PaymentBadge, SlaBadge, StatusBadge } from "@/components/badges";
import { Badge, Button, buttonVariants, Card, CardHeader, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { STATUSES } from "@/server/db/schema";
import { FILING_LABELS } from "@/domain/registration/types";
import { can } from "@/server/auth/actor";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { submissions } from "@/server/db/schema";
import { assessMany } from "@/server/services/submissions/load";
import { dateShort, naira } from "@/lib/format";

export const metadata: Metadata = { title: "Register" };

const PAGE = 50;

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const actor = await requirePermission("registers:read");
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const q = get("q").toLowerCase();
  const status = get("status");
  const filing = get("filing");
  const category = get("category");
  const view = get("view");
  const page = Math.max(1, Number(get("page")) || 1);

  const rows = await db.select().from(submissions).where(isNotNull(submissions.status)).orderBy(desc(submissions.ackNo));
  let list = await assessMany(db, rows);
  if (q) list = list.filter((x) => [x.row.ackNo, x.row.registeredName, x.row.cacNo, x.row.registrationNo].some((v) => v?.toLowerCase().includes(q)));
  if (status) list = list.filter((x) => x.row.status === status);
  if (filing) list = list.filter((x) => x.row.filingType === filing);
  if (category) list = list.filter((x) => x.a.categoryApplied === category);
  if (view === "red") list = list.filter((x) => x.a.sla === "Red");
  if (view === "flags") list = list.filter((x) => x.a.flags.length > 0);
  if (view === "unpaid") list = list.filter((x) => !x.a.closed && (x.a.paymentStatus === "Unpaid" || x.a.paymentStatus === "Part-paid"));
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const shown = list.slice((page - 1) * PAGE, page * PAGE);
  const qs = (p: number) => new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => typeof v === "string")) as Record<string, string>, page: String(p) }).toString();

  return (
    <>
      <PageHeader
        title="Register"
        description="One row per submission: new registrations, updates and annual confirmations (para 15). Every figure is calculated from the saved details, Finance-confirmed payments and the checklist."
        actions={
          can(actor, "submission:save") ? (
            <Link href="/register/new" className={buttonVariants()}>
              <Plus className="h-4 w-4" /> New submission
            </Link>
          ) : null
        }
      />
      <Card>
        <CardHeader
          title={`${list.length} submission(s)`}
          actions={
            <form className="flex flex-wrap gap-2" role="search">
              <Input name="q" defaultValue={get("q")} placeholder="ACK, name, CAC, REG no." className="w-52" aria-label="Search" />
              <Select name="status" defaultValue={status} className="w-56" aria-label="Status">
                <option value="">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
              <Select name="filing" defaultValue={filing} className="w-44" aria-label="Filing type">
                <option value="">All filing types</option>
                {Object.entries(FILING_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
              <Select name="category" defaultValue={category} className="w-32" aria-label="Category">
                <option value="">All categories</option>
                {"ABCDEFGHJK".split("").map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
              <Select name="view" defaultValue={view} className="w-44" aria-label="View">
                <option value="">Everything</option>
                <option value="red">Overdue (SLA red)</option>
                <option value="flags">With data flags</option>
                <option value="unpaid">Unpaid / part-paid</option>
              </Select>
              <Button type="submit" variant="secondary">
                Filter
              </Button>
            </form>
          }
        />
        <Table>
          <thead>
            <tr>
              <Th>ACK</Th>
              <Th>Registrant</Th>
              <Th>Cat.</Th>
              <Th>Status</Th>
              <Th className="text-right">Total due</Th>
              <Th>Payment</Th>
              <Th>SLA</Th>
              <Th>Next action</Th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <Td colSpan={8} className="py-10 text-center text-muted">
                  No submissions match.
                </Td>
              </tr>
            ) : (
              shown.map(({ row, a }) => (
                <tr key={row.id} className="hover:bg-surface-hover/50">
                  <Td className="whitespace-nowrap font-mono text-xs">
                    <Link href={`/register/${row.id}`} className="text-info hover:underline">
                      {row.ackNo}
                    </Link>
                    <div className="mt-0.5 font-sans text-faint">{dateShort(row.dateSubmitted)}</div>
                  </Td>
                  <Td>
                    <div className="font-medium">{row.registeredName}</div>
                    <div className="text-xs text-faint">
                      {FILING_LABELS[row.filingType]}
                      {row.registrationNo ? ` · ${row.registrationNo}` : ""}
                    </div>
                  </Td>
                  <Td className="font-medium">{a.categoryApplied ?? "—"}</Td>
                  <Td>
                    <StatusBadge status={row.status} />
                    {a.flags.length ? (
                      <Badge tone="warn" className="ml-1">
                        {a.flags.length} flag{a.flags.length > 1 ? "s" : ""}
                      </Badge>
                    ) : null}
                  </Td>
                  <Td className="tabular text-right">{naira(a.totalDue)}</Td>
                  <Td>
                    <PaymentBadge status={a.paymentStatus} />
                  </Td>
                  <Td>
                    <SlaBadge sla={a.sla} />
                  </Td>
                  <Td className="max-w-xs text-xs text-muted">{a.nextAction}</Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
        {pages > 1 ? (
          <div className="flex items-center justify-between px-5 py-3 text-sm">
            <span className="text-muted">
              Page {page} of {pages}
            </span>
            <div className="flex gap-3">
              {page > 1 ? <Link href={`/register?${qs(page - 1)}`} className="text-info hover:underline">← Newer</Link> : null}
              {page < pages ? <Link href={`/register?${qs(page + 1)}`} className="text-info hover:underline">Older →</Link> : null}
            </div>
          </div>
        ) : null}
      </Card>
    </>
  );
}
