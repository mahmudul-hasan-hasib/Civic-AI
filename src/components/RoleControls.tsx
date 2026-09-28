"use client";

/* ==========================================================================
 * CivicLens · HEADER IDENTITY CONTROLS
 *
 * Two header controls with non-overlapping jobs:
 *   RoleSwitcher   — persona elevation, so a judge can open the command center
 *                    in one click.
 *   CitizenBadge   — the filing citizen's own name, which is what gets printed
 *                    on their PDF receipt. It is hidden while the authority
 *                    role is active, because then AuthorityProfile already
 *                    owns the identity slot with the real officer's details.
 *
 * Both render in the shared deep-navy header, so no tone prop is needed.
 * ========================================================================== */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import { Check, ChevronRight, HardHat, Pencil, Users } from "lucide-react";

import {
  AUTHORITY_ROUTE,
  CITIZEN_ROLE_LABEL,
  CITIZEN_ROUTE,
  DEFAULT_CITIZEN_NAME,
  useAuth,
} from "@/context/AuthContext";
import type { CivicRole } from "@/context/AuthContext";

const TRACK = "flex items-center gap-0.5 rounded-full bg-[#0c2f5c] p-1 ring-1 ring-[#1b4b8a]";
const SEGMENT_ACTIVE = "rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white";
const SEGMENT_IDLE =
  "rounded-full px-2.5 py-1 text-[11px] font-semibold text-slate-300 transition hover:text-white";

/* ---------------------------- role switcher ----------------------------- */

export function RoleSwitcher() {
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
      <div role="group" aria-label="Active role" className={TRACK} data-testid="role-switcher">
        <button
          type="button"
          onClick={() => choose("citizen")}
          aria-pressed={role === "citizen"}
          className={`inline-flex items-center gap-1.5 ${role === "citizen" ? SEGMENT_ACTIVE : SEGMENT_IDLE}`}
        >
          <Users className="h-3 w-3" aria-hidden="true" />
          Citizen
        </button>
        <button
          type="button"
          onClick={() => choose("admin")}
          aria-pressed={role === "admin"}
          className={`inline-flex items-center gap-1.5 ${role === "admin" ? SEGMENT_ACTIVE : SEGMENT_IDLE}`}
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
          className="inline-flex items-center gap-1 rounded-full bg-[#1d63b8] px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#2569bd]"
        >
          <span className="hidden sm:inline">Open Command Center</span>
          <span className="sm:hidden">Command</span>
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

/* --------------------------- citizen identity --------------------------- */

export function CitizenIdentityBadge() {
  const { isAdmin, citizenName, initials, setCitizenName } = useAuth();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(citizenName);
  /* Escape unmounts the field, which can still fire a blur; this keeps the
     cancelled value from being written back to storage. */
  const [cancelled, setCancelled] = useState(false);

  /* The officer pill is the identity surface once the authority role is active. */
  if (isAdmin) return null;

  const beginEditing = () => {
    setCancelled(false);
    setDraft(citizenName);
    setEditing(true);
  };

  const commit = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (cancelled) {
      setCancelled(false);
      return;
    }
    setCitizenName(draft);
    setEditing(false);
  };

  if (editing) {
    return (
      <form
        onSubmit={commit}
        className="hidden items-center gap-1 rounded-full bg-[#0c2f5c] py-1 pl-3 pr-1 ring-1 ring-[#5b9be0] lg:flex"
      >
        <label htmlFor="civic-identity-name" className="sr-only">
          Your name
        </label>
        <input
          id="civic-identity-name"
          value={draft}
          maxLength={48}
          autoFocus
          placeholder={DEFAULT_CITIZEN_NAME}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => commit()}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setCancelled(true);
              setEditing(false);
            }
          }}
          className="w-40 rounded-full bg-transparent text-[11px] text-white outline-none placeholder:text-slate-400"
        />
        <button
          type="submit"
          aria-label="Save name"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1d63b8] text-white transition hover:bg-[#2569bd]"
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
      title="Click to change your name"
      aria-label={`${CITIZEN_ROLE_LABEL}: ${citizenName}. Activate to change the name.`}
      className="hidden items-center gap-2 rounded-full bg-[#0c2f5c] py-1 pl-1 pr-2.5 text-left ring-1 ring-[#1b4b8a] transition hover:ring-[#5b9be0] lg:inline-flex"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1d63b8] text-[11px] font-bold text-white">
        {initials}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block max-w-[9rem] truncate text-[11px] font-semibold text-white">
          {citizenName}
        </span>
        <span className="block text-[10px] text-slate-300">{CITIZEN_ROLE_LABEL}</span>
      </span>
      <Pencil className="h-3 w-3 shrink-0 text-slate-300" aria-hidden="true" />
    </button>
  );
}
