"use client";

import { formatINR, reallocationFor } from "@/app/civic-shared";
import type { CategoryAllocation } from "@/app/civic-shared";
import { AdminPanel, AdminPanelHeader } from "@/components/admin/Primitives";

export default function PolicyAnalytics({
  allocations,
}: {
  allocations: CategoryAllocation[];
}) {
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

      {/* Full width: the recommendation is a column of the same table rather than
          a separate AI narrative, so nothing on screen can contradict it. */}
      <div className="mt-4 overflow-x-auto">
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
                  <th scope="row" className="py-2.5 pr-3 text-[12px] font-semibold text-white">
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

      <p className="mt-3 border-t border-[#1b4578] pt-3 text-[10px] leading-relaxed text-slate-400">
        Decision support only. Final sanction rests with the ward office.
      </p>
    </AdminPanel>
  );
}
