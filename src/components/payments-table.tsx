import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { FinanceBadge } from "@/components/badges";
import { Input, Table, Td, Th } from "@/components/ui";
import { dateShort, naira } from "@/lib/format";
import { lagosDateTime } from "@/domain/dates";
import { can, type Actor } from "@/server/auth/actor";
import type { payments } from "@/server/db/schema";
import { confirmPaymentAction, rejectPaymentAction, reversePaymentAction } from "@/app/(app)/register/actions";

type Payment = typeof payments.$inferSelect;

export function PaymentsTable({
  rows,
  actor,
  ownerHref,
  revalidateId = "",
  showReference = true,
}: {
  rows: Payment[];
  actor: Actor;
  ownerHref?: (p: Payment) => string;
  revalidateId?: string;
  showReference?: boolean;
}) {
  const canDecide = can(actor, "payment:decide");
  const canReverse = can(actor, "payment:reverse");
  return (
    <Table>
      <thead>
        <tr>
          <Th>Payment</Th>
          {showReference ? <Th>Reference</Th> : null}
          <Th className="text-right">Amount</Th>
          <Th>Channel / RRR</Th>
          <Th>Recorded</Th>
          <Th>Finance</Th>
          <Th className="w-80">Actions</Th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <Td colSpan={7} className="py-8 text-center text-muted">
              No payments.
            </Td>
          </tr>
        ) : (
          rows.map((p) => {
            const mine = p.recordedBy === actor.id;
            const pending = p.financeStatus === "Pending" && !p.reversed;
            return (
              <tr key={p.id} className="align-top">
                <Td className="whitespace-nowrap font-mono text-xs">
                  {p.payNo}
                  <div className="font-sans text-faint">{dateShort(p.dateReceived)}</div>
                </Td>
                {showReference ? (
                  <Td className="whitespace-nowrap font-mono text-xs">
                    {ownerHref ? (
                      <Link href={ownerHref(p)} className="text-info hover:underline">
                        {p.reference}
                      </Link>
                    ) : (
                      p.reference
                    )}
                  </Td>
                ) : null}
                <Td className="tabular whitespace-nowrap text-right font-medium">{naira(p.amount)}</Td>
                <Td className="text-xs">
                  <div>{p.channel ?? "—"}</div>
                  <div className="text-faint">{p.rrr ?? ""}</div>
                </Td>
                <Td className="text-xs">
                  <div>{p.recordedByName}</div>
                  <div className="text-faint">{lagosDateTime(p.recordedAt)}</div>
                </Td>
                <Td className="text-xs">
                  <FinanceBadge status={p.financeStatus} reversed={p.reversed} />
                  {p.decidedByName ? <div className="mt-1 text-faint">{p.decidedByName}</div> : null}
                  {p.financeRemarks ? <div className="mt-1 text-faint">{p.financeRemarks}</div> : null}
                  {p.reversalReason ? <div className="mt-1 text-faint">Reversed: {p.reversalReason}</div> : null}
                </Td>
                <Td>
                  <div className="flex flex-col gap-2">
                    {pending && canDecide && !mine ? (
                      <>
                        <details>
                          <summary className="cursor-pointer text-sm text-accent">Confirm…</summary>
                          <ActionForm action={confirmPaymentAction} submitLabel="Confirm payment" size="sm" hidden={{ id: revalidateId, paymentId: p.id }} className="mt-2">
                            <label className="flex items-start gap-2 text-xs">
                              <input type="checkbox" name="verified" className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
                              I have verified it against the bank / Remita.
                            </label>
                            <Input name="remarks" placeholder="Remarks (optional)" className="h-8" />
                          </ActionForm>
                        </details>
                        <details>
                          <summary className="cursor-pointer text-sm text-danger">Reject…</summary>
                          <ActionForm action={rejectPaymentAction} submitLabel="Reject payment" size="sm" variant="danger" hidden={{ id: revalidateId, paymentId: p.id }} className="mt-2">
                            <Input name="reason" placeholder="Reason (required)" className="h-8" required />
                          </ActionForm>
                        </details>
                      </>
                    ) : null}
                    {pending && canDecide && mine ? <span className="text-xs text-faint">You recorded this: another Finance officer must decide.</span> : null}
                    {!p.reversed && p.financeStatus !== "Rejected" && canReverse ? (
                      <details>
                        <summary className="cursor-pointer text-xs text-muted">Reverse…</summary>
                        <ActionForm action={reversePaymentAction} submitLabel="Reverse payment" size="sm" variant="secondary" hidden={{ id: revalidateId, paymentId: p.id }} className="mt-2">
                          <Input name="reason" placeholder="Reason (required)" className="h-8" required />
                        </ActionForm>
                      </details>
                    ) : null}
                  </div>
                </Td>
              </tr>
            );
          })
        )}
      </tbody>
    </Table>
  );
}
