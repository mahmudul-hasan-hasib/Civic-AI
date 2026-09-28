"use client";

/* Header controls shared by both personas: the role switcher and the identity
   badge. The two routes use different header palettes ("navy" on the citizen
 * portal, "civic" in the shared NavBar), so every control takes a tone. */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import {
  BadgeCheck,
  Check,
  ChevronRight,
  HardHat,
  Pencil,
  Users,
} from "lucide-react";

import {
  ADMIN_ROLE_LABEL,
  AUTHORITY_ROUTE,
  CITIZEN_ROLE_LABEL,
  CITIZEN_ROUTE,
  DEFAULT_ADMIN_NAME,
  DEFAULT_CITIZEN_NAME,
  useAuth,
} from "@/context/AuthContext";
import type { CivicRole } from "@/context/AuthContext";

type Tone = "navy" | "civic";

const SEGMENT_ACTIVE: Record<Tone, string> = {
  navy: "rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white",
  civic: "rounded-full bg-civic-blue px-2.5 py-1 text-[11px] font-semibold text-white",
};

const SEGMENT_IDLE: Record<Tone, string> = {
  navy: "rounded-full px-2.5 py-1 text-[11px] font-semibold text-slate-300 transition hover:text-white",
  civic:
    "rounded-full px-2.5 py-1 text-[11px] font-semibold text-civic-muted transition hover:text-civic-ink",
};

const TRACK: Record<Tone, string> = {
  navy: "flex items-center gap-0.5 rounded-full bg-[#0c2f5c] p-1 ring-1 ring-[#1b4b8a]",
  civic: "flex items-center gap-0.5 rounded-full border border-civic-line bg-civic-soft p-1",
};

const BADGE_RING: Record<Tone, string> = {
  navy: "bg-emerald-500",
  civic: "bg-civic-blue",
};

/* ---------------------------- role switcher ----------------------------- */

export function RoleSwitcher({ tone = "civic" }: { tone?: Tone }) {
  const { role, setRole, isAdmin } = useAuth();
  const router = useRouter();
  const onAuthorityRoute = usePathname() === AUTHORITY_ROUTE;

  /* Switching back to Citizen from the command centre also walks the officer
     back to the filing form, so the toggle never strands anyone on a gate. */
  const choose = (next: CivicRole) => {
    setRole(next);
    if (next === "citizen" && onAuthorityRoute) router.push(CITIZEN_ROUTE);
  };

  return (
    <div className="flex items-center gap-2">
      <div
        role="group"
        aria-label="Active role"
        className={TRACK[tone]}
        data-testid="role-switcher"
      >
        <button
          type="button"
          onClick={() => choose("citizen")}
          aria-pressed={role === "citizen"}
          className={`inline-flex items-center gap-1.5 ${role === "citizen" ? SEGMENT_ACTIVE[tone] : SEGMENT_IDLE[tone]}`}
        >
          <Users className="h-3 w-3" aria-hidden="true" />
          Citizen
        </button>
        <button
          type="button"
          onClick={() => choose("admin")}
          aria-pressed={role === "admin"}
          className={`inline-flex items-center gap-1.5 ${role === "admin" ? SEGMENT_ACTIVE[tone] : SEGMENT_IDLE[tone]}`}
        >
          <HardHat className="h-3 w-3" aria-hidden="true" />
          <span className="hidden sm:inline">Authority</span>
          <span className="sm:hidden">Admin</span>
        </button>
      </div>

      {isAdmin && !onAuthorityRoute ? (
        <Link
          href={AUTHORITY_ROUTE}
          data-testid="open-command-center"
          className={
            tone === "navy"
              ? "inline-flex items-center gap-1 rounded-full bg-[#1d63b8] px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#2569bd]"
              : "civic-cta inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:opacity-95"
          }
        >
          <span className="hidden sm:inline">Open Command Center</span>
          <span className="sm:hidden">Command</span>
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

/* ---------------------------- identity badge ---------------------------- */

export function UserIdentityBadge({ tone = "civic" }: { tone?: Tone }) {
  const { isAdmin, displayName, initials, setCitizenName, setAdminName } = useAuth();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displayName);
  /* Escape unmounts the field, which can still fire a blur; this keeps the
     cancelled value from being written back to storage. */
  const [cancelled, setCancelled] = useState(false);

  const placeholder = isAdmin ? DEFAULT_ADMIN_NAME : DEFAULT_CITIZEN_NAME;
  const roleLabel = isAdmin ? ADMIN_ROLE_LABEL : CITIZEN_ROLE_LABEL;
  const commitName = isAdmin ? setAdminName : setCitizenName;

  const beginEditing = () => {
    setCancelled(false);
    setDraft(displayName);
    setEditing(true);
  };

  const commit = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (cancelled) {
      setCancelled(false);
      return;
    }
    commitName(draft);
    setEditing(false);
  };

  const shell =
    tone === "navy"
      ? "hidden items-center gap-1 rounded-full bg-[#0c2f5c] py-1 pl-3 pr-1 ring-1 ring-[#5b9be0] lg:flex"
      : "hidden items-center gap-1 rounded-full border border-civic-blue/40 bg-civic-soft py-1 pl-3 pr-1 sm:flex";

  if (editing) {
    return (
      <form onSubmit={commit} className={shell}>
        <label htmlFor="civic-identity-name" className="sr-only">
          Your name
        </label>
        <input
          id="civic-identity-name"
          value={draft}
          maxLength={48}
          autoFocus
          placeholder={placeholder}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => commit()}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setCancelled(true);
              setEditing(false);
            }
          }}
          className={
            tone === "navy"
              ? "w-40 rounded-full bg-transparent text-[11px] text-white outline-none placeholder:text-slate-400"
              : "w-36 rounded-full bg-transparent text-[11px] text-civic-ink outline-none placeholder:text-civic-muted"
          }
        />
        <button
          type="submit"
          aria-label="Save name"
          className={
            tone === "navy"
              ? "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1d63b8] text-white transition hover:bg-[#2569bd]"
              : "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-civic-blue text-white"
          }
        >
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={beginEditing}
      data-testid="identity-badge"
      title={isAdmin ? "Click to change the officer name" : "Click to change your name"}
      aria-label={`${roleLabel}: ${displayName}. Activate to change the name.`}
      className={
        tone === "navy"
          ? "hidden items-center gap-2 rounded-full bg-[#0c2f5c] py-1 pl-1 pr-2.5 text-left ring-1 ring-[#1b4b8a] transition hover:ring-[#5b9be0] lg:inline-flex"
          : "hidden items-center gap-2 rounded-full border border-civic-line bg-civic-soft py-1 pl-1 pr-2.5 text-left transition hover:border-civic-blue/50 sm:inline-flex"
      }
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${BADGE_RING[tone]}`}
      >
        {initials}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="flex items-center gap-1">
          <span className="block max-w-[9rem] truncate text-[11px] font-semibold text-civic-ink dark:text-white">
            {displayName}
          </span>
          {isAdmin ? (
            <BadgeCheck
              className="h-3.5 w-3.5 shrink-0 text-emerald-500"
              aria-label="Verified authority"
            />
          ) : null}
        </span>
        <span className="block text-[10px] text-civic-muted dark:text-slate-300">{roleLabel}</span>
      </span>
      <Pencil
        className={
          tone === "navy"
            ? "h-3 w-3 shrink-0 text-slate-300"
            : "h-3 w-3 shrink-0 text-civic-muted"
        }
        aria-hidden="true"
      />
    </button>
  );
}
