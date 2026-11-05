import { Badge } from "@/components/ui";

const STATUS_TONE: Record<string, "neutral" | "accent" | "info" | "warn" | "danger"> = {
  "Acknowledged - Awaiting Payment": "warn",
  "Received - Under Review": "info",
  "Deficiency Notice Issued": "warn",
  "Provisionally Registered": "info",
  Registered: "accent",
  "Changes Applied": "accent",
  Lapsed: "neutral",
  Refused: "danger",
  Cancelled: "neutral",
};

export function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <Badge tone="neutral">Register entry not saved</Badge>;
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{status}</Badge>;
}

export function SlaBadge({ sla }: { sla: string }) {
  if (!sla) return null;
  return <Badge tone={sla === "Red" ? "danger" : sla === "Amber" ? "warn" : "accent"}>{sla}</Badge>;
}

export function PaymentBadge({ status }: { status: string }) {
  return <Badge tone={status === "Paid" || status === "Nil" ? "accent" : status === "Part-paid" ? "warn" : "danger"}>{status}</Badge>;
}

export function FinanceBadge({ status, reversed }: { status: string; reversed?: boolean }) {
  if (reversed) return <Badge tone="neutral">Reversed</Badge>;
  return <Badge tone={status === "Confirmed" ? "accent" : status === "Rejected" ? "danger" : "warn"}>{status === "Pending" ? "With Finance" : status}</Badge>;
}

export function DocBadge({ value }: { value: string }) {
  if (value === "Y") return <Badge tone="accent">Received</Badge>;
  if (value === "N") return <Badge tone="danger">Outstanding</Badge>;
  if (value === "N/A") return <Badge>N/A</Badge>;
  return <Badge tone="warn">Pending</Badge>;
}
