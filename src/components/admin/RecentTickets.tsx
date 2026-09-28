"use client";

import Link from "next/link";

import type { CivicReport } from "@/app/civic-shared";
import { AUTHORITY_ROUTE } from "@/context/AuthContext";
import {
  AdminPanel,
  AdminPanelHeader,
  UrgencyBadge,
  tierFor,
} from "@/components/admin/Primitives";

export type TicketRow = {
  id: string;
  category: string;
  grievance: string;
  ward: string;
  urgency: number;
  action: string;
  status: string;
  dispatched: boolean;
};

/* Case state is derived rather than stored: a dispatched ticket has a unit on
   site, and everything else ages through acknowledgement into review. */
export function statusFor(report: CivicReport, dispatched: boolean, now: number): string {
  if (dispatched) return "Assigned";
  const ageHours = (now - new Date(report.created_at).getTime()) / 3_600_000;
  if (!Number.isFinite(ageHours) || ageHours < 0) return "New";
  if (ageHours >= 24) return "In review";
  if (ageHours >= 4) return "Acknowledged";
  return "New";
}

const STATUS_STYLE: Record<string, string> = {
  New: "border-sky-300/50 bg-sky-400/10 text-sky-100",
  Acknowledged: "border-cyan-300/50 bg-cyan-400/10 text-cyan-100",
  "In review": "border-amber-300/50 bg-amber-400/10 text-amber-100",
  Assigned: "border-emerald-300/50 bg-emerald-400/10 text-emerald-100",
};

export default function RecentTickets({ rows }: { rows: TicketRow[] }) {
  return (
    <AdminPanel className="my-6 lg:p-6">
      <AdminPanelHeader
        eyebrow="Case management"
        title="Recent Tickets"
        subtitle="Newest first, ranked by arrival time across all monitored wards."
        actions={
          <Link
            href={AUTHORITY_ROUTE}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-300 transition hover:text-white"
          >
            View all cases →
          </Link>
        }
      />

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-[#2f6fb8] text-[10px] uppercase tracking-wider text-sky-200">
              <th scope="col" className="py-2 pr-3 font-semibold">
                Case ID
              </th>
              <th scope="col" className="py-2 pr-3 font-semibold">
                Grievance
              </th>
              <th scope="col" className="py-2 pr-3 font-semibold">
                Location
              </th>
              <th scope="col" className="py-2 pr-3 font-semibold">
                Urgency
              </th>
              <th scope="col" className="py-2 pr-3 font-semibold">
                Recommended action
              </th>
              <th scope="col" className="py-2 font-semibold">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-[#1b4578] last:border-b-0">
                <th
                  scope="row"
                  className="whitespace-nowrap py-2.5 pr-3 font-mono text-[11px] font-bold text-sky-200"
                >
                  {row.id}
                </th>
                <td className="py-2.5 pr-3 text-[12px] text-white">
                  <span className="block font-semibold">{row.category}</span>
                  <span className="block max-w-[18rem] truncate text-[11px] text-slate-300">
                    {row.grievance}
                  </span>
                </td>
                <td className="whitespace-nowrap py-2.5 pr-3 text-[12px] text-slate-200">
                  {row.ward}
                </td>
                <td className="py-2.5 pr-3">
                  <UrgencyBadge tier={tierFor(row.urgency)} />
                </td>
                <td className="py-2.5 pr-3 text-[12px] text-slate-200">{row.action}</td>
                <td className="py-2.5">
                  <span
                    className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      STATUS_STYLE[row.status] ?? STATUS_STYLE.New
                    }`}
                  >
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminPanel>
  );
}
