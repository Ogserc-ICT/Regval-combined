import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { Notice, PageHeader } from "@/components/ui";
import { can, type Actor } from "@/server/auth/actor";
import { db } from "@/server/db/client";
import { submissionLicences, submissionOtherActivities, type submissions } from "@/server/db/schema";
import { saveDraftSubmissionAction } from "../actions";
import { formLists, valuesFromParts } from "../data";
import { SubmissionForm } from "../submission-form";

/** A Register row started by Registry Intake: complete it and save it under its ACK (SPEC §18.1). */
export async function DraftSubmission({ row, actor }: { row: typeof submissions.$inferSelect; actor: Actor }) {
  const [others, licences, lists] = await Promise.all([
    db.select().from(submissionOtherActivities).where(eq(submissionOtherActivities.submissionId, row.id)).orderBy(asc(submissionOtherActivities.position)),
    db.select().from(submissionLicences).where(eq(submissionLicences.submissionId, row.id)).orderBy(asc(submissionLicences.position)),
    formLists(db),
  ]);
  return (
    <>
      <PageHeader
        title={row.registeredName}
        description={<span className="font-mono text-text">{row.ackNo} · Register row started by Registry Intake</span>}
        actions={
          <Link href="/registry-intake" className="text-sm text-info hover:underline">
            Back to Registry intake
          </Link>
        }
      />
      {can(actor, "submission:save") ? (
        <>
          <Notice tone="warn" title="Complete it and save it on the Register" className="mb-6">
            The acknowledgement is issued. Pricing, the payment step and evaluation start when this entry is saved.
          </Notice>
          <SubmissionForm action={saveDraftSubmissionAction} lists={lists} values={valuesFromParts(row, others.map((o) => o.activity), licences)} mode="draft" />
        </>
      ) : (
        <Notice tone="info">A Registry officer completes this entry and saves it on the Register.</Notice>
      )}
    </>
  );
}
