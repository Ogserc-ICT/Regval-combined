import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, CardHeader, Notice, PageHeader, Table, Td, Th } from "@/components/ui";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { goLiveChecks, type Check } from "@/server/services/go-live";

export const metadata: Metadata = { title: "Go-live checks" };

const LABEL: Record<Check["state"], string> = { ok: "Ready", warn: "To do", fail: "Blocking", info: "Info" };
const TONE: Record<Check["state"], "accent" | "warn" | "danger" | "neutral"> = { ok: "accent", warn: "warn", fail: "danger", info: "neutral" };

export default async function GoLivePage() {
  await requirePermission("settings:write");
  const { production, checks } = await goLiveChecks(db);
  const blocking = checks.filter((c) => c.state === "fail").length;
  const todo = checks.filter((c) => c.state === "warn").length;
  const areas = [...new Set(checks.map((c) => c.area))];
  return (
    <>
      <PageHeader
        title="Go-live checks"
        description={`Checked now against this deployment (${production ? "production" : "not production"}). The platform steps (domain, region, environment variables) are in docs/GO-LIVE.md.`}
      />
      <Notice tone={blocking ? "danger" : todo ? "warn" : "accent"} className="mb-6" title={blocking ? `${blocking} blocking item(s)` : todo ? `${todo} item(s) to do` : "Ready"}>
        {blocking ? "Fix the blocking items before the Commission relies on this deployment." : todo ? "Nothing blocks go-live; finish the remaining items as soon as you can." : "Every check passes."}
      </Notice>
      <div className="flex flex-col gap-6">
        {areas.map((area) => (
          <Card key={area}>
            <CardHeader title={area} />
            <Table>
              <thead>
                <tr>
                  <Th className="w-56">Check</Th>
                  <Th className="w-24">State</Th>
                  <Th>Detail</Th>
                </tr>
              </thead>
              <tbody>
                {checks
                  .filter((c) => c.area === area)
                  .map((c) => (
                    <tr key={c.label}>
                      <Td className="font-medium">{c.href ? <Link href={c.href} className="hover:underline">{c.label}</Link> : c.label}</Td>
                      <Td>
                        <Badge tone={TONE[c.state]}>{LABEL[c.state]}</Badge>
                      </Td>
                      <Td className="text-sm text-muted">{c.detail}</Td>
                    </tr>
                  ))}
              </tbody>
            </Table>
          </Card>
        ))}
      </div>
    </>
  );
}
