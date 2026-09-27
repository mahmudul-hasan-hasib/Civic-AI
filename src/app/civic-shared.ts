export type CivicReport = {
  id: string;
  category: string;
  urgency_score: number;
  summary_en: string;
  extracted_location: string;
  actionable_recommendation: string;
  lat: number;
  lng: number;
  created_at: string;
  input_text: string;
  source: "live" | "seed";
};

export const DEFAULT_COORDS: { lat: number; lng: number } = {
  lat: 23.8103,
  lng: 90.4125,
};

export const MAP_CENTER: [number, number] = [DEFAULT_COORDS.lat, DEFAULT_COORDS.lng];

export const MAP_ZOOM = 12;

export function clampUrgency(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 3;
  return Math.min(5, Math.max(1, Math.round(parsed)));
}

export function urgencyTone(score: number): string {
  if (score >= 4) return "#ef4444";
  if (score === 3) return "#f97316";
  return "#22c55e";
}

export function urgencyLabel(score: number): string {
  if (score >= 5) return "Critical";
  if (score === 4) return "High";
  if (score === 3) return "Moderate";
  if (score === 2) return "Low";
  return "Minimal";
}

export function urgencyBadgeClass(score: number): string {
  if (score >= 4) return "bg-red-500/15 text-red-300 ring-red-500/30";
  if (score === 3) return "bg-orange-500/15 text-orange-300 ring-orange-500/30";
  return "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30";
}

export function urgencyBarClass(score: number): string {
  if (score >= 4) return "bg-red-500";
  if (score === 3) return "bg-orange-500";
  return "bg-emerald-500";
}

export function formatCoordinate(value: number): string {
  return value.toFixed(4);
}

export function formatRelativeTime(iso: string): string {
  const parsed = new Date(iso).getTime();
  if (Number.isNaN(parsed)) return "unknown";
  const minutes = Math.round((Date.now() - parsed) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  const months = Math.round(days / 30);
  return `${months} mo ago`;
}
