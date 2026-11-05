import { PaymentsTable } from "@/components/payments-table";
import { RecordPaymentForm } from "@/components/record-payment-form";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { naira } from "@/lib/format";
import { can, type Actor } from "@/server/auth/actor";
import { db } from "@/server/db/client";
import { listValues } from "@/server/services/reference";
import type { LoadedSubmission } from "@/server/services/submissions/load";
import { lagosToday } from "@/server/time";

export async function PaymentsTab({ l, actor }: { l: LoadedSubmission; actor: Actor }) {
  const [channels, purposes] = await Promise.all([listValues(db, "payment_channel"), listValues(db, "payment_purpose")]);
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title="Payments"
          description={`Total due ${naira(l.a.totalDue)} · confirmed ${naira(l.a.payments.amountPaid)} · with Finance ${naira(l.a.payments.withFinance)} · balance ${naira(l.a.balance)}`}
        />
        <PaymentsTable rows={l.payments} actor={actor} revalidateId={l.row.id} showReference={false} />
      </Card>
      {can(actor, "payment:record") ? (
        <Card>
          <CardHeader title="Record a payment" description={`Against ${l.row.ackNo}. It counts once Finance confirms it.`} />
          <CardBody>
            <RecordPaymentForm reference={l.row.ackNo} today={lagosToday()} channels={channels} purposes={purposes} revalidateId={l.row.id} />
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
