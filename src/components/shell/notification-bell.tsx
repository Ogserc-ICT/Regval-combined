"use client";

import { Bell, BellRing, CheckCheck, Monitor, Volume2, VolumeX, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { markNotificationsReadAction, setNotificationSoundAction } from "@/app/(app)/_notifications/actions";
import { cn } from "@/lib/cn";
import { PULSE_EVENT, type NotificationItem, type Pulse } from "@/lib/pulse";

// ---------------------------------------------------------------- sound (Web Audio, no file)

let audioCtx: AudioContext | null = null;

/** Browsers only allow sound after a click or key press on the page; this runs on the first one. */
function unlockAudio() {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") void audioCtx.resume();
  } catch {
    // No audio on this device.
  }
}

/** A short two-note chime. */
function chime() {
  const c = audioCtx;
  if (!c || c.state !== "running") return;
  const t0 = c.currentTime;
  for (const [freq, at] of [
    [880, 0],
    [1318.5, 0.13],
  ] as const) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0 + at);
    gain.gain.exponentialRampToValueAtTime(0.22, t0 + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.7);
    osc.connect(gain).connect(c.destination);
    osc.start(t0 + at);
    osc.stop(t0 + at + 0.75);
  }
}

// ---------------------------------------------------------------- per-browser bits (storage may be blocked)

const DESKTOP_KEY = "ogserc:desktop-alerts";
const ALERTED_KEY = "ogserc:last-alerted";

function readStore(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStore(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Private window or blocked storage: the preference just isn't remembered.
  }
}

/** With several tabs open, only the first to see a notification chimes and pops up. */
function claimAlert(id: string): boolean {
  if (readStore(ALERTED_KEY) === id) return false;
  writeStore(ALERTED_KEY, id);
  return true;
}

type DesktopState = "unsupported" | "denied" | "on" | "off";
function desktopState(): DesktopState {
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return Notification.permission === "granted" && readStore(DESKTOP_KEY) === "on" ? "on" : "off";
}

// ---------------------------------------------------------------- display

const lagosTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)} h ago`;
  return lagosTime.format(new Date(iso));
}

// ---------------------------------------------------------------- the bell

export function NotificationBell({ initialUnread, initialNewestAt, initialSound }: { initialUnread: number; initialNewestAt: string | null; initialSound: boolean }) {
  const router = useRouter();
  const [unread, setUnread] = useState(initialUnread);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [sound, setSound] = useState(initialSound);
  const [desktop, setDesktop] = useState<DesktopState>("off");
  const [ringing, setRinging] = useState(false);
  const newestAt = useRef(initialNewestAt);
  const soundRef = useRef(initialSound);
  const openRef = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  async function load() {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store", headers: { accept: "application/json" } });
      if (res.ok) setItems(((await res.json()) as { items: NotificationItem[] }).items);
    } catch {
      // Try again next time the list is opened.
    }
  }

  // Unlock sound on the first interaction with the page.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true, capture: true });
    window.addEventListener("keydown", unlock, { once: true, capture: true });
    return () => {
      window.removeEventListener("pointerdown", unlock, { capture: true });
      window.removeEventListener("keydown", unlock, { capture: true });
    };
  }, []);

  // React to each poll (LiveUpdates does the polling).
  useEffect(() => {
    const onPulse = (e: Event) => {
      const p = (e as CustomEvent<Pulse>).detail;
      setUnread(p.unread);
      const n = p.newest;
      if (!n || (newestAt.current && n.createdAt <= newestAt.current)) return;
      newestAt.current = n.createdAt;
      setRinging(true);
      window.setTimeout(() => setRinging(false), 1200);
      if (openRef.current) void load();
      if (!claimAlert(n.id)) return;
      if (soundRef.current) chime();
      const away = document.visibilityState !== "visible" || !document.hasFocus();
      if (away && desktopState() === "on") {
        try {
          // Title and reference only: a pop-up can be seen by anyone near the screen.
          const pop = new Notification("OGSERC", { body: n.title, tag: n.id, icon: "/icon.png" });
          pop.onclick = () => {
            window.focus();
            void markNotificationsReadAction([n.id]);
            router.push(n.href);
            pop.close();
          };
        } catch {
          // Some mobile browsers only allow pop-ups from a service worker.
        }
      }
    };
    window.addEventListener(PULSE_EVENT, onPulse);
    return () => window.removeEventListener(PULSE_EVENT, onPulse);
  }, [router]);

  // Escape closes the list.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        openRef.current = false;
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    openRef.current = next;
    if (next) {
      setDesktop(desktopState());
      void load();
    }
  }

  function close() {
    setOpen(false);
    openRef.current = false;
  }

  function go(n: NotificationItem) {
    if (!n.read) {
      void markNotificationsReadAction([n.id]);
      setUnread((u) => Math.max(0, u - 1));
      setItems((list) => list?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? null);
    }
    close();
    router.push(n.href);
  }

  function markAll() {
    void markNotificationsReadAction("all");
    setUnread(0);
    setItems((list) => list?.map((x) => ({ ...x, read: true })) ?? null);
  }

  function toggleSound() {
    const next = !sound;
    setSound(next);
    soundRef.current = next;
    void setNotificationSoundAction(next);
    if (next) {
      unlockAudio();
      window.setTimeout(chime, 50);
    }
  }

  async function toggleDesktop() {
    if (desktop === "on") {
      writeStore(DESKTOP_KEY, null);
      setDesktop("off");
      return;
    }
    if (typeof Notification === "undefined") return;
    const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (permission === "granted") writeStore(DESKTOP_KEY, "on");
    setDesktop(desktopState());
  }

  const has = unread > 0;
  const Icon = has ? BellRing : Bell;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-label={has ? `Notifications: ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={has ? `${unread} unread` : "Notifications"}
        className={cn(
          "relative inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
          has ? "bg-warn-soft text-warn ring-1 ring-inset ring-warn/40 hover:bg-warn/20" : "text-muted hover:bg-surface-hover hover:text-text",
        )}
      >
        <Icon className={cn("h-4 w-4", ringing && "animate-bell-ring")} />
        {has ? (
          <span className="tabular absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-bg">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open
        ? createPortal(
            <>
              <div className="fixed inset-0 z-40" onClick={close} aria-hidden="true" />
              <div
                role="dialog"
                aria-label="Notifications"
                className="animate-fade-in fixed inset-x-2 top-16 z-50 flex max-h-[min(36rem,calc(100dvh-5rem))] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl sm:left-auto sm:right-4 sm:w-96"
              >
                <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                  <p className="text-sm font-semibold">
                    Notifications{has ? <span className="ml-2 rounded-md bg-warn-soft px-1.5 py-0.5 text-xs font-medium text-warn">{unread} unread</span> : null}
                  </p>
                  <div className="flex items-center gap-1">
                    {has ? (
                      <button type="button" onClick={markAll} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-muted hover:bg-surface-hover hover:text-text">
                        <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                      </button>
                    ) : null}
                    <button type="button" onClick={close} aria-label="Close notifications" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-hover hover:text-text">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto overscroll-contain">
                  {items === null ? (
                    <p className="px-4 py-8 text-center text-sm text-faint">Loading…</p>
                  ) : items.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-faint">Nothing yet. When work is passed to you, it shows here.</p>
                  ) : (
                    <ul className="divide-y divide-border/60">
                      {items.map((n) => (
                        <li key={n.id}>
                          <button
                            type="button"
                            onClick={() => go(n)}
                            className={cn("flex w-full gap-3 px-4 py-3 text-left hover:bg-surface-hover", !n.read && "bg-warn-soft/40")}
                          >
                            <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-warn")} aria-hidden="true" />
                            <span className="min-w-0 flex-1">
                              <span className={cn("block text-sm", n.read ? "text-muted" : "font-medium text-text")}>{n.title}</span>
                              {n.body ? <span className="mt-0.5 block text-xs text-muted wrap-break-word">{n.body}</span> : null}
                              <span className="mt-1 block text-[11px] text-faint">
                                {ago(n.createdAt)}
                                {n.actorName ? ` · ${n.actorName}` : ""}
                                {!n.read ? <span className="sr-only"> (unread)</span> : null}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1 border-t border-border px-2 py-2">
                  <button type="button" onClick={toggleSound} aria-pressed={sound} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-muted hover:bg-surface-hover hover:text-text">
                    {sound ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                    Sound {sound ? "on" : "off"}
                  </button>
                  {desktop === "unsupported" ? null : desktop === "denied" ? (
                    <span className="px-2 text-xs text-faint">Pop-ups are blocked in this browser&apos;s settings</span>
                  ) : (
                    <button type="button" onClick={toggleDesktop} aria-pressed={desktop === "on"} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-muted hover:bg-surface-hover hover:text-text">
                      <Monitor className="h-3.5 w-3.5" />
                      {desktop === "on" ? "Pop-ups on" : "Turn on pop-ups"}
                    </button>
                  )}
                </div>
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}
