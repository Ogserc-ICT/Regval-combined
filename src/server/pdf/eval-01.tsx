/**
 * Registration evaluation form OGSERC/EVAL-01, internal (template: docs/templates/EVAL-01.pdf).
 */
import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { EvalCheckLine, EvaluationData } from "../services/letters";
import { COMMISSION_NAME, d, dash, Footer, GREEN, GREY, KvTable, Letterhead, RULE, s, SignatureBlock } from "./common";

function shown(c: EvalCheckLine): { text: string; color: string } {
  if (!c.applicable) return { text: "N/A (auto)", color: GREY };
  const auto = c.automatic ? " (auto)" : "";
  if (c.value === "Y") return { text: `Y${auto}`, color: GREY };
  if (c.value === "N") return { text: `N${auto}`, color: "#b42318" };
  if (c.value === "N/A") return { text: `N/A${auto}`, color: GREY };
  return { text: "pending", color: "#b26b00" };
}

function Checks({ title, checks }: { title: string; checks: EvalCheckLine[] }) {
  return (
    <View style={{ marginBottom: 6 }}>
      <Text style={{ fontSize: 9.5, fontWeight: "bold", color: GREEN, marginTop: 8, marginBottom: 3 }} minPresenceAhead={40}>
        {title}
      </Text>
      {checks.map((c) => {
        const v = shown(c);
        return (
          <View key={c.id} wrap={false} style={{ flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: RULE, paddingVertical: 2.5, fontSize: 8 }}>
            <Text style={{ width: 32, fontWeight: "bold", color: GREEN }}>{c.id}</Text>
            <Text style={{ flex: 1, paddingRight: 8 }}>{c.text}</Text>
            <Text style={{ width: 62, color: v.color }}>{v.text}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function Eval01({ x }: { x: EvaluationData }) {
  const footer = `EVAL-01 · ${x.ackNo} · printed ${d(x.printedOn)}`;
  const decision: [string, string][] = [
    ["Checks satisfied / failed / N/A / pending", `${x.counts.satisfied} / ${x.counts.failed} / ${x.counts.notApplicable} / ${x.counts.pending}`],
    ["Recommended outcome (automatic)", x.recommendedOutcome],
  ];
  if (x.flags.length) decision.push(["Data flags", `${x.flags.join("; ")}${x.flagOverrideReason ? `\nOverride reason: ${x.flagOverrideReason}` : ""}`]);
  decision.push(["Final decision", x.finalDecision ? `${x.finalDecision}${x.approvalDate ? ` · ${d(x.approvalDate)}` : ""}` : "—"]);
  decision.push(["Reasons / comments", dash([x.reasons, x.remarks].filter((v) => v?.trim()).join("\n"))]);
  decision.push(["Registration No.", dash(x.registrationNo)]);

  return (
    <Document title={`EVAL-01 ${x.ackNo}`} author={COMMISSION_NAME} subject="Registration evaluation form (internal)">
      <Page size="A4" style={s.page}>
        <Letterhead address={x.head.address} email={x.head.email} />
        <Text style={[s.title, { fontSize: 12.5 }]}>REGISTRATION EVALUATION FORM (OGSERC/EVAL-01) — INTERNAL</Text>
        <KvTable
          labelWidth="32%"
          rows={[
            ["Acknowledgement No.", x.ackNo],
            ["Registrant", x.registrant],
            ...(x.filingLabel.startsWith("New") ? [] : ([["Filing", x.filingLabel]] as [string, string][])),
            ["Category / activity", x.categoryActivity],
            ["Evaluating officer", dash(x.evaluator)],
            ["Reviewing supervisor", dash(x.supervisor)],
            ["Approving officer", dash(x.approver)],
            ["Date evaluation started", d(x.startedOn)],
          ]}
        />
        {x.stages.map((st) => (
          <Checks key={st.title} title={st.title} checks={st.checks} />
        ))}

        <View wrap={false}>
          <Text style={[s.h2, { marginTop: 12 }]}>RESULT AND DECISION</Text>
          <KvTable labelWidth="32%" rows={decision} />
        </View>

        <View wrap={false}>
          <SignatureBlock name={x.evaluator} caption="Evaluating officer — signature / date" width={240} />
          <SignatureBlock name={x.supervisor} caption="Reviewing supervisor — signature / date" width={240} />
          <SignatureBlock name={x.approver} caption="Approving officer — signature / date" width={240} />
        </View>

        <Checks title="POST-APPROVAL ACTIONS" checks={x.postApproval} />
        <Footer left={footer} />
      </Page>
    </Document>
  );
}
