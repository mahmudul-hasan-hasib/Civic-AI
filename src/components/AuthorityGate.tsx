"use client";

/* Friendly authority gate for /dashboard.

   A citizen who follows the "Policymaker Dashboard" tab should never meet a
   dead 401/403 wall, and a judge must never be stuck behind a credential form.
   This card states who the route is for and offers one-click demo access, so
   the command centre is two seconds away from either audience. */

import Link from "next/link";
import { ArrowLeft, HardHat, MapPinned, ShieldCheck, Sparkles, Zap } from "lucide-react";

import NavBar from "@/components/NavBar";
import { CITIZEN_ROUTE, useAuth } from "@/context/AuthContext";

const CAPABILITIES = [
  { icon: MapPinned, label: "Live incident map across all 22 monitored wards" },
  { icon: Zap, label: "Actionable SLA triage queue with dispatch triggers" },
  { icon: HardHat, label: "Ward budget-versus-demand deficit analytics" },
];

export default function AuthorityGate() {
  const { grantAdmin, adminName } = useAuth();

  return (
    <div className="min-h-screen w-full bg-civic-page text-civic-ink">
      <div
        aria-hidden="true"
        className="h-[2px] w-full bg-gradient-to-r from-amber-500 via-white to-emerald-500 opacity-80"
      />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60rem_38rem_at_12%_-12%,rgba(37,99,235,0.16),transparent),radial-gradient(48rem_32rem_at_100%_0%,rgba(16,185,129,0.10),transparent)]" />

      <div className="relative mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
        <NavBar
          persona="authority"
          eyebrow="Restricted route"
          title={
            <>
              Civic
              <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent dark:from-indigo-300 dark:to-violet-300">
                Lens
              </span>{" "}
              <span className="text-civic-muted">· Authority</span>
            </>
          }
          subtitle="Municipal operations, ward budgets and SLA triage for engineers and commissioners"
        />

        <div className="mx-auto mt-6 flex max-w-3xl flex-col gap-6 pb-10">
          <section className="civic-panel flex flex-col gap-6 p-6 sm:p-8">
            <header className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-civic-blue/10 ring-1 ring-civic-blue/25">
                <ShieldCheck className="h-6 w-6 text-civic-blue" aria-hidden="true" />
              </span>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-civic-ink sm:text-3xl">
                  Ward Authority Portal
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-civic-muted">
                  The Ward Command Center is the internal view for municipal engineers, Ward
                  Commissioners and Public Works officers. You are currently browsing as a{" "}
                  <strong className="font-semibold text-civic-ink">citizen</strong>, so the triage
                  queue, incident map and budget analytics are held back.
                </p>
              </div>
            </header>

            <ul className="grid gap-2.5 sm:grid-cols-3">
              {CAPABILITIES.map((item) => (
                <li
                  key={item.label}
                  className="flex items-start gap-2 rounded-xl border border-civic-line bg-civic-soft p-3 text-[11px] leading-relaxed text-civic-ink"
                >
                  <item.icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-civic-blue" aria-hidden="true" />
                  {item.label}
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={grantAdmin}
                data-testid="quick-demo-access"
                className="civic-cta inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-6 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-civic-blue/30"
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Quick Demo Access (1-Click Judge Login)
              </button>
              <Link
                href={CITIZEN_ROUTE}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-civic-line bg-civic-soft px-5 text-sm font-semibold text-civic-ink transition hover:border-civic-blue/40 hover:text-civic-blue"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back to Citizen Portal
              </Link>
            </div>

            <p className="text-[11px] leading-relaxed text-civic-muted">
              Demo access runs as <span className="font-semibold text-civic-ink">{adminName}</span>,{" "}
              Ward 12 Authority. The role is stored in this browser only — nothing is sent to a
              server and no credentials are required. You can switch roles at any time from the
              segmented control in the header.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
