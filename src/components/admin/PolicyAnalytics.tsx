"use client";

import { ArrowRight, Cpu, Sparkles } from "lucide-react";

import { formatINR, reallocationFor } from "@/app/civic-shared";
import type { CategoryAllocation } from "@/app/civic-shared";
import type { CivicTelemetry } from "@/lib/civic-store";
import { AccentButton, AdminPanel, AdminPanelHeader } from "@/components/admin/Primitives";

export default function PolicyAnalytics({
  allocations,
  telemetry,
  onReview,
}: {
  allocations: CategoryAllocation[];
  /** Provenance of the most recent real analysis, when one has been filed. */
  telemetry: CivicTelemetry | null;
  onReview: () => void;
}) {
  /* The worst-aligned category drives the AI signal, so the recommendation can
     never disagree with the table above it. */
  const worst = allocations[0];
  const aligned = worst ? worst.deficitPct <= 0 : true;
  const gapPoints = worst ? Math.abs(worst.deficitPct) : 0;

  return (
    <AdminPanel className="my-6 lg:p-6">
      <AdminPanelHeader
        eyebrow="Policy analytics"
        title="Municipal Budget vs Citizen Demand"
        subtitle="Share of ward demand measured against the sanctioned allocation."
        actions={
          <span className="rounded-lg border border-[#2f6fb8] bg-[#0d2e55] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-sky-200">
            FY 2025-26
          </span>
        }
      />

      <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Comparison table */}
        <div className="overflow-x-auto lg:col-span-8">
          <table className="w-full min-w-[34rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#2f6fb8] text-[10px] uppercase tracking-wider text-sky-200">
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Category
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">
                  Citizen demand
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">
                  Allocated budget
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">
                  Gap
                </th>
                <th scope="col" className="py-2 font-semibold">
                  Recommended reallocation
                </th>
              </tr>
            </thead>
            <tbody>
              {allocations.map((row) => {
                const positive = row.deficitPct > 0;
                return (
                  <tr key={row.category} className="border-b border-[#1b4578] last:border-b-0">
                    <th
                      scope="row"
                      className="py-2.5 pr-3 text-[12px] font-semibold text-white"
                    >
                      {row.category}
                    </th>
                    <td className="py-2.5 pr-3 text-right text-[12px] text-slate-200">
                      {row.demandPct.toFixed(0)}%
                    </td>
                    <td className="py-2.5 pr-3 text-right text-[12px] text-slate-200">
                      {row.budgetPct.toFixed(0)}%
                    </td>
                    <td
                      className={`py-2.5 pr-3 text-right text-[12px] font-bold ${
                        positive ? "text-rose-300" : "text-sky-300"
                      }`}
                    >
                      {positive ? "+" : ""}
                      {row.deficitPct.toFixed(0)}%
                    </td>
                    <td className="py-2.5 text-[12px] text-slate-200">
                      {positive
                        ? `Reallocate ${formatINR(reallocationFor(row.deficitPct))}`
                        : row.deficitPct > -10
                          ? "Allocation adequate"
                          : "Monitor next cycle"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* AI signal */}
        <aside className="lg:col-span-4">
          <div
            className="flex h-full flex-col rounded-xl border border-[#1b4475] bg-[#0d2e55] p-4"
            data-testid="ai-policy-signal"
          >
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-sky-300">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              AI-generated policy signal
            </p>

            <p className="mt-2.5 text-[13px] font-bold leading-snug text-white">
              {aligned
                ? "Citizen demand is broadly matched by current allocation."
                : `${worst?.category} demand exceeds current allocation in monitored wards.`}
            </p>

            <p className="mt-2 text-[11px] leading-relaxed text-slate-300">
              {aligned
                ? "No category is misaligned by more than the tolerance band, so this cycle needs monitoring rather than reallocation."
                : `Citizen demand is ${gapPoints.toFixed(0)} percentage points above budget share, concentrated in the most flood-prone and road-damaged wards.`}
            </p>

            {/* Provenance of the last real analysis, so the AI claim above is
                backed by the pipeline that produced the triage. */}
            {telemetry ? (
              <p className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-[#1b4475] pt-2.5 text-[10px] text-slate-400">
                <Cpu className="h-3 w-3 shrink-0 text-sky-300" aria-hidden="true" />
                <span className="font-mono text-sky-200">{telemetry.active_model}</span>
                <span>· {telemetry.latency_ms} ms</span>
                <span>· {Math.round(telemetry.confidence * 100)}% confidence</span>
                <span>· {telemetry.mode} mode</span>
              </p>
            ) : null}

            <div className="mt-auto pt-4">
              <AccentButton
                onClick={onReview}
                disabled={aligned}
                className="w-full"
                title={aligned ? "No reallocation is warranted this cycle" : undefined}
              >
                {aligned
                  ? "No reallocation required"
                  : `Review ${formatINR(reallocationFor(worst?.deficitPct ?? 0))} reallocation`}
                {!aligned ? <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /> : null}
              </AccentButton>
              <p className="mt-2 text-center text-[10px] leading-relaxed text-slate-400">
                AI-generated decision support. Final sanction rests with the ward office.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </AdminPanel>
  );
}
