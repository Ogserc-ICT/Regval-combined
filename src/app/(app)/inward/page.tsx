import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { EntryBadge, FlagsBadge, InwardStatusBadge } from "@/components/registry-badges";
import { Badge, Button, buttonVariants, Card, CardHeader, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { INWARD_STATUSES } from "@/domain/registry";
import { dateShort } from "@/lib/format";
import { can } from "@/server/auth/actor";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { listInward, registryCtx } from "@/server/services/registry/load";

export const metadata: Metadata = { title: "Inward Register" };

const PAGE = 50;

export default async function InwardPage({ searchParams }: PageProps<"/inward">) {
  const actor = await requirePermission("registers:read");
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const q = get("q").toLowerCase();
  const status = get("status");
  const unit = get("unit");
  const type = get("type");
  const view = get("view");
  const from = get("from");
  const to = get("to");
  const page = Math.max(1, Number(get("page")) || 1);

  const ctx = await registryCtx(db);
  let list = await listInward(db, ctx);
  if (q) list = list.filter((x) => [x.row.ackNo, x.row.sender, x.row.subject, x.row.cacNo, x.row.senderRef, x.fdNo].some((v) => v?.toLowerCase().includes(q)));
  if (status) list = list.filter((x) => x.a.status === status);
  if (unit) list = list.filter((x) => x.unit?.id === unit);
  if (type) list = list.filter((x) => x.row.correspondenceTypeId === type);
  if (from) list = list.filter((x) => x.row.deemedReceiptDate >= from);
  if (to) list = list.filter((x) => x.row.deemedReceiptDate <= to);
  if (view === "flags") list = list.filter((x) => x.a.flags.length > 0);
  if (view === "entry") list = list.filter((x) => x.entry === "Awaiting Register entry" || x.entry.startsWith("Register row started"));
  if (view === "late") list = list.filter((x) => x.a.filedAfterDeadline);
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const shown = list.slice((page - 1) * PAGE, page * PAGE);
  const qs = (p: number) => new URLSearchParams({ ...(Object.fromEntries(Object.entries(sp).filter(([, v]) => typeof v === "string")) as Record<string, string>), page: String(p) }).toString();

  return (
    <>
      <PageHeader
        title="Inward Register"
        description="Every incoming item and its OGSERC/ACK number, including filings saved directly on the Register or Own-Use. Status, response due and flags are worked out from the item, its routing and any reply."
        actions={
          can(actor, "inward:write") ? (
            <Link href="/inward/new" className={buttonVariants()}>
              <Plus className="h-4 w-4" /> New inward
            </Link>
          ) : null
        }
      />
      <Card>
        <CardHeader
          title={`${list.length} item(s)`}
          actions={
            <form className="flex flex-wrap gap-2 max-sm:w-full max-sm:*:w-full" role="search">
              <Input name="q" defaultValue={get("q")} placeholder="ACK, sender, subject, CAC" className="w-52" aria-label="Search" />
              <Select name="status" defaultValue={status} className="w-44" aria-label="Status">
                <option value="">All statuses</option>
                {INWARD_STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
              <Select name="unit" defaultValue={unit} className="w-52" aria-label="Unit">
                <option value="">All units</option>
                {ctx.ref.units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
              <Select name="type" defaultValue={type} className="w-52" aria-label="Type">
                <option value="">All types</option>
                {ctx.ref.types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
              <Input name="from" type="date" defaultValue={from} className="w-36" aria-label="Deemed from" title="Deemed receipt from" />
              <Input name="to" type="date" defaultValue={to} className="w-36" aria-label="Deemed to" title="Deemed receipt to" />
              <Select name="view" defaultValue={view} className="w-48" aria-label="View">
                <option value="">Everything</option>
                <option value="flags">With flags</option>
                <option value="entry">Awaiting Register entry</option>
                <option value="late">REG-01 after the deadline</option>
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
              <Th>Sender / subject</Th>
              <Th>Type · unit</Th>
              <Th>Status</Th>
              <Th>Response due</Th>
              <Th className="text-right">Days open</Th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <Td colSpan={6} className="py-10 text-center text-muted">
                  No items match.
                </Td>
              </tr>
            ) : (
              shown.map((x) => (
                <tr key={x.row.id} className="hover:bg-surface-hover/50">
                  <Td className="whitespace-nowrap font-mono text-xs">
                    <Link href={`/inward/${x.row.id}`} className="text-info hover:underline">
                      {x.row.ackNo}
                    </Link>
                    <div className="mt-0.5 font-sans text-faint">Deemed {dateShort(x.row.deemedReceiptDate)}</div>
                    {x.row.isExample ? <Badge className="mt-1">EXAMPLE</Badge> : null}
                  </Td>
                  <Td>
                    <div className="font-medium">{x.row.sender}</div>
                    <div className="text-xs text-muted">{x.row.subject}</div>
                  </Td>
                  <Td className="text-xs">
                    <div>{x.typeName ?? "—"}</div>
                    <div className="text-muted">{x.unit?.name ?? "No unit"}</div>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      <InwardStatusBadge status={x.a.status} />
                      <FlagsBadge flags={x.a.flags} />
                      <EntryBadge entry={x.entry} />
                    </div>
                  </Td>
                  <Td className="tabular whitespace-nowrap">{dateShort(x.a.responseDue)}</Td>
                  <Td className="tabular text-right">{x.a.workingDaysOpen}</Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
        {pages > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm sm:px-5">
            <span className="text-muted">
              Page {page} of {pages}
            </span>
            <div className="flex gap-3">
              {page > 1 ? <Link href={`/inward?${qs(page - 1)}`} className="text-info hover:underline">← Newer</Link> : null}
              {page < pages ? <Link href={`/inward?${qs(page + 1)}`} className="text-info hover:underline">Older →</Link> : null}
            </div>
          </div>
        ) : null}
      </Card>
    </>
  );
}
