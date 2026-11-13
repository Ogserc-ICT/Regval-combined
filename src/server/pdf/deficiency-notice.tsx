/**
 * Notice of deficiency, para 13(1)(b) (template: docs/templates/deficiency-notice.pdf).
 * Prints what was frozen when the notice was issued. Until the date it was sent is
 * recorded, it prints as a draft dated today.
 */
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { formatNaira } from "@/domain/money";
import type { DeficiencyData } from "../services/letters";
import { bullet, COMMISSION_NAME, ORDER_NO, d, dash, Footer, Letterhead, List, RefLines, s, SignatureBlock, Watermark } from "./common";

export function DeficiencyNotice({ x }: { x: DeficiencyData }) {
  const c = x.contents;
  const owes = c.balance > 0;
  return (
    <Document title={`Deficiency notice ${x.defNo}`} author={COMMISSION_NAME} subject="Notice of deficiency (para 13(1)(b))">
      <Page size="A4" style={s.page}>
        <Letterhead address={x.head.address} email={x.head.email} />
        <Text style={s.title}>NOTICE OF DEFICIENCY</Text>
        <RefLines
          rows={[
            ["Our ref.", x.defNo],
            ["Date of notice", d(x.date)],
            ["To", x.to],
            ["Address", dash(x.address)],
            ["Attention", dash(x.attention)],
          ]}
        />
        <Text style={s.re}>RE: NOTICE OF DEFICIENCY IN REGISTRATION SUBMISSION — {x.ackNo}</Text>
        <Text style={s.p}>
          The Commission acknowledges receipt of your submission dated {d(x.submissionDate)} for registration under Order No. {ORDER_NO}
          {c.category ? ` (Category ${c.category})` : ""}. On review, the submission is incomplete for the reasons set out below.
        </Text>

        {c.documents.length ? (
          <>
            <Text style={s.h2}>Outstanding documents (Schedule 2)</Text>
            <List items={c.documents} marker={bullet} />
          </>
        ) : null}
        {c.checks.length ? (
          <>
            <Text style={s.h2}>Other deficiencies found in evaluation</Text>
            <List items={c.checks} marker={bullet} />
          </>
        ) : null}
        {c.remarks ? <Text style={s.p}>Evaluator&apos;s remarks: {c.remarks}</Text> : null}

        {c.totalDue > 0 ? (
          <>
            <Text style={s.h2}>Fees and charges</Text>
            <Text style={s.p}>
              Total due {formatNaira(c.totalDue)}; paid {formatNaira(c.paid)}; balance {formatNaira(c.balance)}
            </Text>
          </>
        ) : null}

        <Text style={[s.p, s.bold, { marginTop: 6 }]}>
          Under paragraph 13(1)(b) of the Order, you are required to supply the outstanding information{owes ? " and payment" : ""} by {d(x.responseDue)}. If{" "}
          {owes ? "they are" : "it is"} not received by that date, your submission will lapse and you will be treated as not registered (paragraph 13(2)), without
          prejudice to your right to submit a fresh application.
        </Text>
        <Text style={s.p}>Please quote the acknowledgement number above in all correspondence.</Text>

        <View wrap={false}>
          <SignatureBlock name={c.issuedByName} caption={`For: ${COMMISSION_NAME}`} />
        </View>
        <Footer left={x.defNo} />
        {x.draft ? <Watermark text="DRAFT – NOT ISSUED" /> : null}
      </Page>
    </Document>
  );
}
