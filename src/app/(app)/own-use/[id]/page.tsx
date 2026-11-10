import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { DocBadge, PaymentBadge } from "@/components/badges";
import { DeleteEntryCard } from "@/components/delete-entry-card";
import { PaymentsTable } from "@/components/payments-table";
import { RecordPaymentForm } from "@/components/record-payment-form";
import { Badge, Card, CardBody, CardHeader, FormErrors, Notice, PageHeader, Select, Table, Td, Th, Textarea } from "@/components/ui";
import { dateLong, naira } from "@/lib/format";
import { can } from "@/server/auth/actor";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { ServiceError } from "@/server/errors";
import { loadOwnUse, type LoadedOwnUse } from "@/server/services/ownuse";
import { listValues } from "@/server/services/reference";
import { lagosDateTime, lagosMinuteOfDay } from "@/domain/dates";

const hhmm = (d: Date) => {
  const m = lagosMinuteOfDay(d);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
import { lagosToday } from "@/server/time";
import { getSettings } from "@/server/services/settings";
import { deleteOwnUseAction } from "../../admin/data/actions";
import { ownUseDocumentAction, ownUseFlagAction, registerOwnUseAction, saveDraftOwnUseAction } from "../actions";
import { OwnUseForm } from "../own-use-form";

export const metadata: Metadata = { title: "Own-use notification" };

export default async function OwnUseDetailPage({ params, searchParams }: PageProps<"/own-use/[id]">) {
  const actor = await requirePermission("registers:read");
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let l: LoadedOwnUse;
  try {
    l = await loadOwnUse(db, id);
  } catch (e) {
    if (e instanceof ServiceError && e.kind === "not_found") notFound();
    throw e;
  }
  const { row, a } = l;
  if (!row.ounNo) {
    // A row started before Phase 9 by the old Registry intake: complete it here to issue the OUN.
    const [lgas, fuels, settings] = await Promise.all([listValues(db, "lga"), listValues(db, "fuel"), getSettings(db)]);
    const str = (v: string | null) => v ?? "";
    return (
      <>
        <PageHeader
          title={row.name}
          description={<span>ACK {row.ackNo} · Own-Use row not yet saved</span>}
          actions={
            <Link href="/own-use" className="text-sm text-info hover:underline">
              Back to Own-use
            </Link>
          }
        />
        {can(actor, "ownuse:save") ? (
          <OwnUseForm
            lgas={lgas}
            fuels={fuels}
            channels={[row.submissionChannel]}
            today={lagosToday()}
            thresholdKw={settings.ownUseThresholdKw}
            action={saveDraftOwnUseAction}
            values={{ id: row.id, name: row.name, dateFiled: row.dateFiled, timeReceived: hhmm(row.receivedAt), channel: row.submissionChannel, deemed: row.deemedReceiptDate, cacNo: str(row.cacNo), siteAddress: str(row.siteAddress), lga: str(row.lga), contactPerson: str(row.contactPerson), phone: str(row.phone), email: str(row.email), remarks: str(row.remarks) }}
          />
        ) : (
          <Notice tone="info">A Registration officer completes this notification and saves it to issue the OUN number.</Notice>
        )}
      </>
    );
  }
  const [channels, purposes] = await Promise.all([listValues(db, "payment_channel"), listValues(db, "payment_purpose")]);
  const canDocs = can(actor, "documents:update") && !row.registrationNo;

  return (
    <>
      <PageHeader
        title={row.name}
        description={
          <span className="flex flex-wrap gap-x-3">
            <span className="font-mono text-text">{row.ounNo}</span>
            <span>ACK {row.ackNo}</span>
            {row.registrationNo ? <Badge tone="accent">{row.registrationNo}</Badge> : null}
          </span>
        }
        actions={
          <Link href="/own-use" className="text-sm text-info hover:underline">
            Back to own-use
          </Link>
        }
      />
      {sp.saved ? <Notice tone="accent" className="mb-4">Saved as {row.ounNo} (acknowledgement {row.ackNo}). Fee due: {naira(a.feeDue)}.</Notice> : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Notification" />
          <CardBody className="space-y-1.5 text-sm">
            <p><span className="text-muted">Received:</span> {lagosDateTime(row.receivedAt)} · {row.submissionChannel}</p>
            <p><span className="text-muted">Deemed received (para 10(3)):</span> {dateLong(row.deemedReceiptDate)}{a.filedAfterDeadline ? " (after the registration deadline)" : ""}</p>
            <p><span className="text-muted">LGA:</span> {row.lga}</p>
            <p><span className="text-muted">Site:</span> {row.siteAddress ?? "—"}</p>
            <p><span className="text-muted">CAC:</span> {row.cacNo ?? "—"}</p>
            <p><span className="text-muted">Contact:</span> {[row.contactPerson, row.phone, row.email].filter(Boolean).join(" · ") || "—"}</p>
            <p><span className="text-muted">Saved by:</span> {row.createdByName}</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Capacity and fee" />
          <CardBody className="space-y-1.5 text-sm">
            <p><span className="text-muted">Installed:</span> {a.installedKw} kW from {l.units.length} unit(s)</p>
            <p><span className="text-muted">Eligibility:</span> {a.eligibility}</p>
            <p><span className="text-muted">Fee due:</span> {naira(a.feeDue)} <PaymentBadge status={a.paymentStatus} /></p>
            <p><span className="text-muted">Confirmed:</span> {naira(a.payments.amountPaid)} · with Finance {naira(a.payments.withFinance)}</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Register with a certificate" />
          <CardBody className="flex flex-col gap-3">
            {row.registrationNo ? (
              <Notice tone="accent">Registered as {row.registrationNo} on {dateLong(row.certificateIssueDate)}.</Notice>
            ) : a.registrationBlockers.length ? (
              <FormErrors reasons={a.registrationBlockers} />
            ) : (
              <Notice tone="accent">Nothing blocks registration.</Notice>
            )}
            {!row.registrationNo && can(actor, "evaluation:decide") ? <ActionForm action={registerOwnUseAction} submitLabel="Register" size="sm" hidden={{ id }} /> : null}
          </CardBody>
        </Card>
      </div>

      {a.flags.length ? (
        <Card className="mt-6">
          <CardHeader title={`${a.flags.length} data flag(s)`} />
          <CardBody>
            <ul className="mb-3 list-disc pl-5 text-sm">
              {a.flags.map((f) => (
                <li key={f.code}>{f.text}</li>
              ))}
            </ul>
            {can(actor, "evaluation:decide") && !row.registrationNo ? (
              <ActionForm action={ownUseFlagAction} submitLabel="Save reason" size="sm" variant="secondary" hidden={{ id }}>
                <Textarea name="reason" defaultValue={row.flagOverrideReason ?? ""} placeholder="Written reason the flags do not stop registration" aria-label="Flag override reason" />
              </ActionForm>
            ) : row.flagOverrideReason ? (
              <p className="text-sm">Explained: {row.flagOverrideReason}</p>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      <Card className="mt-6">
        <CardHeader title="Generator units" />
        <Table>
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Make / model</Th>
              <Th className="text-right">kW</Th>
              <Th>Fuel</Th>
              <Th className="text-right">Avg MWh</Th>
            </tr>
          </thead>
          <tbody>
            {l.units.map((u) => (
              <tr key={u.position}>
                <Td className="text-faint">{u.position}</Td>
                <Td>{u.makeModel ?? "—"}</Td>
                <Td className="tabular text-right">{u.kw}</Td>
                <Td>{u.fuel ?? "—"}</Td>
                <Td className="tabular text-right">{u.avgMwh ?? "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Documents · REG-01I" description={a.documents.complete ? "Complete" : `${a.documents.outstanding} outstanding · ${a.documents.pending} pending`} />
        <Table>
          <tbody>
            {a.documents.items.map((i) => (
              <tr key={i.key}>
                <Td>
                  {i.document}
                  {i.note ? <div className="text-xs text-faint">{i.note}</div> : null}
                </Td>
                <Td>
                  <DocBadge value={i.value} />
                </Td>
                <Td className="w-64">
                  {canDocs && !i.automatic ? (
                    <ActionForm action={ownUseDocumentAction} submitLabel="Save" size="sm" variant="secondary" inline hidden={{ id, key: i.key }}>
                      <Select name="value" defaultValue={i.entered} className="h-8 w-36" aria-label={`Status of ${i.document}`}>
                        <option value="">Pending</option>
                        <option value="Y">Y: received</option>
                        <option value="N">N: outstanding</option>
                        <option value="N/A">N/A</option>
                      </Select>
                    </ActionForm>
                  ) : null}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Payments" description={`Against ${row.ounNo}`} />
        <PaymentsTable rows={l.payments} actor={actor} showReference={false} />
        {can(actor, "payment:record") ? (
          <CardBody className="border-t border-border">
            <RecordPaymentForm reference={row.ounNo ?? undefined} today={lagosToday()} channels={channels} purposes={purposes} />
          </CardBody>
        ) : null}
      </Card>
      {can(actor, "data:clear") ? (
        <DeleteEntryCard action={deleteOwnUseAction} id={row.id} ack={row.ackNo} what="own-use notification" withIt="its generator units, payments and documents checklist" />
      ) : null}
    </>
  );
}
