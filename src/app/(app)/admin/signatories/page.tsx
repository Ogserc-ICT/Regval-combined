import type { Metadata } from "next";
import { Badge, Card, CardBody, CardHeader, Notice, PageHeader } from "@/components/ui";
import { can } from "@/server/auth/actor";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { SIGNATORY_ROLES } from "@/server/db/schema";
import { signatoriesReady } from "@/server/services/reference";
import { listSignatories, SIGNATORY_ROLE_LABELS } from "@/server/services/signatories";
import { SignatoryForm } from "./signatory-form";

export const metadata: Metadata = { title: "Signatories" };

export default async function SignatoriesPage() {
  const actor = await requirePermission("registers:read");
  const editable = can(actor, "signatories:manage");
  const [list, ready] = await Promise.all([listSignatories(db), signatoriesReady(db)]);
  const roles = SIGNATORY_ROLES.map((r) => ({ value: r, label: SIGNATORY_ROLE_LABELS[r] }));
  return (
    <>
      <PageHeader
        title="Signatories"
        description="One list for CERT-01 certificates and outgoing letters. Approval of a new registration is blocked until there is an active Chairman / CEO and an active Commissioner."
      />
      {!ready.chairman || !ready.commissioner ? (
        <Notice tone="warn" title="Approvals are blocked" className="mb-6">
          Missing: {[!ready.chairman && "Chairman / CEO", !ready.commissioner && "Commissioner"].filter(Boolean).join(" and ")}. Add the
          name once the Commission confirms it (Q12).
        </Notice>
      ) : null}
      <div className="flex flex-col gap-4">
        {list.map((s) => (
          <Card key={s.id}>
            <CardHeader
              title={s.name}
              description={s.note ?? undefined}
              actions={
                <div className="flex gap-1">
                  <Badge>{SIGNATORY_ROLE_LABELS[s.role]}</Badge>
                  {s.active ? null : <Badge>Inactive</Badge>}
                  {s.confirmed ? <Badge tone="accent">Confirmed</Badge> : <Badge tone="warn">Confirm</Badge>}
                </div>
              }
            />
            <CardBody>
              <SignatoryForm s={s} editable={editable} roles={roles} />
            </CardBody>
          </Card>
        ))}
        {editable ? (
          <Card>
            <CardHeader title="Add a signatory" />
            <CardBody>
              <SignatoryForm editable roles={roles} />
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}
