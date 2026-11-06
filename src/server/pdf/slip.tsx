/**
 * Acknowledgement slip (SPEC §24.1; Acknowledgement Slip sheet): A4, two
 * copies (registrant's / sender's and Registry), with a cut line.
 */
import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { eq } from "drizzle-orm";
import type { DbOrTx } from "../db/connect";
import { signatories } from "../db/schema";
import { loadInward, registryCtx } from "../services/registry/load";
import { d, dash, dt, Header, ngn, s } from "./common";

/** Acknowledgement Slip B22, verbatim. */
export const SLIP_FOOTER =
  "This slip acknowledges receipt only. It is not a registration, licence or permit (para 11(3)). The Commission will decide a complete registration submission within thirty (30) days (para 13(1)) and will notify you of any missing information. Quote the acknowledgement number on all correspondence. Where you file electronically after 5:00 p.m. or on a non-working day, your filing is received on the next working day (para 10(3)).";

export const PARA_10_3 = "Paragraph 10(3), OGSERC Order on Commencement of Operations and Registration of Licensees and Electricity Operators, 2026";
export const GENERAL = "Correspondence received by the Registry of the Ogun State Electricity Regulatory Commission";

export type SlipData = {
  ackNo: string;
  address: string;
  para103: boolean;
  receivedAt: Date;
  deemed: string;
  mode: string;
  orderRef: string | null;
  type: string | null;
  related: string | null;
  sender: string;
  senderRef: string | null;
  subject: string;
  deliveredBy: string | null;
  volumes: number | null;
  schedule2: number | null;
  feeEvidence: boolean | null;
  paymentRef: string | null;
  amount: number | null;
  receivedBy: string | null;
  forwardedTo: string | null;
  secretary: string | null;
};

export async function slipData(db: DbOrTx, inwardId: string): Promise<SlipData> {
  const ctx = await registryCtx(db);
  const v = await loadInward(db, inwardId, ctx);
  const t = ctx.ref.type(v.row.correspondenceTypeId);
  const [sec] = await db.select({ name: signatories.name }).from(signatories).where(eq(signatories.role, "secretary")).limit(1);
  return {
    ackNo: v.row.ackNo,
    address: ctx.settings.registryAddress,
    para103: !!t?.para103Wording,
    receivedAt: v.row.receivedAt,
    deemed: v.row.deemedReceiptDate,
    mode: v.row.mode,
    orderRef: t?.orderRef ?? null,
    type: t?.name ?? null,
    related: v.row.relatedOgsercNo,
    sender: v.row.sender,
    senderRef: v.row.senderRef,
    subject: v.row.subject,
    deliveredBy: v.row.deliveredBy,
    volumes: v.row.volumes,
    schedule2: v.row.schedule2Count,
    feeEvidence: v.row.feeEvidence,
    paymentRef: v.row.paymentReference,
    amount: v.row.amountShownKobo,
    receivedBy: v.receivedByName,
    forwardedTo: v.unit?.name ?? null,
    secretary: sec?.name ?? null,
  };
}

function Pair({ l1, v1, l2, v2 }: { l1: string; v1: string; l2?: string; v2?: string }) {
  return (
    <View style={s.row} wrap={false}>
      <Text style={s.label}>{l1}</Text>
      <Text style={l2 ? s.value : s.wide}>{v1}</Text>
      {l2 ? <Text style={s.label}>{l2}</Text> : null}
      {l2 ? <Text style={s.value}>{v2}</Text> : null}
    </View>
  );
}

function Copy({ x, copy }: { x: SlipData; copy: string }) {
  const yn = x.feeEvidence === true ? "Y" : x.feeEvidence === false ? "N" : "-";
  return (
    <View>
      <Header address={x.address} copy={copy} />
      <Text style={s.title}>ACKNOWLEDGEMENT OF RECEIPT</Text>
      <Text style={s.subtitle}>{x.para103 ? PARA_10_3 : GENERAL}</Text>
      <Pair l1="Inward / Ack. No." v1={x.ackNo} />
      <Pair l1="Date & time received" v1={dt(x.receivedAt)} l2="Deemed receipt date" v2={d(x.deemed)} />
      <Pair l1="Mode of receipt" v1={dash(x.mode)} l2="Order reference" v2={dash(x.orderRef)} />
      <Pair l1="Type" v1={dash(x.type)} l2="Related OGSERC No." v2={dash(x.related)} />
      <Pair l1="Sender" v1={dash(x.sender)} l2="Sender's ref. no." v2={dash(x.senderRef)} />
      <Pair l1="Subject" v1={dash(x.subject)} />
      <Pair l1="Delivered / sent by" v1={dash(x.deliveredBy)} l2="Files / volumes" v2={dash(x.volumes)} />
      <Pair l1="Schedule 2 documents" v1={dash(x.schedule2)} l2="Fee evidence attached" v2={yn} />
      <Pair l1="Payment reference" v1={dash(x.paymentRef)} l2="Amount shown" v2={ngn(x.amount)} />
      <Pair l1="Received by" v1={dash(x.receivedBy)} l2="Forwarded to" v2={dash(x.forwardedTo)} />
      <Text style={[s.small, { marginTop: 8 }]}>{SLIP_FOOTER}</Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 16 }}>
        <Text>Registry officer&apos;s signature: ______________________</Text>
        <Text>Official stamp:</Text>
      </View>
      <Text style={{ marginTop: 6 }}>For the Secretary to the Commission{x.secretary ? ` (${x.secretary})` : ""}</Text>
    </View>
  );
}

export function SlipDocument({ x }: { x: SlipData }) {
  return (
    <Document title={`Acknowledgement ${x.ackNo}`} author="OGSERC Registry">
      <Page size="A4" style={s.page}>
        <Copy x={x} copy="REGISTRANT'S / SENDER'S COPY" />
        <Text style={{ textAlign: "center", color: "#888", marginVertical: 14, fontSize: 8 }}>- - - - - - - - - - - - - - - - - - - - cut here - - - - - - - - - - - - - - - - - - - -</Text>
        <Copy x={x} copy="REGISTRY COPY" />
      </Page>
    </Document>
  );
}

export async function renderSlip(db: DbOrTx, inwardId: string): Promise<{ buffer: Buffer; ackNo: string }> {
  const x = await slipData(db, inwardId);
  return { buffer: await renderToBuffer(<SlipDocument x={x} />), ackNo: x.ackNo };
}

/** A file name for the slip, e.g. "Acknowledgement-OGSERC-ACK-2026-00001.pdf". */
export const slipFileName = (ackNo: string) => `Acknowledgement-${ackNo.replace(/\//g, "-")}.pdf`;
