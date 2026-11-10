import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { Notice, PageHeader } from "@/components/ui";
import { can, type Actor } from "@/server/auth/actor";
import { db } from "@/server/db/client";
import { submissionLicences, submissionOtherActivities, type submissions } from "@/server/db/schema";
import { saveDraftSubmissionAction } from "../actions";
import { formLists, valuesFromParts } from "../data";
import { SubmissionForm } from "../submission-form";
import { DeleteEntryCard } from "@/components/delete-entry-card";
import { deleteSubmissionAction } from "../../admin/data/actions";

/** A Register row started before Phase 9 by the old Registry intake: complete it and save it under its ACK. */
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
        description={<span className="font-mono text-text">{row.ackNo} · Register row not yet saved</span>}
        actions={
          <Link href="/register" className="text-sm text-info hover:underline">
            Back to the Register
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
        <Notice tone="info">A Registration officer completes this entry and saves it on the Register.</Notice>
      )}
      {can(actor, "data:clear") ? (
        <DeleteEntryCard action={deleteSubmissionAction} id={row.id} ack={row.ackNo} what="unsaved Register row" withIt="anything recorded against it" />
      ) : null}
    </>
  );
}
