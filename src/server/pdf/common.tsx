/**
 * Shared PDF pieces for the registration documents (@react-pdf/renderer, Phase 10).
 * Layout follows the Commission's templates in docs/templates/. DejaVu fonts are
 * embedded (src/server/pdf/fonts) because the built-in Helvetica has no naira sign.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { Font, Image, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { longDate, type LocalDate } from "@/domain/dates";

export const COMMISSION = "OGUN STATE ELECTRICITY REGULATORY COMMISSION";
export const COMMISSION_NAME = "Ogun State Electricity Regulatory Commission";
/** The Order every document cites. */
export const ORDER_NO = "OGSERC/ORD/2026/001";

export const GREEN = "#1d5e36";
export const GREEN_SOFT = "#eef4ee";
export const GOLD = "#a8892c";
export const GREY = "#555555";
export const RULE = "#cfd8d0";

const here = path.join(process.cwd(), "src", "server", "pdf");
const font = (f: string) => path.join(here, "fonts", f);

let registered = false;
/** Register the embedded fonts once per server instance. */
export function registerFonts() {
  if (registered) return;
  Font.register({
    family: "DejaVu Sans",
    fonts: [
      { src: font("DejaVuSans.ttf") },
      { src: font("DejaVuSans-Bold.ttf"), fontWeight: "bold" },
      { src: font("DejaVuSans-Oblique.ttf"), fontStyle: "italic" },
    ],
  });
  Font.register({
    family: "DejaVu Serif",
    fonts: [
      { src: font("DejaVuSerif.ttf") },
      { src: font("DejaVuSerif-Bold.ttf"), fontWeight: "bold" },
      { src: font("DejaVuSerif-Italic.ttf"), fontStyle: "italic" },
      { src: font("DejaVuSerif-BoldItalic.ttf"), fontWeight: "bold", fontStyle: "italic" },
    ],
  });
  // Never split words with hyphens: references and names must print whole.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}

let logo: Buffer | null = null;
/** The OGSERC wordmark (src/server/pdf/assets). */
export function wordmark(): { data: Buffer; format: "png" } {
  logo ??= readFileSync(path.join(here, "assets", "ogserc-wordmark.png"));
  return { data: logo, format: "png" };
}

export const s = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 58, paddingHorizontal: 54, fontSize: 9.5, fontFamily: "DejaVu Sans", color: "#1a1a1a", lineHeight: 1.4 },
  title: { fontSize: 15, fontWeight: "bold", color: GREEN, marginTop: 18, marginBottom: 12 },
  re: { fontWeight: "bold", marginTop: 10, marginBottom: 6 },
  p: { marginBottom: 6 },
  bold: { fontWeight: "bold" },
  h2: { fontSize: 11, fontWeight: "bold", color: GREEN, marginTop: 10, marginBottom: 5 },
  kvLabel: { width: 112, fontWeight: "bold", color: GREEN },
  muted: { color: GREY },
  small: { fontSize: 8, color: GREY },
});

/**
 * The full letterhead on page 1 and a short one on later pages. One tree whose sizes vary
 * by page: react-pdf mixes up nodes when a render prop returns differently shaped trees.
 */
export function Letterhead({ address, email }: { address: string; email: string }) {
  return (
    <View
      fixed
      render={({ pageNumber }) => {
        const first = pageNumber === 1;
        return (
          <View>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
              <Image src={wordmark()} style={first ? { width: 128, height: 33 } : { width: 80, height: 21 }} />
              <View style={{ marginLeft: first ? 12 : 10, flex: 1 }}>
                <Text style={{ fontSize: first ? 11 : 9, fontWeight: "bold", color: GREEN, lineHeight: 1.2 }}>{COMMISSION}</Text>
                <Text style={{ fontSize: first ? 7.5 : 1, color: first ? GREY : "#ffffff", marginTop: first ? 2 : 0, lineHeight: 1.3 }}>
                  {first ? `${address} · ${email}` : " "}
                </Text>
              </View>
            </View>
            <DoubleRule />
          </View>
        );
      }}
    />
  );
}

function DoubleRule() {
  return (
    <View style={{ marginTop: 7, marginBottom: 4 }}>
      <View style={{ height: 1.6, backgroundColor: GREEN }} />
      <View style={{ height: 0.6, backgroundColor: GREEN, marginTop: 1.4 }} />
    </View>
  );
}

/** A4 portrait height in points. */
const A4_HEIGHT = 841.89;

/**
 * Thin rule and "{left} · Page n of m" at the bottom right of every page. Placed from the
 * top: in this react-pdf version a render-prop element placed with `bottom` draws nothing.
 */
export function Footer({ left }: { left: string }) {
  return (
    <>
      <View fixed style={{ position: "absolute", top: A4_HEIGHT - 38, left: 54, right: 54, height: 0.5, backgroundColor: RULE }} />
      <Text
        fixed
        style={{ position: "absolute", top: A4_HEIGHT - 32, left: 54, right: 54, fontSize: 7.5, color: GREY, textAlign: "right" }}
        render={({ pageNumber, totalPages }) => `${left}  ·  Page ${pageNumber} of ${totalPages}`}
      />
    </>
  );
}

/** Large diagonal watermark on every page ("DRAFT – NOT ISSUED", "CANCELLED"). */
export function Watermark({ text, landscape = false }: { text: string; landscape?: boolean }) {
  return (
    <View fixed style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
      <Text
        style={{
          fontSize: landscape ? 64 : 56,
          fontWeight: "bold",
          color: "#d64545",
          opacity: 0.16,
          transform: "rotate(-35deg)",
          textAlign: "center",
          width: landscape ? 820 : 640,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

/** Label / value lines without shading (the reference block under the title). */
export function RefLines({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <View style={{ marginBottom: 4 }}>
      {rows.map(([k, v]) => (
        <View key={k} style={{ flexDirection: "row", paddingVertical: 2.5 }}>
          <Text style={s.kvLabel}>{k}</Text>
          <Text style={{ flex: 1 }}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

/** Label / value table with alternate rows shaded, as in the templates. */
export function KvTable({ rows, labelWidth = "36%" }: { rows: [string, ReactNode][]; labelWidth?: string }) {
  return (
    <View style={{ marginBottom: 4 }}>
      {rows.map(([k, v], i) => (
        <View key={k} wrap={false} style={{ flexDirection: "row", paddingVertical: 4, paddingHorizontal: 6, backgroundColor: i % 2 === 0 ? GREEN_SOFT : "#ffffff" }}>
          <Text style={{ width: labelWidth, fontWeight: "bold", color: GREEN, paddingRight: 8 }}>{k}</Text>
          <Text style={{ flex: 1 }}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

/** A numbered or lettered list with hanging indent. */
export function List({ items, marker }: { items: ReactNode[]; marker: (i: number) => string }) {
  return (
    <View style={{ marginBottom: 4 }}>
      {items.map((it, i) => (
        <View key={i} style={{ flexDirection: "row", marginBottom: 2.5 }} wrap={false}>
          <Text style={{ width: 22, paddingLeft: 2 }}>{marker(i)}</Text>
          <Text style={{ flex: 1 }}>{it}</Text>
        </View>
      ))}
    </View>
  );
}

export const numbered = (i: number) => `${i + 1}.`;
export const lettered = (i: number) => `(${String.fromCharCode(97 + i)})`;
export const bullet = () => "•";

/** Signature line with the name in bold and a caption under it. */
export function SignatureBlock({ name, caption, width = 190 }: { name: string | null; caption: string; width?: number }) {
  return (
    <View wrap={false} style={{ marginTop: 26 }}>
      <View style={{ height: 0.6, width, backgroundColor: "#777", marginBottom: 4 }} />
      {name ? <Text style={{ fontWeight: "bold" }}>{name}</Text> : null}
      <Text style={{ fontSize: 8, color: GREY }}>{caption}</Text>
    </View>
  );
}

export const d = (date: LocalDate | null | undefined) => (date ? longDate(date) : "—");
export const dash = (v: string | null | undefined) => (v?.trim() ? v : "—");

/** "22nd day of October, 2026" (CERT-01). */
export function dayOfMonthYear(date: LocalDate): string {
  const [y, , day] = date.split("-").map(Number);
  const sfx = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  const month = longDate(date).split(" ")[1];
  return `${day}${sfx} day of ${month}, ${y}`;
}
