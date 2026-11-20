/**
 * Official receipt for a Finance-confirmed payment, in the CERT-01 style (frame, colours, serif).
 * Numbered by the payment's PAY number. Signed by the Head of Finance from Admin › Signatories,
 * with the e-signature of the staff account linked to that signatory; prints as a draft while
 * there is no confirmed Head of Finance, and marked REVERSED once the payment is reversed.
 */
import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import { formatNaira, nairaInWords } from "@/domain/money";
import type { ReceiptData } from "../services/letters";
import { CertificateFrame } from "./certificate";
import { COMMISSION, COMMISSION_NAME, d, GOLD, GREEN, GREY, SignatureImage, Watermark, wordmark } from "./common";

export const RECEIPT_FORM = "OGSERC Official Receipt  ·  Version 2026.1";
const MICRO = "OGSERC OFFICIAL RECEIPT OF PAYMENT 2026.1   ";
const serif = "DejaVu Serif";

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flexDirection: "row", borderBottomWidth: 0.7, borderBottomColor: GOLD, paddingVertical: 3 }}>
      <Text style={{ width: "38%", fontWeight: "bold", color: GREEN, fontSize: 9 }}>{k}</Text>
      <Text style={{ flex: 1, fontSize: 9 }}>{v}</Text>
    </View>
  );
}

export function PaymentReceipt({ x, qr }: { x: ReceiptData; qr: Buffer }) {
  const left: [string, string][] = [
    ["Being payment for", x.purpose],
    [x.referenceLabel, x.reference],
    ["Registration No.", x.registrationNo ?? "Not yet issued"],
    ["Date paid", d(x.dateReceived)],
  ];
  const right: [string, string][] = [
    ["Mode of payment", x.channel ?? "—"],
    ["RRR / bank reference", x.rrr ?? "—"],
    ["Confirmed by Finance", d(x.confirmedOn)],
    ["Verified by", x.confirmedBy ?? "—"],
  ];
  const holder = [x.cacNo ? `RC / Registration No. ${x.cacNo}` : null, x.payerAddress ? `of ${x.payerAddress}` : null].filter(Boolean).join(" ");
  const stamp = x.reversedReason ? "REVERSED" : x.draftReason ? "DRAFT – NOT ISSUED" : null;
  return (
    <Document title={`Receipt ${x.payNo}`} author={COMMISSION_NAME} subject="Official receipt of payment">
      <Page size="A4" orientation="landscape" style={{ fontFamily: serif, color: "#1a1a1a", paddingTop: 40, paddingBottom: 34, paddingHorizontal: 58, fontSize: 10 }}>
        <CertificateFrame micro={MICRO} />
        <View style={{ position: "absolute", top: 330, left: 0, right: 0, alignItems: "center", opacity: 0.06 }}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
          <Image src={wordmark()} style={{ width: 300, height: 78 }} />
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between", fontSize: 8.5, color: GREY }}>
          <Text style={{ fontWeight: "bold" }}>Receipt No.: {x.payNo}</Text>
          <Text>{RECEIPT_FORM}</Text>
        </View>

        <View style={{ alignItems: "center", marginTop: 8 }}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
          <Image src={wordmark()} style={{ width: 96, height: 25, marginBottom: 4 }} />
          <Text style={{ fontSize: 15, fontWeight: "bold", color: GREEN }}>{COMMISSION}</Text>
          <Text style={{ fontSize: 8, color: GREY, marginTop: 1 }}>
            {x.head.address} · {x.head.email}
          </Text>
          <Text style={{ fontSize: 27, fontWeight: "bold", color: GOLD, marginTop: 6 }}>OFFICIAL RECEIPT</Text>
          <Text style={{ fontSize: 9.5, color: GREEN }}>Payment received by the Commission and confirmed by Finance</Text>

          <Text style={{ fontStyle: "italic", fontSize: 11, marginTop: 12 }}>Received from</Text>
          <Text style={{ fontSize: 15, fontWeight: "bold", color: GREEN, marginTop: 3, textAlign: "center" }}>{x.payer.toUpperCase()}</Text>
          {holder ? <Text style={{ fontSize: 8.5, fontWeight: "bold", color: GREY, marginTop: 2, textAlign: "center" }}>{holder}</Text> : null}

          <Text style={{ fontStyle: "italic", fontSize: 11, marginTop: 9 }}>the sum of</Text>
          <Text style={{ fontSize: 20, fontWeight: "bold", fontFamily: "DejaVu Sans", marginTop: 2 }}>{formatNaira(x.amount)}</Text>
          <Text style={{ fontSize: 10, fontStyle: "italic", color: GREEN, marginTop: 2, textAlign: "center", paddingHorizontal: 60 }}>({nairaInWords(x.amount)})</Text>
        </View>

        <View style={{ flexDirection: "row", marginTop: 14, marginHorizontal: 40, gap: 24 }}>
          <View style={{ flex: 1 }}>
            {left.map(([k, v]) => (
              <Row key={k} k={k} v={v} />
            ))}
          </View>
          <View style={{ flex: 1 }}>
            {right.map(([k, v]) => (
              <Row key={k} k={k} v={v} />
            ))}
          </View>
        </View>

        {x.position ? (
          <Text style={{ textAlign: "center", fontSize: 8.5, color: GREY, marginTop: 9 }}>
            Account as at {d(x.printedOn)}: total due {formatNaira(x.position.totalDue)} · confirmed payments {formatNaira(x.position.paid)} · balance{" "}
            {formatNaira(x.position.balance)}
          </Text>
        ) : null}

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 14, paddingHorizontal: 30 }}>
          <View style={{ width: 230 }}>
            <SignatureImage image={x.signature} width={230} date={x.signature ? d(x.confirmedOn) : null} />
            <View style={{ height: 0.7, width: "100%", backgroundColor: "#555", marginBottom: 5, marginTop: 1 }} />
            <Text style={{ fontFamily: serif, fontWeight: "bold", fontSize: 10.5 }}>{x.headOfFinance?.name ?? "[Not set]"}</Text>
            <Text style={{ fontFamily: serif, fontSize: 9 }}>{x.headOfFinance?.designation ?? "Head of Finance"}</Text>
            <Text style={{ fontFamily: serif, fontSize: 8, color: GREY }}>For: {COMMISSION_NAME}</Text>
          </View>
          <View style={{ width: 74, height: 74, borderRadius: 37, borderWidth: 1, borderColor: GOLD, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 7.5, fontWeight: "bold", color: GOLD, textAlign: "center" }}>FINANCE{"\n"}STAMP</Text>
          </View>
          <View style={{ alignItems: "center", width: 84 }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
            <Image src={{ data: qr, format: "png" }} style={{ width: 54, height: 54 }} />
            <Text style={{ fontSize: 5.5, color: GREY, marginTop: 2, fontFamily: "DejaVu Sans" }}>Scan to verify (OGSERC staff)</Text>
          </View>
        </View>

        <Text style={{ fontSize: 7, fontStyle: "italic", color: GREY, textAlign: "center", marginTop: 14, lineHeight: 1.3 }}>
          This receipt acknowledges a payment to the Commission, confirmed by Finance against the bank / Remita record. It is evidence of payment only: it is not a
          certificate of registration, a licence or a permit. Quote the receipt number in any enquiry about this payment. Printed {d(x.printedOn)}.
        </Text>
        {stamp ? <Watermark text={stamp} landscape /> : null}
      </Page>
    </Document>
  );
}
