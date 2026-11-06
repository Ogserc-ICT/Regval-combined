import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { EntityHistory } from "@/components/entity-history";
import { EntryBadge, InwardStatusBadge } from "@/components/registry-badges";
import { Badge, buttonVariants, Card, CardBody, CardHeader, Notice, PageHeader } from "@/components/ui";
import { lagosDateTime } from "@/domain/dates";
import { dateLong, naira } from "@/lib/format";
import { can } from "@/server/auth/actor";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { ServiceError } from "@/server/errors";
import { loadInward, registryCtx, type InwardView } from "@/server/services/registry/load";
import { lagosToday } from "@/server/time";
import { Printer } from "lucide-react";
import { emailsFor } from "@/server/services/email";
import { EmailsCard } from "./emails-card";
import { CloseForm, ConfirmReceiptForm, ForwardForm, RouteForm, UpdateInwardForm } from "./item-forms";

export const metadata: Metadata = { title: "Inward item" };

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-3 py-1 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 wrap-break-word">{children ?? "—"}</dd>
    </div>
  );
}

const yn = (v: boolean | null) => (v === true ? "Y" : v === false ? "N" : "—");
const s = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v));

export default async function InwardItemPage({ params, searchParams }: PageProps<"/inward/[id]">) {
  const actor = await requirePermission("registers:read");
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await registryCtx(db);
  let v: InwardView;
  try {
    v = await loadInward(db, id, ctx);
  } catch (e) {
    if (e instanceof ServiceError && e.kind === "not_found") notFound();
    throw e;
  }
  const { row, a } = v;
  const type = ctx.ref.type(row.correspondenceTypeId);
  const warn = typeof sp.warn === "string" ? sp.warn.split("\n").filter(Boolean) : [];
  const closed = a.status === "Closed";
  const isMyUnit = actor.roles.includes("unit_officer") && !!actor.unitId && actor.unitId === v.unit?.id;
  const canClose = !closed && (can(actor, "inward:write") || isMyUnit);
  const canPrint = can(actor, "reports:print");
  const emails = await emailsFor(db, "inward_item", row.id);

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono">{row.ackNo}</span>
            <InwardStatusBadge status={a.status} />
            <EntryBadge entry={v.entry} />
            {row.isExample ? <Badge>EXAMPLE</Badge> : null}
          </span>
        }
        description={`${row.sender} · ${row.subject}`}
        actions={
          <>
            {canPrint ? (
              <a href={`/api/pdf/slip/${row.id}`} target="_blank" rel="noopener" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                <Printer className="h-4 w-4" /> Slip (PDF)
              </a>
            ) : null}
            <Link href="/inward" className="self-center text-sm text-info hover:underline">
              Back to the Inward Register
            </Link>
          </>
        }
      />
      {sp.saved ? (
        <Notice tone="accent" className="mb-4" title={`Acknowledged as ${row.ackNo}`}>
          Deemed received {dateLong(row.deemedReceiptDate)}.{" "}
          {canPrint ? (
            <a href={`/api/pdf/slip/${row.id}`} target="_blank" rel="noopener" className="text-info hover:underline">
              Print the acknowledgement slip
            </a>
          ) : null}
        </Notice>
      ) : null}
      {warn.length ? (
        <Notice tone="warn" className="mb-4">
          <ul className="list-disc pl-5">
            {warn.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
      {v.entryHref && v.entry !== "Saved on Register" && v.entry !== "Saved on Own-Use" ? (
        <Notice tone="warn" className="mb-4" title={v.entry}>
          <Link href={v.entryHref} className="text-info hover:underline">
            Complete the entry
          </Link>
        </Notice>
      ) : null}
      {v.entry === "Awaiting Register entry" && can(actor, "inward:write") ? (
        <Notice tone="warn" className="mb-4" title="Awaiting Register entry">
          <Link href={`/registry-intake?ack=${row.id}`} className="text-info hover:underline">
            Start it on Registry Intake
          </Link>{" "}
          (keeps this ACK).
        </Notice>
      ) : null}
      {a.flags.length ? (
        <Notice tone="warn" className="mb-6" title={`${a.flags.length} flag(s)`}>
          <ul className="list-disc pl-5">
            {a.flags.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Item" />
          <CardBody>
            <dl className="divide-y divide-border/50">
              <Row label="Received">{lagosDateTime(row.receivedAt)} · {row.mode}</Row>
              <Row label="Deemed receipt">{dateLong(row.deemedReceiptDate)}</Row>
              <Row label="Type">
                {v.typeName}
                {type?.orderRef ? <span className="text-muted"> · Order {type.orderRef}</span> : null}
                {type?.category ? <span className="text-muted"> · {type.category}</span> : null}
              </Row>
              <Row label="Sender">
                {row.sender}
                {row.senderCategory ? <span className="text-muted"> · {row.senderCategory}</span> : null}
              </Row>
              <Row label="Sender's ref">{row.senderRef}</Row>
              <Row label="Date on document">{row.documentDate ? dateLong(row.documentDate) : null}</Row>
              <Row label="Related OGSERC no.">{row.relatedOgsercNo}</Row>
              <Row label="In response to">{v.inResponseToOutNo ? <Link href={`/outward/${row.inResponseToOutwardId}`} className="font-mono text-info hover:underline">{v.inResponseToOutNo}</Link> : null}</Row>
              <Row label="CAC / reg no.">{row.cacNo}</Row>
              <Row label="LGA">{row.lga}</Row>
              <Row label="Contact">{[row.contactPerson, row.phone, row.email].filter(Boolean).join(" · ") || null}</Row>
              <Row label="Delivered by">{[row.deliveredBy, row.volumes !== null ? `${row.volumes} item(s)` : null].filter(Boolean).join(" · ") || null}</Row>
              <Row label="Schedule 2 / fee">
                {row.schedule2Count ?? "—"} document(s) · fee evidence {yn(row.feeEvidence)}
                {row.paymentReference ? ` · ref ${row.paymentReference}` : ""}
                {row.amountShownKobo !== null ? ` · ${naira(row.amountShownKobo)}` : ""}
              </Row>
              <Row label="Received by">{v.receivedByName}</Row>
              <Row label="Acknowledgement via">{row.ackIssuedVia}</Row>
              <Row label="From front desk">{v.fdNo}</Row>
              <Row label="Source">{row.source.replace(/_/g, " ")}</Row>
              <Row label="Remarks">{row.remarks}</Row>
            </dl>
          </CardBody>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Handling" />
            <CardBody>
              <dl className="divide-y divide-border/50">
                <Row label="Unit">
                  {v.unit?.name ?? "No unit"}
                  {row.unitOverrideId ? <Badge className="ml-1">routed</Badge> : null}
                </Row>
                <Row label="Division">{v.unit?.divisionName}</Row>
                <Row label="Action">{row.actionRequired}</Row>
                <Row label="Priority">{row.priority}</Row>
                <Row label="Action officer">{row.actionOfficer}</Row>
                <Row label="File">{v.fileRef ? <Link href={`/files/${row.fileId}`} className="font-mono text-info hover:underline">{v.fileRef}</Link> : null}</Row>
                <Row label="Routed">{row.routedAt ? lagosDateTime(row.routedAt) : null}</Row>
                <Row label="Forwarded">{row.forwardedOn ? `${dateLong(row.forwardedOn)} (${a.workingDaysAtRegistry} working day(s) at Registry)` : `Not yet (${a.workingDaysAtRegistry} working day(s))`}</Row>
                <Row label="Unit received">{row.unitOfficerReceivedBy ? `${row.unitOfficerReceivedBy}${row.unitReceivedAt ? ` · ${lagosDateTime(row.unitReceivedAt)}` : ""}` : null}</Row>
                <Row label="Response due">{a.responseDue ? dateLong(a.responseDue) : "None"}</Row>
                <Row label="Reply">
                  {v.reply ? (
                    <Link href={`/outward/${v.reply.id}`} className="font-mono text-info hover:underline">
                      {v.reply.outNo}
                    </Link>
                  ) : null}
                  {v.reply ? (v.reply.dispatchedOn ? ` · dispatched ${dateLong(v.reply.dispatchedOn)}` : " · not dispatched") : null}
                </Row>
                <Row label="Closed">{a.closedOn ? dateLong(a.closedOn) : null}</Row>
                <Row label="Working days open">{a.workingDaysOpen}</Row>
                {a.filedAfterDeadline !== null ? <Row label="After deadline?">{a.filedAfterDeadline ? "Yes" : "No"}</Row> : null}
              </dl>
            </CardBody>
          </Card>

          {!closed && can(actor, "inward:route") ? (
            <Card>
              <CardHeader title={row.routedAt ? "Re-route" : "Route"} description="Router only. Re-routing is allowed and logged." />
              <CardBody>
                <RouteForm
                  id={row.id}
                  units={ctx.ref.units.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name }))}
                  actions={ctx.ref.actions}
                  priorities={ctx.ref.priorities}
                  current={{
                    unitId: s(row.unitOverrideId),
                    defaultUnit: ctx.ref.unit(type?.defaultUnitId)?.name ?? null,
                    fileRef: s(v.fileRef),
                    actionRequired: s(row.actionRequired),
                    priority: s(row.priority),
                    actionOfficer: s(row.actionOfficer),
                    responseDueOverride: s(row.responseDueOverride),
                  }}
                />
              </CardBody>
            </Card>
          ) : null}

          {!closed && !row.forwardedOn && can(actor, "inward:forward") ? (
            <Card>
              <CardHeader title="Forward" description="Record when the item went to the unit." />
              <CardBody>
                <ForwardForm id={row.id} today={lagosToday()} officer={s(row.actionOfficer)} />
              </CardBody>
            </Card>
          ) : null}

          {!closed && isMyUnit && !row.unitReceivedAt ? (
            <Card>
              <CardHeader title="Your unit" />
              <CardBody>
                <ConfirmReceiptForm id={row.id} />
              </CardBody>
            </Card>
          ) : null}

          {canClose ? (
            <Card>
              <CardHeader title="Close" description="Logging an outward reply quoting this ACK closes it automatically when dispatched." />
              <CardBody className="flex flex-col gap-3">
                {can(actor, "outward:write") && !v.reply ? (
                  <Link href={`/outward/new?reply=${row.id}`} className={buttonVariants({ size: "sm" })}>
                    Log the reply (outward)
                  </Link>
                ) : null}
                <CloseForm id={row.id} />
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>

      {can(actor, "inward:write") ? (
        <Card className="mt-6">
          <CardHeader title="Update item" description="Handling details. Every change is written to the history (old → new). The receipt time, type and ACK cannot change." />
          <CardBody>
            <UpdateInwardForm
              id={row.id}
              lists={{ senderCategories: ctx.ref.senderCategories, ackVia: ctx.ref.ackVia, lgas: ctx.ref.lgas }}
              v={{
                sender: row.sender,
                senderCategory: s(row.senderCategory),
                senderRef: s(row.senderRef),
                documentDate: s(row.documentDate),
                subject: row.subject,
                relatedOgsercNo: s(row.relatedOgsercNo),
                cacNo: s(row.cacNo),
                lga: s(row.lga),
                contactPerson: s(row.contactPerson),
                phone: s(row.phone),
                email: s(row.email),
                deliveredBy: s(row.deliveredBy),
                volumes: s(row.volumes),
                ackIssuedVia: s(row.ackIssuedVia),
                forwardedOn: s(row.forwardedOn),
                unitOfficerReceivedBy: s(row.unitOfficerReceivedBy),
                closedManualOn: s(row.closedManualOn),
                remarks: s(row.remarks),
              }}
            />
          </CardBody>
        </Card>
      ) : null}

      <EmailsCard id={row.id} emails={emails} canSend={can(actor, "inward:write")} ackEmailedAt={row.ackEmailedAt} />

      <div className="mt-6">
        <EntityHistory entityType="inward_item" entityId={row.id} reference={row.ackNo} description="Every action and change on this item, newest first (including its Register entry under the same ACK)." />
      </div>
    </>
  );
}
