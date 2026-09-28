"use client";

import Link from "next/link";
import { CheckCircle2, CircleDot, MapPin, Wrench } from "lucide-react";

import { AUTHORITY_ROUTE } from "@/context/AuthContext";
import {
  AdminPanel,
  AdminPanelHeader,
  UrgencyBadge,
  tierFor,
} from "@/components/admin/Primitives";

export type QueueItem = {
  id: string;
  /** The report the dispatch toggle acts on, or null for an unmatched cluster. */
  reportId: string | null;
  title: string;
  wardLabel: string;
  action: string;
  urgency: number;
  dispatched: boolean;
};

export default function PriorityQueue({
  items,
  totalOpen,
  onToggleDispatch,
}: {
  items: QueueItem[];
  totalOpen: number;
  onToggleDispatch: (id: string) => void;
}) {
  return (
    <AdminPanel className="flex flex-col justify-between lg:col-span-4">
      <div>
        <AdminPanelHeader
          eyebrow="Action required"
          title="Priority Queue"
          count={
            <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white">
              {totalOpen} open
            </span>
          }
          subtitle="AI-ranked by urgency, citizen impact, and infrastructure gap."
        />

        <ol className="mt-2 flex-1">
          {items.map((item, index) => (
            <li key={item.id} className="border-b border-[#1b4578] py-3.5 last:border-b-0">
              <div className="flex items-start justify-between gap-2">
                <p className="flex items-baseline gap-2">
                  <span className="font-mono text-[11px] font-bold text-sky-300">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[13px] font-bold leading-snug text-white">
                    {item.title}
                  </span>
                </p>
                <UrgencyBadge tier={tierFor(item.urgency)} />
              </div>

              <p className="mt-1.5 flex items-start gap-1.5 pl-6 text-[11px] text-slate-300">
                <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
                {item.wardLabel}
              </p>

              <p className="mt-1 flex items-start gap-1.5 pl-6 text-[11px] text-slate-200">
                <Wrench className="mt-0.5 h-3 w-3 shrink-0 text-sky-300" aria-hidden="true" />
                <span>
                  <span className="text-slate-400">Action:</span> {item.action}
                </span>
              </p>

              <div className="mt-2 pl-6">
                <button
                  type="button"
                  onClick={() => item.reportId && onToggleDispatch(item.reportId)}
                  disabled={!item.reportId}
                  aria-pressed={item.dispatched}
                  data-testid={`dispatch-${item.id}`}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    item.dispatched
                      ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-100"
                      : "border-[#2f6fb8] text-sky-100 hover:bg-[#1b4578]"
                  }`}
                >
                  {item.dispatched ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Unit dispatched
                    </>
                  ) : (
                    <>
                      <CircleDot className="h-3.5 w-3.5" aria-hidden="true" />
                      Dispatch unit
                    </>
                  )}
                </button>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <Link
        href={AUTHORITY_ROUTE}
        className="mt-4 inline-flex items-center gap-1 text-[11px] font-semibold text-sky-300 transition hover:text-white"
      >
        View complete priority queue →
      </Link>
    </AdminPanel>
  );
}
