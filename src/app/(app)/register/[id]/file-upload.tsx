"use client";

import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Button, Field, FormErrors, Input, Notice, Select } from "@/components/ui";
import { ACCEPT_ATTRIBUTE, FILE_KIND_HINTS, FILE_KINDS, fileContentType, formatBytes, MAX_FILE_BYTES, uploadPathname } from "@/domain/files";
import { attachFileAction } from "../actions";

/**
 * Uploads straight from the browser to the private Blob store (so large scans are fine), then
 * records the file on the submission. The server checks the person's role before handing out
 * the upload token and again when recording it.
 */
export function FileUpload({ submissionId, hasFiledForm }: { submissionId: string; hasFiledForm: boolean }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors([]);
    setDone(null);
    const data = new FormData(e.currentTarget);
    const file = data.get("file");
    if (!(file instanceof File) || !file.size) return setErrors(["Choose a file to upload."]);
    const type = fileContentType(file.name, file.type);
    const problems: string[] = [];
    if (!type) problems.push(`${file.name} is not a PDF, JPEG, PNG or TIFF file.`);
    if (file.size > MAX_FILE_BYTES) problems.push(`${file.name} is ${formatBytes(file.size)}; the limit is ${formatBytes(MAX_FILE_BYTES)}.`);
    if (problems.length) return setErrors(problems);

    setBusy(true);
    setProgress(0);
    try {
      const blob = await upload(uploadPathname(submissionId, file.name), file, {
        access: "private",
        handleUploadUrl: "/api/files/upload",
        clientPayload: JSON.stringify({ submissionId }),
        contentType: type!,
        multipart: file.size > 8 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
      });
      const rec = new FormData();
      rec.set("id", submissionId);
      rec.set("pathname", blob.pathname);
      rec.set("kind", String(data.get("kind") ?? ""));
      rec.set("description", String(data.get("description") ?? ""));
      rec.set("fileName", file.name);
      const res = await attachFileAction(undefined, rec);
      if (res.ok) {
        setDone(res.message ?? `${file.name} uploaded.`);
        form.current?.reset();
        router.refresh();
      } else {
        setErrors([...res.reasons.filter((r) => r !== "Please correct the highlighted fields."), ...Object.values(res.fieldErrors).flat()]);
      }
    } catch (err) {
      setErrors([err instanceof Error && err.message ? err.message.replace(/^Vercel Blob: /, "") : "The upload failed. Check the connection and try again."]);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <form ref={form} onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="File" htmlFor="file" hint={`PDF, JPEG, PNG or TIFF, up to ${formatBytes(MAX_FILE_BYTES)}`}>
          <Input id="file" name="file" type="file" accept={ACCEPT_ATTRIBUTE} required disabled={busy} className="py-1.5" />
        </Field>
        <Field label="What it is" htmlFor="kind">
          <Select id="kind" name="kind" defaultValue={hasFiledForm ? "Supporting document" : "Filed form"} disabled={busy}>
            {FILE_KINDS.map((k) => (
              <option key={k} value={k} title={FILE_KIND_HINTS[k]}>
                {k}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Description" htmlFor="description" hint="Optional, e.g. 'REG-01D as filed, 12 pages' or 'CAC certificate'">
        <Input id="description" name="description" maxLength={300} disabled={busy} />
      </Field>
      <FormErrors reasons={errors} />
      {done ? <Notice tone="accent">{done}</Notice> : null}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? (progress !== null && progress < 100 ? `Uploading… ${progress}%` : "Saving…") : "Upload"}
        </Button>
        {busy && progress !== null ? (
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-surface-hover" aria-hidden>
            <div className="h-full bg-accent transition-[width]" style={{ width: `${progress}%` }} />
          </div>
        ) : null}
      </div>
    </form>
  );
}
