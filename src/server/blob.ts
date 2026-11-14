/**
 * Vercel Blob (private store) for the files kept with a submission: the operator's filed
 * form and scans of supporting documents. Browsers upload straight to Blob with a short-lived
 * token from /api/files/upload (so a scan may exceed Vercel's 4.5 MB request limit); staff open
 * a file through /api/files/{id}, which checks their role and streams it. Nothing touches a
 * local disk. Without BLOB_READ_WRITE_TOKEN (local development) uploads are switched off.
 */
import { del, get, head } from "@vercel/blob";

export function blobEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!env.BLOB_READ_WRITE_TOKEN;
}

/** What the file service needs from storage; tests pass a fake. */
export type FileStore = {
  /** Size and type of a stored file, or null when it is not there. */
  stat(pathname: string): Promise<{ size: number; contentType: string } | null>;
  open(pathname: string): Promise<{ stream: ReadableStream<Uint8Array>; size: number; contentType: string } | null>;
  /** Best effort: a failure is logged, never thrown (the record is already saved). */
  remove(pathnames: string[]): Promise<void>;
};

export const blobStore: FileStore = {
  async stat(pathname) {
    try {
      const h = await head(pathname);
      return { size: h.size, contentType: h.contentType };
    } catch {
      return null;
    }
  },
  async open(pathname) {
    const r = await get(pathname, { access: "private", useCache: false });
    if (!r || r.statusCode !== 200) return null;
    return { stream: r.stream, size: r.blob.size, contentType: r.blob.contentType };
  },
  async remove(pathnames) {
    if (!pathnames.length || !blobEnabled()) return;
    try {
      await del(pathnames);
    } catch (e) {
      console.error(`Blob: could not delete ${pathnames.length} file(s)`, e);
    }
  },
};
