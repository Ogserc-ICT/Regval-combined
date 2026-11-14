/**
 * Files kept with a submission (Q23 step 1): pure rules shared by the browser upload and the
 * server checks. No I/O.
 */
export const FILE_KINDS = ["Filed form", "Supporting document", "Other"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export const FILE_KIND_HINTS: Record<FileKind, string> = {
  "Filed form": "The REG-01 form the operator filed, as received (PDF or scan)",
  "Supporting document": "A Schedule 2 document or other attachment the operator sent",
  Other: "Anything else worth keeping with this submission",
};

export const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Media type → label. Browsers can show PDF, JPEG and PNG; TIFF scans download. */
export const ALLOWED_FILE_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/tiff": "TIFF",
};
export const ACCEPT_ATTRIBUTE = [".pdf", ".jpg", ".jpeg", ".png", ".tif", ".tiff", ...Object.keys(ALLOWED_FILE_TYPES)].join(",");

const EXT_TYPES: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", tif: "image/tiff", tiff: "image/tiff" };

/** The media type to upload with: the browser's, or one from the extension (Windows often gives none for TIFF). */
export function fileContentType(name: string, browserType: string): string | null {
  const t = browserType.toLowerCase();
  if (ALLOWED_FILE_TYPES[t]) return t;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TYPES[ext] ?? null;
}

export const filePrefix = (submissionId: string) => `submissions/${submissionId}/`;

/** Whether a Blob pathname belongs to this submission's folder. */
export const inSubmissionFolder = (submissionId: string, pathname: string) =>
  pathname.startsWith(filePrefix(submissionId)) && !pathname.includes("..") && !pathname.slice(filePrefix(submissionId).length).includes("/");

/**
 * The Blob pathname a new upload goes to. `unique` (random, from the browser) keeps two files
 * with the same name apart; the path is fixed before upload so a presigned URL can be scoped to it.
 */
export function uploadPathname(submissionId: string, fileName: string, unique: string): string {
  const dot = fileName.lastIndexOf(".");
  const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) : "";
  const stem = (dot > 0 ? fileName.slice(0, dot) : fileName)
    .replace(/[^A-Za-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const tag = unique.replace(/[^A-Za-z0-9]/g, "").slice(0, 12);
  return `${filePrefix(submissionId)}${stem || "file"}${tag ? `-${tag}` : ""}${ext ? `.${ext}` : ""}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
