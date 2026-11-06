/**
 * Shared PDF pieces (@react-pdf/renderer, built-in Helvetica). Helvetica has
 * no naira sign, so PDFs print amounts as "NGN 250,000.00".
 */
import { StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { longDate, lagosDateTime, type LocalDate } from "@/domain/dates";

export const COMMISSION = "OGUN STATE ELECTRICITY REGULATORY COMMISSION";

export const s = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 32, paddingHorizontal: 34, fontSize: 9, fontFamily: "Helvetica", color: "#111" },
  pageLandscape: { paddingTop: 24, paddingBottom: 30, paddingHorizontal: 26, fontSize: 8, fontFamily: "Helvetica", color: "#111" },
  commission: { fontSize: 11, fontFamily: "Helvetica-Bold", textAlign: "center", color: "#0b5a36" },
  address: { fontSize: 8, textAlign: "center", color: "#444", marginTop: 2 },
  copy: { fontSize: 8, fontFamily: "Helvetica-Bold", textAlign: "center", marginTop: 4, letterSpacing: 1 },
  title: { fontSize: 12, fontFamily: "Helvetica-Bold", textAlign: "center", marginTop: 8 },
  subtitle: { fontSize: 8, textAlign: "center", color: "#333", marginTop: 2, marginBottom: 8 },
  h2: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 4 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ccc", paddingVertical: 3 },
  label: { width: "22%", color: "#555" },
  value: { width: "28%" },
  wide: { width: "78%" },
  small: { fontSize: 7.5, color: "#333", lineHeight: 1.35 },
  th: { fontFamily: "Helvetica-Bold", backgroundColor: "#eef3f0" },
  cell: { paddingHorizontal: 3, paddingVertical: 2.5 },
  footer: { position: "absolute", bottom: 14, left: 34, right: 34, fontSize: 7, color: "#777", flexDirection: "row", justifyContent: "space-between" },
});

export const dash = (v: unknown) => (v === null || v === undefined || v === "" ? "-" : String(v));
export const ngn = (kobo: number | null | undefined) =>
  kobo === null || kobo === undefined ? "-" : `NGN ${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const d = (date: LocalDate | null | undefined) => (date ? longDate(date) : "-");
export const dt = (instant: Date | null | undefined) => (instant ? lagosDateTime(instant) : "-");

export function Header({ address, copy }: { address: string; copy?: string }) {
  return (
    <View>
      <Text style={s.commission}>{COMMISSION}</Text>
      <Text style={s.address}>{address}</Text>
      {copy ? <Text style={s.copy}>{copy}</Text> : null}
    </View>
  );
}

/** A table row from columns with fixed widths (percent strings). */
export function TRow({ cells, widths, header = false }: { cells: ReactNode[]; widths: string[]; header?: boolean }) {
  return (
    <View style={[{ flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ccc" }, header ? s.th : {}]} wrap={false}>
      {cells.map((c, i) => (
        <Text key={i} style={[s.cell, { width: widths[i] }]}>
          {c as string}
        </Text>
      ))}
    </View>
  );
}

export function Footer({ left }: { left: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>{left}</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}
