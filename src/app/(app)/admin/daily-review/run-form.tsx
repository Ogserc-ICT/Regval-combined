"use client";

import { ActionForm } from "@/components/action-form";
import { runDailyReviewAction } from "./actions";

export function RunReviewForm() {
  return <ActionForm action={runDailyReviewAction} submitLabel="Run daily review now" pendingLabel="Running…" />;
}
