import { desc, eq } from "drizzle-orm";
import { FileDown, FileText } from "lucide-react";
import { Badge, buttonVariants, Card, CardBody, CardHeader } from "@/components/ui";
import { dateLong } from "@/lib/format";
import { db } from "@/server/db/client";
import { deficiencyNotices, signatories } from "@/server/db/schema";
import type { LoadedSubmission } from "@/server/services/submissions/load";

/** One printable document: open in a new tab, or download. */
function Doc({ title, note, href, badge }: { title: string; note: string; href: string; badge?: { text: string; tone: "warn" | "info" | "danger" } }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {title}
          {badge ? <Badge tone={badge.tone}>{badge.text}</Badge> : null}
        </p>
        <p className="text-xs text-muted">{note}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <a href={href} target="_blank" rel="noopener" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          <FileText className="h-4 w-4" aria-hidden /> Open
        </a>
        <a href={`${href}${href.includes("?") ? "&" : "?"}download=1`} className={buttonVariants({ variant: "ghost", size: "sm" })} aria-label={`Download ${title}`}>
          <FileDown className="h-4 w-4" aria-hidden /> Download
        </a>
      </div>
    </div>
  );
}

/** The four registration documents for this submission (Phase 10), generated from the current records. */
export async function PrintCard({ l }: { l: LoadedSubmission }) {
  const { row } = l;
  const base = (doc: string) => `/api/pdf/${doc}/${row.id}`;
  const notices = await db
    .select({ id: deficiencyNotices.id, defNo: deficiencyNotices.defNo, issuedOn: deficiencyNotices.issuedOn, sentOn: deficiencyNotices.sentOn })
    .from(deficiencyNotices)
    .where(eq(deficiencyNotices.submissionId, row.id))
    .orderBy(desc(deficiencyNotices.issuedAt));
  const hasCert = row.filingType === "NEW" && !!row.registrationNo && !!row.certificateIssueDate;
  const sigs = hasCert ? await db.select({ role: signatories.role, confirmed: signatories.confirmed, active: signatories.active }).from(signatories) : [];
  const sigReady = ["chairman_ceo", "commissioner"].every((r) => sigs.some((s) => s.role === r && s.active && s.confirmed));

  return (
    <Card className="mb-6">
      <CardHeader title="Documents" description="Generated as PDFs from the current records, on the Commission's templates. Each print is logged." />
      <CardBody className="grid gap-3 lg:grid-cols-2">
        <Doc title="Acknowledgement letter" note={`Para 10(3) · ${row.ackNo}`} href={base("acknowledgement")} />
        <Doc title="EVAL-01 evaluation form" note={`Internal · ${l.a.evaluationStatus}`} href={base("eval-01")} />
        {notices.map((n) => (
          <Doc
            key={n.id}
            title={`Deficiency notice ${n.defNo}`}
            note={n.sentOn ? `Sent ${dateLong(n.sentOn)}` : `Issued ${dateLong(n.issuedOn)}. Prints as a draft until the sent date is recorded on the Evaluation tab.`}
            href={`${base("deficiency")}?notice=${n.id}`}
            badge={n.sentOn ? undefined : { text: "Draft", tone: "warn" }}
          />
        ))}
        {hasCert ? (
          <Doc
            title="CERT-01 certificate"
            note={
              row.status !== "Registered"
                ? `${row.registrationNo} · prints marked ${row.status}`
                : sigReady
                  ? `${row.registrationNo} · serial ${String(row.certificateSerial ?? "").padStart(4, "0")}`
                  : "Prints as a draft until both signatories are confirmed under Admin › Signatories."
            }
            href={base("certificate")}
            badge={
              row.status !== "Registered"
                ? { text: row.status ?? "", tone: "danger" }
                : !sigReady
                  ? { text: "Draft", tone: "warn" }
                  : row.certificateNeedsReissue
                    ? { text: "Needs reissue", tone: "info" }
                    : undefined
            }
          />
        ) : null}
      </CardBody>
    </Card>
  );
}
