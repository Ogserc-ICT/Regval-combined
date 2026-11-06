import type { Metadata } from "next";
import { Badge, Card, CardBody, CardHeader, Notice, PageHeader, Table, Td, Th } from "@/components/ui";
import { lagosDateTime } from "@/domain/dates";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { listImportRuns, type ImportReport } from "@/server/services/import";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Import" };

export default async function ImportPage() {
  await requirePermission("settings:write");
  const runs = await listImportRuns(db);
  return (
    <>
      <PageHeader
        title="Import the workbook"
        description="Brings the real records from the workbook into the app: Front Desk Log, Inward and Outward Registers, File Index and File Movement. Rows marked EXAMPLE are skipped. Numbers keep the value issued in the workbook and the app continues after them."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4 self-start">
          <Notice tone="info" title="Before you import">
            <ul className="list-disc space-y-1 pl-5">
              <li>Import before staff start logging in the app, so the workbook&apos;s numbers are still free. A number the app already issued to a different item is reported, not overwritten.</li>
              <li>Phones that lost their leading zero in Excel are restored (8021846578 → 08021846578) and listed.</li>
              <li>Names typed in the workbook that are not user accounts (e.g. &ldquo;[Front desk officer 1]&rdquo;) are kept as written and listed.</li>
              <li>Running the import again is safe: records already imported are counted, not duplicated.</li>
            </ul>
          </Notice>
          <Card>
            <CardHeader title="Workbook" />
            <CardBody>
              <ImportForm />
            </CardBody>
          </Card>
        </div>
        <Card className="self-start">
          <CardHeader title="Runs" description="Every dry run and import, latest first." />
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>File</Th>
                <Th>Result</Th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 ? (
                <tr>
                  <Td colSpan={3} className="py-8 text-center text-muted">
                    No runs yet.
                  </Td>
                </tr>
              ) : (
                runs.map((r) => {
                  const rep = r.report as ImportReport;
                  const imported = Object.values(rep.sheets).reduce((n, s) => n + s.imported, 0);
                  const errors = Object.values(rep.sheets).reduce((n, s) => n + s.errors.length, 0);
                  return (
                    <tr key={r.id}>
                      <Td className="tabular whitespace-nowrap text-xs text-muted">
                        {lagosDateTime(r.at)}
                        <div>{r.userName}</div>
                      </Td>
                      <Td className="text-xs">
                        {r.sourceName}
                        <div className="font-mono text-faint">{r.sha256.slice(0, 12)}</div>
                      </Td>
                      <Td className="text-xs">
                        <div className="flex flex-wrap gap-1">
                          {r.dryRun ? <Badge>Dry run</Badge> : <Badge tone="accent">Imported</Badge>}
                          {r.mode === "examples" ? <Badge tone="info">EXAMPLE rows</Badge> : null}
                          {errors ? <Badge tone="danger">{errors} error(s)</Badge> : null}
                        </div>
                        <div className="mt-1 text-muted">
                          {imported} record(s){rep.notes.length ? ` · ${rep.notes.length} note(s)` : ""}
                        </div>
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
