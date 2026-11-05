import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { lagosDate, lagosMinuteOfDay } from "@/domain/dates";
import { Notice, PageHeader } from "@/components/ui";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { frontDeskItems } from "@/server/db/schema";
import { registryCtx } from "@/server/services/registry/load";
import { lagosTimeNow, lagosToday } from "@/server/time";
import { InwardForm, type InwardDefaults } from "../inward-form";

export const metadata: Metadata = { title: "New inward" };

const hhmm = (d: Date) => {
  const m = lagosMinuteOfDay(d);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

export default async function NewInwardPage({ searchParams }: PageProps<"/inward/new">) {
  await requirePermission("inward:write");
  const sp = await searchParams;
  const fdId = typeof sp.fd === "string" && /^[0-9a-f-]{36}$/i.test(sp.fd) ? sp.fd : null;
  const ctx = await registryCtx(db);
  const [fd] = fdId ? await db.select().from(frontDeskItems).where(eq(frontDeskItems.id, fdId)) : [];

  const d: InwardDefaults = fd
    ? {
        frontDeskItemId: fd.inwardItemId ? undefined : fd.id,
        fdNo: fd.fdNo,
        receivedDate: lagosDate(fd.receivedAt),
        receivedTime: hhmm(fd.receivedAt),
        mode: fd.mode,
        correspondenceTypeId: fd.correspondenceTypeId ?? "",
        sender: fd.sender,
        subject: fd.subject,
        deliveredBy: fd.deliveredBy ?? "",
        phone: fd.phone ?? "",
        volumes: fd.volumes?.toString() ?? "",
        remarks: fd.remarks ?? "",
      }
    : { receivedDate: lagosToday(), receivedTime: lagosTimeNow(), mode: "Hand delivery", correspondenceTypeId: "", sender: "", subject: "", deliveredBy: "", phone: "", volumes: "", remarks: "" };

  return (
    <>
      <PageHeader
        title="New inward"
        description="Register any incoming item and issue its OGSERC/ACK number from the shared series. The Registry does not route at registration: the Router routes it next."
        actions={
          <Link href="/inward" className="text-sm text-info hover:underline">
            Back to the Inward Register
          </Link>
        }
      />
      {fd?.inwardItemId ? (
        <Notice tone="warn" className="mb-4">
          {fd.fdNo} is already registered. A front desk item can be registered once only.
        </Notice>
      ) : null}
      {!fd ? (
        <Notice tone="info" className="mb-4">
          For a registration filing (REG-01, own-use, update, annual confirmation), use{" "}
          <Link href="/registry-intake" className="text-info hover:underline">
            Registry Intake
          </Link>
          : it also starts the Register or Own-Use entry under the same ACK.
        </Notice>
      ) : null}
      <InwardForm
        lists={{
          types: ctx.ref.types.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name, unit: ctx.ref.unit(t.defaultUnitId)?.name ?? null })),
          modes: ctx.ref.modes,
          senderCategories: ctx.ref.senderCategories,
          ackVia: ctx.ref.ackVia,
          lgas: ctx.ref.lgas,
        }}
        d={d}
      />
    </>
  );
}
