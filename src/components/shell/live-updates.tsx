"use client";

import { RefreshCw } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PULSE_EVENT, type Pulse } from "@/lib/pulse";

const POLL_MS = 5000;
const HIDDEN_POLL_MS = 30_000;

/**
 * Keeps the open page current (docs/PLAN.md §11f, 8a). Polls /api/pulse every 5s while the tab is
 * visible (every 30s while hidden, for notifications; the page itself refreshes on return);
 * when the app's change number moves, the page re-renders from the server. If the person has typed
 * into a form on this page, the page is left alone and a "Refresh" button is offered instead, so
 * nothing they typed is redrawn under them.
 */
export function LiveUpdates() {
  const router = useRouter();
  const pathname = usePathname();
  const version = useRef<number | null>(null);
  // Both belong to the page they happened on, so navigating clears them.
  const dirtyOn = useRef<string | null>(null);
  const [staleOn, setStaleOn] = useState<string | null>(null);

  useEffect(() => {
    const onInput = (e: Event) => {
      const el = e.target as Element | null;
      // Search and filter boxes are not work in progress.
      if (el?.closest?.("form") && !el.closest('form[role="search"]')) dirtyOn.current = window.location.pathname;
    };
    const onSubmit = () => {
      dirtyOn.current = null;
    };
    document.addEventListener("input", onInput, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, []);

  useEffect(() => {
    let busy = false;
    let stopped = false;
    let lastPoll = 0;
    // A change seen while the tab was hidden is applied when the person comes back.
    let pendingRefresh = false;

    const apply = () => {
      const here = window.location.pathname;
      if (dirtyOn.current === here) setStaleOn(here);
      else router.refresh();
    };

    async function tick() {
      const visible = document.visibilityState === "visible";
      if (visible && pendingRefresh) {
        pendingRefresh = false;
        apply();
      }
      // Hidden tabs still poll, slowly, so notifications can pop up while the app is minimised.
      if (busy || stopped || (!visible && Date.now() - lastPoll < HIDDEN_POLL_MS)) return;
      busy = true;
      lastPoll = Date.now();
      try {
        const res = await fetch("/api/pulse", { cache: "no-store", headers: { accept: "application/json" } });
        if (res.status === 401) {
          // Signed out elsewhere, ended for inactivity, or revoked: go to sign in, then come back here.
          stopped = true;
          const qs = new URLSearchParams({ next: window.location.pathname + window.location.search });
          // A full load on purpose: nothing from the signed-out session stays in the browser's memory.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.assign(`/sign-in?${qs}`);
          return;
        }
        if (!res.ok) return;
        const pulse = (await res.json()) as Pulse;
        window.dispatchEvent(new CustomEvent<Pulse>(PULSE_EVENT, { detail: pulse }));
        if (version.current !== null && pulse.v !== version.current) {
          if (document.visibilityState === "visible") apply();
          else pendingRefresh = true;
        }
        version.current = pulse.v;
      } catch {
        // Offline or a deploy in progress: try again on the next tick.
      } finally {
        busy = false;
      }
    }

    void tick();
    const timer = window.setInterval(tick, POLL_MS);
    const onVisible = () => void tick();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [router]);

  if (staleOn !== pathname) return null;
  return (
    <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4" role="status">
      <button
        type="button"
        onClick={() => {
          setStaleOn(null);
          dirtyOn.current = null;
          router.refresh();
        }}
        className="inline-flex items-center gap-2 rounded-full border border-info/40 bg-surface px-4 py-2 text-sm font-medium text-text shadow-card hover:bg-surface-hover"
      >
        <RefreshCw className="h-4 w-4 text-info" />
        New changes on this page · Refresh
      </button>
    </div>
  );
}
