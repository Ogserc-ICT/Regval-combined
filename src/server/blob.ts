/**
 * Vercel Blob for kept files (slips attached to emails), private access.
 * Without BLOB_READ_WRITE_TOKEN (local development, tests) nothing is kept.
 */
import { put } from "@vercel/blob";

export function blobEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!env.BLOB_READ_WRITE_TOKEN;
}

/** Stores a file privately; returns its pathname, or null when Blob is not configured. */
export async function keepFile(pathname: string, content: Buffer, contentType: string): Promise<string | null> {
  if (!blobEnabled()) return null;
  const res = await put(pathname, content, { access: "private", contentType, addRandomSuffix: true });
  return res.pathname;
}
