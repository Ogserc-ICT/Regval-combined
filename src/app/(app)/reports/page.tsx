import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody, CardHeader, Notice, PageHeader } from "@/components/ui";
import { can } from "@/server/auth/actor";
import { requirePermission } from "@/server/auth/session";

export const metadata: Metadata = { title: "Reports" };

const DOCUMENTS = [
  ["Acknowledgement letter", "Para 10(3): the ACK number, when and how the filing was received, the deemed receipt date, the fee and payments so far, the Schedule 2 documents received and pending, and what happens next. Signed by the evaluating officer, or the officer printing it if none is assigned."],
  ["Deficiency notice", "Para 13(1)(b): the DEF number, the documents outstanding and failed checks as they stood when the notice was issued, the balance due and the response date. A draft until the date it was sent is recorded; then dated that day. Signed by the reviewing supervisor who issued it."],
  ["EVAL-01 evaluation form", "Internal: every check with its answer, the counts, the recommended outcome, the decision and the three officers' signature lines."],
  ["CERT-01 certificate", "Para 13(5): the registration number, certificate serial, registrant, category and particulars, signed by the Chairman / CEO and the Commissioner from Admin › Signatories. A draft while either signatory is unconfirmed; marked if the registration is no longer in force."],
] as const;

export default async function ReportsPage() {
  const actor = await requirePermission("registers:read");
  return (
    <>
      <PageHeader title="Reports" description="The registration documents the app produces as PDFs, generated on request from the current records on the Commission's templates." />
      <Notice tone="info" title="Where to print them" className="mb-6">
        Open a submission from the <Link href="/register" className="text-info hover:underline">Register</Link>: its Summary and Evaluation tabs list the documents it has, each with Open and
        Download. {can(actor, "reports:print") ? "Every print is recorded in the audit log." : "Printing is for Registration officers, evaluators, supervisors, approvers and admins."}
      </Notice>
      <div className="grid gap-6 md:grid-cols-2">
        {DOCUMENTS.map(([title, description]) => (
          <Card key={title}>
            <CardHeader title={title} />
            <CardBody>
              <p className="text-sm text-muted">{description}</p>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
