"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, Clock, MapPin, RotateCcw } from "lucide-react";

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
  /** Internal report id, used to persist the resolved flag. */
  reportId: string;
  category: string;
  grievance: string;
  fullGrievance: string;
  ward: string;
  urgency: number;
  action: string;
  fullAction: string;
  slaHours: number;
  createdAt: string;
  originalText: string;
  location: string;
  department: string;
  isFallback: boolean;
  latencyMs: number | null;
  confidence: number;
  status: string;
  dispatched: boolean;
  resolved: boolean;
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
  Resolved: "border-emerald-300/50 bg-emerald-400/20 text-emerald-100",
};

function formatArrival(iso: string): string {
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return "-";
  return new Date(at).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function RecentTickets({
  rows,
  onToggleResolved,
}: {
  rows: TicketRow[];
  onToggleResolved: (reportId: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

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
              <th scope="col" className="w-8 py-2 pr-2 font-semibold">
                <span className="sr-only">Expand</span>
              </th>
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
            {rows.map((row) => {
              const isOpen = expanded === row.id;
              const status = row.resolved ? "Resolved" : row.status;
              return (
                <Fragment key={row.id}>
                  <tr className="border-b border-[#1b4578] last:border-b-0">
                    <td className="py-2.5 pr-2 align-top">
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : row.id)}
                        aria-expanded={isOpen}
                        aria-controls={`detail-${row.id}`}
                        aria-label={
                          isOpen
                            ? `Collapse details for ${row.id}`
                            : `Expand details for ${row.id}`
                        }
                        className="rounded-md p-1 text-sky-200 transition hover:bg-white/10 hover:text-white"
                      >
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${
                            isOpen ? "rotate-180" : ""
                          }`}
                          aria-hidden="true"
                        />
                      </button>
                    </td>
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
                      <UrgencyBadge tier={tierFor(row.urgency)} score={row.urgency} />
                    </td>
                    <td className="py-2.5 pr-3 text-[12px] text-slate-200">{row.action}</td>
                    <td className="whitespace-nowrap py-2.5">
                      <span
                        className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          STATUS_STYLE[status] ?? STATUS_STYLE.New
                        }`}
                      >
                        {status}
                      </span>
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr
                      id={`detail-${row.id}`}
                      className="border-b border-[#1b4578] bg-[#0d2e55]/60"
                    >
                      <td colSpan={7} className="px-3 py-4">
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                          <div className="lg:col-span-7">
                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-200">
                              Citizen grievance
                            </p>
                            <p className="mt-1.5 text-[12px] leading-relaxed text-white">
                              {row.fullGrievance}
                            </p>

                            {row.originalText &&
                            row.originalText.trim() !== row.fullGrievance.trim() ? (
                              <>
                                <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-sky-200">
                                  As submitted
                                </p>
                                <p className="mt-1.5 rounded-lg border border-[#1b4475] bg-[#0c2a4e] p-2.5 text-[12px] leading-relaxed text-slate-200">
                                  {row.originalText}
                                </p>
                              </>
                            ) : null}

                            <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-sky-200">
                              Recommended action
                            </p>
                            <p className="mt-1.5 text-[12px] leading-relaxed text-slate-200">
                              {row.fullAction || "No action recorded."}
                            </p>
                          </div>

                          <div className="lg:col-span-5">
                            <dl className="space-y-2 text-[11px]">
                              <div className="flex items-start gap-2">
                                <dt className="sr-only">Location</dt>
                                <MapPin
                                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300"
                                  aria-hidden="true"
                                />
                                <dd className="text-slate-200">
                                  <span className="block font-semibold text-white">
                                    {row.location || row.ward}
                                  </span>
                                  <span className="block text-slate-400">
                                    Routed to {row.department}
                                  </span>
                                </dd>
                              </div>
                              <div className="flex items-start gap-2">
                                <dt className="sr-only">Arrival</dt>
                                <Clock
                                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300"
                                  aria-hidden="true"
                                />
                                <dd className="text-slate-200">
                                  <span className="block font-semibold text-white">
                                    {formatArrival(row.createdAt)}
                                  </span>
                                  <span className="block text-slate-400">
                                    SLA: {row.slaHours}h dispatch window
                                  </span>
                                </dd>
                              </div>
                              <div className="flex items-start gap-2">
                                <dt className="sr-only">Triage</dt>
                                <UrgencyBadge
                                  tier={tierFor(row.urgency)}
                                  score={row.urgency}
                                />
                                <dd className="text-slate-400">
                                  {Math.round(row.confidence * 100)}% confidence
                                  {row.isFallback
                                    ? " · offline heuristic triage"
                                    : row.latencyMs
                                      ? ` · ${row.latencyMs}ms`
                                      : ""}
                                </dd>
                              </div>
                            </dl>

                            <button
                              type="button"
                              onClick={() => onToggleResolved(row.reportId)}
                              aria-pressed={row.resolved}
                              data-testid={`resolve-${row.id}`}
                              className={`mt-4 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition ${
                                row.resolved
                                  ? "bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-300/50 hover:bg-emerald-500/30"
                                  : "bg-[#1c4d87] text-white ring-1 ring-[#2f6fb8] hover:bg-[#255f9f]"
                              }`}
                            >
                              {row.resolved ? (
                                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                              )}
                              {row.resolved ? "Reopen ticket" : "Mark as resolved"}
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </AdminPanel>
  );
}
