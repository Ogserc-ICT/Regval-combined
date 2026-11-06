import type { Metadata } from "next";
import { Card, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui";
import { requirePermission } from "@/server/auth/session";
import { REGISTERS } from "@/server/services/exports";

export const metadata: Metadata = { title: "Export registers" };

export default async function ExportsPage() {
  await requirePermission("registers:export");
  return (
    <>
      <PageHeader
        title="Export registers"
        description="Download any register with its calculated columns, as Excel (.xlsx) or CSV. Generated now from the live records; each export is logged. Backups of the database itself are Neon point-in-time restore."
      />
      <Card className="max-w-3xl">
        <CardHeader title="Registers" description="Phone numbers, CAC numbers and references stay as text, so leading zeros are kept. Amounts are in naira." />
        <Table>
          <thead>
            <tr>
              <Th>Register</Th>
              <Th className="text-right">Download</Th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(REGISTERS).map(([key, label]) => (
              <tr key={key}>
                <Td className="font-medium">{label}</Td>
                <Td className="whitespace-nowrap text-right text-sm">
                  <a href={`/api/export/${key}?format=xlsx`} className="text-info hover:underline">
                    Excel
                  </a>
                  <span className="text-faint"> · </span>
                  <a href={`/api/export/${key}?format=csv`} className="text-info hover:underline">
                    CSV
                  </a>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
