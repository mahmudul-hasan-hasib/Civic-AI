"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useRef, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, CircleMarker } from "react-leaflet";
import { Layers, ShieldAlert, TriangleAlert, Users } from "lucide-react";

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

/* Free, keyless raster basemaps. No token, no account, and no watermark:
   - Light: the canonical OSM standard layer, sharded across a/b/c hosts so one
     tile server is never a single point of failure.
   - Dark: CARTO's dark_all raster basemap, which is a registered third-party
     service on the same OpenStreetMap data and also requires no key. Used for
     the command center because light raster tiles glare against the navy panel.
   Both are backed by a visible container background and a tileerror surface, so
   a tile outage degrades to an explicit message rather than a black rectangle. */
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

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

/** A position to plot independently of the issue clusters. */
export type MapPoint = {
  lat: number;
  lng: number;
  label?: string;
};

type CivicMapProps = {
  reports: CivicReport[];
  clusters: SuperIncident[];
  /** "dark" swaps in the navy basemap and tier-coloured circular markers. */
  variant?: "light" | "dark";
  /** Explicit container height; Leaflet needs a sized box before it can measure. */
  className?: string;
  /** Re-centres the map, e.g. on the citizen's detected position. */
  center?: [number, number];
  zoom?: number;
  /** Renders without the floating stat chips, for compact previews. */
  compact?: boolean;
  showAttribution?: boolean;
  /** The user's own live position, drawn distinctly from the issue locations. */
  userLocation?: MapPoint | null;
};

function tierOf(urgency: number): keyof typeof TIER_FILL {
  if (urgency >= 5) return "critical";
  if (urgency >= 4) return "elevated";
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
  className = "h-[450px] w-full",
  center = DHAKA_CENTER,
  zoom = 12,
  compact = false,
  showAttribution = true,
  userLocation = null,
}: CivicMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const dark = variant === "dark";
  /* Bumping this remounts the TileLayer, which re-requests every visible tile
     after a transient outage. */
  const [tileEpoch, setTileEpoch] = useState(0);
  const [tileErrors, setTileErrors] = useState(0);
  const [tilesLoaded, setTilesLoaded] = useState(false);

  const citizensImpacted = clusters.reduce(
    (total, cluster) => total + cluster.citizen_report_count,
    0,
  );

  const retryTiles = () => {
    setTileErrors(0);
    setTilesLoaded(false);
    setTileEpoch((value) => value + 1);
    mapRef.current?.invalidateSize();
  };

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

  /* Recentre imperatively: React-Leaflet's centre prop is only read on mount, so
     changing it as a prop would leave the viewport where it started. */
  const centerLat = center[0];
  const centerLng = center[1];
  useEffect(() => {
    mapRef.current?.setView([centerLat, centerLng], zoom, { animate: true });
  }, [centerLat, centerLng, zoom]);

  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl z-0 ${dark ? "border border-[#1b4578]" : "border border-civic-line"} ${className}`}
      /* Leaflet's own background is a light grey, which reads as a black void
         against the navy command-center panel while tiles are still in flight
         or have failed. An explicit themed backdrop keeps that state legible. */
      style={{ backgroundColor: dark ? "#0d2e55" : "#e8eef4" }}
    >
      <MapContainer
        ref={mapRef}
        center={center}
        zoom={zoom}
        scrollWheelZoom={!compact}
        dragging={!compact}
        zoomControl={!compact}
        doubleClickZoom={!compact}
        attributionControl={showAttribution}
        className="z-0 h-full w-full"
      >
        <TileLayer
          key={tileEpoch}
          url={dark ? DARK_TILE_URL : TILE_URL}
          attribution={dark ? DARK_TILE_ATTRIBUTION : TILE_ATTRIBUTION}
          eventHandlers={{
            /* A handful of 404s is normal at the edges of a panned map. Sustained
               failure means the basemap is genuinely unreachable, so the map says
               so instead of presenting an unexplained black panel. */
            tileerror: () => setTileErrors((count) => count + 1),
            load: () => setTilesLoaded(true),
          }}
        />

        {/* The citizen's own live position, deliberately a different shape and
            colour from the issue pins so the two are never confused. */}
        {userLocation ? (
          <>
            <CircleMarker
              center={[userLocation.lat, userLocation.lng]}
              radius={16}
              pathOptions={{
                color: "#38bdf8",
                fillColor: "#38bdf8",
                fillOpacity: 0.14,
                weight: 2,
                dashArray: "4 4",
              }}
            />
            <CircleMarker
              center={[userLocation.lat, userLocation.lng]}
              radius={6}
              pathOptions={{
                color: "#ffffff",
                fillColor: "#0ea5e9",
                fillOpacity: 1,
                weight: 3,
              }}
            >
              <Popup>
                <div className="min-w-44 space-y-1 text-sm" data-testid="user-location-popup">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-700">
                    Your live location
                  </p>
                  <p className="font-semibold text-civic-ink">
                    {userLocation.label ?? "Current position"}
                  </p>
                  <p className="text-[11px] text-civic-muted">
                    {formatCoordinate(userLocation.lat)}, {formatCoordinate(userLocation.lng)}
                  </p>
                </div>
              </Popup>
            </CircleMarker>
          </>
        ) : null}

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

      {/* Tile outage is reported in place, over the affected area, so the cause
          is never mistaken for a styling or API-key problem. */}
      {tileErrors > 4 && !tilesLoaded ? (
        <div
          role="status"
          className={`absolute inset-0 z-[1200] flex flex-col items-center justify-center gap-2 px-6 text-center ${
            dark ? "bg-[#0d2e55]/92" : "bg-white/92"
          }`}
        >
          <TriangleAlert
            className={`h-5 w-5 ${dark ? "text-amber-300" : "text-amber-600"}`}
            aria-hidden="true"
          />
          <p className={`text-xs font-bold ${dark ? "text-white" : "text-civic-ink"}`}>
            Map tiles could not be loaded
          </p>
          <p className={`max-w-xs text-[11px] ${dark ? "text-slate-300" : "text-civic-muted"}`}>
            The basemap uses free, keyless OpenStreetMap tiles. This is a network
            or tile-server issue, not a missing API key.
          </p>
          <button
            type="button"
            onClick={retryTiles}
            className={`mt-1 rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${
              dark
                ? "bg-[#1c4d87] text-white hover:bg-[#255f9f]"
                : "bg-[#1d63b8] text-white hover:bg-[#2569bd]"
            }`}
          >
            Retry tiles
          </button>
        </div>
      ) : null}

      {!compact ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[1100] flex flex-wrap items-start justify-between gap-2 p-3">
          <div
            className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium shadow-lg backdrop-blur ${
              dark
                ? "border-[#1b4578] bg-[#0c2a4e]/90 text-slate-200"
                : "border-civic-line bg-white/95 text-civic-ink shadow-black/10"
            }`}
          >
            <Layers className="h-3.5 w-3.5 text-civic-blue" aria-hidden="true" />
            {clusters.length} geo-tagged incident{clusters.length === 1 ? "" : "s"} ·{" "}
            {reports.length} ticket{reports.length === 1 ? "" : "s"}
          </div>
          <div
            className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium shadow-lg backdrop-blur ${
              dark
                ? "border-amber-500/30 bg-[#0c2a4e]/90 text-amber-300"
                : "border-amber-500/40 bg-amber-50/95 text-amber-700"
            }`}
          >
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            {citizensImpacted} citizens impacted
          </div>
        </div>
      ) : null}

      {userLocation ? (
        <div
          className={`pointer-events-none absolute bottom-3 left-3 z-[1100] flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium shadow-lg backdrop-blur ${
            dark
              ? "border-sky-400/40 bg-[#0c2a4e]/90 text-sky-200"
              : "border-sky-300 bg-white/95 text-sky-800"
          }`}
        >
          <span className="h-2.5 w-2.5 rounded-full bg-sky-500 ring-2 ring-white" aria-hidden="true" />
          Your live location
        </div>
      ) : null}
    </div>
  );
}
