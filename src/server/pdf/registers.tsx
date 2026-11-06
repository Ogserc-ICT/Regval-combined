/**
 * Daily Register (SPEC §24.2) and Pending actions (SPEC §23) as PDFs.
 */
import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { eq } from "drizzle-orm";
import { lagosDate, lagosDateTime, lagosMinuteOfDay, longDate, type LocalDate } from "@/domain/dates";
import type { DbOrTx } from "../db/connect";
import { signatories } from "../db/schema";
import { listInward, listOutward, pendingActions, registryCtx } from "../services/registry/load";
import { serverNow } from "../time";
import { d, dash, Footer, Header, s, TRow } from "./common";

const hhmm = (t: Date) => {
  const m = lagosMinuteOfDay(t);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

async function secretaryName(db: DbOrTx) {
  const [sec] = await db.select({ name: signatories.name }).from(signatories).where(eq(signatories.role, "secretary")).limit(1);
  return sec?.name ?? "";
}

export async function dailyRegisterData(db: DbOrTx, date: LocalDate) {
  const ctx = await registryCtx(db);
  const [inward, outward, secretary] = await Promise.all([listInward(db, ctx), listOutward(db, ctx), secretaryName(db)]);
  // Received: by the date received, not the deemed date (Daily Register IN_rday).
  const received = inward.filter((x) => lagosDate(x.row.receivedAt) === date).sort((a, b) => a.row.receivedAt.getTime() - b.row.receivedAt.getTime());
  const dispatched = outward.filter((x) => x.row.dispatchedOn === date).sort((a, b) => (a.row.outNo < b.row.outNo ? -1 : 1));
  return { date, address: ctx.settings.registryAddress, received, dispatched, secretary };
}

export async function renderDailyRegister(db: DbOrTx, date: LocalDate, officer: string): Promise<Buffer> {
  const x = await dailyRegisterData(db, date);
  const rw = ["3%", "16%", "5%", "8%", "13%", "15%", "16%", "9%", "8%", "7%"];
  const dw = ["3%", "16%", "8%", "8%", "13%", "14%", "15%", "8%", "8%", "7%"];
  return renderToBuffer(
    <Document title={`Daily Register ${date}`} author="OGSERC Registry">
      <Page size="A4" orientation="landscape" style={s.pageLandscape}>
        <Header address={x.address} />
        <Text style={s.title}>DAILY REGISTER: {longDate(date).toUpperCase()}</Text>
        <Text style={s.subtitle}>
          Items received: {x.received.length} · Items dispatched: {x.dispatched.length}
        </Text>
        <Text style={s.h2}>RECEIVED</Text>
        <TRow header widths={rw} cells={["#", "Inward No.", "Time", "Mode", "Type", "Sender", "Subject", "Deemed receipt", "Received by", "Forward to"]} />
        {x.received.length === 0 ? <Text style={{ padding: 4, color: "#666" }}>Nothing received.</Text> : null}
        {x.received.map((r, i) => (
          <TRow
            key={r.row.id}
            widths={rw}
            cells={[String(i + 1), r.row.ackNo, hhmm(r.row.receivedAt), r.row.mode, dash(r.typeName), r.row.sender, r.row.subject, d(r.row.deemedReceiptDate), dash(r.receivedByName), dash(r.unit?.name)]}
          />
        ))}
        <Text style={s.h2}>DISPATCHED</Text>
        <TRow header widths={dw} cells={["#", "Outward No.", "Doc. date", "Mode", "Type", "Addressee", "Subject", "Signed by", "Dispatched by", "Tracking"]} />
        {x.dispatched.length === 0 ? <Text style={{ padding: 4, color: "#666" }}>Nothing dispatched.</Text> : null}
        {x.dispatched.map((o, i) => (
          <TRow
            key={o.row.id}
            widths={dw}
            cells={[String(i + 1), o.row.outNo, d(o.row.documentDate), o.row.dispatchMode, o.row.documentType, o.row.addressee, o.row.subject, o.row.signatoryName, dash(o.dispatchedByName), dash(o.row.trackingRef)]}
          />
        ))}
        <View style={{ marginTop: 22, flexDirection: "row", justifyContent: "space-between" }} wrap={false}>
          <Text>Registry officer on duty: {officer}     Signature: ______________</Text>
          <Text>Secretary to the Commission: {x.secretary || "______________"}     Signature: ______________</Text>
        </View>
        <Footer left={`Printed ${lagosDateTime(serverNow())} by ${officer}`} />
      </Page>
    </Document>,
  );
}

export async function renderPending(db: DbOrTx, unitId: string | null, officer: string): Promise<Buffer> {
  const ctx = await registryCtx(db);
  const { items, totals } = await pendingActions(db, unitId, ctx);
  const unitName = ctx.ref.unit(unitId)?.name ?? "All units";
  const w = ["14%", "7%", "15%", "17%", "11%", "11%", "7%", "6%", "7%", "5%"];
  return renderToBuffer(
    <Document title={`Pending actions - ${unitName}`} author="OGSERC Registry">
      <Page size="A4" orientation="landscape" style={s.pageLandscape}>
        <Header address={ctx.settings.registryAddress} />
        <Text style={s.title}>PENDING ACTIONS: {unitName.toUpperCase()}</Text>
        <Text style={s.subtitle}>
          As at {longDate(ctx.today)} · Pending {totals.pending} · Overdue {totals.overdue} · Awaiting routing {totals.awaitingRouting} · Awaiting forwarding {totals.awaitingForwarding}
        </Text>
        <TRow header widths={w} cells={["Inward No.", "Deemed", "Sender", "Subject", "Type", "Unit", "Officer", "Action", "Due", "Days"]} />
        {items.length === 0 ? <Text style={{ padding: 4, color: "#666" }}>Nothing pending.</Text> : null}
        {items.map((x) => (
          <TRow
            key={x.row.id}
            widths={w}
            cells={[
              `${x.row.ackNo}\n${x.a.status}`,
              d(x.row.deemedReceiptDate),
              x.row.sender,
              x.row.subject,
              dash(x.typeName),
              dash(x.unit?.name),
              dash(x.row.actionOfficer),
              `${dash(x.row.actionRequired)}${x.row.priority && x.row.priority !== "Normal" ? ` (${x.row.priority})` : ""}`,
              d(x.a.responseDue),
              String(x.a.workingDaysOpen),
            ]}
          />
        ))}
        <Footer left={`Printed ${lagosDateTime(serverNow())} by ${officer}`} />
      </Page>
    </Document>,
  );
}
