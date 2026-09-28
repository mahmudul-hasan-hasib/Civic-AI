"use client";

/* Authority gate for /dashboard.

   A citizen who follows the "Policymaker Dashboard" tab should never meet a
   dead 401/403 wall, and a judge must never be stuck behind a credential form.
   The card states who the route is for and offers two ways in: register real
   official credentials, or one click through to the prefilled demo profile.
   Both are wrapped in the same navy chrome the command center uses, so the
   route never changes its visual language. */

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, HardHat, MapPinned, ShieldCheck, Sparkles, UserRoundCog, Zap } from "lucide-react";

import AmbientCanvas from "@/components/AmbientCanvas";
import AuthorityAuthModal from "@/components/AuthorityAuthModal";
import { SectionTagline } from "@/components/admin/Primitives";
import TopNav from "@/components/TopNav";
import { CITIZEN_ROUTE, DEMO_OFFICER, useAuth } from "@/context/AuthContext";

const CAPABILITIES = [
  { icon: MapPinned, label: "Live incident heatmap across all monitored wards" },
  { icon: Zap, label: "Actionable SLA triage queue with dispatch triggers" },
  { icon: HardHat, label: "Ward budget-versus-demand deficit analytics" },
];

export default function AuthorityGate() {
  const { quickDemoLogin, citizenName } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <div className="relative min-h-screen w-full bg-[#eef5fa] text-slate-800 dark:bg-[#0a1a2e] dark:text-slate-100">
      <AmbientCanvas />
      <TopNav showSystemChip={false} />

      <main className="relative z-10 mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <SectionTagline>प्रशासनिक दृष्टि · Administrative view</SectionTagline>

        <section className="mt-3 rounded-2xl border border-[#1e4d88] bg-[#133e70] p-6 text-white shadow-md sm:p-8">
          <header className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <ShieldCheck className="h-6 w-6 text-white" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                Ward Authority Portal
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                The Ward Command Center is the internal view for municipal engineers, Ward
                Commissioners and Public Works officers. You are currently browsing as{" "}
                <strong className="font-semibold text-white">{citizenName}</strong>, so the
                triage queue, incident heatmap and budget analytics are held back.
              </p>
            </div>
          </header>

          <ul className="mt-6 grid gap-2.5 sm:grid-cols-3">
            {CAPABILITIES.map((item) => (
              <li
                key={item.label}
                className="flex items-start gap-2 rounded-xl border border-[#1b4475] bg-[#0d2e55] p-3 text-[11px] leading-relaxed text-slate-200"
              >
                <item.icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300" aria-hidden="true" />
                {item.label}
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => setAuthOpen(true)}
              data-testid="official-register"
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#1d63b8] px-6 text-sm font-semibold text-white transition hover:bg-[#2569bd]"
            >
              <UserRoundCog className="h-4 w-4" aria-hidden="true" />
              Official Login / Register
            </button>

            <button
              type="button"
              onClick={quickDemoLogin}
              data-testid="quick-demo-access"
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-[#2f6fb8] bg-[#16406f] px-6 text-sm font-semibold text-white transition hover:bg-[#1d4f8c]"
            >
              <Sparkles className="h-4 w-4 text-amber-300" aria-hidden="true" />
              Quick Demo Access (1-Click Judge Login)
            </button>

            <Link
              href={CITIZEN_ROUTE}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#1b4578] px-5 text-sm font-semibold text-sky-200 transition hover:border-[#2f6fb8] hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to Citizen Portal
            </Link>
          </div>

          <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
            Quick Demo Access signs you in as{" "}
            <span className="font-semibold text-slate-200">{DEMO_OFFICER.name}</span>,{" "}
            {DEMO_OFFICER.designation} ({DEMO_OFFICER.officialId}). The session is stored in this
            browser only — nothing is sent to a server and no credentials are required.
          </p>
        </section>
      </main>

      <AuthorityAuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
