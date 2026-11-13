/**
 * Acknowledgement of registration submission, para 10(3) (template: docs/templates/acknowledgement-letter.pdf).
 */
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { formatNaira } from "@/domain/money";
import { lagosDateTime } from "@/domain/dates";
import type { AcknowledgementData } from "../services/letters";
import { COMMISSION_NAME, ORDER_NO, d, dash, Footer, KvTable, Letterhead, lettered, List, numbered, RefLines, s } from "./common";

const CHANNEL: Record<string, string> = { "By hand": "by hand", Email: "by email", "Online portal": "through the online portal" };

function received(x: AcknowledgementData): string {
  const how = CHANNEL[x.channel] ?? `(${x.channel})`;
  if (x.deemedReceiptDate === x.dateSubmitted) return `${d(x.deemedReceiptDate)} ${how}`;
  return `${d(x.deemedReceiptDate)} (received ${lagosDateTime(x.receivedAt)} ${how}; deemed received on the next working day)`;
}

export function AcknowledgementLetter({ x }: { x: AcknowledgementData }) {
  const isNew = x.filing === "NEW";
  const what = isNew
    ? `your submission for registration under Order No. ${ORDER_NO}`
    : x.filing === "UPDATE"
      ? `your notification of a material change to registration ${dash(x.linkedRegistrationNo)} under paragraph 16(1) of Order No. ${ORDER_NO}`
      : `your annual confirmation of registration ${dash(x.linkedRegistrationNo)} under paragraph 16(2) of Order No. ${ORDER_NO}`;
  const title = isNew ? "ACKNOWLEDGEMENT OF REGISTRATION SUBMISSION" : `ACKNOWLEDGEMENT OF ${x.filing === "UPDATE" ? "NOTIFICATION OF CHANGE" : "ANNUAL CONFIRMATION"}`;

  const rows: [string, string][] = [["Date received (para 10(3))", received(x)]];
  if (!isNew) rows.push(["Filing", x.filingLabel]);
  rows.push(["Activities declared", x.activities.join("; ") || "—"]);
  rows.push(["Installed capacity", x.capacityMw === null ? "Not stated" : `${x.capacityMw.toFixed(2)} MW`]);
  if (x.category) rows.push([`Schedule 3 category${x.categoryConfirmed ? "" : " (provisional)"}`, `Category ${x.category}${x.categoryConfirmed ? "" : "\n(subject to evaluation)"}`]);
  if (x.fee > 0 || isNew) rows.push(["Registration fee for the category", formatNaira(x.fee)]);
  if (x.waiver > 0) rows.push(["Waiver approved (para 17(3))", formatNaira(x.waiver)]);
  if (x.lateCharge > 0) rows.push(["Late charge (para 19)", `${formatNaira(x.lateCharge)} (${x.daysLate} day${x.daysLate === 1 ? "" : "s"} late)`]);
  if (x.totalDue > 0) rows.push(["Payment received to date", `${formatNaira(x.paid)}; balance ${formatNaira(x.balance)}`]);
  if (isNew) {
    const onTime = x.daysLate === 0 ? "Yes" : `No: ${x.daysLate} day${x.daysLate === 1 ? "" : "s"} after ${d(x.deadline)}`;
    rows.push([x.newOperator ? "Filed in time before starting operations (para 11(2))?" : "Filed within the Registration Period?", onTime]);
  }

  const next = isNew
    ? [
        "Evaluation. The Commission will now evaluate your submission. It is complete when it includes the information and documents required by paragraph 12 and evidence of payment of the registration fee (paragraph 13(1)).",
        `Decision within ${x.days.determination} days. Within ${period(x.days.determination)} days of receiving a complete submission, the Commission will either issue a Registration Certificate bearing a unique OGSERC registration number (paragraph 13(1)(a)) or notify you in writing of any missing or deficient information (paragraph 13(1)(b)).`,
        `Deficiency notice. If you receive one, you must supply the information within ${period(x.days.deficiency)} days, or your submission will lapse and you will be treated as not registered (paragraph 13(2)).`,
        `Provisional registration. If the Commission has not acted within ${period(x.days.determination)} days of receiving your complete submission, you are provisionally registered from the next day, and the acknowledgement number above serves as your registration number (paragraph 13(4)).`,
        "Verification. Authorized officers may inspect your installations, meters and records on not less than forty-eight (48) hours' notice (paragraph 22).",
        `Refusal only on stated grounds, after written reasons and ${period(x.days.showCause)} days to respond (paragraphs 13(3) and 20).`,
      ]
    : [
        "Review. The Commission will review the information you have filed against your entry in the Register.",
        "Decision. Once accepted, the Register is updated; where the change affects the particulars on your certificate, a revised certificate is issued.",
        "Verification. Authorized officers may inspect your installations, meters and records on not less than forty-eight (48) hours' notice (paragraph 22).",
      ];

  const duties = [
    "Registration is not a licence and does not authorize any activity that requires one (paragraph 11(3)).",
    "Notify the Commission in writing within fourteen (14) days of any material change in the information submitted (paragraph 16(1)).",
    "Information claimed as commercially sensitive is treated as confidential until the Commission decides the claim (paragraph 15(3)); personal data is processed under the Nigeria Data Protection Act, 2023 (paragraph 15(4)).",
  ];
  if (x.unlicensed && x.licenceApplicationDue) {
    duties.push(
      `As you are not licensed, you must apply for the appropriate licence or permit by ${d(x.licenceApplicationDue)}. Until it is decided, maintain safe and continuous supply, connect no new customers and extend no network without written approval, and charge no tariff above that in force on the Effective Date (paragraph 18).`,
    );
  }

  return (
    <Document title={`Acknowledgement ${x.ackNo}`} author={COMMISSION_NAME} subject="Acknowledgement of registration submission (para 10(3))">
      <Page size="A4" style={s.page}>
        <Letterhead address={x.head.address} email={x.head.email} />
        <Text style={s.title}>{title}</Text>
        <RefLines
          rows={[
            ["Our ref.", x.ackNo],
            ["Date", d(x.date)],
            ["To", x.to],
            ["Address", dash(x.address)],
            ["Attention", dash(x.attention)],
          ]}
        />
        <Text style={s.re}>
          RE: {title} — {x.ackNo}
        </Text>
        <Text style={s.p}>
          The Ogun State Electricity Regulatory Commission acknowledges receipt of {what}. This acknowledgement is issued under paragraph 10(3) of the Order. Your
          submission has been entered in the Register under the acknowledgement number above. Please quote it in all correspondence and as the reference for any
          payment.
        </Text>

        <Text style={s.h2}>1. Your submission</Text>
        <KvTable rows={rows} />

        <Text style={s.h2}>2. Documents received (Schedule 2) — a record of receipt, not yet evaluated</Text>
        <Text style={s.p}>Received: {x.received.length ? x.received.join("; ") : "none recorded yet."}</Text>
        {x.pending.length ? (
          <Text style={s.p}>
            Pending: {x.pending.join("; ")} — please supply these, or state the reason and propose a completion date (para 12(4)).
          </Text>
        ) : (
          <Text style={s.p}>Pending: none.</Text>
        )}

        <Text style={s.h2}>3. What happens next</Text>
        <List items={next} marker={numbered} />

        <Text style={s.h2}>4. Your obligations in the meantime</Text>
        <List items={duties} marker={lettered} />

        <View wrap={false}>
          <Text style={[s.bold, { marginTop: 8 }]}>This acknowledgement is not a Registration Certificate.</Text>
          <Text style={{ marginTop: 10 }}>Yours faithfully,</Text>
          <View style={{ marginTop: 26, width: 190, height: 0.6, backgroundColor: "#777" }} />
          <Text style={[s.bold, { marginTop: 4 }]}>{x.signedBy}</Text>
          <Text style={s.small}>For: {COMMISSION_NAME}</Text>
        </View>
        <Footer left={x.ackNo} />
      </Page>
    </Document>
  );
}

const WORDS: Record<number, string> = {
  7: "seven", 10: "ten", 14: "fourteen", 15: "fifteen", 21: "twenty-one", 28: "twenty-eight", 30: "thirty", 45: "forty-five", 60: "sixty", 90: "ninety",
};
/** "thirty (30)", as the Order writes its periods; digits alone for a number with no word here. */
export function period(n: number): string {
  const w = WORDS[n];
  return w ? `${w} (${n})` : String(n);
}
