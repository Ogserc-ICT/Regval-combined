import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { FlagsBadge, MovementBadge } from "@/components/registry-badges";
import { Badge, Button, buttonVariants, Card, CardHeader, Input, PageHeader, Select, Stat, Table, Td, Th } from "@/components/ui";
import { lagosDateTime } from "@/domain/dates";
import { dateShort } from "@/lib/format";
import { can } from "@/server/auth/actor";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { listFiles, listMovements, registryCtx } from "@/server/services/registry/load";

export const metadata: Metadata = { title: "Files" };

export default async function FilesPage({ searchParams }: PageProps<"/files">) {
  const actor = await requirePermission("registers:read");
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const q = get("q").toLowerCase();
  const cls = get("class");
  const view = get("view");
  const ctx = await registryCtx(db);
  const [all, out] = await Promise.all([listFiles(db, ctx), listMovements(db, { outOnly: true }, ctx)]);
  let list = all;
  if (q) list = list.filter((x) => [x.row.fileRef, x.row.title, x.a.currentlyWith].some((v) => v?.toLowerCase().includes(q)));
  if (cls) list = list.filter((x) => x.row.fileClass === cls);
  if (view === "out") list = list.filter((x) => x.a.isOut);
  if (view === "overdue") list = list.filter((x) => x.a.overdue);
  if (view === "flags") list = list.filter((x) => x.a.flags.length > 0);

  return (
    <>
      <PageHeader
        title="Files"
        description="The File Index and file movements: who has each file, since when and when it is due back."
        actions={
          can(actor, "files:write") ? (
            <Link href="/files/new" className={buttonVariants()}>
              <Plus className="h-4 w-4" /> New file
            </Link>
          ) : null
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="In the index" value={all.length} />
        <Stat label="Open" value={all.filter((x) => x.row.status === "Open").length} />
        <Stat label="Out now" value={out.length} />
        <Stat label="Overdue back" value={out.filter((m) => m.status === "Overdue").length} hint={`Return within ${ctx.settings.fileReturnDays} working days`} />
      </div>

      {out.length ? (
        <Card className="mb-6">
          <CardHeader title="Out now" description="Latest first." />
          <Table>
            <thead>
              <tr>
                <Th>File</Th>
                <Th>With</Th>
                <Th>Out since</Th>
                <Th>Return by</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {out.map((m) => (
                <tr key={m.row.id}>
                  <Td className="whitespace-nowrap font-mono text-xs">
                    <Link href={`/files/${m.row.fileId}`} className="text-info hover:underline">
                      {m.fileRef}
                    </Link>
                    <div className="mt-0.5 font-sans text-muted">{m.fileTitle}</div>
                  </Td>
                  <Td>
                    {m.row.issuedTo}
                    <div className="text-xs text-muted">{m.unitName}</div>
                  </Td>
                  <Td className="tabular whitespace-nowrap text-muted">{lagosDateTime(m.row.outAt)}</Td>
                  <Td className="tabular whitespace-nowrap">{dateShort(m.returnDue)}</Td>
                  <Td>
                    <MovementBadge status={m.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title={`File Index (${list.length})`}
          actions={
            <form className="flex flex-wrap gap-2 max-sm:w-full max-sm:*:w-full" role="search">
              <Input name="q" defaultValue={get("q")} placeholder="Reference, title, holder" className="w-52" aria-label="Search" />
              <Select name="class" defaultValue={cls} className="w-52" aria-label="Class">
                <option value="">All classes</option>
                {ctx.ref.fileClasses.map((c) => (
                  <option key={c.name}>{c.name}</option>
                ))}
              </Select>
              <Select name="view" defaultValue={view} className="w-40" aria-label="View">
                <option value="">Everything</option>
                <option value="out">Out</option>
                <option value="overdue">Overdue back</option>
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
              <Th>Reference</Th>
              <Th>Title</Th>
              <Th>Class · unit</Th>
              <Th>Currently with</Th>
              <Th className="text-right">In / out</Th>
              <Th>Last correspondence</Th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <Td colSpan={6} className="py-10 text-center text-muted">
                  No files yet.
                </Td>
              </tr>
            ) : (
              list.map((x) => (
                <tr key={x.row.id} className="hover:bg-surface-hover/50">
                  <Td className="whitespace-nowrap font-mono text-xs">
                    <Link href={`/files/${x.row.id}`} className="text-info hover:underline">
                      {x.row.fileRef}
                    </Link>
                    {x.row.status !== "Open" ? <Badge className="ml-1">{x.row.status}</Badge> : null}
                  </Td>
                  <Td>
                    {x.row.title}
                    <div className="mt-0.5">
                      <FlagsBadge flags={x.a.flags} />
                    </div>
                  </Td>
                  <Td className="text-xs">
                    <div>{x.row.fileClass}</div>
                    <div className="text-muted">{x.owningUnit ?? ""}</div>
                  </Td>
                  <Td className="text-xs">
                    {x.a.currentlyWith}
                    {x.a.isOut ? <div className="text-muted">since {dateShort(x.a.outSince)} · {x.a.workingDaysOut} working day(s)</div> : null}
                  </Td>
                  <Td className="tabular text-right">
                    {x.inwardCount} / {x.outwardCount}
                  </Td>
                  <Td className="tabular whitespace-nowrap">{dateShort(x.a.lastCorrespondence)}</Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
