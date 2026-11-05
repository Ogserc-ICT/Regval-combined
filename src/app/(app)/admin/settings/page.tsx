import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { Card, CardBody, CardHeader, Input, PageHeader } from "@/components/ui";
import { recalculateAllAction } from "../../register/actions";
import { longDate } from "@/domain/dates";
import { registrationDeadline } from "@/domain/settings";
import { can } from "@/server/auth/actor";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { getSettings } from "@/server/services/settings";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const actor = await requirePermission("registers:read");
  const settings = await getSettings(db);
  const editable = can(actor, "settings:write");
  return (
    <>
      <PageHeader
        title="Settings"
        description={`One set of settings for both modules. The registration deadline is ${longDate(registrationDeadline(settings))}. Every change is written to the audit log.${editable ? "" : " Only an admin can change them."}`}
      />
      <SettingsForm settings={settings} editable={editable} />
      {can(actor, "pricing:recalculate") ? (
        <Card className="mt-6">
          <CardHeader
            title="Recalculate all open submissions"
            description="Saved submissions keep the pricing and deadline they were saved with. After changing the Effective Date, the fee table or another pricing setting, re-price every open submission that has no registration number. One reason is recorded on each one (Q6)."
          />
          <CardBody>
            <ActionForm action={recalculateAllAction} submitLabel="Recalculate all open submissions" variant="secondary">
              <Input name="reason" placeholder="Reason, e.g. Effective Date gazetted on …" required aria-label="Reason" />
            </ActionForm>
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
