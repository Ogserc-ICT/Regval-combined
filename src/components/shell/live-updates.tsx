"use client";

import { RefreshCw } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const POLL_MS = 5000;

/**
 * Keeps the open page current (docs/PLAN.md §11f, 8a). Polls /api/pulse while the tab is visible;
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

    async function tick() {
      if (busy || stopped || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const res = await fetch("/api/pulse", { cache: "no-store", headers: { accept: "application/json" } });
        if (res.status === 401) {
          // Signed out elsewhere (or revoked): re-render, and the server sends us to sign in.
          stopped = true;
          router.refresh();
          return;
        }
        if (!res.ok) return;
        const { v } = (await res.json()) as { v: number };
        if (version.current !== null && v !== version.current) {
          const here = window.location.pathname;
          if (dirtyOn.current === here) setStaleOn(here);
          else router.refresh();
        }
        version.current = v;
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
