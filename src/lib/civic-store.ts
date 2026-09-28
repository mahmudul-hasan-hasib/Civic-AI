/* Cross-route client persistence for CivicLens.

   The citizen portal and the authority command center are separate routes, so
   React context cannot bridge them. Instead every mutation is written to
   localStorage and published through a tiny external store, which both pages
   subscribe to with useSyncExternalStore.

   That gives us three things at once:
     - instant optimistic state inside the submitting tab,
     - automatic pickup when the user navigates to /dashboard,
     - cross-tab sync via the native "storage" event.

   Seeds are deterministic demo data and are never written to storage; only
   reports the citizen actually files are persisted. */

import { useCallback, useSyncExternalStore } from "react";

import {
  clampUrgency,
  departmentFor,
  generateTrackingId,
  normalizeCategory,
  referenceHash,
  slaHours,
  wardFor,
} from "@/app/civic-shared";
import type { CivicReport } from "@/app/civic-shared";

export const REPORTS_STORAGE_KEY = "civiclens-reports";
export const TELEMETRY_STORAGE_KEY = "civiclens-telemetry";
export const DISPATCH_STORAGE_KEY = "civiclens-dispatched";
export const RESOLVED_STORAGE_KEY = "civiclens-resolved";

export type CivicTelemetry = {
  mode: "primary" | "resilient";
  latency_ms: number;
  confidence: number;
  active_model: string;
};

const EMPTY_REPORTS: CivicReport[] = [];
const EMPTY_DISPATCHED: string[] = [];
const EMPTY_RESOLVED: string[] = [];

function readRaw(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    /* storage blocked (private mode / quota) — the session still works in memory */
    return false;
  }
}

function parseArray<T>(raw: string | null, guard: (value: unknown) => value is T): T[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(guard) : [];
  } catch {
    return [];
  }
}

function parseValue<T>(raw: string | null, guard: (value: unknown) => value is T): T | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return guard(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isReport(value: unknown): value is CivicReport {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CivicReport>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.tracking_id === "string" &&
    typeof candidate.category === "string" &&
    typeof candidate.urgency_score === "number" &&
    typeof candidate.created_at === "string" &&
    typeof candidate.lat === "number" &&
    typeof candidate.lng === "number"
  );
}

function isTelemetry(value: unknown): value is CivicTelemetry {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CivicTelemetry>;
  return (
    (candidate.mode === "primary" || candidate.mode === "resilient") &&
    typeof candidate.latency_ms === "number" &&
    typeof candidate.confidence === "number" &&
    typeof candidate.active_model === "string"
  );
}

/* ------------------------------------------------------------------ *
 * Minimal external store: cached snapshots + subscriber registry.
 * getSnapshot must be referentially stable, hence the raw-string cache.
 * ------------------------------------------------------------------ */

type Listener = () => void;

const listeners = new Set<Listener>();
let memoryFallback: Record<string, string> = {};

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  if (typeof window !== "undefined" && listeners.size === 1) {
    /* Fires only in other tabs; same-tab writes call notify() directly. */
    window.addEventListener("storage", notify);
  }
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined" && listeners.size === 0) {
      window.removeEventListener("storage", notify);
    }
  };
}

function createCachedReader<T>(key: string, guard: (value: unknown) => value is T) {
  let cachedRaw: string | null = null;
  let cachedValue: T[] = [];
  let primed = false;

  return (): T[] => {
    const raw = readRaw(key) ?? memoryFallback[key] ?? null;
    if (primed && raw === cachedRaw) return cachedValue;
    cachedRaw = raw;
    cachedValue = parseArray<T>(raw, guard);
    primed = true;
    return cachedValue;
  };
}

const readReportsSnapshot = createCachedReader(REPORTS_STORAGE_KEY, isReport);
const readDispatchedSnapshot = createCachedReader(DISPATCH_STORAGE_KEY, (v): v is string => typeof v === "string");
const readResolvedSnapshot = createCachedReader(RESOLVED_STORAGE_KEY, (v): v is string => typeof v === "string");

/* Single-record counterpart to createCachedReader, with the same raw-string
   cache. Without it the telemetry snapshot is a fresh object on every call,
   which useSyncExternalStore reads as a perpetual change and loops on. */
function createCachedValueReader<T>(key: string, guard: (value: unknown) => value is T) {
  let cachedRaw: string | null = null;
  let cachedValue: T | null = null;
  let primed = false;

  return (): T | null => {
    const raw = readRaw(key) ?? memoryFallback[key] ?? null;
    if (primed && raw === cachedRaw) return cachedValue;
    cachedRaw = raw;
    cachedValue = parseValue<T>(raw, guard);
    primed = true;
    return cachedValue;
  };
}

const readTelemetrySnapshot = createCachedValueReader(TELEMETRY_STORAGE_KEY, isTelemetry);

function writeArray(key: string, values: unknown[]): void {
  const payload = JSON.stringify(values);
  if (!writeRaw(key, payload)) {
    memoryFallback = { ...memoryFallback, [key]: payload };
  }
  notify();
}

export const readReports = readReportsSnapshot;
export const readDispatched = readDispatchedSnapshot;
export const readResolved = readResolvedSnapshot;
export const subscribeToStore = subscribe;

/* Snapshot readers for the server render must be stable references. */
const serverReports = (): CivicReport[] => EMPTY_REPORTS;
const serverDispatched = (): string[] => EMPTY_DISPATCHED;
const serverTelemetry = (): CivicTelemetry | null => null;

/* ----------------------------- hooks ------------------------------ */

export function useCivicReports(): CivicReport[] {
  return useSyncExternalStore(subscribe, readReportsSnapshot, serverReports);
}

export function useCivicTelemetry(): CivicTelemetry | null {
  return useSyncExternalStore(
    subscribe,
    readTelemetrySnapshot,
    serverTelemetry,
  );
}

export function useDispatchedTickets(): {
  dispatched: Set<string>;
  toggleDispatch: (id: string) => void;
  clearDispatch: () => void;
} {
  const ids = useSyncExternalStore(
    subscribe,
    readDispatchedSnapshot,
    serverDispatched,
  );

  const toggleDispatch = useCallback((id: string) => {
    const current = readDispatchedSnapshot();
    const next = current.includes(id)
      ? current.filter((value) => value !== id)
      : [...current, id];
    writeArray(DISPATCH_STORAGE_KEY, next);
  }, []);

  const clearDispatch = useCallback(() => {
    writeArray(DISPATCH_STORAGE_KEY, []);
  }, []);

  return { dispatched: new Set(ids), toggleDispatch, clearDispatch };
}

/* Resolution is officer-authored, not inferred from age: a ticket only becomes
   "Resolved" when someone marks it, so the dashboard filter always reflects a
   real workflow decision rather than a guess. */
export function useResolvedTickets(): {
  resolved: Set<string>;
  toggleResolved: (id: string) => void;
} {
  const ids = useSyncExternalStore(
    subscribe,
    readResolvedSnapshot,
    () => EMPTY_RESOLVED,
  );

  const toggleResolved = useCallback((id: string) => {
    const current = readResolvedSnapshot();
    const next = current.includes(id)
      ? current.filter((value) => value !== id)
      : [...current, id];
    writeArray(RESOLVED_STORAGE_KEY, next);
  }, []);

  return { resolved: new Set(ids), toggleResolved };
}

/* --------------------------- mutations ---------------------------- */

/** Prepends a freshly filed grievance so the dashboard sees it immediately. */
export function persistReport(report: CivicReport): void {
  const next = [report, ...readReportsSnapshot()].slice(0, 200);
  writeArray(REPORTS_STORAGE_KEY, next);
}

export function persistTelemetry(telemetry: CivicTelemetry): void {
  const payload = JSON.stringify(telemetry);
  if (!writeRaw(TELEMETRY_STORAGE_KEY, payload)) {
    memoryFallback = { ...memoryFallback, [TELEMETRY_STORAGE_KEY]: payload };
  }
  notify();
}

export function clearPersistedReports(): void {
  writeArray(REPORTS_STORAGE_KEY, []);
}

/* ------------------------- report factory ------------------------- */

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function buildTicketId(date: Date): string {
  const stamp = [
    String(date.getFullYear()).slice(-2),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");
  const serial = String(Math.floor(Math.random() * 9000) + 1000);
  return `CIV-${stamp}-${serial}`;
}

type AnalysePayload = {
  input_text: string;
  lat: number;
  lng: number;
  language?: string;
};

type AnalyseResult = {
  report: CivicReport;
  telemetry: CivicTelemetry;
};

/**
 * Calls the civic triage service, normalises the response into a CivicReport
 * and persists both the report and its telemetry.
 */
export async function submitGrievance(
  input: AnalysePayload,
): Promise<AnalyseResult> {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error ?? "The grievance could not be analysed.");
  }

  const analysed = (payload?.data ?? payload) as Partial<CivicReport> & {
    assigned_department?: unknown;
    active_model?: unknown;
  };

  const now = new Date();
  const lat = toFiniteNumber(analysed.lat, input.lat);
  const lng = toFiniteNumber(analysed.lng, input.lng);
  const isFallback = Boolean(analysed.is_fallback);
  const latencyMs = typeof analysed.latency_ms === "number" ? analysed.latency_ms : 0;
  const confidence = toFiniteNumber(analysed.confidence, 0.9);
  const activeModel =
    typeof analysed.active_model === "string" ? analysed.active_model.trim() : "";
  const category = normalizeCategory(analysed.category?.trim() || input.input_text);
  const urgency = clampUrgency(analysed.urgency_score);
  const aiDepartment =
    typeof analysed.assigned_department === "string"
      ? analysed.assigned_department.trim()
      : "";

  const trackingId = generateTrackingId();
  const created_at = analysed.created_at ?? now.toISOString();

  const report: CivicReport = {
    id: buildTicketId(now),
    category,
    urgency_score: urgency,
    summary_en: analysed.summary_en?.trim() || input.input_text,
    extracted_location:
      analysed.extracted_location?.trim() || "Location not specified",
    actionable_recommendation:
      analysed.actionable_recommendation?.trim() ||
      "Route to the ward engineer for a physical inspection within 48 hours.",
    lat,
    lng,
    created_at,
    input_text: input.input_text,
    source: "live",
    ward: wardFor(lat, lng),
    department: aiDepartment || departmentFor(category),
    sla_hours: slaHours(urgency),
    tracking_id: trackingId,
    reference_hash: referenceHash(trackingId, created_at),
    is_fallback: isFallback,
    latency_ms: latencyMs,
    confidence,
  };

  const telemetry: CivicTelemetry = {
    mode: isFallback ? "resilient" : "primary",
    latency_ms: latencyMs,
    confidence,
    active_model: activeModel,
  };

  persistReport(report);
  persistTelemetry(telemetry);

  return { report, telemetry };
}

/* ----------------------------- seed data --------------------------- */

type SeedDefinition = {
  id: string;
  tracking_id: string;
  category: string;
  urgency_score: number;
  summary_en: string;
  extracted_location: string;
  actionable_recommendation: string;
  lat: number;
  lng: number;
  ageHours: number;
  input_text: string;
};

const SEED_DEFINITIONS: SeedDefinition[] = [
  {
    id: "CIV-260901-4417",
    tracking_id: "CIVIC-2026-4Q2X8M5K",
    category: "Drainage",
    urgency_score: 5,
    summary_en:
      "Waterlogging up to knee level has cut off the only access road to the primary school; two children nearly drowned this morning.",
    extracted_location: "Mirpur 10",
    actionable_recommendation:
      "Deploy emergency pumping units within 2 hours, desilt the outfall and mark the ward as Sev-A.",
    lat: 23.804,
    lng: 90.379,
    ageHours: 2,
    input_text:
      "আমাদের এলাকায় হাঁটু পর্যন্ত জল জমে আছে, স্কুলের রাস্তা বন্ধ। দুটি শিশু প্রায় ডুবে গেছে।",
  },
  {
    id: "CIV-260901-8820",
    tracking_id: "CIVIC-2026-7P9L3W6D",
    category: "Water Supply",
    urgency_score: 4,
    summary_en:
      "Continuous dry taps for five days across more than 40 households; two patients depend on this line for tube-well refills.",
    extracted_location: "Sadarghat",
    actionable_recommendation:
      "Dispatch two water tankers to the ward today and escalate the rising-main blockage to the zone officer.",
    lat: 23.799,
    lng: 90.418,
    ageHours: 5,
    input_text:
      "पाँच दिन से पानी नहीं आ रहा। बीमार मरीज़ों के लिए ट्यूबवेल भरना संभव नहीं हो पा रहा।",
  },
  {
    id: "CIV-260901-1053",
    tracking_id: "CIVIC-2026-2R8J4V7F",
    category: "Electricity",
    urgency_score: 4,
    summary_en:
      "A pole-mounted transformer is arcing and the pole is visibly leaning; residents fear an electrocution incident.",
    extracted_location: "Mohammadpur",
    actionable_recommendation:
      "Isolate the feeder immediately, issue a public safety notice, and replace the pole within 48 hours.",
    lat: 23.81,
    lng: 90.399,
    ageHours: 7,
    input_text:
      "The transformer in our lane keeps sparking and the pole is tilted. It feels very unsafe.",
  },
  {
    id: "CIV-260901-6290",
    tracking_id: "CIVIC-2026-5T3N9H6C",
    category: "Drainage",
    urgency_score: 4,
    summary_en:
      "A collapsed drain cover has left an open hole on a busy footpath just after heavy rain.",
    extracted_location: "Keraniganj",
    actionable_recommendation:
      "Barricade the spot immediately, cast a temporary slab and install reflective signage overnight.",
    lat: 23.774,
    lng: 90.376,
    ageHours: 9,
    input_text:
      "नाली का ढक्कन टूटकर गड्ढा बन गया है, बारिश में पानी भर गया है। बच्चे गिरते हैं।",
  },
  {
    id: "CIV-260901-7742",
    tracking_id: "CIVIC-2026-8K2M4Z9X",
    category: "Roads & Transport",
    urgency_score: 3,
    summary_en:
      "A deep crater on the main arterial road is causing two-wheeler accidents during peak hours.",
    extracted_location: "Uttara Sector 6",
    actionable_recommendation:
      "Patch the crater through the emergency tender and add speed breakers before the next school day.",
    lat: 23.9,
    lng: 90.393,
    ageHours: 12,
    input_text: "মূল রাস্তায় বড় গর্ত হয়েছে, দুপুরে দুর্ঘটনা হয়। দ্রুত ঠিক করা দরকার।",
  },
  {
    id: "CIV-260901-3388",
    tracking_id: "CIVIC-2026-3V7L5B8P",
    category: "Drainage",
    urgency_score: 3,
    summary_en:
      "A flooded service lane behind the keraniganj market has standing sewage water that residents wade through daily.",
    extracted_location: "Keraniganj service lane",
    actionable_recommendation:
      "Send a jet-suction tanker and spray larvicide across the affected lane within 24 hours.",
    lat: 23.7745,
    lng: 90.3762,
    ageHours: 16,
    input_text: "বৃষ্টির পরও আশপাশে পানি দাঁড়িয়ে আছে, দুর্গন্ধ এবং মশা বাড়ছে।",
  },
  {
    id: "CIV-260901-5514",
    tracking_id: "CIVIC-2026-6X4N2G9R",
    category: "Drainage",
    urgency_score: 3,
    summary_en:
      "Household waste has not been cleared for eleven days and is blocking the nullah, drawing flies.",
    extracted_location: "Wari",
    actionable_recommendation:
      "Schedule a special clearance vehicle for three consecutive days and fumigate the nullah stretch.",
    lat: 23.71,
    lng: 90.39,
    ageHours: 21,
    input_text: "Eleven days since garbage was cleared. The drain is completely blocked now.",
  },
  {
    id: "CIV-260901-2267",
    tracking_id: "CIVIC-2026-9D7H3W5T",
    category: "Waste Management",
    urgency_score: 2,
    summary_en:
      "An overflowing waste pile beside a school gate is spreading and attracting stray animals.",
    extracted_location: "Gulshan 1",
    actionable_recommendation:
      "Re-deploy two collection vehicles to the sector and install an additional bin at the school gate.",
    lat: 23.792,
    lng: 90.407,
    ageHours: 30,
    input_text: "স্কুলের গেটের পাশে আবর্জনা ফুলে গেছে, মশা ও পাখির সমস্যা হচ্ছে।",
  },
  {
    id: "CIV-260901-9931",
    tracking_id: "CIVIC-2026-2Z6J8M4K",
    category: "Roads & Transport",
    urgency_score: 2,
    summary_en:
      "Three streetlights are out on a stretch where residents walk home after dark.",
    extracted_location: "Lalbagh",
    actionable_recommendation:
      "Replace the failed light assemblies this week and add two poles on the dark block.",
    lat: 23.717,
    lng: 90.388,
    ageHours: 44,
    input_text:
      "The street light has not worked for a week, the road is completely dark at night.",
  },
  {
    id: "CIV-260900-4125",
    tracking_id: "CIVIC-2026-5C9R2V7L",
    category: "Water Supply",
    urgency_score: 2,
    summary_en:
      "Irregular supply timing with no published schedule leaves households short every morning.",
    extracted_location: "Farmgate",
    actionable_recommendation:
      "Publish a weekly supply schedule and position an auto-tanker for the morning window.",
    lat: 23.757,
    lng: 90.396,
    ageHours: 58,
    input_text: "পানি আসার সময় অনিয়মিত এবং কোনো সময়সূচি দেওয়া হয় না।",
  },
];

/** Deterministic historical registry used for context on both routes. */
export function buildSeedReports(): CivicReport[] {
  const now = Date.now();
  const at = (hoursAgo: number) =>
    new Date(now - hoursAgo * 3_600_000).toISOString();

  return SEED_DEFINITIONS.map((seed) => {
    const category = normalizeCategory(seed.category);
    const created_at = at(seed.ageHours);
    return {
      id: seed.id,
      category,
      urgency_score: seed.urgency_score,
      summary_en: seed.summary_en,
      extracted_location: seed.extracted_location,
      actionable_recommendation: seed.actionable_recommendation,
      lat: seed.lat,
      lng: seed.lng,
      created_at,
      input_text: seed.input_text,
      source: "seed" as const,
      ward: wardFor(seed.lat, seed.lng),
      department: departmentFor(category),
      sla_hours: slaHours(seed.urgency_score),
      tracking_id: seed.tracking_id,
      reference_hash: referenceHash(seed.tracking_id, seed.id),
      is_fallback: false,
      latency_ms: null,
      confidence: 0.95,
    };
  });
}

/** Every grievance visible to the authority view: live filings first. */
export function mergeReports(live: CivicReport[], seeds: CivicReport[]): CivicReport[] {
  return [...live, ...seeds];
}
