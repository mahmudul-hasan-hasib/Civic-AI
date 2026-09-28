"use client";

/* ==========================================================================
 * CivicLens · SHARED STICKY NAVIGATION
 *
 * One opaque deep-navy header drives both routes, so moving between the citizen
 * filing form and the policymaker command center never changes the chrome. The
 * active tab is derived from the pathname, and the right-hand cluster carries
 * the role switcher plus the dynamic authority profile, which itself owns the
 * official login / registration dialog.
 * ========================================================================== */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, Globe } from "lucide-react";

import { AUTHORITY_ROUTE, CITIZEN_ROUTE } from "@/context/AuthContext";
import type { Officer } from "@/context/AuthContext";
import AshokaChakra from "@/components/AshokaChakra";
import AuthorityAuthModal from "@/components/AuthorityAuthModal";
import AuthorityProfile from "@/components/AuthorityProfile";
import NotificationBell from "@/components/NotificationBell";
import { RoleSwitcher, CitizenIdentityBadge } from "@/components/RoleControls";
import ThemeToggle from "@/components/ThemeToggle";

const TABS = [
  { href: CITIZEN_ROUTE, label: "Citizen Portal" },
  { href: AUTHORITY_ROUTE, label: "Policymaker Dashboard" },
] as const;

const IDLE =
  "flex-1 rounded-full px-4 py-1.5 text-center text-xs font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white sm:flex-none";
const ACTIVE = "flex-1 rounded-full bg-white/15 px-4 py-1.5 text-center text-xs font-semibold text-white sm:flex-none";

export default function TopNav({
  rightSlot,
  showSystemChip = true,
}: {
  rightSlot?: ReactNode;
  showSystemChip?: boolean;
}) {
  const pathname = usePathname();
  const [authOpen, setAuthOpen] = useState(false);
  const [authSeed, setAuthSeed] = useState<Officer | null>(null);

  const openAuth = (initial?: Officer | null) => {
    setAuthSeed(initial ?? null);
    setAuthOpen(true);
  };

  return (
    <>
      <nav className="sticky top-0 z-50 border-b border-[#1b4b8a] bg-[#103b6e] text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          {/* Brand */}
          <Link href={CITIZEN_ROUTE} className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/25">
              <AshokaChakra className="h-6 w-6 text-white" />
            </span>
            <span className="min-w-0">
              <span className="block text-base font-bold leading-tight tracking-tight">
                CivicLens
              </span>
              <span className="block truncate text-[11px] leading-tight text-slate-300">
                AI Civic Intelligence Platform
              </span>
            </span>
          </Link>

          {/* Center tab group */}
          <div
            role="tablist"
            aria-label="Sections"
            className="order-3 flex w-full items-center rounded-full bg-[#0c2f5c] p-1 ring-1 ring-[#1b4b8a] sm:order-2 sm:ml-4 sm:w-auto"
          >
            {TABS.map((tab) => {
              const isActive = pathname === tab.href;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  role="tab"
                  aria-current={isActive ? "page" : undefined}
                  className={isActive ? ACTIVE : IDLE}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>

          {/* Right cluster */}
          <div className="order-2 ml-auto flex flex-wrap items-center justify-end gap-2 sm:order-3">
            {rightSlot}
            {showSystemChip ? (
              <span className="hidden items-center gap-1.5 rounded-full bg-[#0c2f5c] px-3 py-1.5 text-[11px] font-medium text-slate-200 ring-1 ring-[#1b4b8a] xl:inline-flex">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                All systems operational
              </span>
            ) : null}
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#0c2f5c] px-2.5 py-1.5 text-[11px] font-medium text-slate-200 ring-1 ring-[#1b4b8a]"
              aria-label="Interface language: English"
            >
              <Globe className="h-3.5 w-3.5" aria-hidden="true" />
              EN
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
            </button>
            <NotificationBell />
            <ThemeToggle />
            <RoleSwitcher />
            <CitizenIdentityBadge />
            <AuthorityProfile onOpenAuth={openAuth} />
          </div>
        </div>
      </nav>

      <AuthorityAuthModal
        open={authOpen}
        initial={authSeed}
        onClose={() => setAuthOpen(false)}
      />
    </>
  );
}
