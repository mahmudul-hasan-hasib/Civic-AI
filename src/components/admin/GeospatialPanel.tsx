"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronDown, MapPin, TrendingUp } from "lucide-react";

import { wardLabel } from "@/app/civic-shared";
import type { CivicReport, SuperIncident } from "@/app/civic-shared";
import {
  AdminPanel,
  AdminPanelHeader,
  DotLegend,
  FilterPill,
} from "@/components/admin/Primitives";

/* Leaflet reads `window` at module scope, so the map can only be evaluated in
   the browser. Skipping SSR keeps /dashboard prerenderable; the reserved
   placeholder below holds the space until the tiles mount. */
const CivicMap = dynamic(() => import("@/components/CivicMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[300px] items-center justify-center rounded-xl border border-[#1b4578] bg-[#0d2e55] sm:h-[380px] lg:h-[440px]">
      <p className="text-xs font-semibold text-slate-300">Loading geospatial layer…</p>
    </div>
  ),
});

type MapFilter = "all" | "critical" | "infrastructure" | "session";

const FILTERS: { id: MapFilter; label: string }[] = [
  { id: "all", label: "All reports" },
  { id: "critical", label: "Critical" },
  { id: "infrastructure", label: "Infrastructure gaps" },
  { id: "session", label: "This session" },
];

/* Demand categories that represent physical infrastructure failure rather than
   a service or administrative request. */
const INFRASTRUCTURE = new Set(["Drainage", "Roads & Transport", "Electricity"]);

export default function GeospatialPanel({
  clusters,
  reports,
  sessionReportIds,
}: {
  clusters: SuperIncident[];
  reports: CivicReport[];
  sessionReportIds: Set<string>;
}) {
  const [filter, setFilter] = useState<MapFilter>("all");

  const visible = useMemo(() => {
    if (filter === "all") return clusters;
    if (filter === "critical") return clusters.filter((c) => c.urgency_score >= 8);
    if (filter === "infrastructure") {
      return clusters.filter((c) => INFRASTRUCTURE.has(c.category));
    }
    return clusters.filter((c) => c.member_ids.some((id) => sessionReportIds.has(id)));
  }, [clusters, filter, sessionReportIds]);

  /* The densest, most urgent cluster is the one an officer should look at
     first, so it is called out on the map rather than left to be found. */
  const hotspot = useMemo(() => {
    if (visible.length === 0) return null;
    return [...visible].sort(
      (a, b) =>
        b.citizen_report_count * 2 + b.urgency_score - (a.citizen_report_count * 2 + a.urgency_score),
    )[0];
  }, [visible]);

  const visibleReports = useMemo(() => {
    const ids = new Set(visible.flatMap((cluster) => cluster.member_ids));
    return reports.filter((report) => ids.has(report.id));
  }, [reports, visible]);

  return (
    <AdminPanel className="flex flex-col lg:col-span-8">
      <AdminPanelHeader
        eyebrow="Geospatial intelligence"
        title="India Grievance Heatmap"
        subtitle={`${visible.length} geo-tagged cluster${visible.length === 1 ? "" : "s"} · ${visibleReports.length} ticket${visibleReports.length === 1 ? "" : "s"} in view`}
        actions={
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg border border-[#1b4578] px-2.5 py-1 text-[11px] font-semibold text-slate-200 transition hover:border-[#2f6fb8] hover:text-white"
          >
            Past 30 days
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
          </button>
        }
      />

      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Map filters">
        {FILTERS.map((item) => (
          <FilterPill
            key={item.id}
            active={filter === item.id}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </FilterPill>
        ))}
      </div>

      <div className="relative mt-3">
        <CivicMap
          reports={visibleReports}
          clusters={visible}
          variant="dark"
          className="h-[300px] sm:h-[380px] lg:h-[440px]"
        />

        {/* Highest-concentration callout, anchored over the map. */}
        {hotspot ? (
          <div
            className="pointer-events-none absolute left-3 top-14 z-[1100] max-w-[15rem] rounded-xl border border-[#2f6fb8] bg-[#0d2e55]/95 p-3 shadow-xl backdrop-blur"
            data-testid="heatmap-hotspot"
          >
            <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.16em] text-amber-300">
              <TrendingUp className="h-3 w-3" aria-hidden="true" />
              Highest concentration
            </p>
            <p className="mt-1 flex items-start gap-1 text-[12px] font-bold leading-snug text-white">
              <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-sky-300" aria-hidden="true" />
              {wardLabel(wardOfMember(hotspot, reports))}
            </p>
            <p className="mt-1 text-[11px] text-slate-300">
              {hotspot.citizen_report_count} report
              {hotspot.citizen_report_count === 1 ? "" : "s"} · {hotspot.category}
            </p>
          </div>
        ) : (
          <div className="pointer-events-none absolute inset-0 z-[1100] flex items-center justify-center">
            <p className="rounded-lg bg-[#0d2e55]/90 px-3 py-2 text-xs font-semibold text-slate-200">
              No clusters match this filter
            </p>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#1b4578] pt-3">
        <DotLegend />
        <p className="text-[11px] text-slate-300">
          Marker size reflects the number of citizens reporting the same incident
        </p>
      </div>
    </AdminPanel>
  );
}

/* The cluster itself stores no ward, so it is resolved through one of its
   member reports. */
function wardOfMember(cluster: SuperIncident, reports: CivicReport[]): string {
  const byId = new Map(reports.map((report) => [report.id, report]));
  for (const id of cluster.member_ids) {
    const ward = byId.get(id)?.ward;
    if (ward) return ward;
  }
  return cluster.extracted_location;
}
