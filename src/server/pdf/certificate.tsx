/**
 * Certificate of registration OGSERC/CERT-01, para 13(5) (template: docs/templates/CERT-01.pdf).
 * Signed by the Chairman / CEO and the Commissioner from Admin › Signatories; prints as a
 * draft while either is missing or unconfirmed (Q28e). The QR code opens the registration
 * in this app, for signed-in staff (Q28f). The seal is stamped by hand in the circle (Q28g).
 */
import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import type { CertificateData, Signer } from "../services/letters";
import { COMMISSION, COMMISSION_NAME, dayOfMonthYear, GOLD, GREEN, GREY, Watermark, wordmark } from "./common";

export const CERT_FORM = "Form OGSERC/CERT-01  ·  Version 2026.1";
const MICRO = "OGSERC CERTIFICATE OF REGISTRATION CERT-01 2026.1   ";
const serif = "DejaVu Serif";

function Micro({ top }: { top: boolean }) {
  return (
    <Text style={{ position: "absolute", left: 30, right: 30, [top ? "top" : "bottom"]: 25, fontSize: 3.2, color: GREEN, opacity: 0.7, fontFamily: "DejaVu Sans" }}>
      {MICRO.repeat(8).trim()}
    </Text>
  );
}

function Corner({ style }: { style: Record<string, number> }) {
  return <View style={{ position: "absolute", width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: GOLD, backgroundColor: "#f6efd9", ...style }} />;
}

function Signature({ who, role }: { who: Signer | null; role: string }) {
  return (
    <View style={{ width: 205, alignItems: "center" }}>
      <View style={{ height: 0.7, width: "100%", backgroundColor: "#555", marginBottom: 5 }} />
      <Text style={{ fontFamily: serif, fontWeight: "bold", fontSize: 10.5 }}>{who?.name ?? "[Not set]"}</Text>
      <Text style={{ fontFamily: serif, fontSize: 9 }}>{who?.designation ?? role}</Text>
      <Text style={{ fontFamily: serif, fontSize: 8, color: GREY }}>{COMMISSION_NAME}</Text>
    </View>
  );
}

export function Certificate({ x, qr }: { x: CertificateData; qr: Buffer }) {
  const rows: [string, string][] = [
    ["Registration category (Schedule 3)", x.category],
    ["Primary activity", x.primaryActivity],
    ["Other activities", x.otherActivities.join("; ") || "None"],
    ["Principal LGA and service area", x.serviceArea],
    ["Licence / permit held", x.licence],
  ];
  const holder = [x.cacNo ? `RC / Registration No. ${x.cacNo}` : null, x.address ? `of ${x.address}` : null].filter(Boolean).join(" ");
  const stamp = x.voidReason ? x.voidReason.toUpperCase() : x.draftReason ? "DRAFT – NOT ISSUED" : null;
  return (
    <Document title={`Certificate ${x.registrationNo}`} author={COMMISSION_NAME} subject="Certificate of registration (para 13(5))">
      <Page size="A4" orientation="landscape" style={{ fontFamily: serif, color: "#1a1a1a", paddingTop: 40, paddingBottom: 34, paddingHorizontal: 58, fontSize: 10 }}>
        {/* Frame */}
        <View fixed style={{ position: "absolute", top: 12, left: 12, right: 12, bottom: 12, borderWidth: 5, borderColor: GOLD }} />
        <View fixed style={{ position: "absolute", top: 20, left: 20, right: 20, bottom: 20, borderWidth: 0.8, borderColor: GREEN }} />
        <Corner style={{ top: 5, left: 5 }} />
        <Corner style={{ top: 5, right: 5 }} />
        <Corner style={{ bottom: 5, left: 5 }} />
        <Corner style={{ bottom: 5, right: 5 }} />
        <Micro top />
        <Micro top={false} />
        {/* Faint crest behind the particulars */}
        <View style={{ position: "absolute", top: 230, left: 0, right: 0, alignItems: "center", opacity: 0.06 }}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
          <Image src={wordmark()} style={{ width: 300, height: 78 }} />
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between", fontSize: 8.5, color: GREY }}>
          <Text style={{ fontWeight: "bold" }}>Certificate Serial No.: {x.serial}</Text>
          <Text>{CERT_FORM}</Text>
        </View>

        <View style={{ alignItems: "center", marginTop: 8 }}>
          <Text style={{ fontSize: 15, fontWeight: "bold", color: GREEN }}>{COMMISSION}</Text>
          <Text style={{ fontSize: 8.5, color: GREY, marginTop: 1 }}>Established under the Ogun State Power Law, 2024</Text>
          <Text style={{ fontSize: 29, fontWeight: "bold", color: GOLD, marginTop: 6 }}>CERTIFICATE OF REGISTRATION</Text>
          <Text style={{ fontSize: 9.5, color: GREEN }}>Register of Licensees and Electricity Operators in Ogun State</Text>
          <Text style={{ marginTop: 8 }}>
            <Text style={{ fontSize: 12, color: GREY }}>Registration No.  </Text>
            <Text style={{ fontSize: 14, fontWeight: "bold", fontFamily: "DejaVu Sans" }}>{x.registrationNo}</Text>
          </Text>
          <Text style={{ fontStyle: "italic", fontSize: 11.5, marginTop: 6 }}>This is to certify that</Text>
          <Text style={{ fontSize: 15, fontWeight: "bold", color: GREEN, marginTop: 4, textAlign: "center" }}>{x.registrant.toUpperCase()}</Text>
          {holder ? <Text style={{ fontSize: 8.5, fontWeight: "bold", color: GREY, marginTop: 3, textAlign: "center" }}>{holder}</Text> : null}
          <Text style={{ fontSize: 9.5, marginTop: 8, textAlign: "center", lineHeight: 1.35, paddingHorizontal: 40 }}>
            has been entered in the Register of Licensees and Electricity Operators maintained by the Commission under paragraph 15 of the OGSERC Order on
            Commencement of Operations and Registration of Licensees and Electricity Operators, 2026, with the following particulars:
          </Text>
        </View>

        <View style={{ marginTop: 8, marginHorizontal: 92 }}>
          {rows.map(([k, v]) => (
            <View key={k} style={{ flexDirection: "row", borderBottomWidth: 0.7, borderBottomColor: GOLD, paddingVertical: 3 }}>
              <Text style={{ width: "34%", fontWeight: "bold", color: GREEN, fontSize: 9 }}>{k}</Text>
              <Text style={{ flex: 1, fontSize: 9 }}>{v}</Text>
            </View>
          ))}
        </View>

        <Text style={{ textAlign: "center", fontWeight: "bold", fontSize: 10.5, marginTop: 12 }}>Issued at Abeokuta this {dayOfMonthYear(x.issueDate)}</Text>

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 16, paddingHorizontal: 30 }}>
          <Signature who={x.chairman} role="Chairman / Chief Executive Officer" />
          <View style={{ width: 74, height: 74, borderRadius: 37, borderWidth: 1, borderColor: GOLD, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 7.5, fontWeight: "bold", color: GOLD, textAlign: "center" }}>COMMISSION{"\n"}SEAL</Text>
          </View>
          <Signature who={x.commissioner} role="Commissioner" />
          <View style={{ alignItems: "center", width: 84 }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
            <Image src={{ data: qr, format: "png" }} style={{ width: 54, height: 54 }} />
            <Text style={{ fontSize: 5.5, color: GREY, marginTop: 2, fontFamily: "DejaVu Sans" }}>Scan to verify (OGSERC staff)</Text>
          </View>
        </View>

        <Text style={{ fontSize: 7, fontStyle: "italic", color: GREY, textAlign: "center", marginTop: 14, lineHeight: 1.3 }}>
          This certificate is evidence of registration only. It is not a licence or permit and does not authorize any activity that requires one (para 13(5)). It
          remains valid until cancelled under paragraph 14, subject to annual confirmation by 31 January each year (para 16(2)). The registration number must be
          quoted on all correspondence and filings with the Commission and on customer bills issued in Ogun State (para 13(6)). Any material change must be
          notified within fourteen (14) days (para 16(1)).
        </Text>
        {stamp ? <Watermark text={stamp} landscape /> : null}
      </Page>
    </Document>
  );
}
