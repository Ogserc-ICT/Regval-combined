import type { Metadata } from "next";
import { Badge, Card, CardHeader, Table, Td, Th } from "@/components/ui";
import { db } from "@/server/db/client";
import { loadRef } from "@/server/services/reference";

export const metadata: Metadata = { title: "Forms, documents & checks" };

/** From the Order (Schedules 1–3) and EVAL-01: shown for reference, changed only by a code release. */
export default async function OrderPage() {
  const ref = await loadRef(db);
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title="Forms" description="REG-01A to REG-01K. Read-only: these follow the Order." />
        <Table>
          <thead>
            <tr>
              <Th>Form</Th>
              <Th>Category</Th>
              <Th>Title</Th>
              <Th>Para</Th>
              <Th className="text-right">Schedule 2 documents</Th>
            </tr>
          </thead>
          <tbody>
            {ref.forms.map((f) => (
              <tr key={f.form}>
                <Td className="font-mono text-xs">{f.form}</Td>
                <Td>{f.category}</Td>
                <Td>{f.title}</Td>
                <Td>{f.orderPara}</Td>
                <Td className="tabular text-right">{ref.formDocs.filter((d) => d.form === f.form).length}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card>
        <CardHeader title="Document conditions" description="A document whose condition is answered N on the submission is N/A." />
        <Table>
          <tbody>
            {ref.conditions.map((c) => (
              <tr key={c.key}>
                <Td className="font-mono text-xs">{c.key}</Td>
                <Td>{c.question}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card>
        <CardHeader title="Schedule 2 documents" description={`${ref.formDocs.length} rows across the forms.`} />
        <Table>
          <thead>
            <tr>
              <Th>Form</Th>
              <Th>#</Th>
              <Th>Document</Th>
              <Th>Required when</Th>
            </tr>
          </thead>
          <tbody>
            {ref.formDocs.map((d) => (
              <tr key={`${d.form}-${d.key}`}>
                <Td className="font-mono text-xs">{d.form}</Td>
                <Td className="tabular">{d.no}</Td>
                <Td>{d.document}</Td>
                <Td>{d.requiredWhen ? <Badge>{d.requiredWhen}</Badge> : "Always"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card>
        <CardHeader title="EVAL-01 checks" description={`${ref.checks.length} checks by stage.`} />
        <Table>
          <thead>
            <tr>
              <Th>Check</Th>
              <Th>Stage</Th>
              <Th>Text</Th>
              <Th>Rule</Th>
            </tr>
          </thead>
          <tbody>
            {ref.checks.map((c) => (
              <tr key={c.id}>
                <Td className="font-mono text-xs">{c.id}</Td>
                <Td className="text-xs text-muted">{c.stage}</Td>
                <Td>{c.text}</Td>
                <Td className="text-xs text-muted">{c.ruleText}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
