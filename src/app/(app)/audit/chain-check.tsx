"use client";

import { ShieldCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { verifyAuditAction } from "../admin/actions";

export function ChainCheckButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex items-center gap-3">
      {msg ? <span className={msg.ok ? "text-sm text-accent" : "text-sm text-danger"}>{msg.text}</span> : null}
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await verifyAuditAction();
            if (!res.ok) setMsg({ ok: false, text: res.reasons.join(" ") });
            else if (res.data.ok) setMsg({ ok: true, text: `Intact: ${res.data.checked} entries checked.` });
            else setMsg({ ok: false, text: `Broken at entry ${res.data.brokenAtSeq}: ${res.data.reason}.` });
          })
        }
      >
        <ShieldCheck className="h-4 w-4" />
        {pending ? "Checking…" : "Check integrity"}
      </Button>
    </div>
  );
}
