"use client";

import { ActionForm } from "@/components/action-form";
import { Field, Input } from "@/components/ui";
import { importAction } from "./actions";

export function ImportForm() {
  return (
    <ActionForm
      action={importAction}
      submitLabel="Read the workbook"
      pendingLabel="Reading… (up to a minute)"
      success={(report) => <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap font-mono text-xs">{report}</pre>}
    >
      <Field label="Workbook (.xlsm)" htmlFor="file" hint="OGSERC_Registry_and_Evaluation_Combined.xlsm, up to 4 MB.">
        <Input id="file" name="file" type="file" accept=".xlsm,.xlsx" className="h-auto py-1.5" required />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="commit" value="yes" className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
        <span>
          <span className="font-medium">Keep the records.</span> Leave this off for a dry run: the report is shown and nothing is kept. Tick it only after a clean dry run.
        </span>
      </label>
    </ActionForm>
  );
}
