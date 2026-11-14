import { ActionForm } from "@/components/action-form";
import { Badge, Card, CardBody, CardHeader, Input, Notice, Table, Td, Th } from "@/components/ui";
import { lagosDateTime } from "@/domain/dates";
import { ALLOWED_FILE_TYPES, formatBytes } from "@/domain/files";
import { can, type Actor } from "@/server/auth/actor";
import type { SubmissionFile } from "@/server/services/files";
import { removeFileAction } from "../actions";
import { FileUpload } from "./file-upload";

/** The operator's filed form and scans kept with this submission (Q23 step 1). */
export function FilesCard({ submissionId, files, actor, storageReady }: { submissionId: string; files: SubmissionFile[]; actor: Actor; storageReady: boolean }) {
  const editable = can(actor, "documents:update");
  const live = files.filter((f) => !f.removedAt);
  const removed = files.filter((f) => f.removedAt);
  const hasFiledForm = live.some((f) => f.kind === "Filed form");
  return (
    <Card className="mb-6">
      <CardHeader
        title="Filed form and attachments"
        description={
          live.length
            ? `${live.length} file(s) on record${hasFiledForm ? "" : " · no filed form yet"}`
            : "Keep a copy of what the operator filed: upload the REG-01 form (PDF or scan) and any supporting documents."
        }
        actions={hasFiledForm ? <Badge tone="accent">Filed form on record</Badge> : <Badge tone="warn">No filed form</Badge>}
      />
      {live.length ? (
        <Table>
          <thead>
            <tr>
              <Th>File</Th>
              <Th>What it is</Th>
              <Th>Uploaded</Th>
              <Th className="w-56">{editable ? "" : null}</Th>
            </tr>
          </thead>
          <tbody>
            {live.map((f) => (
              <tr key={f.id}>
                <Td>
                  <a href={`/api/files/${f.id}`} target="_blank" rel="noopener" className="font-medium text-info hover:underline">
                    {f.fileName}
                  </a>
                  <div className="mt-0.5 text-xs text-faint">
                    {ALLOWED_FILE_TYPES[f.contentType] ?? f.contentType} · {formatBytes(f.sizeBytes)} ·{" "}
                    <a href={`/api/files/${f.id}?download=1`} className="hover:underline">
                      Download
                    </a>
                  </div>
                  {f.description ? <div className="mt-0.5 text-xs text-muted">{f.description}</div> : null}
                </Td>
                <Td>{f.kind}</Td>
                <Td className="text-xs">
                  <div>{lagosDateTime(f.uploadedAt)}</div>
                  <div className="text-faint">{f.uploadedByName}</div>
                </Td>
                <Td>
                  {editable ? (
                    <details>
                      <summary className="cursor-pointer text-xs text-danger">Remove…</summary>
                      <ActionForm action={removeFileAction} submitLabel="Remove file" variant="danger" size="sm" hidden={{ id: submissionId, fileId: f.id }} className="mt-2">
                        <Input name="reason" placeholder="Why? e.g. wrong operator's form" required maxLength={300} aria-label={`Why remove ${f.fileName}`} />
                      </ActionForm>
                    </details>
                  ) : null}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : null}
      {editable ? (
        <CardBody className={live.length ? "border-t border-border" : undefined}>
          {storageReady ? (
            <FileUpload submissionId={submissionId} hasFiledForm={hasFiledForm} />
          ) : (
            <Notice tone="warn" title="File storage is not set up">
              Uploads need a private Vercel Blob store connected to this project (BLOB_READ_WRITE_TOKEN). An admin can see this under Admin › Go-live.
            </Notice>
          )}
        </CardBody>
      ) : null}
      {removed.length ? (
        <CardBody className="border-t border-border">
          <details>
            <summary className="cursor-pointer text-xs text-muted">{removed.length} removed file(s)</summary>
            <ul className="mt-2 space-y-1 text-xs text-muted">
              {removed.map((f) => (
                <li key={f.id}>
                  <span className="text-text line-through">{f.fileName}</span> ({f.kind}): removed {lagosDateTime(f.removedAt!)} by {f.removedByName}; {f.removedReason}
                </li>
              ))}
            </ul>
          </details>
        </CardBody>
      ) : null}
    </Card>
  );
}
