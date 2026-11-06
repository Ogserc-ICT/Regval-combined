import { Badge, Card, CardBody, CardHeader } from "@/components/ui";
import { lagosDateTime } from "@/domain/dates";
import type { emailMessages } from "@/server/db/schema";
import { DiscardEmailForm, ResendAckForm, SendEmailForm } from "./item-forms";

type Msg = typeof emailMessages.$inferSelect;

const TONE: Record<string, "neutral" | "accent" | "info" | "warn" | "danger"> = {
  preview: "warn",
  queued: "info",
  sent: "accent",
  failed: "danger",
  discarded: "neutral",
};

/** Email log for an inward item (SPEC §25): previews to review, sent, failed, resend. */
export function EmailsCard({ id, emails, canSend, ackEmailedAt }: { id: string; emails: Msg[]; canSend: boolean; ackEmailedAt: Date | null }) {
  return (
    <Card className="mt-6">
      <CardHeader
        title="Emails"
        description={ackEmailedAt ? `Acknowledgement emailed ${lagosDateTime(ackEmailedAt)}.` : "Acknowledgement and routing emails to the unit and its division."}
      />
      <CardBody className="flex flex-col gap-4">
        {emails.length === 0 ? <p className="text-sm text-muted">No emails for this item.</p> : null}
        {emails.map((m) => (
          <div key={m.id} className="rounded-lg border border-border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={TONE[m.status] ?? "neutral"}>{m.status === "preview" ? "Ready for review" : m.status}</Badge>
              <span className="font-medium">{m.subject}</span>
            </div>
            <p className="mt-1 text-xs text-muted">
              To {m.to.join(", ")}
              {m.cc.length ? ` · Cc ${m.cc.join(", ")}` : ""}
              {m.attachSlip ? " · slip attached" : ""} · {m.sentAt ? `sent ${lagosDateTime(m.sentAt)}${m.sentByName ? ` by ${m.sentByName}` : ""}` : `created ${lagosDateTime(m.createdAt)}`}
            </p>
            {m.error ? <p className="mt-1 text-xs text-danger">{m.error}</p> : null}
            {m.status === "preview" ? <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-bg-subtle p-2 text-xs">{m.body}</pre> : null}
            {canSend && (m.status === "preview" || m.status === "failed") ? (
              <div className="mt-2 flex flex-wrap items-start gap-2">
                <SendEmailForm id={id} messageId={m.id} label={m.status === "failed" ? "Try again" : "Send now"} />
                <DiscardEmailForm id={id} messageId={m.id} />
              </div>
            ) : null}
          </div>
        ))}
        {canSend ? (
          <div className="self-start">
            <ResendAckForm id={id} />
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
