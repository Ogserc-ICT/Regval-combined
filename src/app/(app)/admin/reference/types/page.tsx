import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { Badge, Card, CardBody, CardHeader, Table, Td, Th } from "@/components/ui";
import { can } from "@/server/auth/actor";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { correspondenceTypes, units } from "@/server/db/schema";
import { TypeRow } from "../forms";

export const metadata: Metadata = { title: "Correspondence types" };

export default async function TypesPage() {
  const actor = await requireActor();
  const edit = can(actor, "lists:write");
  const [types, us] = await Promise.all([db.select().from(correspondenceTypes).orderBy(asc(correspondenceTypes.sort)), db.select().from(units).orderBy(asc(units.sort))]);
  const unitOptions = us.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name }));
  return (
    <Card>
      <CardHeader
        title="Incoming correspondence types"
        description="Default unit, Order reference, response target in working days (0 = none) and whether the slip uses the para 10(3) wording. Outgoing document types are under Lists."
      />
      {edit ? (
        <CardBody className="flex flex-col gap-3">
          {types.map((t) => (
            <TypeRow key={t.id} t={t} units={unitOptions} />
          ))}
          <div className="border-t border-border pt-3">
            <TypeRow units={unitOptions} />
          </div>
        </CardBody>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Type</Th>
              <Th>Category</Th>
              <Th>Default unit</Th>
              <Th>Order ref</Th>
              <Th className="text-right">Target</Th>
            </tr>
          </thead>
          <tbody>
            {types.map((t) => (
              <tr key={t.id}>
                <Td>
                  {t.name}
                  {t.filingType ? (
                    <Badge tone="info" className="ml-1">
                      {t.filingType}
                    </Badge>
                  ) : null}
                  {!t.active ? <Badge className="ml-1">off</Badge> : null}
                </Td>
                <Td className="text-muted">{t.category}</Td>
                <Td>{us.find((u) => u.id === t.defaultUnitId)?.name ?? <Badge tone="warn">None</Badge>}</Td>
                <Td>{t.orderRef ?? "—"}</Td>
                <Td className="tabular text-right">{t.responseTargetDays || "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
