import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { inwardItems } from "@/server/db/schema";
import { registryCtx } from "@/server/services/registry/load";
import { lagosToday } from "@/server/time";
import { OutwardForm } from "../outward-forms";

export const metadata: Metadata = { title: "New outward" };

export default async function NewOutwardPage({ searchParams }: PageProps<"/outward/new">) {
  await requirePermission("outward:write");
  const sp = await searchParams;
  const ctx = await registryCtx(db);
  const replyId = typeof sp.reply === "string" && /^[0-9a-f-]{36}$/i.test(sp.reply) ? sp.reply : null;
  const [reply] = replyId ? await db.select().from(inwardItems).where(eq(inwardItems.id, replyId)) : [];

  return (
    <>
      <PageHeader
        title="New outward"
        description="Log an outgoing document and get its OGSERC/OUT number."
        actions={
          <Link href="/outward" className="text-sm text-info hover:underline">
            Back to the Outward Register
          </Link>
        }
      />
      <OutwardForm
        today={lagosToday()}
        replyTo={reply ? { ack: reply.ackNo, sender: reply.sender, subject: reply.subject } : null}
        lists={{
          docTypes: ctx.ref.outgoingTypes,
          categories: ctx.ref.senderCategories,
          units: ctx.ref.units.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name })),
          signatories: ctx.ref.signatories.map((s) => ({ id: s.id, name: s.name, designation: s.designation, isSecretary: s.role === "secretary" })),
          modes: ctx.ref.modes,
        }}
      />
    </>
  );
}
