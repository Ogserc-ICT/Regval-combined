import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { Badge, Card, CardBody, CardHeader, Notice, Table, Td, Th } from "@/components/ui";
import { can } from "@/server/auth/actor";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { divisions, units } from "@/server/db/schema";
import { DivisionRow, UnitRow } from "../forms";

export const metadata: Metadata = { title: "Units & emails" };

export default async function UnitsPage() {
  const actor = await requireActor();
  const edit = can(actor, "lists:write");
  const [divs, us] = await Promise.all([db.select().from(divisions).orderBy(asc(divisions.sort)), db.select().from(units).orderBy(asc(units.sort))]);
  const missing = us.filter((u) => u.active && !u.email && !divs.find((d) => d.id === u.divisionId)?.email);
  const divOptions = divs.map((d) => ({ id: d.id, name: d.name }));
  return (
    <div className="flex flex-col gap-6">
      <Notice tone={missing.length ? "warn" : "accent"} title={missing.length ? `${missing.length} active unit(s) cannot be emailed` : "Every active unit can be emailed"}>
        Acknowledgement and routing emails go to the unit and its division. Where neither has an address, the item records &ldquo;Not emailed: no address&rdquo;.
        {missing.length ? <span className="mt-1 block text-xs text-muted">{missing.map((u) => u.name).join(" · ")}</span> : null}
      </Notice>
      <Card>
        <CardHeader title="Divisions" />
        {edit ? (
          <CardBody className="flex flex-col gap-3">
            {divs.map((d) => (
              <DivisionRow key={d.id} d={d} />
            ))}
            <div className="border-t border-border pt-3">
              <DivisionRow />
            </div>
          </CardBody>
        ) : (
          <Table>
            <tbody>
              {divs.map((d) => (
                <tr key={d.id}>
                  <Td>{d.name}</Td>
                  <Td>{d.email ?? <Badge tone="warn">No address</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader title="Units" />
        {edit ? (
          <CardBody className="flex flex-col gap-3">
            {us.map((u) => (
              <UnitRow key={u.id} u={u} divisions={divOptions} />
            ))}
            <div className="border-t border-border pt-3">
              <UnitRow divisions={divOptions} />
            </div>
          </CardBody>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Unit</Th>
                <Th>Division</Th>
                <Th>Email</Th>
              </tr>
            </thead>
            <tbody>
              {us.map((u) => (
                <tr key={u.id}>
                  <Td>
                    {u.name}
                    {!u.active ? <Badge className="ml-1">off</Badge> : null}
                  </Td>
                  <Td className="text-muted">{divs.find((d) => d.id === u.divisionId)?.name ?? "—"}</Td>
                  <Td>{u.email ?? <Badge tone="warn">No address</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
