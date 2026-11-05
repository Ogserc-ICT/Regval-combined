import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, ilike, lt, or, type SQL } from "drizzle-orm";
import { Badge, Button, Card, CardHeader, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { lagosDateTime } from "@/domain/dates";
import { AUDIT_MODULES } from "@/server/audit";
import { can } from "@/server/auth/actor";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { auditLog } from "@/server/db/schema";
import { ChainCheckButton } from "./chain-check";

export const metadata: Metadata = { title: "Audit log" };

const PAGE = 100;

export default async function AuditPage({ searchParams }: PageProps<"/audit">) {
  const actor = await requirePermission("audit:read");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const mod = typeof sp.module === "string" && (AUDIT_MODULES as readonly string[]).includes(sp.module) ? sp.module : "";
  const before = typeof sp.before === "string" && /^\d+$/.test(sp.before) ? Number(sp.before) : null;

  const where: SQL[] = [];
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, (c: string) => `\\${c}`)}%`;
    where.push(or(ilike(auditLog.reference, like), ilike(auditLog.detail, like), ilike(auditLog.action, like), ilike(auditLog.userName, like))!);
  }
  if (mod) where.push(eq(auditLog.module, mod));
  if (before) where.push(lt(auditLog.seq, before));
  const rows = await db.select().from(auditLog).where(where.length ? and(...where) : undefined).orderBy(desc(auditLog.seq)).limit(PAGE);
  const next = rows.length === PAGE ? rows[rows.length - 1].seq : null;
  const qs = (extra: Record<string, string>) => new URLSearchParams({ ...(q && { q }), ...(mod && { module: mod }), ...extra }).toString();

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every action in both modules, newest first. Append-only: entries cannot be changed or removed, and each one carries the fingerprint of the one before it."
        actions={can(actor, "settings:write") ? <ChainCheckButton /> : null}
      />
      <Card>
        <CardHeader
          title="Entries"
          actions={
            <form className="flex flex-wrap gap-2" role="search">
              <Input name="q" defaultValue={q} placeholder="Number, name, action…" className="w-56" aria-label="Search" />
              <Select name="module" defaultValue={mod} className="w-40" aria-label="Module">
                <option value="">All modules</option>
                {AUDIT_MODULES.map((m) => (
                  <option key={m} value={m}>
                    {m[0].toUpperCase() + m.slice(1)}
                  </option>
                ))}
              </Select>
              <Button type="submit" variant="secondary">
                Filter
              </Button>
            </form>
          }
        />
        <Table>
          <thead>
            <tr>
              <Th className="w-16">#</Th>
              <Th>When (Lagos)</Th>
              <Th>User</Th>
              <Th>Action</Th>
              <Th>Reference</Th>
              <Th>Detail</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <Td colSpan={6} className="py-10 text-center text-muted">
                  No entries match.
                </Td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.seq}>
                  <Td className="tabular text-faint">{r.seq}</Td>
                  <Td className="tabular whitespace-nowrap text-muted">{lagosDateTime(r.at)}</Td>
                  <Td className="whitespace-nowrap">{r.userName}</Td>
                  <Td className="whitespace-nowrap">
                    <span className="mr-2">{r.action}</span>
                    <Badge>{r.module}</Badge>
                  </Td>
                  <Td className="whitespace-nowrap font-mono text-xs">{r.reference}</Td>
                  <Td className="max-w-xl text-muted">{r.detail}</Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
        {next ? (
          <div className="flex justify-end px-5 py-3">
            <Link href={`/audit?${qs({ before: String(next) })}`} className="text-sm text-info hover:underline">
              Older entries →
            </Link>
          </div>
        ) : null}
      </Card>
    </>
  );
}
