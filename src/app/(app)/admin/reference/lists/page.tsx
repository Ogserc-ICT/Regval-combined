import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui";
import { cn } from "@/lib/cn";
import { can } from "@/server/auth/actor";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { EDITABLE_LISTS, listEditable } from "@/server/services/reference-admin";
import { AddListItem, ListItemRow } from "../forms";

export const metadata: Metadata = { title: "Lists" };

export default async function ListsPage({ searchParams }: PageProps<"/admin/reference/lists">) {
  const actor = await requireActor();
  const edit = can(actor, "lists:write");
  const sp = await searchParams;
  const key = typeof sp.list === "string" && EDITABLE_LISTS[sp.list] ? sp.list : "sender_category";
  const def = EDITABLE_LISTS[key];
  const all = await listEditable(db);
  const items = all.filter((i) => i.listKey === key);
  const channels = all.filter((i) => i.listKey === "submission_channel").map((i) => i.value);
  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <nav className="flex flex-col gap-0.5 self-start" aria-label="Lists">
        {Object.entries(EDITABLE_LISTS).map(([k, d]) => (
          <Link
            key={k}
            href={`/admin/reference/lists?list=${k}`}
            className={cn("rounded-md px-3 py-1.5 text-sm", k === key ? "bg-surface-hover font-medium text-text" : "text-muted hover:text-text")}
          >
            {d.label}
          </Link>
        ))}
      </nav>
      <Card>
        <CardHeader title={def.label} description="Values cannot be renamed (records keep the text). Switch a value off to hide it from new entries." />
        <CardBody className="flex flex-col gap-2">
          {items.map((i) =>
            edit ? (
              <ListItemRow key={i.value} listKey={key} item={i} meta={def.meta} channels={channels} locked={!!def.locked?.includes(i.value)} />
            ) : (
              <div key={i.value} className="flex items-center gap-2 text-sm">
                {i.value} {i.meta && def.meta !== "outgoing" ? <span className="font-mono text-xs text-faint">{i.meta}</span> : null}
                {!i.active ? <Badge>off</Badge> : null}
              </div>
            ),
          )}
          {edit ? (
            <div className="mt-2 border-t border-border pt-3">
              <AddListItem listKey={key} meta={def.meta} channels={channels} />
            </div>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
