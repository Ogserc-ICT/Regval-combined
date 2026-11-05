import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
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
    </>
  );
}
