"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Button, Table, Td, Th } from "@/components/ui";

export type HistoryRow = { seq: number | string; when: string; by: string; action: string; detail: string | null };

/** A History table that shows the newest few entries, with View more / View less. */
export function HistoryTable({ rows, initial = 10 }: { rows: HistoryRow[]; initial?: number }) {
  const [open, setOpen] = useState(false);
  const shown = open ? rows : rows.slice(0, initial);
  const hidden = rows.length - initial;
  return (
    <>
      <Table>
        <thead>
          <tr>
            <Th>When (Lagos)</Th>
            <Th>By</Th>
            <Th>Action</Th>
            <Th>Detail</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <Td colSpan={4} className="py-6 text-center text-muted">
                Nothing yet.
              </Td>
            </tr>
          ) : (
            shown.map((r) => (
              <tr key={r.seq}>
                <Td className="tabular whitespace-nowrap text-muted">{r.when}</Td>
                <Td className="whitespace-nowrap">{r.by}</Td>
                <Td className="whitespace-nowrap">{r.action}</Td>
                <Td className="text-muted">{r.detail}</Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
      {hidden > 0 ? (
        <div className="flex justify-center border-t border-border p-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? (
              <>
                <ChevronUp className="h-4 w-4" /> View less
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" /> View {hidden} more
              </>
            )}
          </Button>
        </div>
      ) : null}
    </>
  );
}
