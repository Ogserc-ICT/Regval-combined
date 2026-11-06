/**
 * A ranked horizontal bar list: one series, one hue (the accent), value and
 * label in text colours so identity never rests on colour alone. Each row has
 * a hover tooltip and the whole list is readable as a table by screen readers.
 */
import type { Bar } from "@/server/services/dashboard";

export function BarList({ bars, caption, format = (n) => n.toLocaleString("en-NG"), empty = "Nothing yet." }: { bars: Bar[]; caption: string; format?: (n: number) => string; empty?: string }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  if (!bars.length || bars.every((b) => b.value === 0)) return <p className="py-2 text-sm text-muted">{empty}</p>;
  return (
    <table className="w-full border-separate border-spacing-y-1.5 text-sm">
      <caption className="sr-only">{caption}</caption>
      <tbody>
        {bars.map((b) => (
          <tr key={b.label} title={`${b.label}: ${format(b.value)}${b.hint ? ` · ${b.hint}` : ""}`} className="group">
            <th scope="row" className="w-2/5 max-w-0 truncate pr-3 text-left font-normal text-muted group-hover:text-text">
              {b.label}
            </th>
            <td className="pr-3">
              <div className="h-2 rounded-r-[4px] bg-accent/85 group-hover:bg-accent" style={{ width: `${Math.max(2, (b.value / max) * 100)}%` }} />
            </td>
            <td className="tabular w-16 text-right text-text">{format(b.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Month columns (vertical bars) for one series over time. */
export function MonthColumns({ bars, caption }: { bars: Bar[]; caption: string }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  const name = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  return (
    <figure>
      <figcaption className="sr-only">{caption}</figcaption>
      <div className="flex h-36 items-end gap-1.5 border-b border-border" role="list">
        {bars.map((b) => (
          <div key={b.label} role="listitem" className="group flex h-full flex-1 flex-col items-center justify-end" title={`${b.label}: ${b.value}`}>
            <span className="tabular mb-1 text-[10px] text-muted opacity-0 group-hover:opacity-100">{b.value}</span>
            <div className="w-full max-w-8 rounded-t-[4px] bg-accent/85 group-hover:bg-accent" style={{ height: `${b.value ? Math.max(3, (b.value / max) * 100) : 0}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5">
        {bars.map((b) => (
          <span key={b.label} className="flex-1 text-center text-[10px] text-faint">
            {name(b.label)}
          </span>
        ))}
      </div>
    </figure>
  );
}
