import { Notice } from "@/components/ui";
import { can, type Actor } from "@/server/auth/actor";
import { db } from "@/server/db/client";
import type { LoadedSubmission } from "@/server/services/submissions/load";
import { updateSubmissionAction } from "../../register/actions";
import { formLists, valuesFrom } from "../data";
import { SubmissionForm } from "../submission-form";

export async function DetailsTab({ l, actor }: { l: LoadedSubmission; actor: Actor }) {
  const lists = await formLists(db);
  const editable = can(actor, "submission:save") && !l.a.closed && !l.evaluation?.finalDecision;
  return (
    <div className="flex flex-col gap-4">
      {editable ? (
        <Notice tone="info">
          Every change is written to the history (old → new). The saved pricing does not change: if the category, fee or deadline would now differ, the
          submission is flagged and an admin can recalculate.
        </Notice>
      ) : (
        <Notice tone="info">
          {l.a.closed || l.evaluation?.finalDecision ? "The submission is decided; its details are read-only." : "Only a Registry officer can change these details."}
        </Notice>
      )}
      <fieldset disabled={!editable} className="contents">
        <SubmissionForm action={updateSubmissionAction} lists={lists} values={valuesFrom(l)} mode="edit" />
      </fieldset>
    </div>
  );
}
