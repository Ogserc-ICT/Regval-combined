import { PageHeader } from "@/components/ui";
import { can } from "@/server/auth/actor";
import { requirePermission } from "@/server/auth/session";
import { ReferenceTabs } from "./tabs";

export default async function ReferenceLayout({ children }: LayoutProps<"/admin/reference">) {
  const actor = await requirePermission("registers:read");
  return (
    <>
      <PageHeader
        title="Reference data"
        description={
          can(actor, "lists:write")
            ? "The lists behind both modules. Every change is logged. Rows already used by records are switched off, never deleted."
            : "The lists behind both modules (read-only: only an admin can change them)."
        }
      />
      <ReferenceTabs />
      {children}
    </>
  );
}
