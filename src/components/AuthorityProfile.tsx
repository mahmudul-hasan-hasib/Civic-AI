"use client";

/* ==========================================================================
 * CivicLens · AUTHORITY PROFILE CONTROL
 *
 * Two states, one slot in the sticky header:
 *   signed out — a single "Official Login / Register" call to action.
 *   signed in  — a capsule showing the officer's real initials, full name and
 *                designation, which opens an account menu carrying their
 *                employee code and ward plus logout / switch-authority actions.
 * ========================================================================== */

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  IdCard,
  LogOut,
  MapPin,
  RefreshCw,
  ShieldCheck,
  UserRoundCog,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import type { Officer } from "@/context/AuthContext";

type AuthorityProfileProps = {
  onOpenAuth: (initial?: Officer | null) => void;
};

export default function AuthorityProfile({ onOpenAuth }: AuthorityProfileProps) {
  const { isOfficerSignedIn, officer, displayName, initials, roleLabel, logoutOfficer } =
    useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  /* Any click outside the capsule dismisses the menu, and Escape closes it
     without disturbing focus. */
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!isOfficerSignedIn) {
    return (
      <button
        type="button"
        onClick={() => onOpenAuth()}
        data-testid="official-login-cta"
        className="inline-flex items-center gap-1.5 rounded-lg bg-[#1d63b8] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#2569bd]"
      >
        <UserRoundCog className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">Official Login / Register</span>
        <span className="sm:hidden">Login</span>
      </button>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="authority-profile"
        className="flex items-center gap-2 rounded-full bg-[#0c2f5c] py-1 pl-1 pr-2.5 text-left ring-1 ring-[#1b4b8a] transition hover:ring-[#5b9be0]"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1d63b8] text-[11px] font-bold text-white">
          {initials}
        </span>
        <span className="hidden min-w-0 leading-tight lg:block">
          <span className="flex max-w-[11rem] items-center gap-1">
            <span className="truncate text-[11px] font-semibold text-white">{displayName}</span>
            <ShieldCheck className="h-3 w-3 shrink-0 text-emerald-400" aria-hidden="true" />
          </span>
          <span className="block max-w-[11rem] truncate text-[10px] text-slate-300">
            {roleLabel}
          </span>
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-slate-300 transition ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-[60] w-72 overflow-hidden rounded-xl border border-[#1e4d88] bg-[#133e70] text-white shadow-2xl"
        >
          <div className="border-b border-[#1b4578] p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1d63b8] text-sm font-bold text-white">
                {initials}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white">{displayName}</p>
                <p className="truncate text-[11px] text-sky-200">{roleLabel}</p>
              </div>
            </div>
            <dl className="mt-3 space-y-1.5 text-[11px]">
              <div className="flex items-center gap-2 text-slate-300">
                <IdCard className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <dt className="sr-only">Employee code</dt>
                <dd className="truncate font-mono">{officer?.officialId}</dd>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <dt className="sr-only">Jurisdiction</dt>
                <dd className="truncate">{officer?.ward}</dd>
              </div>
            </dl>
          </div>

          <div className="p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onOpenAuth(officer);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-white transition hover:bg-[#1b4578]"
            >
              <UserRoundCog className="h-3.5 w-3.5" aria-hidden="true" />
              Account · edit credentials
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onOpenAuth(null);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-white transition hover:bg-[#1b4578]"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Switch authority
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                logoutOfficer();
              }}
              data-testid="officer-logout"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-rose-200 transition hover:bg-[#1b4578]"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Logout
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
