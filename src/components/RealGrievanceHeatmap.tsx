"use client";

/* ==========================================================================
 * CivicLens · REAL GRIEVANCE HEATMAP
 *
 * A genuine Leaflet map on the free public OpenStreetMap raster layer.
 *
 * Tile provider policy
 * --------------------
 * OSM's own tile service is the only source used here:
 *   https://tile.openstreetmap.org/{z}/{x}/{y}.png
 * No Mapbox, Stadia, Google or Jawg. Those services all require an access
 * token; without one they return a black tile stamped "API KEY REQUIRED",
 * which is exactly the failure this component is built to eliminate. The
 * tile URL is a single explicit constant so there is no fallback chain that
 * could quietly reintroduce a keyed provider.
 *
 * Rendering safety
 * ----------------
 * Leaflet touches `window` at import time, so every react-leaflet component is
 * loaded through `next/dynamic` with `ssr: false`. Combined with the explicit
 * `isClient` gate, the server and the first client render agree on a loading
 * placeholder, which is what removes the hydration mismatch that otherwise
 * crashes the panel.
 *
 * The two failure modes that produce an unexplained black rectangle are both
 * handled explicitly: a themed container background that shows through before
 * tiles arrive, and a `tileerror` surface that names the real cause (network
 * or tile-server outage) and offers a retry.
 * ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";
import { TriangleAlert } from "lucide-react";

/* Dynamic import of Leaflet components to ensure client-only execution. */
const MapContainer = dynamic(() => import("react-leaflet").then((mod) => mod.MapContainer), {
  ssr: false,
});
const TileLayer = dynamic(() => import("react-leaflet").then((mod) => mod.TileLayer), {
  ssr: false,
});
const Marker = dynamic(() => import("react-leaflet").then((mod) => mod.Marker), {
  ssr: false,
});
const Popup = dynamic(() => import("react-leaflet").then((mod) => mod.Popup), {
  ssr: false,
});

type LeafletNamespace = typeof import("leaflet");

export interface HeatNode {
  id: string;
  lat: number;
  lng: number;
  ward: string;
  reports: number;
  category: string;
  status: "critical" | "high" | "elevated" | "normal";
}

/** The free, keyless public OpenStreetMap raster layer. */
const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Mumbai metropolitan centre, covering all four monitored wards. */
const CENTER: [number, number] = [19.085, 72.875];
const ZOOM = 12;

const MOCK_HOTSPOTS: HeatNode[] = [
  {
    id: "h1",
    lat: 19.1136,
    lng: 72.8697,
    ward: "Andheri East - Ward K/E",
    reports: 438,
    category: "Drainage",
    status: "critical",
  },
  {
    id: "h2",
    lat: 19.1176,
    lng: 72.906,
    ward: "Powai - Ward S",
    reports: 210,
    category: "Road safety hazard",
    status: "high",
  },
  {
    id: "h3",
    lat: 19.0596,
    lng: 72.8406,
    ward: "Bandra East - Ward H/E",
    reports: 145,
    category: "Water supply outage",
    status: "elevated",
  },
  {
    id: "h4",
    lat: 19.0434,
    lng: 72.8567,
    ward: "Dharavi - Ward G/N",
    reports: 89,
    category: "Waste accumulation",
    status: "normal",
  },
];

const STATUS_COLOR: Record<HeatNode["status"], { bg: string; ring: string }> = {
  critical: { bg: "#f97316", ring: "rgba(249, 115, 22, 0.45)" },
  high: { bg: "#eab308", ring: "rgba(234, 179, 8, 0.45)" },
  elevated: { bg: "#38bdf8", ring: "rgba(56, 189, 248, 0.45)" },
  normal: { bg: "#10b981", ring: "rgba(16, 185, 129, 0.45)" },
};

const FILTERS = [
  { id: "all", label: "All reports" },
  { id: "critical", label: "Critical" },
  { id: "infrastructure gaps", label: "Infrastructure gaps" },
  { id: "resolved", label: "Resolved" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

export default function RealGrievanceHeatmap({
  nodes = MOCK_HOTSPOTS,
  className = "h-[430px]",
}: {
  nodes?: HeatNode[];
  className?: string;
}) {
  const [filter, setFilter] = useState<FilterId>("all");
  const [selectedHotspot, setSelectedHotspot] = useState<HeatNode | null>(
    MOCK_HOTSPOTS[0],
  );
  const [L, setL] = useState<LeafletNamespace | null>(null);

  /* Leaflet only imports cleanly in a browser, and it is not needed during SSR.
     A null `L` is therefore also the "not yet mounted" signal, so it doubles as
     the hydration gate: server render and first client render both take the
     loading branch, which is what keeps them byte-identical. */
  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((mod) => {
      if (!cancelled) setL((mod.default ?? mod) as LeafletNamespace);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredHotspots = useMemo(
    () =>
      nodes.filter((node) => {
        if (filter === "critical") return node.status === "critical";
        if (filter === "infrastructure gaps") {
          return node.status === "high" || node.status === "critical";
        }
        if (filter === "resolved") return node.status === "normal";
        return true;
      }),
    [nodes, filter],
  );

  const [tileErrors, setTileErrors] = useState(0);
  const [tilesLoaded, setTilesLoaded] = useState(false);
  const [tileEpoch, setTileEpoch] = useState(0);
  const mapRef = useRef<import("leaflet").Map | null>(null);

  const retryTiles = useCallback(() => {
    setTileErrors(0);
    setTilesLoaded(false);
    /* Remounting TileLayer re-requests every visible tile after an outage. */
    setTileEpoch((value) => value + 1);
    mapRef.current?.invalidateSize();
  }, []);

  /* Leaflet measures its container once at init. This panel lives in a grid
     that reflows, so without re-measuring the map can stay collapsed or render
     only a sliver of tiles. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const container = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);
    map.invalidateSize();
    return () => observer.disconnect();
  }, [L]);

  /* Custom glowing heat-ball icons, built as Leaflet divIcons. The bodies are
     raw HTML injected by Leaflet, outside the React tree, so styling comes from
     the global `civic-heat-*` classes rather than from inline animation
     declarations - inline styles would outrank a `prefers-reduced-motion`
     override. */
  const createHeatIcon = useCallback(
    (status: HeatNode["status"], reports: number) => {
      if (!L) return null;
      const cfg = STATUS_COLOR[status] ?? STATUS_COLOR.normal;
      const core = Math.round(10 + Math.min(6, Math.sqrt(reports) / 5));
      return L.divIcon({
        className: "custom-heat-ball",
        html: `
          <div style="position:relative;width:32px;height:32px;display:flex;align-items:center;justify-content:center;">
            <div class="civic-heat-ring" style="position:absolute;width:32px;height:32px;border-radius:9999px;background-color:${cfg.ring};"></div>
            <div class="civic-heat-dot" style="width:${core}px;height:${core}px;border-radius:9999px;background-color:${cfg.bg};border:2px solid #ffffff;box-shadow:0 0 10px ${cfg.bg};z-index:10;"></div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
    },
    [L],
  );

  if (!L) {
    return (
      <div
        className={`${className} w-full rounded-2xl bg-[#0d2a4e] flex items-center justify-center text-slate-400 text-sm`}
      >
        Loading real-time geospatial map...
      </div>
    );
  }

  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl border border-[#1e4d88] shadow-inner bg-[#0d2a4e] ${className}`}
      data-testid="real-grievance-heatmap"
    >
      <MapContainer
        ref={mapRef}
        center={CENTER}
        zoom={ZOOM}
        scrollWheelZoom={false}
        zoomControl
        dragging
        doubleClickZoom
        attributionControl
        className="z-0 h-full w-full"
      >
        <TileLayer
          key={tileEpoch}
          attribution={OSM_ATTRIBUTION}
          url={OSM_TILE_URL}
          eventHandlers={{
            /* A few 404s are normal while panning past the edge of the layer.
               Sustained failure means the basemap is genuinely unreachable. */
            tileerror: () => setTileErrors((count) => count + 1),
            load: () => setTilesLoaded(true),
          }}
        />

        {filteredHotspots.map((node) => {
          const icon = createHeatIcon(node.status, node.reports);
          if (!icon) return null;
          return (
            <Marker
              key={node.id}
              position={[node.lat, node.lng]}
              icon={icon}
              eventHandlers={{ click: () => setSelectedHotspot(node) }}
            >
              <Popup>
                <div className="text-slate-900 text-xs">
                  <p className="font-bold">{node.ward}</p>
                  <p className="text-slate-600">{node.reports} incident reports</p>
                  <span
                    className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold capitalize ${
                      node.status === "critical"
                        ? "bg-red-100 text-red-700"
                        : node.status === "high"
                          ? "bg-amber-100 text-amber-700"
                          : node.status === "elevated"
                            ? "bg-sky-100 text-sky-700"
                            : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {node.status}
                  </span>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Top filter buttons, overlaid on the map. */}
      <div className="absolute top-3 left-3 z-[1000] flex flex-wrap items-center gap-1.5 bg-[#0e315b]/90 backdrop-blur-md p-1.5 rounded-xl border border-[#1b4b8a]">
        {FILTERS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            aria-pressed={filter === tab.id}
            data-testid={`heatmap-filter-${tab.id}`}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              filter === tab.id
                ? "bg-[#1d63b8] text-white shadow-sm"
                : "text-slate-300 hover:text-white hover:bg-white/10"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Floating callout for the selected hotspot. */}
      {selectedHotspot ? (
        <div
          role="status"
          data-testid="heatmap-callout"
          className="absolute top-3 right-3 z-[1000] bg-[#081b33]/95 border border-cyan-500/50 text-white rounded-xl p-3 shadow-2xl backdrop-blur-md max-w-xs text-xs"
        >
          <div className="flex items-center gap-1.5 text-orange-400 font-semibold uppercase tracking-wider text-[10px]">
            <span className="civic-heat-dot w-2 h-2 rounded-full bg-orange-500" />
            Highest Concentration
          </div>
          <div className="font-bold text-sm text-white mt-1">{selectedHotspot.ward}</div>
          <div className="text-slate-300 text-xs mt-0.5">
            {selectedHotspot.reports} reports &middot; {selectedHotspot.category}
          </div>
        </div>
      ) : null}

      {/* Bottom legend. */}
      <div className="absolute bottom-8 left-3 z-[1000] flex flex-wrap items-center gap-3 bg-[#0e315b]/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-[#1b4b8a] text-[11px] text-slate-300">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500" /> Normal
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-sky-400" /> Elevated
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-orange-500" /> Critical
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-500" /> Resolved
        </span>
      </div>

      {/* Tile outage is reported over the affected area, so a network failure is
          never misread as a styling problem or a missing API key. */}
      {tileErrors > 4 && !tilesLoaded ? (
        <div
          role="status"
          data-testid="heatmap-tile-error"
          className="absolute inset-0 z-[1200] flex flex-col items-center justify-center gap-2 bg-[#0d2a4e]/92 px-6 text-center"
        >
          <TriangleAlert className="h-5 w-5 text-amber-300" aria-hidden="true" />
          <p className="text-xs font-bold text-white">Map tiles could not be loaded</p>
          <p className="max-w-xs text-[11px] text-slate-300">
            The basemap is the free, keyless OpenStreetMap layer. This is a network or
            tile-server issue, not a missing API key.
          </p>
          <button
            type="button"
            onClick={retryTiles}
            className="mt-1 rounded-lg bg-[#1d63b8] px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-[#2569bd]"
          >
            Retry tiles
          </button>
        </div>
      ) : null}
    </div>
  );
}
