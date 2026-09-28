"use client";

/* Shared application header for both routes.

   Renders the CivicLens brand, the DPI initiative chip, the Day/Night switch, the
   role switcher and the identity badge. The active route is derived from
   usePathname() so callers only declare their own persona. */

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { HardHat, Landmark } from "lucide-react";

import { CITIZEN_ROUTE } from "@/context/AuthContext";
import { RoleSwitcher, UserIdentityBadge } from "@/components/RoleControls";
import ThemeToggle from "@/components/ThemeToggle";
import { TricolorRule } from "@/components/civic-ui";

export { AUTHORITY_ROUTE, CITIZEN_ROUTE } from "@/context/AuthContext";

export default function NavBar({
  persona,
  eyebrow,
  title,
  subtitle,
  children,
}: {
  persona: "citizen" | "authority";
  /** Small kicker above the wordmark on the authority route. */
  eyebrow?: string;
  /** Wordmark; accepts JSX so callers can inject the gradient "Lens" span. */
  title: ReactNode;
  subtitle: string;
  /** Telemetry / status strip rendered under the brand row. */
  children?: ReactNode;
}) {
  const pathname = usePathname();
  const isAuthority = persona === "authority";

  return (
    <header className="civic-glass sticky top-0 z-[900] -mx-4 mb-5 flex flex-col gap-3 border-b border-civic-line px-4 pt-3 pb-0 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 lg:gap-4 lg:pt-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 shadow-md shadow-indigo-600/20 sm:h-11 sm:w-11">
            {isAuthority ? (
              <HardHat className="h-4 w-4 text-white sm:h-5 sm:w-5" aria-hidden="true" />
            ) : (
              <Landmark className="h-4 w-4 text-white sm:h-5 sm:w-5" aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-[10px] font-semibold uppercase tracking-wider text-civic-blue">
                {eyebrow}
              </p>
            ) : null}
            <p className="truncate text-base font-semibold tracking-tight text-civic-ink sm:text-xl">
              {title}
            </p>
            <p className="hidden text-[11px] leading-snug text-civic-muted md:block">
              {subtitle}
            </p>
            <p className="truncate text-[10px] font-medium text-civic-muted md:hidden">
              {isAuthority ? "Municipal Command" : "DPI Citizen Redressal"}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <UserIdentityBadge tone="civic" />
          <ThemeToggle />
          {/* Single cross-persona affordance: flipping to Citizen on this route
              returns the officer to the filing form automatically. */}
          <RoleSwitcher tone="civic" />
          <span className="hidden items-center gap-1.5 rounded-full border border-slate-700/60 bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-slate-300 xl:inline-flex">
            <span aria-hidden="true">🇮🇳</span>
            DPI Citizen Redressal Initiative
          </span>
        </div>
      </div>

      {children}

      <TricolorRule />
      <span className="sr-only" aria-current={pathname === CITIZEN_ROUTE ? "page" : undefined}>
        {isAuthority ? "Authority Command Center" : "Citizen Portal"}
      </span>
    </header>
  );
}
