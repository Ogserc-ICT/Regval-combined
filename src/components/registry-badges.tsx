import { Badge } from "@/components/ui";

type Tone = "neutral" | "accent" | "info" | "warn" | "danger";

const INWARD: Record<string, Tone> = {
  Closed: "neutral",
  Overdue: "danger",
  "Awaiting routing": "warn",
  "Awaiting forwarding": "warn",
  "Noted / filed": "neutral",
  Open: "info",
};

const OUTWARD: Record<string, Tone> = {
  "Not yet dispatched": "warn",
  "Response received": "accent",
  "Response overdue": "danger",
  "Awaiting response": "info",
  Delivered: "accent",
  Dispatched: "info",
};

const MOVEMENT: Record<string, Tone> = { Returned: "neutral", Overdue: "danger", Out: "info" };

const ENTRY: Record<string, Tone> = {
  "Awaiting Register entry": "warn",
  "Register row started – complete and save it": "warn",
  "Saved on Register": "accent",
  "Saved on Own-Use": "accent",
};

export function InwardStatusBadge({ status }: { status: string }) {
  return <Badge tone={INWARD[status] ?? "neutral"}>{status}</Badge>;
}

export function OutwardStatusBadge({ status }: { status: string }) {
  return <Badge tone={OUTWARD[status] ?? "neutral"}>{status}</Badge>;
}

export function MovementBadge({ status }: { status: string }) {
  return <Badge tone={MOVEMENT[status] ?? "neutral"}>{status}</Badge>;
}

export function EntryBadge({ entry }: { entry: string }) {
  if (entry === "Not a filing") return null;
  return <Badge tone={ENTRY[entry] ?? "neutral"}>{entry}</Badge>;
}

export function FlagsBadge({ flags }: { flags: string[] }) {
  if (!flags.length) return null;
  return (
    <Badge tone="warn" title={flags.join("\n")}>
      {flags.length} flag{flags.length > 1 ? "s" : ""}
    </Badge>
  );
}
