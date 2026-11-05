/**
 * The audit writer (SPEC §28; docs/PLAN.md §5). Call it inside the same
 * transaction as the change it records. Writes are serialised through the
 * chain-head row so each entry hashes the one before it.
 */
import { createHash } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import type { DbOrTx, Tx } from "./db/connect";
import { auditChainHead, auditLog } from "./db/schema";

export const AUDIT_MODULES = ["registry", "registration", "admin", "auth", "system"] as const;
export type AuditModule = (typeof AUDIT_MODULES)[number];

export type AuditActor = { id: string | null; name: string };
export const SYSTEM_ACTOR: AuditActor = { id: null, name: "System" };

export type AuditEntry = {
  actor: AuditActor;
  action: string;
  module: AuditModule;
  entityType?: string | null;
  entityId?: string | null;
  /** The business number shown to staff: ACK, FD, OUT, PAY, OUN, REG, file ref … */
  reference?: string | null;
  detail?: string;
  /** Structured before/after values or other data. */
  data?: unknown;
  at?: Date;
};

type HashInput = {
  seq: number;
  at: string;
  userId: string | null;
  userName: string;
  action: string;
  module: string;
  entityType: string | null;
  entityId: string | null;
  reference: string | null;
  detail: string;
  data: unknown;
  prevHash: string;
};

/** Deterministic JSON: object keys sorted, so the hash does not depend on key order. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
    .join(",")}}`;
}

export function auditHash(input: HashInput): string {
  return createHash("sha256").update(canonical(input)).digest("hex");
}

export async function writeAudit(tx: Tx, entry: AuditEntry): Promise<{ seq: number; hash: string }> {
  // Lock the chain head for the rest of the transaction.
  const head = await tx.execute<{ seq: string | number; hash: string }>(
    sql`select seq, hash from audit_chain_head where id = 1 for update`,
  );
  const row = head.rows[0];
  if (!row) throw new Error("audit_chain_head is missing; run the migrations");
  const seq = Number(row.seq) + 1;
  const at = entry.at ?? new Date();
  // The hash covers the value as stored (jsonb round-trip) via canonical JSON.
  const data = entry.data === undefined ? null : JSON.parse(JSON.stringify(entry.data));
  const input: HashInput = {
    seq,
    at: at.toISOString(),
    userId: entry.actor.id,
    userName: entry.actor.name,
    action: entry.action,
    module: entry.module,
    entityType: entry.entityType ?? null,
    entityId: entry.entityId ?? null,
    reference: entry.reference ?? null,
    detail: entry.detail ?? "",
    data,
    prevHash: row.hash,
  };
  const hash = auditHash(input);
  await tx.insert(auditLog).values({
    seq,
    at,
    userId: input.userId,
    userName: input.userName,
    action: input.action,
    module: input.module,
    entityType: input.entityType,
    entityId: input.entityId,
    reference: input.reference,
    detail: input.detail,
    data,
    prevHash: input.prevHash,
    hash,
  });
  await tx.update(auditChainHead).set({ seq, hash }).where(eq(auditChainHead.id, 1));
  return { seq, hash };
}

export type ChainCheck = { ok: true; checked: number } | { ok: false; checked: number; brokenAtSeq: number; reason: string };

/** Re-hash the whole chain in order. Used by the admin check and the daily review. */
export async function verifyAuditChain(db: DbOrTx, batch = 1000): Promise<ChainCheck> {
  let prev = "0".repeat(64);
  let expectedSeq = 1;
  let checked = 0;
  for (;;) {
    const rows = await db
      .select()
      .from(auditLog)
      .where(sql`${auditLog.seq} >= ${expectedSeq}`)
      .orderBy(asc(auditLog.seq))
      .limit(batch);
    if (rows.length === 0) break;
    for (const r of rows) {
      if (r.seq !== expectedSeq) return { ok: false, checked, brokenAtSeq: expectedSeq, reason: "missing entry" };
      if (r.prevHash !== prev) return { ok: false, checked, brokenAtSeq: r.seq, reason: "previous hash does not match" };
      const hash = auditHash({
        seq: r.seq,
        at: r.at.toISOString(),
        userId: r.userId,
        userName: r.userName,
        action: r.action,
        module: r.module,
        entityType: r.entityType,
        entityId: r.entityId,
        reference: r.reference,
        detail: r.detail,
        data: r.data ?? null,
        prevHash: r.prevHash,
      });
      if (hash !== r.hash) return { ok: false, checked, brokenAtSeq: r.seq, reason: "content does not match its hash" };
      prev = r.hash;
      expectedSeq += 1;
      checked += 1;
    }
  }
  const head = await db.select().from(auditChainHead).where(eq(auditChainHead.id, 1));
  if (head[0] && (head[0].seq !== checked || head[0].hash !== prev)) {
    return { ok: false, checked, brokenAtSeq: checked + 1, reason: "entries after the last one are missing" };
  }
  return { ok: true, checked };
}
