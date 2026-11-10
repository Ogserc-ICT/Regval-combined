"use client";

import { Clock, History, X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { idleSignOutAction } from "@/app/auth-actions";
import { applyDraft, captureForms, type Draft } from "@/lib/drafts-client";

const WARN_MS = 30_000;
const PING_MS = 20_000;
const SHARE_MS = 2_000;
const SHARED_KEY = "ogserc:last-activity";

function readShared(): number {
  try {
    return Number(window.localStorage.getItem(SHARED_KEY)) || 0;
  } catch {
    return 0;
  }
}
function writeShared(t: number) {
  try {
    window.localStorage.setItem(SHARED_KEY, String(t));
  } catch {
    // Storage blocked: each tab keeps its own clock (the server still enforces the limit).
  }
}

const here = () => window.location.pathname + window.location.search;
const draftUrl = (path: string) => `/api/drafts?path=${encodeURIComponent(path)}`;
const lagosTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit" });

/**
 * Idle sign-out with resume (docs/PLAN.md §11f, 8c). Watches for real activity (mouse, keyboard,
 * touch, scroll) across every open tab; 30 seconds before the limit it warns and saves what the
 * person typed into forms on this page; at the limit it signs out. After signing in again, opening
 * the same page puts the typing back. The server enforces the same limit on its own.
 */
export function SessionGuard({ idleMinutes, draftPaths }: { idleMinutes: number; draftPaths: string[] }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [restored, setRestored] = useState<{ path: string; at: string } | null>(null);
  const waiting = useRef(new Set(draftPaths));
  const dirty = useRef(new Set<HTMLFormElement>());
  const savedFor = useRef<string | null>(null);
  const limit = idleMinutes * 60_000;

  // Activity, the countdown and the sign-out.
  useEffect(() => {
    let last = Date.now();
    let lastShared = 0;
    let lastPing = 0;
    let warned = false;
    let leaving = false;

    const ping = () => {
      lastPing = Date.now();
      void fetch("/api/activity", { method: "POST", cache: "no-store" }).catch(() => {});
    };

    const dropSaved = () => {
      const path = savedFor.current;
      savedFor.current = null;
      if (path) void fetch(draftUrl(path), { method: "DELETE" }).catch(() => {});
    };

    const save = async () => {
      const draft = captureForms(dirty.current);
      if (!draft) return;
      const path = here();
      try {
        const res = await fetch(draftUrl(path), { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(draft), keepalive: true });
        if (res.ok) savedFor.current = path;
      } catch {
        // Nothing more can be done; the server's own limit is a minute later.
      }
    };

    const active = () => {
      if (leaving) return;
      const now = Date.now();
      last = now;
      if (now - lastShared > SHARE_MS) {
        lastShared = now;
        writeShared(now);
      }
      if (warned) {
        warned = false;
        setSecondsLeft(null);
        dropSaved();
        ping();
      } else if (now - lastPing > PING_MS) ping();
    };

    const signOut = async () => {
      leaving = true;
      if (dirty.current.size && !savedFor.current) await save();
      try {
        await idleSignOutAction(idleMinutes);
      } catch {
        // Already ended, or offline: the server ends it anyway.
      }
      const qs = new URLSearchParams({ reason: "idle", next: here() });
      // A full load on purpose: nothing from the signed-out session (pages, cached data) stays in memory.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/sign-in?${qs}`);
    };

    const tick = () => {
      if (leaving) return;
      const idle = Date.now() - Math.max(last, readShared());
      const left = limit - idle;
      if (left <= 0) {
        void signOut();
      } else if (left <= WARN_MS) {
        if (!warned) {
          warned = true;
          void save();
        }
        setSecondsLeft(Math.ceil(left / 1000));
      } else if (warned) {
        // Someone was active in another tab.
        warned = false;
        setSecondsLeft(null);
        dropSaved();
      }
    };

    let lastMove = 0;
    const onMove = () => {
      const now = Date.now();
      if (now - lastMove > 1000) {
        lastMove = now;
        active();
      }
    };
    const onVisible = () => {
      if (leaving) return;
      if (document.visibilityState === "visible") {
        // Back, still signed in: the copy kept while away is not needed.
        if (!warned) dropSaved();
        active();
      } else if (dirty.current.size) {
        // Browsers slow a hidden tab's timers, so keep the typing now rather than at the warning.
        void save();
      }
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;
    for (const e of events) window.addEventListener(e, active, { capture: true, passive: true });
    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("visibilitychange", onVisible);
    // Opening the page counts as activity.
    writeShared(last);
    ping();
    const timer = window.setInterval(tick, 1000);
    return () => {
      for (const e of events) window.removeEventListener(e, active, { capture: true });
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [idleMinutes, limit]);

  // Which forms hold typing worth keeping.
  useEffect(() => {
    const onEdit = (e: Event) => {
      const form = (e.target as Element | null)?.closest?.("form");
      if (form && form.getAttribute("role") !== "search") dirty.current.add(form);
    };
    const onSubmit = (e: Event) => {
      if (e.target instanceof HTMLFormElement) dirty.current.delete(e.target);
    };
    document.addEventListener("input", onEdit, true);
    document.addEventListener("change", onEdit, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("input", onEdit, true);
      document.removeEventListener("change", onEdit, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, []);

  // A new page: forget the last page's forms, and put back typing kept for this one.
  useEffect(() => {
    dirty.current.clear();
    const path = pathname + (search ? `?${search}` : "");
    if (!waiting.current.has(path)) return;
    waiting.current.delete(path);
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(draftUrl(path), { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const { draft } = (await res.json()) as { draft: Draft | null };
        if (!draft || cancelled) return;
        const n = await applyDraft(draft);
        await fetch(draftUrl(path), { method: "DELETE" });
        if (n > 0 && !cancelled) setRestored({ path, at: draft.savedAt });
      } catch {
        // The draft stays on the server for the next visit (up to a day).
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, search]);

  const currentPath = pathname + (search ? `?${search}` : "");

  return (
    <>
      {secondsLeft !== null ? (
        <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4" role="alertdialog" aria-live="assertive" aria-label="About to sign you out">
          <div className="flex w-full max-w-md flex-wrap items-center gap-3 rounded-xl border border-warn/40 bg-surface px-4 py-3 shadow-2xl">
            <Clock className="h-5 w-5 shrink-0 text-warn" />
            <p className="min-w-0 flex-1 text-sm">
              <span className="font-medium text-text">Still there?</span>{" "}
              <span className="text-muted">
                Signing you out in <span className="tabular font-semibold text-warn">{secondsLeft}s</span>. What you typed in forms is kept (never passwords).
              </span>
            </p>
            {/* Any click counts as activity; the button makes that obvious. */}
            <button type="button" className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-accent-text hover:bg-accent-strong">
              Stay signed in
            </button>
          </div>
        </div>
      ) : null}

      {restored && restored.path === currentPath ? (
        <div className="fixed inset-x-0 top-16 z-30 flex justify-center px-4" role="status">
          <div className="flex w-full max-w-xl items-start gap-3 rounded-xl border border-info/40 bg-surface px-4 py-3 shadow-card">
            <History className="mt-0.5 h-4 w-4 shrink-0 text-info" />
            <p className="min-w-0 flex-1 text-sm text-text">
              We put back what you were typing when you were signed out at {lagosTime.format(new Date(restored.at))}.{" "}
              <span className="text-muted">Check it, then save as usual.</span>
            </p>
            <button type="button" onClick={() => setRestored(null)} aria-label="Dismiss" className="-m-1 rounded-lg p-1 text-muted hover:bg-surface-hover hover:text-text">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
