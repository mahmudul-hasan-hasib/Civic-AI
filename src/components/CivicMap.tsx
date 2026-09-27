"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import { Layers, ShieldAlert, Users } from "lucide-react";

import {
  clusterAgeHours,
  formatCoordinate,
  urgencyLabel,
} from "@/app/civic-shared";
import type { CivicReport, SuperIncident } from "@/app/civic-shared";

type IconDefaultWithUrl = typeof L.Icon.Default.prototype & { _getIconUrl?: unknown };

delete (L.Icon.Default.prototype as IconDefaultWithUrl)._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const DHAKA_CENTER: [number, number] = [23.8103, 90.4125];

type CivicMapProps = {
  reports: CivicReport[];
  clusters: SuperIncident[];
};

export default function CivicMap({ reports, clusters }: CivicMapProps) {
  const citizensImpacted = clusters.reduce(
    (total, cluster) => total + cluster.citizen_report_count,
    0,
  );

  return (
    <div className="relative h-[450px] w-full overflow-hidden rounded-xl">
      <MapContainer
        center={DHAKA_CENTER}
        zoom={12}
        scrollWheelZoom
        className="z-0 h-full w-full"
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />

        {clusters.map((cluster) => (
          <Marker key={cluster.clusterId} position={[cluster.lat, cluster.lng]}>
            <Popup>
              <div className="min-w-52 space-y-2 text-sm" data-testid="civic-map-popup">
                <p className="flex items-baseline justify-between gap-3">
                  <strong>{cluster.category}</strong>
                  <span className="shrink-0 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-700 ring-1 ring-red-500/30">
                    U{cluster.urgency_score} {urgencyLabel(cluster.urgency_score)}
                  </span>
                </p>

                {cluster.citizen_report_count > 1 ? (
                  <p className="flex items-start gap-1.5 rounded-lg bg-amber-500/15 px-2 py-1.5 text-[11px] font-semibold text-amber-800">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      Super Incident · Reported by {cluster.citizen_report_count} citizens in the
                      last {clusterAgeHours(cluster.latest_at)} hour
                      {clusterAgeHours(cluster.latest_at) === 1 ? "" : "s"}
                    </span>
                  </p>
                ) : null}

                <p className="text-xs leading-relaxed text-slate-600">{cluster.summary_en}</p>

                <p className="text-[11px] text-slate-500">
                  {cluster.extracted_location} · {formatCoordinate(cluster.lat)},{" "}
                  {formatCoordinate(cluster.lng)}
                </p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1100] flex flex-wrap items-start justify-between gap-2 p-3">
        <div className="flex items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-950/85 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 backdrop-blur">
          <Layers className="h-3.5 w-3.5 text-indigo-300" aria-hidden="true" />
          {clusters.length} geo-tagged incident{clusters.length === 1 ? "" : "s"} ·{" "}
          {reports.length} ticket{reports.length === 1 ? "" : "s"}
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-slate-950/85 px-2.5 py-1.5 text-[11px] font-medium text-amber-200 backdrop-blur">
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          {citizensImpacted} citizens impacted
        </div>
      </div>
    </div>
  );
}