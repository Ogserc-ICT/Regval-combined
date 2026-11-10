import { Badge, Card, CardBody, CardHeader, Notice } from "@/components/ui";
import { lagosDateTime } from "@/domain/dates";
import { dateLong, naira } from "@/lib/format";
import type { LoadedSubmission } from "@/server/services/submissions/load";

function Row({ label, children, strong }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className={strong ? "tabular min-w-0 text-right font-semibold wrap-break-word" : "tabular min-w-0 text-right wrap-break-word"}>{children}</dd>
    </div>
  );
}

export function SummaryTab({ l }: { l: LoadedSubmission }) {
  const { row, a } = l;
  const act = (code: string | null) => l.ref.activities.find((x) => x.code === code)?.name ?? code ?? "—";
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card>
        <CardHeader title="Category" description={a.categoryDescription ?? undefined} />
        <CardBody>
          <dl className="divide-y divide-border/60">
            <Row label="Category charged" strong>{a.categoryApplied ?? "—"}</Row>
            <Row label="Calculated now">{a.categoryAuto ?? "—"}</Row>
            <Row label="Override">{row.categoryOverride ?? "—"}</Row>
            <Row label="Form filed">{row.formFiled ? `${row.formFiled} (${a.formCategory})` : "—"}</Row>
            <Row label="Confirmed category">{row.confirmedCategory ?? "Not confirmed"}</Row>
            <Row label="Primary activity">{act(row.primaryActivity)}</Row>
            <Row label="Other activities">{l.otherActivities.length ? l.otherActivities.map(act).join(", ") : "—"}</Row>
            <Row label="Installed capacity">{row.installedCapacityMw === null ? "—" : `${row.installedCapacityMw} MW`}</Row>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Fees and payments" description="Only Finance-confirmed payments count." />
        <CardBody>
          <dl className="divide-y divide-border/60">
            <Row label="Registration fee">{naira(a.registrationFee)}</Row>
            <Row label={`Late charge (${a.daysLate} day${a.daysLate === 1 ? "" : "s"} late)`}>{naira(a.lateCharge)}</Row>
            <Row label="Approved waiver">{naira(row.approvedWaiver)}</Row>
            <Row label="Total due" strong>{naira(a.totalDue)}</Row>
            <Row label="Paid (confirmed)">{naira(a.payments.amountPaid)}</Row>
            <Row label="With Finance">{naira(a.payments.withFinance)}</Row>
            <Row label="Balance" strong>{naira(a.balance)}</Row>
          </dl>
          <div className="mt-3">
            {a.gateCleared ? (
              <Badge tone="accent">Finance gate cleared</Badge>
            ) : (
              <p className="text-xs text-warn">{a.gateReason}</p>
            )}
          </div>
          <p className="mt-2 text-xs text-faint">
            {l.facts.priced
              ? `Pricing frozen at save: Category ${l.facts.priced.category}, Effective Date ${dateLong(l.facts.priced.effectiveDate)}.`
              : "Not priced yet."}
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Dates and clocks" description="Calendar days, Africa/Lagos" />
        <CardBody>
          <dl className="divide-y divide-border/60">
            <Row label="Received">
              {lagosDateTime(row.receivedAt)} · {row.submissionChannel}
            </Row>
            <Row label="Deemed received (para 10(3))">{dateLong(row.deemedReceiptDate)}</Row>
            <Row label="Registration deadline">{dateLong(a.deadline)}</Row>
            <Row label="Released for evaluation">{dateLong(row.releasedOn)}</Row>
            <Row label="Submission complete">{dateLong(row.dateSubmissionComplete)}</Row>
            <Row label="Determination due">{dateLong(a.determinationDue)}</Row>
            <Row label="Deficiency response due">{dateLong(a.deficiencyResponseDue)}</Row>
            {a.licenceApplicationDue ? <Row label="Licence application due">{dateLong(a.licenceApplicationDue)}</Row> : null}
            <Row label="SLA">{a.sla || "—"}{a.daysInQueue !== null ? ` · ${a.daysInQueue} day(s) in queue` : ""}</Row>
          </dl>
        </CardBody>
      </Card>

      <div className="lg:col-span-3">
        {a.flags.length ? (
          <Notice tone="warn" title={`${a.flags.length} data flag(s)`}>
            <ul className="list-disc space-y-0.5 pl-5">
              {a.flags.map((f) => (
                <li key={f.code}>
                  {f.text} <span className="text-xs text-faint">({f.code})</span>
                </li>
              ))}
            </ul>
            {l.evaluation?.flagOverrideReason ? <p className="mt-2 text-sm">Explained: {l.evaluation.flagOverrideReason}</p> : null}
          </Notice>
        ) : (
          <Notice tone="accent">No data flags.</Notice>
        )}
      </div>
    </div>
  );
}
