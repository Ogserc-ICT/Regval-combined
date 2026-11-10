"use client";

import { AlertTriangle, Eraser } from "lucide-react";
import { useActionState, useState } from "react";
import { PasswordInput } from "@/components/password-input";
import { Button, Card, CardBody, CardHeader, Field, FormErrors, Notice } from "@/components/ui";
import { clearDataAction } from "./actions";

export type GroupInfo = { key: string; label: string; detail: string; recommended: boolean; setup: boolean; count: number };

/** The clear-data checklist: tick what goes, keep the rest. Ticking everything is a factory reset. */
export function ClearDataForm({ groups }: { groups: GroupInfo[] }) {
  const [state, action, pending] = useActionState(clearDataAction, undefined);
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(groups.filter((g) => g.recommended).map((g) => g.key)));
  const [understood, setUnderstood] = useState(false);
  const set = (keys: string[]) => setTicked(new Set(keys));
  const toggle = (k: string) => setTicked((t) => {
    const next = new Set(t);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    return next;
  });
  const fe = state && !state.ok ? state.fieldErrors : {};
  const everything = groups.every((g) => ticked.has(g.key));

  const section = (title: string, items: GroupInfo[]) => (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-faint">{title}</legend>
      {items.map((g) => (
        <label key={g.key} className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5 hover:bg-surface-hover">
          <input type="checkbox" name="groups" value={g.key} checked={ticked.has(g.key)} onChange={() => toggle(g.key)} className="mt-0.5 h-4 w-4 accent-[var(--danger)]" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-text">
              {g.label} <span className="tabular font-normal text-faint">· {g.setup ? `${g.count} row(s)` : `${g.count}`}</span>
            </span>
            <span className="block text-xs text-muted">{g.detail}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );

  return (
    <Card className="border-danger/30">
      <CardHeader
        title="Clear data"
        description="Tick what to clear and leave the rest. Staff accounts, their roles and the audit log are always kept. A number series starts again at 1 once nothing holds one of its numbers."
      />
      <CardBody>
        {state?.ok ? (
          <Notice tone="accent" title="Cleared" className="mb-4">
            {Object.keys(state.data.cleared).length} item(s) cleared.
            {state.data.restarted.length ? ` Number series restarted at 1: ${state.data.restarted.join(", ")}.` : ""} It is recorded in the audit log.
          </Notice>
        ) : null}
        {state && !state.ok && !fe.password ? (
          <div className="mb-4">
            <FormErrors reasons={state.reasons} />
          </div>
        ) : null}
        <form action={action} className="flex flex-col gap-5">
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => set(groups.filter((g) => g.recommended).map((g) => g.key))}>
              Entries only (recommended)
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => set(groups.map((g) => g.key))}>
              Everything (factory reset)
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => set([])}>
              Untick all
            </Button>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            {section("Entries", groups.filter((g) => !g.setup))}
            {section("Setup (back to the workbook's defaults)", groups.filter((g) => g.setup))}
          </div>
          <Notice tone="danger" title="This cannot be undone">
            {everything ? "Everything ticked: a factory reset. " : ""}
            {ticked.size} item(s) will be cleared for everyone, at once. There is no undo in the app; only a database restore (Neon point-in-time) brings them back.
          </Notice>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--danger)]" />
            I understand the ticked items are deleted for good.
          </label>
          <Field label="Your password" htmlFor="password" errors={fe.password} className="max-w-sm">
            <PasswordInput id="password" name="password" autoComplete="current-password" required />
          </Field>
          <div>
            <Button type="submit" variant="danger" disabled={pending || !understood || ticked.size === 0}>
              {everything ? <AlertTriangle className="h-4 w-4" /> : <Eraser className="h-4 w-4" />}
              {pending ? "Clearing…" : everything ? "Factory reset" : `Clear ${ticked.size} item(s)`}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
