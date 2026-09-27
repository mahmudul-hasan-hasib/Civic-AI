"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";

import type { CivicReport } from "@/app/civic-shared";

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
};

export default function CivicMap({ reports }: CivicMapProps) {
  return (
    <MapContainer
      center={DHAKA_CENTER}
      zoom={12}
      scrollWheelZoom
      className="z-0 h-[450px] w-full rounded-xl"
    >
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />

      {reports.map((report) => (
        <Marker key={report.id} position={[report.lat, report.lng]}>
          <Popup>
            <div className="min-w-40 space-y-1 text-sm" data-testid="civic-map-popup">
              <p className="flex items-baseline justify-between gap-3">
                <strong>{report.category}</strong>
                <span className="shrink-0 text-xs text-slate-500">
                  Urgency {report.urgency_score}
                </span>
              </p>
              <p className="text-xs leading-relaxed text-slate-600">{report.summary_en}</p>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}