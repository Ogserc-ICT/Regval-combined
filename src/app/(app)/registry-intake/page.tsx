import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { EntryBadge } from "@/components/registry-badges";
import { Card, CardHeader, Notice, PageHeader, Table, Td } from "@/components/ui";
import { lagosDate, lagosDateTime, lagosMinuteOfDay } from "@/domain/dates";
import { dateShort } from "@/lib/format";
import { can } from "@/server/auth/actor";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { frontDeskItems, inwardItems } from "@/server/db/schema";
import { registrationLists } from "@/server/services/reference";
import { awaitingRegisterEntry, listFrontDesk, registryCtx } from "@/server/services/registry/load";
import { lagosTimeNow, lagosToday } from "@/server/time";
import { IntakeForm, type IntakeDefaults } from "./intake-form";

export const metadata: Metadata = { title: "Registry intake" };

const hhmm = (d: Date) => {
  const m = lagosMinuteOfDay(d);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
/** Long lists scroll inside their card, so every item stays reachable without a very long page. */
function ScrollList({ children }: { children: ReactNode }) {
  return <div className="max-h-[28rem] overflow-y-auto overscroll-contain">{children}</div>;
}

const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);

export default async function RegistryIntakePage({ searchParams }: PageProps<"/registry-intake">) {
  const actor = await requirePermission("registers:read");
  const sp = await searchParams;
  const ctx = await registryCtx(db);
  const [fdList, awaiting, regLists] = await Promise.all([listFrontDesk(db, { awaitingOnly: true }, ctx), awaitingRegisterEntry(db, ctx), registrationLists(db)]);
  const canIntake = can(actor, "inward:write") && can(actor, "submission:save");

  const fdId = uuid(sp.fd);
  const ackId = uuid(sp.ack);
  const [fd] = fdId ? await db.select().from(frontDeskItems).where(eq(frontDeskItems.id, fdId)) : [];
  const [pulled] = ackId ? await db.select().from(inwardItems).where(eq(inwardItems.id, ackId)) : [];
  const blank: IntakeDefaults = {
    receivedDate: lagosToday(),
    receivedTime: lagosTimeNow(),
    mode: "Hand delivery",
    filingType: "NEW",
    registeredName: "",
    subject: "",
    phone: "",
    deliveredBy: "",
    volumes: "",
    remarks: "",
    cacNo: "",
    relatedNo: "",
    ackIssuedVia: "Printed slip",
  };
  let d = blank;
  if (fd && !fd.inwardItemId) {
    const filing = ctx.ref.type(fd.correspondenceTypeId)?.filingType;
    d = {
      ...blank,
      frontDeskItemId: fd.id,
      source: `Pulled from ${fd.fdNo}: the front-desk time is the receipt time.`,
      receivedDate: lagosDate(fd.receivedAt),
      receivedTime: hhmm(fd.receivedAt),
      mode: fd.mode,
      filingType: filing ?? "NEW",
      registeredName: fd.sender,
      subject: fd.subject,
      phone: fd.phone ?? "",
      deliveredBy: fd.deliveredBy ?? "",
      volumes: fd.volumes?.toString() ?? "",
      remarks: fd.remarks ?? "",
    };
  } else if (pulled) {
    d = {
      ...blank,
      inwardItemId: pulled.id,
      source: `Pulled from ${pulled.ackNo}: it keeps its ACK; no new number is issued.`,
      receivedDate: lagosDate(pulled.receivedAt),
      receivedTime: hhmm(pulled.receivedAt),
      mode: pulled.mode,
      filingType: ctx.ref.type(pulled.correspondenceTypeId)?.filingType ?? "NEW",
      registeredName: pulled.sender,
      subject: pulled.subject,
      phone: pulled.phone ?? "",
      deliveredBy: pulled.deliveredBy ?? "",
      volumes: pulled.volumes?.toString() ?? "",
      cacNo: pulled.cacNo ?? "",
      relatedNo: pulled.relatedOgsercNo ?? "",
      ackIssuedVia: pulled.ackIssuedVia ?? "Printed slip",
    };
  }
  const pulling = !!(d.frontDeskItemId || d.inwardItemId);

  return (
    <>
      <PageHeader
        title="Registry intake"
        description="Registration filings: new registrations, updates, annual confirmations and own-use notifications. One save issues the ACK, logs the Inward Register entry and starts the Register or Own-Use entry under the same ACK."
      />

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title={`At the front desk (${fdList.length})`} description="Pull one to fill the form." />
          <ScrollList>
          <Table>
            <tbody>
              {fdList.length === 0 ? (
                <tr>
                  <Td className="py-6 text-center text-muted">Nothing waiting.</Td>
                </tr>
              ) : (
                fdList.map((x) => (
                  <tr key={x.row.id}>
                    <Td className="whitespace-nowrap font-mono text-xs">{x.row.fdNo}</Td>
                    <Td>
                      <div>{x.row.sender}</div>
                      <div className="text-xs text-muted">
                        {x.row.subject} · {lagosDateTime(x.row.receivedAt)}
                      </div>
                    </Td>
                    <Td className="text-right text-xs">
                      {canIntake ? (
                        <Link href={`/registry-intake?fd=${x.row.id}`} className="text-info hover:underline">
                          Pull
                        </Link>
                      ) : null}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
          </ScrollList>
        </Card>
        <Card>
          <CardHeader title={`Acknowledged: Register entry not yet saved (${awaiting.length})`} description="Filings logged on New Inward, or started here and not completed." />
          <ScrollList>
          <Table>
            <tbody>
              {awaiting.length === 0 ? (
                <tr>
                  <Td className="py-6 text-center text-muted">None.</Td>
                </tr>
              ) : (
                awaiting.map((x) => (
                  <tr key={x.row.id}>
                    <Td className="whitespace-nowrap font-mono text-xs">
                      <Link href={`/inward/${x.row.id}`} className="text-info hover:underline">
                        {x.row.ackNo}
                      </Link>
                      <div className="mt-0.5 font-sans text-faint">{dateShort(x.row.deemedReceiptDate)}</div>
                    </Td>
                    <Td>
                      <div>{x.row.sender}</div>
                      <div className="mt-0.5">
                        <EntryBadge entry={x.entry} />
                      </div>
                    </Td>
                    <Td className="text-right text-xs">
                      {x.entryHref ? (
                        <Link href={x.entryHref} className="text-info hover:underline">
                          Complete
                        </Link>
                      ) : canIntake ? (
                        <Link href={`/registry-intake?ack=${x.row.id}`} className="text-info hover:underline">
                          Pull
                        </Link>
                      ) : null}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
          </ScrollList>
        </Card>
      </div>

      {fd?.inwardItemId ? (
        <Notice tone="warn" className="mb-4">
          {fd.fdNo} is already registered. A front desk item can be registered once only.
        </Notice>
      ) : null}
      {canIntake ? (
        <>
          {pulling ? (
            <p className="mb-3 text-sm">
              <Link href="/registry-intake" className="text-info hover:underline">
                Start blank instead
              </Link>
            </p>
          ) : null}
          <IntakeForm
            key={d.frontDeskItemId ?? d.inwardItemId ?? "blank"}
            d={d}
            lists={{
              modes: ctx.ref.modes,
              ackVia: ctx.ref.ackVia,
              lgas: regLists.lga,
              licenceStatuses: regLists.licenceStatus,
              activities: regLists.ref.activities.filter((a) => a.active !== false).map((a) => ({ code: a.code, name: a.name })),
              forms: regLists.ref.forms.map((f) => ({ form: f.form, title: f.title })),
            }}
          />
        </>
      ) : (
        <Notice tone="info">Only a Registry officer can take in registration filings.</Notice>
      )}
    </>
  );
}
