"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { Button, FormErrors, Notice } from "@/components/ui";
import type { ActionResult } from "@/server/errors";
import { cn } from "@/lib/cn";

export type FormAction<T = unknown> = (prev: ActionResult<T> | undefined, form: FormData) => Promise<ActionResult<T>>;

/**
 * A form bound to a server action. Shows every blocking reason at once (as the
 * workbook buttons do), field errors under their fields (via `fieldErrors`
 * render prop), and "save anyway?" warnings with a confirm checkbox.
 */
export function ActionForm<T>({
  action,
  submitLabel,
  pendingLabel = "Working…",
  children,
  className,
  variant = "primary",
  size,
  hidden,
  success,
  inline = false,
  resetOnSuccess = false,
}: {
  action: FormAction<T>;
  submitLabel: ReactNode;
  pendingLabel?: string;
  children?: ReactNode | ((fieldErrors: Record<string, string[]>) => ReactNode);
  className?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  hidden?: Record<string, string>;
  success?: (data: T) => ReactNode;
  inline?: boolean;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  const fieldErrors = state && !state.ok ? state.fieldErrors : {};
  const needsConfirm = state && !state.ok && state.kind === "confirm";
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={ref} action={formAction} className={cn(inline ? "flex flex-wrap items-end gap-2" : "flex flex-col gap-3", className)}>
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {typeof children === "function" ? children(fieldErrors) : children}
      {state && !state.ok && !needsConfirm ? (
        <div className={inline ? "w-full" : undefined}>
          <FormErrors
            reasons={
              typeof children === "function"
                ? state.reasons // field errors are shown under their fields
                : [...state.reasons.filter((r) => r !== "Please correct the highlighted fields."), ...Object.values(state.fieldErrors).flat()]
            }
          />
        </div>
      ) : null}
      {needsConfirm ? (
        <div className={inline ? "w-full" : undefined}>
          <Notice tone="warn" title="Please confirm">
            <ul className="list-disc pl-5">
              {state.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <label className="mt-2 flex items-center gap-2 font-medium">
              <input type="checkbox" name="confirmWarnings" value="yes" className="h-4 w-4 accent-[var(--warn)]" required /> Yes, go ahead
            </label>
          </Notice>
        </div>
      ) : null}
      {state?.ok ? (
        <div className={inline ? "w-full" : undefined}>
          <Notice tone="accent">{success ? success(state.data) : (state.message ?? "Done.")}</Notice>
          {state.warnings?.length ? (
            <Notice tone="warn" className="mt-2">
              <ul className="list-disc pl-5">
                {state.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Notice>
          ) : null}
        </div>
      ) : null}
      <div className={inline ? undefined : "flex justify-end"}>
        <Button type="submit" variant={variant} size={size} disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}
