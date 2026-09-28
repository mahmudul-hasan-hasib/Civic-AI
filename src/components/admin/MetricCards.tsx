"use client";

import { BarChart3, FileText, TrendingUp, TriangleAlert } from "lucide-react";

import { CITY_BASELINE } from "@/app/civic-shared";
import { Sparkline } from "@/components/admin/Primitives";

const CARD =
  "border border-[#1f4e89] bg-[#133e70] p-5 text-white rounded-2xl shadow-md text-left transition";

/** Selecting a card filters the page; the active one is ringed. */
export type MetricFilter = "all" | "reports" | "urgent" | "category" | "gap";

export type MetricCardsProps = {
  /** City-wide baseline plus anything filed in this browser session. */
  sessionReports: number;
  sessionUrgent: number;
  topCategory: string;
  topCategoryShare: number;
  gapIndex: number;
  /** Signed change in the gap index since this device last recorded one. */
  gapDelta: number | null;
  gapSeries: number[];
  active: MetricFilter;
  onSelect: (next: Exclude<MetricFilter, "all">) => void;
};

export default function MetricCards({
  sessionReports,
  sessionUrgent,
  topCategory,
  topCategoryShare,
  gapIndex,
  gapDelta,
  gapSeries,
  active,
  onSelect,
}: MetricCardsProps) {
  const total = CITY_BASELINE.totalReports + sessionReports;
  const urgent = CITY_BASELINE.highUrgency + sessionUrgent;

  const cards: {
    key: Exclude<MetricFilter, "all">;
    label: string;
    value: string;
    sub: string;
    icon: typeof FileText;
    tone: string;
  }[] = [
    {
      key: "reports",
      label: "Total reports",
      value: total.toLocaleString("en-IN"),
      sub: `Across ${CITY_BASELINE.monitoredWards} monitored wards`,
      icon: FileText,
      tone: "text-sky-300",
    },
    {
      key: "urgent",
      label: "High urgency",
      value: urgent.toLocaleString("en-IN"),
      sub: "Requires action within 2-4h",
      icon: TriangleAlert,
      tone: "text-rose-300",
    },
    {
      key: "category",
      label: "Top problem category",
      value: topCategory,
      sub: `${topCategoryShare.toFixed(0)}% of current demand`,
      icon: BarChart3,
      tone: "text-amber-300",
    },
    {
      key: "gap",
      label: "Infrastructure gap index",
      value: String(gapIndex),
      sub:
        gapDelta === null
          ? "Baseline recorded for this device"
          : `${gapDelta > 0 ? "+" : ""}${gapDelta} points ${
              gapDelta > 0 ? "higher" : gapDelta < 0 ? "lower" : "flat"
            } since last visit`,
      icon: TrendingUp,
      tone: "text-emerald-300",
    },
  ];

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        const isActive = active === card.key;
        return (
          <button
            key={card.key}
            type="button"
            onClick={() => onSelect(card.key)}
            aria-pressed={isActive}
            data-testid={`metric-${card.key}`}
            className={`${CARD} ${
              isActive
                ? "ring-2 ring-blue-400"
                : "hover:border-[#2f6ab5] hover:bg-[#16457c]"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-200">
                {card.label}
              </p>
              <Icon className={`h-4 w-4 shrink-0 ${card.tone}`} aria-hidden="true" />
            </div>
            <p className="mt-2 text-2xl font-extrabold tracking-tight text-white">
              {card.value}
            </p>
            <div className="mt-1.5 flex items-end justify-between gap-2">
              <p className="text-[11px] leading-snug text-slate-300">{card.sub}</p>
              {card.key === "gap" ? (
                <Sparkline
                  points={gapSeries}
                  className="h-6 w-16 shrink-0 text-emerald-300"
                />
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
