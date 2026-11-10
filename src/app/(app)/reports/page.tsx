import type { Metadata } from "next";
import { Card, CardBody, CardHeader, Notice, PageHeader } from "@/components/ui";
import { requirePermission } from "@/server/auth/session";

export const metadata: Metadata = { title: "Reports" };

const DOCUMENTS = [
  ["Acknowledgement letter", "Para 10(3): the ACK number, the date and time received and the deemed receipt date."],
  ["Deficiency notice", "Para 13(1)(b): the DEF number, what is outstanding and the response period."],
  ["EVAL-01 report", "The evaluation checks and their outcomes for one submission."],
  ["CERT-01 certificate", "The registration certificate, with the confirmed signatories."],
] as const;

export default async function ReportsPage() {
  await requirePermission("registers:read");
  return (
    <>
      <PageHeader title="Reports" description="The registration documents the app produces as PDFs, generated on request from the current records." />
      <Notice tone="info" title="Coming in the next phase" className="mb-6">
        These four documents are built once the Commission sends its templates and wording (QUESTIONS.md Q26). Until then, the dates they are sent are recorded on each submission.
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
