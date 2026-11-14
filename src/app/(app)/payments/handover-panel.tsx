import { ActionForm } from "@/components/action-form";
import { Badge, Card, CardBody, CardHeader, Input, Notice, Stat, Table, Td, Th } from "@/components/ui";
import { lagosDateTime } from "@/domain/dates";
import { batchSlug } from "@/domain/handover";
import { naira } from "@/lib/format";
import type { handoverWaiting, listBatches } from "@/server/services/handover";
import { markImportedAction, prepareHandoverAction } from "./actions";

/** Payments & Finance › Handover (Phase 11a; docs/REVENUE-REGISTRY-CONTRACT.md). */
export function HandoverPanel({
  waiting,
  batches,
  today,
}: {
  waiting: Awaited<ReturnType<typeof handoverWaiting>>;
  batches: Awaited<ReturnType<typeof listBatches>>;
  today: string;
}) {
  const lines = waiting.paymentLines + waiting.reversalLines;
  const notImported = batches.filter((b) => !b.importedOn).length;
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Confirmed payments waiting" value={waiting.paymentLines} hint={naira(waiting.paymentTotal)} />
        <Stat label="Reversals waiting" value={waiting.reversalLines} hint={waiting.reversalLines ? naira(waiting.reversalTotal) : undefined} />
        <Stat label="Batches not yet imported" value={notImported} />
      </div>
      <Card>
        <CardHeader
          title="Prepare a handover batch"
          description="Takes every confirmed payment not handed over before, and a reversal line for every handed-over payment reversed since, into one numbered batch for the Revenue Registry. Nothing is ever in two batches, so nothing is imported twice or missed."
        />
        <CardBody>
          {lines ? (
            <ActionForm action={prepareHandoverAction} submitLabel={`Prepare handover (${lines} line${lines === 1 ? "" : "s"}, net ${naira(waiting.netTotal)})`} pendingLabel="Preparing…" />
          ) : (
            <Notice tone="info">Nothing to hand over: every confirmed payment and reversal is already in a batch.</Notice>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader
          title="Batches"
          description="Download a batch and import it into the Revenue Registry, then mark it imported. A batch never changes: downloading it again gives the same file."
        />
        {batches.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Batch</Th>
                <Th>Prepared</Th>
                <Th>Confirmed</Th>
                <Th className="text-right">Lines</Th>
                <Th className="text-right">Net total</Th>
                <Th>File</Th>
                <Th className="w-72">Revenue Registry</Th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id}>
                  <Td className="font-mono text-xs">{b.batchNo}</Td>
                  <Td className="text-xs">
                    <div>{lagosDateTime(b.preparedAt)}</div>
                    <div className="text-faint">{b.preparedByName}</div>
                  </Td>
                  <Td className="text-xs">{b.confirmedFrom ? (b.confirmedFrom === b.confirmedTo ? b.confirmedFrom : `${b.confirmedFrom} to ${b.confirmedTo}`) : "reversals only"}</Td>
                  <Td className="text-right text-xs">
                    {b.paymentLines}
                    {b.reversalLines ? <span className="text-warn"> + {b.reversalLines} rev.</span> : null}
                  </Td>
                  <Td className="text-right">{naira(b.netTotal)}</Td>
                  <Td className="whitespace-nowrap text-xs">
                    <a href={`/api/handover/${batchSlug(b.batchNo)}`} className="text-info hover:underline">
                      Excel
                    </a>
                    {" · "}
                    <a href={`/api/handover/${batchSlug(b.batchNo)}?format=csv`} className="text-info hover:underline">
                      CSV
                    </a>
                  </Td>
                  <Td>
                    {b.importedOn ? (
                      <span className="text-xs">
                        <Badge tone="accent">Imported {b.importedOn}</Badge> <span className="text-faint">{b.importedByName}</span>
                      </span>
                    ) : (
                      <ActionForm action={markImportedAction} submitLabel="Mark imported" size="sm" variant="secondary" inline hidden={{ batchId: b.id }}>
                        <Input type="date" name="importedOn" defaultValue={today} max={today} className="h-8 w-36" aria-label={`Date ${b.batchNo} was imported`} />
                      </ActionForm>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <CardBody className="text-sm text-muted">No batches yet.</CardBody>
        )}
      </Card>
    </div>
  );
}
