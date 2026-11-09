import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { FlagsBadge, OutwardStatusBadge } from "@/components/registry-badges";
import { Badge, Button, buttonVariants, Card, CardHeader, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { OUTWARD_STATUSES } from "@/domain/registry";
import { dateShort } from "@/lib/format";
import { can } from "@/server/auth/actor";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { listOutward, registryCtx } from "@/server/services/registry/load";

export const metadata: Metadata = { title: "Outward Register" };

const PAGE = 50;

export default async function OutwardPage({ searchParams }: PageProps<"/outward">) {
  const actor = await requirePermission("registers:read");
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const q = get("q").toLowerCase();
  const status = get("status");
  const view = get("view");
  const page = Math.max(1, Number(get("page")) || 1);
  const ctx = await registryCtx(db);
  let list = await listOutward(db, ctx);
  if (q) list = list.filter((x) => [x.row.outNo, x.row.addressee, x.row.subject, x.inReplyToAck, x.row.trackingRef].some((v) => v?.toLowerCase().includes(q)));
  if (status) list = list.filter((x) => x.a.status === status);
  if (view === "flags") list = list.filter((x) => x.a.flags.length > 0);
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const shown = list.slice((page - 1) * PAGE, page * PAGE);
  const qs = (p: number) => new URLSearchParams({ ...(Object.fromEntries(Object.entries(sp).filter(([, v]) => typeof v === "string")) as Record<string, string>), page: String(p) }).toString();

  return (
    <>
      <PageHeader
        title="Outward Register"
        description="Every outgoing document with its OGSERC/OUT number, dispatch, delivery and response tracking."
        actions={
          can(actor, "outward:write") ? (
            <Link href="/outward/new" className={buttonVariants()}>
              <Plus className="h-4 w-4" /> New outward
            </Link>
          ) : null
        }
      />
      <Card>
        <CardHeader
          title={`${list.length} item(s)`}
          actions={
            <form className="flex flex-wrap gap-2 max-sm:w-full max-sm:*:w-full" role="search">
              <Input name="q" defaultValue={get("q")} placeholder="OUT, addressee, subject, ACK" className="w-56" aria-label="Search" />
              <Select name="status" defaultValue={status} className="w-48" aria-label="Status">
                <option value="">All statuses</option>
                {OUTWARD_STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
              <Select name="view" defaultValue={view} className="w-36" aria-label="View">
                <option value="">Everything</option>
                <option value="flags">With flags</option>
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
              <Th>OUT</Th>
              <Th>Addressee / subject</Th>
              <Th>Type · signed by</Th>
              <Th>Dispatched</Th>
              <Th>Status</Th>
              <Th>Response due</Th>
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
                    <Link href={`/outward/${x.row.id}`} className="text-info hover:underline">
                      {x.row.outNo}
                    </Link>
                    <div className="mt-0.5 font-sans text-faint">{dateShort(x.row.documentDate)}</div>
                    {x.row.isExample ? <Badge className="mt-1">EXAMPLE</Badge> : null}
                  </Td>
                  <Td>
                    <div className="font-medium">{x.row.addressee}</div>
                    <div className="text-xs text-muted">
                      {x.row.subject}
                      {x.inReplyToAck ? ` · reply to ${x.inReplyToAck}` : ""}
                    </div>
                  </Td>
                  <Td className="text-xs">
                    <div>{x.row.documentType}</div>
                    <div className="text-muted">{x.row.signatoryName}</div>
                  </Td>
                  <Td className="tabular whitespace-nowrap text-xs">
                    {x.row.dispatchedOn ? dateShort(x.row.dispatchedOn) : "—"}
                    <div className="text-muted">{x.row.dispatchMode}</div>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      <OutwardStatusBadge status={x.a.status} />
                      <FlagsBadge flags={x.a.flags} />
                    </div>
                  </Td>
                  <Td className="tabular whitespace-nowrap">{dateShort(x.a.responseDue)}</Td>
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
              {page > 1 ? <Link href={`/outward?${qs(page - 1)}`} className="text-info hover:underline">← Newer</Link> : null}
              {page < pages ? <Link href={`/outward?${qs(page + 1)}`} className="text-info hover:underline">Older →</Link> : null}
            </div>
          </div>
        ) : null}
      </Card>
    </>
  );
}
