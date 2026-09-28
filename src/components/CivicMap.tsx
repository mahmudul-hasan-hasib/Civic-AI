"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useRef } from "react";
import { MapContainer, Marker, Popup, TileLayer, CircleMarker } from "react-leaflet";
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

/* The command center sits on a deep-navy panel, where light raster tiles glare.
   CARTO's dark basemap keeps the same attribution terms and needs no key. */
const DARK_TILE_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const DARK_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

const DHAKA_CENTER: [number, number] = [23.8103, 90.4125];

/** Tier colours shared with the dashboard legend. */
const TIER_FILL: Record<"critical" | "elevated" | "normal", string> = {
  critical: "#fb7185",
  elevated: "#fcd34d",
  normal: "#7dd3fc",
};

type CivicMapProps = {
  reports: CivicReport[];
  clusters: SuperIncident[];
  /** "dark" swaps in the navy basemap and tier-coloured circular markers. */
  variant?: "light" | "dark";
  className?: string;
};

function tierOf(urgency: number): keyof typeof TIER_FILL {
  if (urgency >= 8) return "critical";
  if (urgency >= 6) return "elevated";
  return "normal";
}

/* Shared marker body, used by both the light pin and the dark disc. */
function ClusterPopupBody({ cluster }: { cluster: SuperIncident }) {
  const age = clusterAgeHours(cluster.latest_at);
  return (
    <div className="min-w-52 space-y-2 text-sm" data-testid="civic-map-popup">
      <p className="flex items-baseline justify-between gap-3">
        <strong className="text-civic-blue">{cluster.category}</strong>
        <span className="shrink-0 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-400 ring-1 ring-rose-500/30">
          U{cluster.urgency_score} {urgencyLabel(cluster.urgency_score)}
        </span>
      </p>

      {cluster.citizen_report_count > 1 ? (
        <p className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2 py-1.5 text-[11px] font-semibold text-amber-300">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            Super Incident · Reported by {cluster.citizen_report_count} citizens in the last{" "}
            {age} hour{age === 1 ? "" : "s"}
          </span>
        </p>
      ) : null}

      <p className="text-xs leading-relaxed text-civic-muted">{cluster.summary_en}</p>

      <p className="text-[11px] text-civic-muted/80">
        {cluster.extracted_location} · {formatCoordinate(cluster.lat)},{" "}
        {formatCoordinate(cluster.lng)}
      </p>
    </div>
  );
}

export default function CivicMap({
  reports,
  clusters,
  variant = "light",
  className = "h-[320px] sm:h-[400px] lg:h-[480px]",
}: CivicMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const dark = variant === "dark";
  const citizensImpacted = clusters.reduce(
    (total, cluster) => total + cluster.citizen_report_count,
    0,
  );

  /* The analytics lane is display:none until the mobile switcher reveals it, and
     Leaflet caches its size at init. Re-measure whenever the box changes so the
     tiles never stay collapsed after a tab switch or window resize. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const container = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);
    map.invalidateSize();
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl border sm: ${dark ? "border-[#1b4578]" : "border-civic-line"} ${className}`}
    >
      <MapContainer
        ref={mapRef}
        center={DHAKA_CENTER}
        zoom={12}
        scrollWheelZoom
        className="z-0 h-full w-full"
      >
        <TileLayer
          url={dark ? DARK_TILE_URL : TILE_URL}
          attribution={dark ? DARK_TILE_ATTRIBUTION : TILE_ATTRIBUTION}
        />

        {clusters.map((cluster) =>
          dark ? (
            /* Tier-coloured discs so the marker fill carries the same meaning as
               the legend beneath the map. */
            <CircleMarker
              key={cluster.clusterId}
              center={[cluster.lat, cluster.lng]}
              radius={Math.min(22, 7 + cluster.citizen_report_count * 2)}
              pathOptions={{
                color: TIER_FILL[tierOf(cluster.urgency_score)],
                fillColor: TIER_FILL[tierOf(cluster.urgency_score)],
                fillOpacity: 0.45,
                weight: 2,
              }}
            >
              <Popup>
                <ClusterPopupBody cluster={cluster} />
              </Popup>
            </CircleMarker>
          ) : (
            <Marker key={cluster.clusterId} position={[cluster.lat, cluster.lng]}>
              <Popup>
                <ClusterPopupBody cluster={cluster} />
              </Popup>
            </Marker>
          ),
        )}
      </MapContainer>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1100] flex flex-wrap items-start justify-between gap-2 p-3">
        <div className="flex items-center gap-2 rounded-lg border border-civic-line bg-slate-900/90 px-2.5 py-1.5 text-[11px] font-medium text-civic-ink shadow-lg shadow-black/50 backdrop-blur">
          <Layers className="h-3.5 w-3.5 text-civic-blue" aria-hidden="true" />
          {clusters.length} geo-tagged incident{clusters.length === 1 ? "" : "s"} ·{" "}
          {reports.length} ticket{reports.length === 1 ? "" : "s"}
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-slate-900/90 px-2.5 py-1.5 text-[11px] font-medium text-amber-300 shadow-lg shadow-black/50 backdrop-blur">
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          {citizensImpacted} citizens impacted
        </div>
      </div>
    </div>
  );
}