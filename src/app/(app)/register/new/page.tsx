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
        description="Enter a filing received by hand, email or the online portal. Saving works out its deemed receipt date (para 10(3)) and issues its ACK."
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
