import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody, PageHeader } from "@/components/ui";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { lastSerial } from "@/server/numbering";
import { previewFileRef } from "@/server/services/registry/files";
import { registryCtx } from "@/server/services/registry/load";
import { lagosToday } from "@/server/time";
import { NewFileForm } from "../file-forms";

export const metadata: Metadata = { title: "New file" };

export default async function NewFilePage() {
  await requirePermission("files:write");
  const ctx = await registryCtx(db);
  const classes = [];
  for (const c of ctx.ref.fileClasses) classes.push({ ...c, next: previewFileRef(c.code, await lastSerial(db, "FILE", 0, c.code)) });

  return (
    <>
      <PageHeader
        title="New file"
        description="Open a file in the File Index. References are OGSERC/{class code}/{number}, numbered per class."
        actions={
          <Link href="/files" className="text-sm text-info hover:underline">
            Back to Files
          </Link>
        }
      />
      <Card className="max-w-3xl">
        <CardBody>
          <NewFileForm classes={classes} units={ctx.ref.units.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name }))} security={ctx.ref.security} today={lagosToday()} />
        </CardBody>
      </Card>
    </>
  );
}
