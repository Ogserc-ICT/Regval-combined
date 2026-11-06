import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { Card, CardBody, CardHeader, Notice, Table, Td, Th } from "@/components/ui";
import { formatNaira } from "@/domain/money";
import { can } from "@/server/auth/actor";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { activities, feeSchedule } from "@/server/db/schema";
import { getSettings } from "@/server/services/settings";
import { dateLong } from "@/lib/format";
import { ActivityRow, FeeRow } from "../forms";

export const metadata: Metadata = { title: "Fees & activities" };

export default async function FeesPage() {
  const actor = await requireActor();
  const edit = can(actor, "lists:write");
  const [fees, acts, settings] = await Promise.all([db.select().from(feeSchedule).orderBy(asc(feeSchedule.category)), db.select().from(activities).orderBy(asc(activities.sort)), getSettings(db)]);
  const categories = fees.map((f) => f.category);
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title="Schedule 3 fee table"
          description={`Late charge = min(initial + daily × days late, cap) (G14). Fees revised on: ${settings.feesRevisedOn ? dateLong(settings.feesRevisedOn) : "not recorded"}.`}
        />
        {edit ? (
          <CardBody className="flex flex-col gap-3">
            <Notice tone="info">
              A change applies to submissions saved from now on. Saved submissions keep their frozen pricing and are flagged where it now differs; an admin can recalculate them under Settings.
            </Notice>
            {fees.map((f) => (
              <FeeRow key={f.category} fee={f} />
            ))}
          </CardBody>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Cat.</Th>
                <Th>Description</Th>
                <Th className="text-right">Fee</Th>
                <Th className="text-right">Late initial</Th>
                <Th className="text-right">Late daily</Th>
                <Th className="text-right">Late cap</Th>
              </tr>
            </thead>
            <tbody>
              {fees.map((f) => (
                <tr key={f.category}>
                  <Td className="font-semibold">{f.category}</Td>
                  <Td>{f.description}</Td>
                  <Td className="tabular text-right">{formatNaira(f.registrationFee)}</Td>
                  <Td className="tabular text-right">{formatNaira(f.lateInitial)}</Td>
                  <Td className="tabular text-right">{formatNaira(f.lateDaily)}</Td>
                  <Td className="tabular text-right">{formatNaira(f.lateCap)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader title="Activity map" description="The category of each activity by installed capacity (capacity-based activities) or the 10 MW+ column (others)." />
        {edit ? (
          <CardBody className="flex flex-col gap-3">
            {acts.map((a) => (
              <ActivityRow key={a.code} a={a} categories={categories} />
            ))}
          </CardBody>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Activity</Th>
                <Th>10 MW+</Th>
                <Th>1–10 MW</Th>
                <Th>Below 1 MW</Th>
                <Th>By capacity</Th>
              </tr>
            </thead>
            <tbody>
              {acts.map((a) => (
                <tr key={a.code}>
                  <Td>
                    {a.name} <span className="font-mono text-xs text-faint">{a.code}</span>
                  </Td>
                  <Td>{a.cat10MwPlus}</Td>
                  <Td>{a.cat1To10Mw}</Td>
                  <Td>{a.catBelow1Mw}</Td>
                  <Td>{a.capacityBased ? "Y" : "N"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
