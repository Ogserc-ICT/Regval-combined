import { ActionForm } from "@/components/action-form";
import { DocBadge } from "@/components/badges";
import { Card, CardHeader, Select, Table, Td, Th } from "@/components/ui";
import { can, type Actor } from "@/server/auth/actor";
import type { LoadedSubmission } from "@/server/services/submissions/load";
import { setDocumentAction } from "../actions";

export function DocumentsTab({ l, actor }: { l: LoadedSubmission; actor: Actor }) {
  const d = l.a.documents;
  const editable = can(actor, "documents:update") && !l.a.closed;
  return (
    <Card>
      <CardHeader
        title={d.form ? `Schedule 2 documents · ${d.form}` : "Schedule 2 documents"}
        description={
          d.listed
            ? `${d.received} received · ${d.items.filter((i) => i.value === "N/A").length} N/A · ${d.outstanding} outstanding · ${d.pending} pending${d.complete ? " · complete" : ""}`
            : "No list yet: the form filed or category is not known."
        }
      />
      <Table>
        <thead>
          <tr>
            <Th className="w-10">#</Th>
            <Th>Document</Th>
            <Th>Status</Th>
            <Th className="w-64">{editable ? "Record" : ""}</Th>
          </tr>
        </thead>
        <tbody>
          {d.items.map((i, n) => (
            <tr key={i.key}>
              <Td className="text-faint">{n + 1}</Td>
              <Td>
                <div>{i.document}</div>
                {i.note ? <div className="mt-0.5 text-xs text-faint">{i.note}</div> : null}
                {i.form !== d.form ? <div className="mt-0.5 text-xs text-faint">From {i.form} (other activity)</div> : null}
              </Td>
              <Td>
                <DocBadge value={i.value} />
              </Td>
              <Td>
                {editable && !i.automatic ? (
                  <ActionForm action={setDocumentAction} submitLabel="Save" size="sm" variant="secondary" inline hidden={{ id: l.row.id, key: i.key }}>
                    <Select name="value" defaultValue={i.entered} className="h-8 w-36" aria-label={`Status of ${i.document}`}>
                      <option value="">Pending</option>
                      <option value="Y">Y: received</option>
                      <option value="N">N: outstanding</option>
                      <option value="N/A">N/A</option>
                    </Select>
                  </ActionForm>
                ) : i.automatic ? (
                  <span className="text-xs text-faint">Automatic</span>
                ) : null}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
