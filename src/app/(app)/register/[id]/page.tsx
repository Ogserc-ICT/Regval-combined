import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/badges";
import { Badge, Notice, PageHeader } from "@/components/ui";
import { FILING_LABELS } from "@/domain/registration/types";
import { cn } from "@/lib/cn";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { ServiceError } from "@/server/errors";
import { loadSubmission, type LoadedSubmission } from "@/server/services/submissions/load";
import { eq } from "drizzle-orm";
import { submissions } from "@/server/db/schema";
import { DetailsTab } from "./details-tab";
import { DraftSubmission } from "./draft";
import { DocumentsTab } from "./documents-tab";
import { EvaluationTab } from "./evaluation-tab";
import { HistoryTab } from "./history-tab";
import { PaymentsTab } from "./payments-tab";
import { SummaryTab } from "./summary-tab";

export const metadata: Metadata = { title: "Submission" };

const TABS = [
  ["summary", "Summary"],
  ["details", "Details"],
  ["documents", "Documents"],
  ["payments", "Payments"],
  ["evaluation", "Evaluation"],
  ["history", "History"],
] as const;

export default async function SubmissionPage({ params, searchParams }: PageProps<"/register/[id]">) {
  const actor = await requirePermission("registers:read");
  const { id } = await params;
  const sp = await searchParams;
  const tab = (TABS.find(([k]) => k === sp.tab)?.[0] ?? "summary") as (typeof TABS)[number][0];
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [raw] = await db.select().from(submissions).where(eq(submissions.id, id));
  if (!raw) notFound();
  if (!raw.status) return <DraftSubmission row={raw} actor={actor} />;
  let l: LoadedSubmission;
  try {
    l = await loadSubmission(db, id);
  } catch (e) {
    if (e instanceof ServiceError && e.kind === "not_found") notFound();
    throw e;
  }
  const { row, a } = l;

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {row.registeredName}
            <StatusBadge status={row.status} />
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-text">{row.ackNo}</span>
            <span>{FILING_LABELS[row.filingType]}</span>
            {row.registrationNo ? <Badge tone="accent">{row.registrationNo}</Badge> : null}
            {a.registrationNoInUse && !row.registrationNo ? <Badge tone="info">Provisional: {a.registrationNoInUse}</Badge> : null}
            {row.certificateNeedsReissue ? <Badge tone="warn">Certificate needs reissue</Badge> : null}
          </span>
        }
        actions={
          <Link href="/register" className="text-sm text-info hover:underline">
            Back to the Register
          </Link>
        }
      />
      {sp.saved ? (
        <Notice tone="accent" title={`Saved as ${row.ackNo}`} className="mb-4">
          Status: {row.status}. Next: record the payment; Finance confirms it on the Finance Desk.
        </Notice>
      ) : null}
      <Notice tone={a.closed ? "info" : "warn"} title="Next action" className="mb-6">
        {a.nextAction} <span className="text-faint">· {a.processStage}</span>
      </Notice>

      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-border" aria-label="Sections">
        {TABS.map(([k, label]) => (
          <Link
            key={k}
            href={`/register/${id}?tab=${k}`}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm",
              tab === k ? "border-accent font-medium text-text" : "border-transparent text-muted hover:text-text",
            )}
            aria-current={tab === k ? "page" : undefined}
          >
            {label}
            {k === "documents" && a.documents.listed ? (
              <span className="ml-1.5 text-xs text-faint">
                {a.documents.received + a.documents.items.filter((i) => i.value === "N/A").length}/{a.documents.listed}
              </span>
            ) : null}
            {k === "summary" && a.flags.length ? <span className="ml-1.5 text-xs text-warn">{a.flags.length}</span> : null}
          </Link>
        ))}
      </nav>

      {tab === "summary" ? <SummaryTab l={l} /> : null}
      {tab === "details" ? <DetailsTab l={l} actor={actor} /> : null}
      {tab === "documents" ? <DocumentsTab l={l} actor={actor} /> : null}
      {tab === "payments" ? <PaymentsTab l={l} actor={actor} /> : null}
      {tab === "evaluation" ? <EvaluationTab l={l} actor={actor} /> : null}
      {tab === "history" ? <HistoryTab l={l} /> : null}
    </>
  );
}
