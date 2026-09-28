"use client";

/* ==========================================================================
 * CivicLens · NOTIFICATION BELL
 *
 * Unread state is derived from a per-officer read-marker in localStorage rather
 * than kept in component state, so a reload never resurrects an alert the
 * officer already dismissed. The popover closes on Escape and on any outside
 * pointer-down, which is the behaviour people expect from a header menu.
 * ========================================================================== */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Bell, CheckCheck, X } from "lucide-react";

const READ_STORAGE_KEY = "civiclens-notifications-read";

const ALL_NOTIFICATIONS = [
  {
    id: "esc-ward-12",
    tone: "critical" as const,
    title: "Escalated: Ward 12 water main",
    body: "Three linked reports in 48h breached the 2-hour dispatch window. Zone officer notified.",
    time: "12 min ago",
  },
  {
    id: "infra-ghatkopar",
    tone: "warning" as const,
    title: "Infrastructure gap detected",
    body: "Ward 05 PWD allocation is 12% below modelled demand. Reallocation draft is ready.",
    time: "1 hr ago",
  },
  {
    id: "budget-cycle",
    tone: "info" as const,
    title: "Budget cycle review due",
    body: "Quarterly allocation review closes Friday. 4 wards are still missing a demand-gap entry.",
    time: "Yesterday",
  },
] as const;

const TONE_STYLES: Record<"critical" | "warning" | "info", string> = {
  critical: "bg-rose-500/10 text-rose-300 ring-rose-400/30",
  warning: "bg-amber-500/10 text-amber-300 ring-amber-400/30",
  info: "bg-sky-500/10 text-sky-300 ring-sky-400/30",
};

const TONE_DOT: Record<"critical" | "warning" | "info", string> = {
  critical: "bg-rose-400",
  warning: "bg-amber-400",
  info: "bg-sky-400",
};

/* The reader is cached by the raw storage string, so an unchanged value keeps
   returning the identical array. Without that, every render would hand
   useSyncExternalStore a new reference and loop forever - the same trap the
   civic store had to be fixed for. */
const EMPTY: string[] = [];
let cachedRaw: string | null = null;
let cachedIds: string[] = EMPTY;

function readIds(): string[] {
  if (typeof window === "undefined") return EMPTY;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(READ_STORAGE_KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cachedRaw) return cachedIds;
  cachedRaw = raw;

  try {
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    cachedIds = Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : EMPTY;
  } catch {
    cachedIds = EMPTY;
  }
  return cachedIds;
}

/* "storage" fires in other tabs, and the local write() below fires it manually
   for this one. */
const subscribe = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
};

const readIdsServer = () => EMPTY;

/* Same hydration sentinel the routes use: the server renders the "not yet
   hydrated" variant, the client immediately reports true. */
const NO_SUBSCRIBE = () => () => {};
const CLIENT_MOUNTED = () => true;
const SERVER_HYDRATING = () => false;

function writeIds(next: string[]) {
  try {
    window.localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* Private-mode storage denial must not break the popover. */
  }
  /* Bust the cache, then notify: a write does not raise "storage" in origin. */
  cachedRaw = null;
  window.dispatchEvent(new Event("storage"));
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const readIdsFromStore = useSyncExternalStore(subscribe, readIds, readIdsServer);
  /* During SSR the snapshot is empty, so the badge would read 0 and pop on
     mount. Report the full count until hydration confirms the read state. */
  const hydrated = useSyncExternalStore(
    NO_SUBSCRIBE,
    CLIENT_MOUNTED,
    SERVER_HYDRATING,
  );

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const persist = useCallback((next: string[]) => {
    writeIds(next);
  }, []);

  const markAllRead = useCallback(() => {
    persist(ALL_NOTIFICATIONS.map((item) => item.id));
  }, [persist]);

  const markOneRead = useCallback(
    (id: string) => {
      if (readIdsFromStore.includes(id)) return;
      persist([...readIdsFromStore, id]);
    },
    [persist, readIdsFromStore],
  );

  const unread = ALL_NOTIFICATIONS.filter(
    (item) => !(hydrated && readIdsFromStore.includes(item.id)),
  );
  const unreadCount = unread.length;

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications, none unread"
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        className="relative hidden h-8 w-8 items-center justify-center rounded-full bg-[#0c2f5c] text-slate-200 ring-1 ring-[#1b4b8a] transition hover:text-white sm:inline-flex"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unreadCount > 0 ? (
          <span
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold tabular-nums text-[#0c2f5c] ring-2 ring-[#103b6e]"
            aria-hidden="true"
          >
            {unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-[calc(100%+0.6rem)] z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[#1b4b8a] bg-[#0c2a4e] text-white shadow-2xl shadow-black/50"
        >
          <header className="flex items-center justify-between gap-3 border-b border-[#1b4578] px-4 py-3">
            <p className="text-sm font-bold">Notifications</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={markAllRead}
                disabled={unreadCount === 0}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Mark all as read
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close notifications"
                className="rounded-lg p-1 text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </header>

          <ul className="max-h-80 divide-y divide-[#1b4578] overflow-y-auto">
            {ALL_NOTIFICATIONS.map((item) => {
              const isRead = hydrated && readIdsFromStore.includes(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => markOneRead(item.id)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-white/5"
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE_DOT[item.tone]}`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ring-1 ${TONE_STYLES[item.tone]}`}
                        >
                          {item.tone}
                        </span>
                        {!isRead ? (
                          <span className="text-[9px] font-bold uppercase tracking-wide text-amber-300">
                            New
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={`mt-1 block text-[13px] font-semibold leading-snug ${isRead ? "text-slate-300" : "text-white"}`}
                      >
                        {item.title}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-300">
                        {item.body}
                      </span>
                      <span className="mt-1 block text-[10px] text-slate-400">{item.time}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
