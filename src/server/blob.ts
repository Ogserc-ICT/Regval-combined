/**
 * Vercel Blob (private store) for the files kept with a submission: the operator's filed
 * form and scans of supporting documents. Browsers upload straight to Blob with a short-lived
 * token from /api/files/upload (so a scan may exceed Vercel's 4.5 MB request limit); staff open
 * a file through /api/files/{id}, which checks their role and streams it. Nothing touches a
 * local disk.
 *
 * Two ways a store can be connected: a read-write token (BLOB_READ_WRITE_TOKEN, older
 * connections and local development) or Vercel's OIDC with BLOB_STORE_ID (newer connections,
 * no token). Browser uploads use a client token in the first case and a presigned URL in the
 * second. Without either, uploads are switched off.
 */
import { del, get, head, put } from "@vercel/blob";

export type BlobMode = "token" | "oidc";

export function blobMode(env: NodeJS.ProcessEnv = process.env): BlobMode | null {
  if (env.BLOB_READ_WRITE_TOKEN) return "token";
  if (env.BLOB_STORE_ID) return "oidc";
  return null;
}

export function blobEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return blobMode(env) !== null;
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

/** Staff e-signatures: small PNGs the server writes and reads itself (no browser upload). */
export type SignatureStore = {
  save(pathname: string, bytes: Uint8Array): Promise<void>;
  /** The image, or null when it is missing or storage is not set up. */
  read(pathname: string): Promise<Buffer | null>;
  /** Best effort, as FileStore.remove. */
  remove(pathnames: string[]): Promise<void>;
};

export const signatureBlobStore: SignatureStore = {
  async save(pathname, bytes) {
    await put(pathname, Buffer.from(bytes), { access: "private", contentType: "image/png", addRandomSuffix: false, allowOverwrite: false });
  },
  async read(pathname) {
    if (!blobEnabled()) return null;
    try {
      const r = await get(pathname, { access: "private", useCache: false });
      if (!r || r.statusCode !== 200) return null;
      return Buffer.from(await new Response(r.stream).arrayBuffer());
    } catch (e) {
      console.error(`Blob: could not read signature ${pathname}`, e);
      return null;
    }
  },
  remove: blobStore.remove,
};
