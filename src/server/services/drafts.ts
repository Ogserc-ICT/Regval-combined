/**
 * Form work kept across an idle sign-out (docs/PLAN.md §11f, 8c). Saved by the
 * browser just before it signs a person out, given back to the same person on
 * the same page after they sign in again, then deleted. Never kept longer than
 * a day.
 */
import { and, eq, gt, lt } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "../db/connect";
import { formDrafts } from "../db/schema";

export const DRAFT_TTL_MS = 24 * 60 * 60_000;
export const DRAFT_MAX_BYTES = 256_000;

const field = z.object({
  name: z.string().min(1).max(200),
  /** Position among the form's fields with the same name. */
  i: z.number().int().min(0).max(500),
  value: z.string().max(20_000).optional(),
  checked: z.boolean().optional(),
});
export const draftSchema = z.object({
  savedAt: z.string().max(40),
  forms: z
    .array(z.object({ key: z.string().max(200), fields: z.array(field).max(1000) }))
    .max(20),
});
export type DraftData = z.infer<typeof draftSchema>;

/** An in-app page path: starts with one slash, no API routes, no scheme tricks. */
export function isDraftPath(path: unknown): path is string {
  return typeof path === "string" && path.length <= 512 && /^\/(?!\/)/.test(path) && !path.startsWith("/api/") && !/[\s\\]/.test(path);
}

const fresh = (now: Date) => gt(formDrafts.savedAt, new Date(now.getTime() - DRAFT_TTL_MS));

export async function saveDraft(db: DbOrTx, userId: string, path: string, data: DraftData, now = new Date()): Promise<void> {
  await db
    .insert(formDrafts)
    .values({ userId, path, data, savedAt: now })
    .onConflictDoUpdate({ target: [formDrafts.userId, formDrafts.path], set: { data, savedAt: now } });
  // Housekeeping: the person's expired drafts go.
  await db.delete(formDrafts).where(and(eq(formDrafts.userId, userId), lt(formDrafts.savedAt, new Date(now.getTime() - DRAFT_TTL_MS))));
}

export async function getDraft(db: DbOrTx, userId: string, path: string, now = new Date()): Promise<DraftData | null> {
  const [row] = await db
    .select({ data: formDrafts.data })
    .from(formDrafts)
    .where(and(eq(formDrafts.userId, userId), eq(formDrafts.path, path), fresh(now)));
  const parsed = draftSchema.safeParse(row?.data);
  return parsed.success ? parsed.data : null;
}

export async function deleteDraft(db: DbOrTx, userId: string, path: string): Promise<void> {
  await db.delete(formDrafts).where(and(eq(formDrafts.userId, userId), eq(formDrafts.path, path)));
}

/** Pages where this person has work waiting. */
export async function draftPaths(db: DbOrTx, userId: string, now = new Date()): Promise<string[]> {
  const rows = await db.select({ path: formDrafts.path }).from(formDrafts).where(and(eq(formDrafts.userId, userId), fresh(now)));
  return rows.map((r) => r.path);
}
