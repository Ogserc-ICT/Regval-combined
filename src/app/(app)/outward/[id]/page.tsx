import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { EntityHistory } from "@/components/entity-history";
import { OutwardStatusBadge } from "@/components/registry-badges";
import { Badge, Card, CardBody, CardHeader, Notice, PageHeader } from "@/components/ui";
import { dateLong } from "@/lib/format";
import { can } from "@/server/auth/actor";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { ServiceError } from "@/server/errors";
import { loadOutward, registryCtx, type OutwardView } from "@/server/services/registry/load";
import { lagosToday } from "@/server/time";
import { DeliverForm, DispatchForm, UpdateOutwardForm } from "../outward-forms";

export const metadata: Metadata = { title: "Outward item" };

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-3 py-1 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 wrap-break-word">{children ?? "—"}</dd>
    </div>
  );
}

const s = (v: string | null | undefined) => v ?? "";

export default async function OutwardItemPage({ params, searchParams }: PageProps<"/outward/[id]">) {
  const actor = await requirePermission("registers:read");
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await registryCtx(db);
  let v: OutwardView;
  try {
    v = await loadOutward(db, id, ctx);
  } catch (e) {
    if (e instanceof ServiceError && e.kind === "not_found") notFound();
    throw e;
  }
  const { row, a } = v;
  const canWrite = can(actor, "outward:write");
  const today = lagosToday();

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono">{row.outNo}</span>
            <OutwardStatusBadge status={a.status} />
            {row.isExample ? <Badge>EXAMPLE</Badge> : null}
          </span>
        }
        description={`${row.documentType} to ${row.addressee} · ${row.subject}`}
        actions={
          <Link href="/outward" className="text-sm text-info hover:underline">
            Back to the Outward Register
          </Link>
        }
      />
      {sp.saved ? (
        <Notice tone="accent" className="mb-4" title={`Numbered ${row.outNo}`}>
          Quote this number on the letter.{v.inReplyToAck ? ` When it is dispatched, ${v.inReplyToAck} closes.` : ""}
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
          <CardHeader title="Document" />
          <CardBody>
            <dl className="divide-y divide-border/50">
              <Row label="Date of document">{dateLong(row.documentDate)}</Row>
              <Row label="Type">{row.documentType}</Row>
              <Row label="Subject">{row.subject}</Row>
              <Row label="Addressee">
                {row.addressee} <span className="text-muted">· {row.recipientCategory}</span>
              </Row>
              <Row label="Address / email">{row.recipientContact}</Row>
              <Row label="In reply to">
                {v.inReplyToAck ? (
                  <>
                    <Link href={`/inward/${row.inReplyToInwardId}`} className="font-mono text-info hover:underline">
                      {v.inReplyToAck}
                    </Link>{" "}
                    <span className="text-muted">from {v.inReplyToSender}</span>
                  </>
                ) : null}
              </Row>
              <Row label="Related OGSERC no.">{row.relatedOgsercNo}</Row>
              <Row label="File">{v.fileRef ? <Link href={`/files/${row.fileId}`} className="font-mono text-info hover:underline">{v.fileRef}</Link> : null}</Row>
              <Row label="Originating unit">{v.unitName}</Row>
              <Row label="Prepared by">{row.preparedBy}</Row>
              <Row label="Signed by">
                {row.signatoryName}
                {row.signatoryDesignation ? <span className="text-muted">, {row.signatoryDesignation}</span> : null}
              </Row>
              <Row label="Remarks">{row.remarks}</Row>
            </dl>
          </CardBody>
        </Card>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Dispatch and response" />
            <CardBody>
              <dl className="divide-y divide-border/50">
                <Row label="Mode">{row.dispatchMode}</Row>
                <Row label="Dispatched">{row.dispatchedOn ? `${dateLong(row.dispatchedOn)}${v.dispatchedByName ? ` by ${v.dispatchedByName}` : ""}` : `Not yet (${a.workingDaysToDispatch} working day(s))`}</Row>
                <Row label="Tracking ref">{row.trackingRef}</Row>
                <Row label="Delivered">{row.deliveryConfirmed ? `${row.deliveredOn ? dateLong(row.deliveredOn) : "Yes"}${row.receivedByRecipient ? ` · ${row.receivedByRecipient}` : ""}` : "Not confirmed"}</Row>
                <Row label="Response expected">{a.responseExpected ? "Yes" : "No"}{row.responseExpected === null ? " (type default)" : ""}</Row>
                <Row label="Response due">{a.responseDue ? dateLong(a.responseDue) : null}</Row>
                <Row label="Response">
                  {v.response ? (
                    <>
                      <Link href={`/inward/${v.response.id}`} className="font-mono text-info hover:underline">
                        {v.response.ackNo}
                      </Link>{" "}
                      · {dateLong(v.response.deemed)}
                    </>
                  ) : null}
                </Row>
              </dl>
            </CardBody>
          </Card>
          {canWrite && !row.dispatchedOn ? (
            <Card>
              <CardHeader title="Dispatched" description="Dispatched by is recorded as you." />
              <CardBody>
                <DispatchForm id={row.id} today={today} trackingRef={s(row.trackingRef)} />
              </CardBody>
            </Card>
          ) : null}
          {canWrite && row.dispatchedOn && !row.deliveryConfirmed ? (
            <Card>
              <CardHeader title="Delivered" />
              <CardBody>
                <DeliverForm id={row.id} today={today} />
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
      {canWrite ? (
        <Card className="mt-6">
          <CardHeader title="Update item" description="The number, date, addressee and signatory cannot change. Every change is written to the history." />
          <CardBody>
            <UpdateOutwardForm
              id={row.id}
              v={{
                recipientContact: s(row.recipientContact),
                fileRef: s(v.fileRef),
                trackingRef: s(row.trackingRef),
                responseExpected: row.responseExpected === true ? "Y" : row.responseExpected === false ? "N" : "",
                responseDueOverride: s(row.responseDueOverride),
                remarks: s(row.remarks),
              }}
            />
          </CardBody>
        </Card>
      ) : null}
      <div className="mt-6">
        <EntityHistory entityType="outward_item" entityId={row.id} reference={row.outNo} />
      </div>
    </>
  );
}
