import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { listValues } from "@/server/services/reference";
import { getSettings } from "@/server/services/settings";
import { lagosToday } from "@/server/time";
import { OwnUseForm } from "../own-use-form";

export const metadata: Metadata = { title: "New own-use notification" };

export default async function NewOwnUsePage() {
  await requirePermission("ownuse:save");
  const [lgas, fuels, settings] = await Promise.all([listValues(db, "lga"), listValues(db, "fuel"), getSettings(db)]);
  return (
    <>
      <PageHeader
        title="New own-use notification"
        description="Form REG-01I."
        actions={
          <Link href="/own-use" className="text-sm text-info hover:underline">
            Back to own-use
          </Link>
        }
      />
      <OwnUseForm lgas={lgas} fuels={fuels} today={lagosToday()} thresholdKw={settings.ownUseThresholdKw} />
    </>
  );
}
