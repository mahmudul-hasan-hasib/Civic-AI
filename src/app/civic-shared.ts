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
  ward: string;
  department: string;
  sla_hours: number;
  tracking_id: string;
  reference_hash: string;
  is_fallback: boolean;
  latency_ms: number | null;
  confidence: number;
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

export const CIVIC_CATEGORIES = [
  "Roads & Transport",
  "Water Supply",
  "Drainage",
  "Electricity",
  "Sanitation / Civic Maintenance",
] as const;

export function normalizeCategory(value: string): string {
  const normalized = value.trim();
  const haystack = normalized.toLowerCase();
  if (
    haystack.includes("road") ||
    haystack.includes("transport") ||
    haystack.includes("pothole") ||
    haystack.includes("গর্ত")
  ) {
    return "Roads & Transport";
  }
  if (
    haystack.includes("water") ||
    haystack.includes("pipe") ||
    haystack.includes("leak") ||
    haystack.includes("পানি") ||
    haystack.includes("পাইপ")
  ) {
    return "Water Supply";
  }
  if (
    haystack.includes("drain") ||
    haystack.includes("waterlog") ||
    haystack.includes("sewer") ||
    haystack.includes("ড্রেন") ||
    haystack.includes("জলাবদ্ধতা")
  ) {
    return "Drainage";
  }
  if (
    haystack.includes("power") ||
    haystack.includes("electric") ||
    haystack.includes("wire") ||
    haystack.includes("current") ||
    haystack.includes("বিদ্যুৎ") ||
    haystack.includes("তার")
  ) {
    return "Electricity";
  }
  return "Sanitation / Civic Maintenance";
}

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const radiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.sqrt(a)) * 1000;
}

export type WardBudget = {
  ward: string;
  label: string;
  lat: number;
  lng: number;
  allocation: Record<string, number>;
};

export const BASE_BUDGET_ALLOCATION: Record<string, number> = {
  "Roads & Transport": 40,
  Drainage: 15,
  "Water Supply": 25,
  "Sanitation / Civic Maintenance": 10,
  Electricity: 10,
};

const WARD_DEFS: { ward: string; label: string; lat: number; lng: number }[] = [
  { ward: "Ward 01", label: "Ward 01 · Mirpur", lat: 23.806, lng: 90.367 },
  { ward: "Ward 02", label: "Ward 02 · Kafrul", lat: 23.793, lng: 90.386 },
  { ward: "Ward 03", label: "Ward 03 · New Market", lat: 23.742, lng: 90.386 },
  { ward: "Ward 04", label: "Ward 04 · Mohammadpur", lat: 23.766, lng: 90.358 },
  { ward: "Ward 05", label: "Ward 05 · Dhanmondi", lat: 23.743, lng: 90.375 },
  { ward: "Ward 06", label: "Ward 06 · Hazaribagh", lat: 23.733, lng: 90.365 },
  { ward: "Ward 07", label: "Ward 07 · Lalbagh", lat: 23.714, lng: 90.386 },
  { ward: "Ward 08", label: "Ward 08 · Motijheel", lat: 23.733, lng: 90.417 },
  { ward: "Ward 09", label: "Ward 09 · Gulshan", lat: 23.79, lng: 90.415 },
  { ward: "Ward 10", label: "Ward 10 · Uttara", lat: 23.875, lng: 90.387 },
];

export const WARD_GRID: WardBudget[] = WARD_DEFS.map((definition) => ({
  ...definition,
  allocation: { ...BASE_BUDGET_ALLOCATION },
}));

export function wardFor(lat: number, lng: number): string {
  let nearest = WARD_DEFS[0];
  let nearestDistance = Infinity;
  for (const definition of WARD_DEFS) {
    const distance = haversineMeters(lat, lng, definition.lat, definition.lng);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = definition;
    }
  }
  return nearest.ward;
}

export function wardLabel(ward: string): string {
  return WARD_GRID.find((entry) => entry.ward === ward)?.label ?? ward;
}

export type CategoryAllocation = {
  category: string;
  complaints: number;
  demandPct: number;
  budgetPct: number;
  deficitPct: number;
};

export type WardDemand = {
  ward: string | null;
  total: number;
  allocations: CategoryAllocation[];
  gapIndex: number;
  mismatches: CategoryAllocation[];
};

export function demandAnalysis(reports: CivicReport[], ward: string | null): WardDemand {
  const scope = ward ? reports.filter((report) => report.ward === ward) : reports;
  const total = scope.length;
  const counts = new Map<string, number>();
  for (const report of scope) {
    counts.set(report.category, (counts.get(report.category) ?? 0) + 1);
  }

  const allocations = CIVIC_CATEGORIES.map((category) => {
    const complaints = counts.get(category) ?? 0;
    const demandPct = total > 0 ? (complaints / total) * 100 : 0;
    const budgetPct = BASE_BUDGET_ALLOCATION[category] ?? 0;
    return {
      category,
      complaints,
      demandPct,
      budgetPct,
      deficitPct: demandPct - budgetPct,
    };
  }).sort((a, b) => b.deficitPct - a.deficitPct);

  const alignment = allocations.reduce(
    (acc, row) => acc + Math.min(row.demandPct, row.budgetPct) / 100,
    0,
  );
  const gapIndex = Math.round(Math.max(0, 100 - alignment * 100));
  const mismatches = allocations.filter((row) => row.deficitPct > 20);

  return { ward, total, allocations, gapIndex, mismatches };
}

export type SuperIncident = {
  clusterId: string;
  lat: number;
  lng: number;
  category: string;
  citizen_report_count: number;
  urgency_score: number;
  member_ids: string[];
  latest_at: string;
  summary_en: string;
  extracted_location: string;
  actionable_recommendation: string;
};

export const CLUSTER_RADIUS_METERS = 500;

export function clusterReports(reports: CivicReport[]): SuperIncident[] {
  const newestFirst = [...reports].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const clusters: SuperIncident[] = [];

  for (const report of newestFirst) {
    let joined: SuperIncident | null = null;
    for (const cluster of clusters) {
      if (cluster.category !== report.category) continue;
      const distance = haversineMeters(cluster.lat, cluster.lng, report.lat, report.lng);
      if (distance <= CLUSTER_RADIUS_METERS) {
        joined = cluster;
        break;
      }
    }

    if (joined) {
      const members = [...joined.member_ids, report.id];
      const memberCount = members.length;
      const maxBase = Math.max(
        joined.urgency_score - (memberCount - 1 >= 2 ? 1 : 0),
        report.urgency_score,
      );
      const boosted = memberCount >= 2 ? Math.min(5, maxBase + 1) : maxBase;
      joined.member_ids = members;
      joined.citizen_report_count = memberCount;
      joined.urgency_score = Math.min(5, Math.max(1, boosted));
      joined.lat = (joined.lat + report.lat) / 2;
      joined.lng = (joined.lng + report.lng) / 2;
      if (new Date(report.created_at).getTime() > new Date(joined.latest_at).getTime()) {
        joined.latest_at = report.created_at;
        joined.summary_en = report.summary_en;
        joined.extracted_location = report.extracted_location;
        joined.actionable_recommendation = report.actionable_recommendation;
      }
    } else {
      clusters.push({
        clusterId: `CL-${clusters.length + 1}`,
        lat: report.lat,
        lng: report.lng,
        category: report.category,
        citizen_report_count: 1,
        urgency_score: report.urgency_score,
        member_ids: [report.id],
        latest_at: report.created_at,
        summary_en: report.summary_en,
        extracted_location: report.extracted_location,
        actionable_recommendation: report.actionable_recommendation,
      });
    }
  }

  return clusters.sort(
    (a, b) =>
      b.citizen_report_count - a.citizen_report_count ||
      new Date(b.latest_at).getTime() - new Date(a.latest_at).getTime(),
  );
}

export function clusterMemberCounts(clusters: SuperIncident[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const cluster of clusters) {
    for (const id of cluster.member_ids) {
      counts.set(id, cluster.citizen_report_count);
    }
  }
  return counts;
}

export const DEPARTMENT_BY_CATEGORY: Record<string, string> = {
  "Roads & Transport": "Zone Roads & Transport Division — Quick-Response Cell",
  "Water Supply": "Zone 4 Water & Sewerage Authority (WASA) Quick-Response Cell",
  Drainage: "City Drainage & Sewerage Engineering Division",
  Electricity: "City Power Distribution Quick-Response Unit",
  "Sanitation / Civic Maintenance": "Cleansing & Sanitation Wing — Ward Cell",
};

export function departmentFor(category: string): string {
  return DEPARTMENT_BY_CATEGORY[normalizeCategory(category)] ?? DEPARTMENT_BY_CATEGORY["Sanitation / Civic Maintenance"];
}

const SLA_HOURS_BY_URGENCY: Record<number, number> = { 1: 72, 2: 72, 3: 72, 4: 48, 5: 24 };

export function slaHours(score: number): number {
  return SLA_HOURS_BY_URGENCY[clampUrgency(score)] ?? 72;
}

export function slapolicyLabel(score: number): string {
  const leveled = clampUrgency(score);
  if (leveled >= 5) return "SLA: 24 Hours for Level 5 Urgency";
  if (leveled === 4) return "SLA: 48 Hours for Level 4 Urgency";
  return "SLA: 72 Hours for Level 2-3 Urgency";
}

const TRACKING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateTrackingId(): string {
  let code = "";
  for (let index = 0; index < 8; index += 1) {
    code += TRACKING_ALPHABET[Math.floor(Math.random() * TRACKING_ALPHABET.length)];
  }
  return `CIVIC-2026-${code}`;
}

export function referenceHash(trackingId: string, createdAt: string): string {
  let hash = 0x811c9dc5;
  const source = `${trackingId}:${createdAt}`;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

export function formatCurrency(amount: number): string {
  return `$${Math.round(amount / 1000)}k`;
}

export function budgetShiftAmount(deficitPct: number): number {
  return Math.round((deficitPct / 100) * 1_000_000 / 50_000) * 50_000;
}

export function clusterAgeHours(latest_at: string): number {
  const elapsed = Date.now() - new Date(latest_at).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return 1;
  return Math.max(1, Math.round(elapsed / 3_600_000));
}