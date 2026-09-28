"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import type { SuperIncident } from "@/app/civic-shared";
import RealGrievanceHeatmap from "@/components/RealGrievanceHeatmap";
import { AdminPanel, AdminPanelHeader } from "@/components/admin/Primitives";

export type HeatTimeframe = "24h" | "7d" | "30d";

/* The timeframe control lives here rather than inside the map so it can share
   state with the dashboard header selector. Two independent copies of this
   dropdown could disagree, and the officer would be left unsure which window
   the figures actually describe. */
const TIMEFRAMES: { id: HeatTimeframe; label: string }[] = [
  { id: "24h", label: "Last 24 Hours" },
  { id: "7d", label: "Past 7 Days" },
  { id: "30d", label: "Past 30 Days" },
];

const TIMEFRAME_LABEL: Record<HeatTimeframe, string> = {
  "24h": "Last 24h",
  "7d": "Past 7d",
  "30d": "Past 30 days",
};

export default function GeospatialPanel({
  clusters,
  timeframe,
  onTimeframeChange,
}: {
  clusters: SuperIncident[];
  timeframe: HeatTimeframe;
  onTimeframeChange: (next: HeatTimeframe) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <AdminPanel className="flex flex-col lg:col-span-8">
      <AdminPanelHeader
        eyebrow="Geospatial intelligence"
        title="India Grievance Heatmap"
        subtitle={`${clusters.length} live cluster${clusters.length === 1 ? "" : "s"} · free OpenStreetMap basemap`}
      />

      <div className="mt-3 flex items-center justify-end">
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            aria-expanded={menuOpen}
            aria-haspopup="listbox"
            data-testid="heatmap-timeframe"
            className="inline-flex items-center gap-1 rounded-lg border border-[#1b4578] px-2.5 py-1 text-[11px] font-semibold text-slate-200 transition hover:border-[#2f6fb8] hover:text-white"
          >
            {TIMEFRAME_LABEL[timeframe]}
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
          </button>

          {menuOpen ? (
            <ul
              role="listbox"
              aria-label="Timeframe"
              className="absolute right-0 top-[calc(100%+0.35rem)] z-[1300] w-40 overflow-hidden rounded-lg border border-[#2f6fb8] bg-[#081b33] py-1 shadow-xl"
            >
              {TIMEFRAMES.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={timeframe === item.id}
                    onClick={() => {
                      onTimeframeChange(item.id);
                      setMenuOpen(false);
                    }}
                    className={`block w-full px-3 py-1.5 text-left text-[11px] font-semibold transition hover:bg-white/10 ${
                      timeframe === item.id ? "text-cyan-300" : "text-slate-200"
                    }`}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <RealGrievanceHeatmap />
    </AdminPanel>
  );
}
