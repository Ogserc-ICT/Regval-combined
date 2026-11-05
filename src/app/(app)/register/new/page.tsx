import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { lagosToday } from "@/server/time";
import { createSubmissionAction } from "../actions";
import { blankValues, formLists } from "../data";
import { SubmissionForm } from "../submission-form";

export const metadata: Metadata = { title: "New submission" };

export default async function NewSubmissionPage() {
  await requirePermission("submission:save");
  const lists = await formLists(db);
  return (
    <>
      <PageHeader
        title="New submission"
        description="Direct entry on the Register. For a filing handed in at the front desk, Registry Intake (Phase 3) will start the entry with its acknowledgement instead."
        actions={
          <Link href="/register" className="text-sm text-info hover:underline">
            Back to the Register
          </Link>
        }
      />
      <SubmissionForm action={createSubmissionAction} lists={lists} values={blankValues(lagosToday())} mode="new" />
    </>
  );
}
