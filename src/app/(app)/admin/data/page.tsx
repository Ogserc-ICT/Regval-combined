import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { CLEAR_GROUPS, dataCounts, type ClearGroup } from "@/server/services/data-admin";
import { ClearDataForm, type GroupInfo } from "./clear-data-form";

export const metadata: Metadata = { title: "Data management" };

export default async function DataManagementPage() {
  await requirePermission("data:clear");
  const counts = await dataCounts(db);
  const groups: GroupInfo[] = (Object.entries(CLEAR_GROUPS) as [ClearGroup, (typeof CLEAR_GROUPS)[ClearGroup]][]).map(([key, g]) => ({
    key,
    label: g.label,
    detail: g.detail,
    recommended: g.recommended,
    setup: g.setup,
    count: counts[key],
  }));
  return (
    <>
      <PageHeader
        title="Data management"
        description="Clear registers or put the setup back to its defaults, up to a full factory reset. To delete a single entry, open it: Register and Own-use pages have a Delete card for admins, and payments that are not confirmed can be deleted from their list."
      />
      <ClearDataForm groups={groups} />
    </>
  );
}
