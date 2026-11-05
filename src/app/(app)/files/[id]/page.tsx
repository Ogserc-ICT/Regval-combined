import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { EntityHistory } from "@/components/entity-history";
import { MovementBadge } from "@/components/registry-badges";
import { Badge, Card, CardBody, CardHeader, Notice, PageHeader, Table, Td, Th } from "@/components/ui";
import { lagosDateTime } from "@/domain/dates";
import { dateLong, dateShort } from "@/lib/format";
import { can } from "@/server/auth/actor";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { inwardItems, outwardItems } from "@/server/db/schema";
import { ServiceError } from "@/server/errors";
import { loadFile, registryCtx, type FileView } from "@/server/services/registry/load";
import { IssueFileForm, ReturnFileForm, UpdateFileForm } from "../file-forms";

export const metadata: Metadata = { title: "File" };

export default async function FilePage({ params, searchParams }: PageProps<"/files/[id]">) {
  const actor = await requirePermission("registers:read");
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await registryCtx(db);
  let f: FileView;
  try {
    f = await loadFile(db, id, ctx);
  } catch (e) {
    if (e instanceof ServiceError && e.kind === "not_found") notFound();
    throw e;
  }
  const { row, a } = f;
  const [inw, outw] = await Promise.all([
    db.select({ id: inwardItems.id, no: inwardItems.ackNo, d: inwardItems.deemedReceiptDate, who: inwardItems.sender, subject: inwardItems.subject }).from(inwardItems).where(eq(inwardItems.fileId, id)).orderBy(desc(inwardItems.deemedReceiptDate)),
    db.select({ id: outwardItems.id, no: outwardItems.outNo, d: outwardItems.documentDate, who: outwardItems.addressee, subject: outwardItems.subject }).from(outwardItems).where(eq(outwardItems.fileId, id)).orderBy(desc(outwardItems.documentDate)),
  ]);
  const correspondence = [...inw.map((x) => ({ ...x, kind: "in" as const })), ...outw.map((x) => ({ ...x, kind: "out" as const }))].sort((x, y) => (x.d < y.d ? 1 : -1));
  const canWrite = can(actor, "files:write");
  const units = ctx.ref.units.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name }));

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono">{row.fileRef}</span>
            <Badge tone={row.status === "Open" ? "accent" : "neutral"}>{row.status}</Badge>
            {a.isOut ? <Badge tone={a.overdue ? "danger" : "info"}>Out with {a.currentlyWith}</Badge> : null}
          </span>
        }
        description={`${row.title} · ${row.fileClass}`}
        actions={
          <Link href="/files" className="text-sm text-info hover:underline">
            Back to Files
          </Link>
        }
      />
      {sp.saved ? <Notice tone="accent" className="mb-4">Opened as {row.fileRef}.</Notice> : null}
      {a.flags.length ? (
        <Notice tone="warn" className="mb-6" title={`${a.flags.length} flag(s)`}>
          <ul className="list-disc pl-5">
            {a.flags.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Movements" description="Newest first." />
          <Table>
            <thead>
              <tr>
                <Th>Out</Th>
                <Th>To</Th>
                <Th>Released by</Th>
                <Th>Return by</Th>
                <Th>Returned</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {f.movements.length === 0 ? (
                <tr>
                  <Td colSpan={6} className="py-8 text-center text-muted">
                    Never issued.
                  </Td>
                </tr>
              ) : (
                f.movements.map((m) => (
                  <tr key={m.row.id}>
                    <Td className="tabular whitespace-nowrap text-xs text-muted">{lagosDateTime(m.row.outAt)}</Td>
                    <Td>
                      {m.row.issuedTo}
                      <div className="text-xs text-muted">
                        {m.unitName}
                        {m.row.purpose ? ` · ${m.row.purpose}` : ""}
                        {m.row.volume ? ` · vol. ${m.row.volume}` : ""}
                      </div>
                    </Td>
                    <Td className="text-xs">{m.row.releasedByName}</Td>
                    <Td className="tabular whitespace-nowrap">{dateShort(m.returnDue)}</Td>
                    <Td className="tabular whitespace-nowrap text-xs">
                      {m.row.returnedAt ? lagosDateTime(m.row.returnedAt) : "—"}
                      {m.row.receivedBackByName ? <div className="text-muted">{m.row.receivedBackByName}</div> : null}
                    </Td>
                    <Td>
                      <MovementBadge status={m.status} />
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="File" />
            <CardBody className="space-y-1.5 text-sm">
              <p><span className="text-muted">Owning unit:</span> {f.owningUnit ?? "—"}</p>
              <p><span className="text-muted">Opened:</span> {dateLong(row.openedOn)}</p>
              {row.closedOn ? <p><span className="text-muted">Closed:</span> {dateLong(row.closedOn)}</p> : null}
              <p><span className="text-muted">Volume:</span> {row.currentVolume}</p>
              <p><span className="text-muted">Security:</span> {row.security}</p>
              <p><span className="text-muted">Currently with:</span> {a.currentlyWith}{a.currentUnit ? ` (${a.currentUnit})` : ""}</p>
              {a.isOut ? <p><span className="text-muted">Due back:</span> {dateLong(a.returnDue!)} · out {a.workingDaysOut} working day(s)</p> : null}
              <p><span className="text-muted">Last correspondence:</span> {a.lastCorrespondence ? dateLong(a.lastCorrespondence) : "—"}</p>
              {row.remarks ? <p><span className="text-muted">Remarks:</span> {row.remarks}</p> : null}
            </CardBody>
          </Card>
          {canWrite && a.isOut ? (
            <Card>
              <CardHeader title="Return" description="Received back by is recorded as you." />
              <CardBody>
                <ReturnFileForm fileId={row.id} holder={a.currentlyWith} />
              </CardBody>
            </Card>
          ) : null}
          {canWrite ? (
            <Card>
              <CardHeader title={a.isOut ? "Issue again" : "Issue"} description={`Return due: ${ctx.settings.fileReturnDays} working days unless overridden. Released by is recorded as you.`} />
              <CardBody>
                <IssueFileForm fileId={row.id} units={units} volume={row.currentVolume} />
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader title={`Correspondence on this file (${correspondence.length})`} />
        <Table>
          <tbody>
            {correspondence.length === 0 ? (
              <tr>
                <Td className="py-6 text-center text-muted">None quotes this file yet.</Td>
              </tr>
            ) : (
              correspondence.map((c) => (
                <tr key={c.id}>
                  <Td className="whitespace-nowrap font-mono text-xs">
                    <Link href={`/${c.kind === "in" ? "inward" : "outward"}/${c.id}`} className="text-info hover:underline">
                      {c.no}
                    </Link>
                  </Td>
                  <Td className="tabular whitespace-nowrap">{dateShort(c.d)}</Td>
                  <Td>
                    <Badge tone={c.kind === "in" ? "info" : "accent"}>{c.kind === "in" ? "In" : "Out"}</Badge> {c.who}
                    <div className="text-xs text-muted">{c.subject}</div>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>

      {canWrite ? (
        <Card className="mt-6">
          <CardHeader title="Update file" description="The reference cannot change." />
          <CardBody>
            <UpdateFileForm
              id={row.id}
              units={units}
              security={ctx.ref.security}
              statuses={ctx.ref.fileStatus}
              v={{ title: row.title, owningUnitId: row.owningUnitId ?? "", currentVolume: String(row.currentVolume), security: row.security, status: row.status, remarks: row.remarks ?? "" }}
            />
          </CardBody>
        </Card>
      ) : null}
      <div className="mt-6">
        <EntityHistory entityType="file" entityId={row.id} reference={row.fileRef} />
      </div>
    </>
  );
}
