"use client";

import dynamic from "next/dynamic";
import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  BellRing,
  Building,
  ChartColumn,
  Check,
  CircleAlert,
  CircleCheckBig,
  Clock,
  Copy,
  Crosshair,
  Download,
  Droplets,
  FileDown,
  FileText,
  Fingerprint,
  Gauge,
  HardHat,
  Landmark,
  Languages,
  Lightbulb,
  LocateFixed,
  LoaderCircle,
  MapPin,
  Mic,
  MicOff,
  PenLine,
  Radio,
  Recycle,
  Scale,
  ScrollText,
  Send,
  Server,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Sparkles,
  Stamp,
  Target,
  Timer,
  TrendingUp,
  TriangleAlert,
  Users,
  Wallet,
  Workflow,
  Wrench,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  DEFAULT_COORDS,
  WARD_GRID,
  budgetShiftAmount,
  clampUrgency,
  clusterMemberCounts,
  clusterReports,
  demandAnalysis,
  departmentFor,
  formatCoordinate,
  formatCurrency,
  formatRelativeTime,
  generateTrackingId,
  normalizeCategory,
  referenceHash,
  slaHours,
  slapolicyLabel,
  urgencyBadgeClass,
  urgencyBarClass,
  urgencyLabel,
  wardFor,
  wardLabel,
} from "./civic-shared";
import type { CivicReport } from "./civic-shared";

const CivicMap = dynamic(() => import("@/components/CivicMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[450px] w-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-100">
      <p className="font-medium text-slate-500">Loading OpenStreetMap civic layers...</p>
    </div>
  ),
});

type SpeechAlternative = { transcript: string };
type SpeechResult = {
  isFinal: boolean;
  [index: number]: SpeechAlternative | undefined;
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechResult | undefined };
};
type SpeechRecognitionErrorLike = { error: string; message?: string };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

type TabId = "citizen" | "policymaker";
type LocationState = "locating" | "detected" | "fallback";
type SeverityFilter = "all" | "high" | "critical";

const SUPPORTED_LANGUAGES: { code: string; label: string; short: string }[] = [
  { code: "bn-IN", label: "বাংলা (Bengali)", short: "BN" },
  { code: "hi-IN", label: "हिन्दी (Hindi)", short: "HI" },
  { code: "en-IN", label: "English (India)", short: "EN" },
];

const PLACEHOLDER: Record<string, string> = {
  "bn-IN": "উদাহরণ: আমাদের এলাকায় তিন দিন ধরে পানি নেই, এবং রাস্তায় ড্রেনেজ ভেঙে পড়েছে।",
  "hi-IN": "उदाहरण: हमारे मोहल्ले में तीन दिन से पानी नहीं आ रहा और नाली जाम है।",
  "en-IN": "e.g. Our lane has had no water supply for three days and the storm drain has collapsed.",
};

const CATEGORY_ICON: Record<string, LucideIcon> = {
  Drainage: Droplets,
  "Roads & Transport": Wrench,
  "Water Supply": Droplets,
  Electricity: Zap,
  "Sanitation / Civic Maintenance": Recycle,
};

const CATEGORY_TINT: Record<string, string> = {
  Drainage: "text-sky-300 bg-sky-500/10 ring-sky-500/25",
  "Roads & Transport": "text-amber-300 bg-amber-500/10 ring-amber-500/25",
  "Water Supply": "text-cyan-300 bg-cyan-500/10 ring-cyan-500/25",
  Electricity: "text-yellow-300 bg-yellow-500/10 ring-yellow-500/25",
  "Sanitation / Civic Maintenance": "text-violet-300 bg-violet-500/10 ring-violet-500/25",
};

const PANEL =
  "rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl shadow-black/20 backdrop-blur";

const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 8000,
  maximumAge: 30_000,
};

const EMPTY_SUBSCRIBE = () => () => {};
const CLIENT_MOUNTED = () => true;
const SERVER_HYDRATING = () => false;

function categoryIcon(category: string): LucideIcon {
  const direct = CATEGORY_ICON[category];
  if (direct) return direct;
  const match = Object.entries(CATEGORY_ICON).find(([key]) =>
    category.toLowerCase().includes(key.toLowerCase().split(" ")[0]),
  );
  return match ? match[1] : Landmark;
}

function categoryTint(category: string): string {
  const direct = CATEGORY_TINT[category];
  if (direct) return direct;
  return "text-slate-300 bg-slate-500/10 ring-slate-500/25";
}

function speechErrorMessage(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access is blocked. Allow it in your browser settings, or type your grievance below.";
    case "no-speech":
      return "No speech was detected. Press record and speak again, or type your grievance below.";
    case "audio-capture":
      return "No microphone was detected on this device. You can type your grievance below.";
    case "network":
      return "The speech service could not be reached. Please type your grievance below.";
    case "aborted":
      return "Recording stopped before it finished.";
    default:
      return "Voice capture failed. Please type your grievance below.";
  }
}

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function buildTicketId(date: Date): string {  const stamp = [
    String(date.getFullYear()).slice(-2),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");
  const serial = String(Math.floor(Math.random() * 9000) + 1000);
  return `CIV-${stamp}-${serial}`;
}

function buildSeedReports(): CivicReport[] {
  const now = Date.now();
  const at = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000).toISOString();

  const seeds: {
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
  }[] = [
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
      input_text: "The transformer in our lane keeps sparking and the pole is tilted. It feels very unsafe.",
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
      input_text: "The street light has not worked for a week, the road is completely dark at night.",
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

  return seeds.map((seed) => {
    const category = normalizeCategory(seed.category);
    const created_at = at(seed.ageHours);
    const trackingId = seed.tracking_id;
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
      tracking_id: trackingId,
      reference_hash: referenceHash(trackingId, seed.id),
      is_fallback: false,
      latency_ms: null,
      confidence: 0.95,
    };
  });
}

function Panel({
  title,
  subtitle,
  icon: Icon,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${PANEL} flex flex-col ${className}`}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 ring-1 ring-indigo-500/25">
            <Icon className="h-4.5 w-4.5 text-indigo-300" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
            {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
          </div>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  progress,
}: {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  tone: "indigo" | "red" | "amber" | "emerald";
  progress?: number;
}) {
  const tones: Record<string, string> = {
    indigo: "text-indigo-300 bg-indigo-500/10 ring-indigo-500/25",
    red: "text-red-300 bg-red-500/10 ring-red-500/25",
    amber: "text-orange-300 bg-orange-500/10 ring-orange-500/25",
    emerald: "text-emerald-300 bg-emerald-500/10 ring-emerald-500/25",
  };
  const bars: Record<string, string> = {
    indigo: "bg-indigo-400",
    red: "bg-red-400",
    amber: "bg-orange-400",
    emerald: "bg-emerald-400",
  };

  return (
    <div className={`${PANEL} flex flex-col gap-3 p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            {label}
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-50">{value}</p>
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${tones[tone]}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      {typeof progress === "number" ? (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${bars[tone]}`}
            style={{ width: `${Math.min(100, Math.max(2, progress))}%` }}
          />
        </div>
      ) : null}
      <p className="text-xs leading-relaxed text-slate-400">{hint}</p>
    </div>
  );
}

function RelativeTime({ value }: { value: string }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setLabel(formatRelativeTime(value));
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, [value]);

  return (
    <time dateTime={value} className="whitespace-nowrap tabular-nums text-slate-500">
      {label ?? "—"}
    </time>
  );
}

function UrgencyMeter({ score, className = "" }: { score: number; className?: string }) {
  return (
    <div className={`flex items-center gap-1 ${className}`} aria-hidden="true">
      {[1, 2, 3, 4, 5].map((step) => (
        <span
          key={step}
          className={`h-1.5 w-4 rounded-full ${
            step <= score ? urgencyBarClass(score) : "bg-slate-700"
          }`}
        />
      ))}
    </div>
  );
}

function CategoryGlyph({ category, className }: { category: string; className?: string }) {
  return createElement(categoryIcon(category), { className, "aria-hidden": true });
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${categoryTint(
        category,
      )}`}
    >
      <CategoryGlyph category={category} className="h-3 w-3" />
      {category}
    </span>
  );
}

function UrgencyBadge({ score }: { score: number }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${urgencyBadgeClass(
        score,
      )}`}
    >
      <span className="tabular-nums">U{score}</span>
      <span className="text-slate-400/80">·</span>
      {urgencyLabel(score)}
    </span>
  );
}

export default function CivicDashboardPage() {
  const [tab, setTab] = useState<TabId>("citizen");
  const [unread, setUnread] = useState(0);
  const [reports, setReports] = useState<CivicReport[]>(buildSeedReports);
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [wardScope, setWardScope] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<{
    mode: "primary" | "resilient";
    latency_ms: number;
    confidence: number;
  } | null>(null);

  const [draft, setDraft] = useState("");
  const [language, setLanguage] = useState(SUPPORTED_LANGUAGES[0].code);
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);

  const [coords, setCoords] = useState({ lat: DEFAULT_COORDS.lat, lng: DEFAULT_COORDS.lng });
  const [locationState, setLocationState] = useState<LocationState>("locating");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<CivicReport | null>(null);
  const mounted = useSyncExternalStore(EMPTY_SUBSCRIBE, CLIENT_MOUNTED, SERVER_HYDRATING);

  const draftRef = useRef(draft);
  const transcriptBaseRef = useRef("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (!isListening) return;

    const Recognition =
      typeof window === "undefined"
        ? undefined
        : (window.SpeechRecognition ?? window.webkitSpeechRecognition);

    if (!Recognition) return;

    const recognition = new Recognition();
    recognition.lang = language;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    transcriptBaseRef.current = draftRef.current;
    recognitionRef.current = recognition;

    recognition.onstart = () => setSpeechError(null);

    recognition.onresult = (event) => {
      let finalPart = "";
      let interimPart = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const alternative = result?.[0];
        if (!alternative) continue;
        if (result.isFinal) finalPart += `${alternative.transcript} `;
        else interimPart += alternative.transcript;
      }
      setDraft(`${transcriptBaseRef.current}${finalPart}${interimPart}`.trimStart());
    };

    recognition.onerror = (event) => {
      setSpeechError(speechErrorMessage(event.error));
    };

    recognition.onend = () => setIsListening(false);

    const startTimer = window.setTimeout(() => {
      try {
        recognition.start();
      } catch {
        setIsListening(false);
        setSpeechError("The microphone could not be started. Please try again.");
      }
    }, 0);

    return () => {
      window.clearTimeout(startTimer);
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognitionRef.current = null;
      recognition.abort();
    };
  }, [isListening, language]);

  const applyDetectedCoords = useCallback((position: GeolocationPosition) => {
    setCoords({
      lat: Number(position.coords.latitude.toFixed(6)),
      lng: Number(position.coords.longitude.toFixed(6)),
    });
    setLocationState("detected");
  }, []);

  const applyFallbackCoords = useCallback(() => {
    setCoords({ lat: DEFAULT_COORDS.lat, lng: DEFAULT_COORDS.lng });
    setLocationState("fallback");
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      const timer = window.setTimeout(applyFallbackCoords, 0);
      return () => window.clearTimeout(timer);
    }

    let active = true;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (active) applyDetectedCoords(position);
      },
      () => {
        if (active) applyFallbackCoords();
      },
      GEOLOCATION_OPTIONS,
    );

    return () => {
      active = false;
    };
  }, [applyDetectedCoords, applyFallbackCoords]);

  const requestLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      applyFallbackCoords();
      return;
    }

    setLocationState("locating");
    navigator.geolocation.getCurrentPosition(
      applyDetectedCoords,
      applyFallbackCoords,
      GEOLOCATION_OPTIONS,
    );
  }, [applyDetectedCoords, applyFallbackCoords]);

  const selectTab = (next: TabId) => {
    setTab(next);
    if (next === "policymaker") setUnread(0);
  };

  const analytics = useMemo(() => {
    const total = reports.length;
    const counts = new Map<string, number>();

    for (const report of reports) {
      counts.set(report.category, (counts.get(report.category) ?? 0) + 1);
    }

    const ranked = Array.from(counts.entries())
      .map(([category, count]) => ({
        category,
        count,
        demandPct: total > 0 ? (count / total) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));

    const highUrgency = reports.filter((report) => report.urgency_score >= 4).length;
    const critical = reports.filter((report) => report.urgency_score >= 5).length;

    const demand = demandAnalysis(reports, null);

    return {
      total,
      highUrgency,
      critical,
      highUrgencyPct: total > 0 ? (highUrgency / total) * 100 : 0,
      ranked,
      gapIndex: demand.gapIndex,
      topCategory: ranked[0] ?? { category: "No data", count: 0, demandPct: 0 },
    };
  }, [reports]);

  const visibleReports = useMemo(() => {
    if (severity === "high") {
      return reports.filter((report) => report.urgency_score >= 4);
    }
    if (severity === "critical") {
      return reports.filter((report) => report.urgency_score >= 5);
    }
    return reports;
  }, [reports, severity]);

  const clusters = useMemo(() => clusterReports(visibleReports), [visibleReports]);

  const clusterCountFor = useMemo(() => clusterMemberCounts(clusters), [clusters]);

  const wardDemand = useMemo(
    () => demandAnalysis(reports, wardScope),
    [reports, wardScope],
  );

  const liveCount = useMemo(
    () => reports.filter((report) => report.source === "live").length,
    [reports],
  );

  const toggleListening = () => {
    setSpeechError(null);

    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const Recognition =
      typeof window === "undefined"
        ? undefined
        : (window.SpeechRecognition ?? window.webkitSpeechRecognition);

    if (!Recognition) {
      setSpeechError(
        "Live transcription is not supported in this browser. Please type your grievance below.",
      );
      return;
    }

    setIsListening(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const text = draft.trim();
    if (!text) {
      setSubmitError("Please describe the problem using your voice or the text field.");
      return;
    }

    if (isListening) setIsListening(false);
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input_text: text, lat: coords.lat, lng: coords.lng }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? "The grievance could not be analysed.");
      }

      const analysed = (payload?.data ?? payload) as Partial<CivicReport> & {
        assigned_department?: unknown;
      };
      const now = new Date();
      const reportLat = toFiniteNumber(analysed.lat, coords.lat);
      const reportLng = toFiniteNumber(analysed.lng, coords.lng);
      const isFallback = Boolean(analysed.is_fallback);
      const latencyMs = typeof analysed.latency_ms === "number" ? analysed.latency_ms : null;
      const confidence = toFiniteNumber(analysed.confidence, 0.9);
      const category = normalizeCategory(analysed.category?.trim() || text);
      const aiDepartment =
        typeof analysed.assigned_department === "string"
          ? analysed.assigned_department.trim()
          : "";
      const trackingId = generateTrackingId();
      const created_at = analysed.created_at ?? now.toISOString();
      const report: CivicReport = {
        id: buildTicketId(now),
        category,
        urgency_score: clampUrgency(analysed.urgency_score),
        summary_en: analysed.summary_en?.trim() || text,
        extracted_location: analysed.extracted_location?.trim() || "Location not specified",
        actionable_recommendation:
          analysed.actionable_recommendation?.trim() ||
          "Route to the ward engineer for a physical inspection within 48 hours.",
        lat: reportLat,
        lng: reportLng,
        created_at,
        input_text: text,
        source: "live",
        ward: wardFor(reportLat, reportLng),
        department: aiDepartment || departmentFor(category),
        sla_hours: slaHours(clampUrgency(analysed.urgency_score)),
        tracking_id: trackingId,
        reference_hash: referenceHash(trackingId, created_at),
        is_fallback: isFallback,
        latency_ms: latencyMs,
        confidence,
      };

      setTelemetry({
        mode: isFallback ? "resilient" : "primary",
        latency_ms: latencyMs ?? 0,
        confidence,
      });
      setVerdict(report);
      setReports((previous) => [report, ...previous]);
      setDraft("");
      if (tab === "citizen") setUnread((previous) => previous + 1);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Something went wrong while contacting the civic intelligence service.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const exportTickets = () => {
    const quote = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const header = [
      "Ticket ID",
      "Category",
      "Urgency",
      "Urgency Label",
      "Location",
      "Summary",
      "Recommended Action",
      "Latitude",
      "Longitude",
      "Reported At",
    ];
    const rows = reports.map((report) =>
      [
        report.id,
        report.category,
        report.urgency_score,
        urgencyLabel(report.urgency_score),
        report.extracted_location,
        report.summary_en,
        report.actionable_recommendation,
        report.lat,
        report.lng,
        report.created_at,
      ]
        .map(quote)
        .join(","),
    );
    const csv = [header.map(quote).join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `civic-tickets-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const locationCopy =
    locationState === "detected"
      ? "GPS location captured"
      : locationState === "locating"
        ? "Detecting your location…"
        : "Using city default (Dhaka)";

  if (!mounted) {
    return (
      <div
        className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center text-slate-400"
        suppressHydrationWarning
      >
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent mb-4"
          suppressHydrationWarning
        />
        <p className="text-sm font-medium" suppressHydrationWarning>
          Loading Civic Intelligence Dashboard...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-200">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60rem_40rem_at_15%_-10%,rgba(79,70,229,0.18),transparent),radial-gradient(50rem_35rem_at_100%_0%,rgba(14,165,233,0.12),transparent)]" />

      <div className="relative mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 shadow-lg shadow-indigo-900/40">
                <Landmark className="h-5 w-5 text-white" aria-hidden="true" />
              </span>
              <div>
                <h1 className="text-lg font-semibold tracking-tight text-slate-50 sm:text-xl">
                  CivicLens
                  <span className="ml-2 text-sm font-normal text-slate-500">
                    AI Civic Intelligence Platform
                  </span>
                </h1>
                <p className="text-xs text-slate-500">
                  Track 01 · AI for Digital Public Infrastructure &amp; Governance
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300">
                <Radio className="h-3.5 w-3.5" aria-hidden="true" />
                Triage engine online
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300">
                <Activity className="h-3.5 w-3.5 text-indigo-300" aria-hidden="true" />
                {analytics.total} tickets · {liveCount} live
              </span>
            </div>
          </div>

          <nav
            role="tablist"
            aria-label="CivicLens workspaces"
            className="inline-flex w-full max-w-md gap-1 rounded-xl border border-slate-800 bg-slate-900/70 p-1"
          >
            {(
              [
                { id: "citizen" as TabId, label: "Citizen Grievance Portal", Icon: Users },
                { id: "policymaker" as TabId, label: "Policymaker Dashboard", Icon: HardHat },
              ] as const
            ).map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  id={`tab-${item.id}`}
                  aria-selected={active}
                  aria-controls={`panel-${item.id}`}
                  onClick={() => selectTab(item.id)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold transition sm:text-sm ${
                    active
                      ? "bg-indigo-500 text-white shadow-lg shadow-indigo-950/50"
                      : "text-slate-400 hover:bg-slate-800/80 hover:text-slate-200"
                  }`}
                >
                  <item.Icon className="h-4 w-4" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                  {item.id === "policymaker" && unread > 0 ? (
                    <span className="ml-0.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {unread}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </header>

        {tab === "citizen" ? (
          <div
            role="tabpanel"
            id="panel-citizen"
            aria-labelledby="tab-citizen"
            className="mt-6 grid gap-5 lg:grid-cols-5"
          >
            <div className="flex flex-col gap-5 lg:col-span-3">
              <Panel
                title="Report a civic grievance"
                subtitle="Speak in your own language, or type below"
                icon={Mic}
              >
                <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Languages className="h-4 w-4 text-indigo-300" aria-hidden="true" />
                      Transcription language
                    </div>
                    <div
                      role="group"
                      aria-label="Transcription language"
                      className="inline-flex gap-1 rounded-lg border border-slate-800 bg-slate-950 p-1"
                    >
                      {SUPPORTED_LANGUAGES.map((item) => {
                        const active = language === item.code;
                        return (
                          <button
                            key={item.code}
                            type="button"
                            onClick={() => setLanguage(item.code)}
                            aria-pressed={active}
                            title={item.label}
                            className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition ${
                              active
                                ? "bg-indigo-500 text-white"
                                : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                            }`}
                          >
                            {item.short}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <button
                      type="button"
                      onClick={toggleListening}
                      aria-pressed={isListening}
                      className={`group flex items-center justify-center gap-3 rounded-xl border px-4 py-4 text-sm font-semibold transition ${
                        isListening
                          ? "border-red-500/60 bg-red-500/15 text-red-200"
                          : "border-indigo-500/40 bg-indigo-500/10 text-indigo-100 hover:border-indigo-400/70 hover:bg-indigo-500/20"
                      }`}
                    >
                      {isListening ? (
                        <>
                          <span className="relative flex h-3 w-3">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                            <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
                          </span>
                          <MicOff className="h-5 w-5" aria-hidden="true" />
                          Stop recording — tap to finish
                        </>
                      ) : (
                        <>
                          <Mic className="h-5 w-5" aria-hidden="true" />
                          Record your grievance by voice
                        </>
                      )}
                    </button>

                    {isListening ? (
                      <p className="flex items-center gap-2 text-xs text-slate-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden="true" />
                        Listening in{" "}
                        {SUPPORTED_LANGUAGES.find((item) => item.code === language)?.label} —
                        the transcript updates live below.
                      </p>
                    ) : null}

                    {speechError ? (
                      <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                        <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {speechError}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-2">
                    <label
                      htmlFor="grievance-text"
                      className="flex items-center justify-between text-xs font-medium text-slate-400"
                    >
                      <span className="inline-flex items-center gap-2">
                        <PenLine className="h-4 w-4 text-slate-500" aria-hidden="true" />
                        Grievance transcript
                      </span>
                      <span className="tabular-nums text-slate-600">
                        {draft.length} characters
                      </span>
                    </label>
                    <textarea
                      id="grievance-text"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      placeholder={PLACEHOLDER[language]}
                      rows={6}
                      className="w-full resize-y rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm leading-relaxed text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/25"
                    />
                    <p className="text-[11px] leading-relaxed text-slate-500">
                      You can edit the voice transcript before submitting. Reports are
                      translated to English, categorised and scored for urgency automatically.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-indigo-300">
                        <LocateFixed className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-200">{locationCopy}</p>
                        <p className="truncate text-[11px] tabular-nums text-slate-500">
                          {formatCoordinate(coords.lat)}, {formatCoordinate(coords.lng)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={requestLocation}
                      disabled={locationState === "locating"}
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-indigo-400/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {locationState === "locating" ? (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {locationState === "detected" ? "Refresh location" : "Detect location"}
                    </button>
                  </div>

                  {submitError ? (
                    <p className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-200">
                      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {submitError}
                    </p>
                  ) : null}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-950/50 transition hover:from-indigo-400 hover:to-sky-400 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isSubmitting ? (
                      <>
                        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                        Analysing grievance with AI…
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" aria-hidden="true" />
                        Submit for AI triage
                      </>
                    )}
                  </button>
                </form>
              </Panel>

              {isSubmitting ? <TriageSkeleton /> : null}

              {verdict && !isSubmitting ? <ReceiptCard report={verdict} /> : null}
            </div>

            <aside className="flex flex-col gap-5 lg:col-span-2">
              <Panel title="How the triage pipeline works" icon={Workflow}>
                <ol className="flex flex-col gap-4 p-5">
                  {[
                    {
                      step: "01",
                      title: "Capture",
                      body: "Speech in Bengali, Hindi or English is transcribed live in the browser, or typed directly.",
                      Icon: Mic,
                    },
                    {
                      step: "02",
                      title: "Understand",
                      body: "The grievance is translated to English, classified into a service category and scored 1-5 for urgency.",
                      Icon: Sparkles,
                    },
                    {
                      step: "03",
                      title: "Locate",
                      body: "Device GPS is attached to the ticket so it drops onto the ward heatmap with a severity colour.",
                      Icon: MapPin,
                    },
                    {
                      step: "04",
                      title: "Act",
                      body: "A recommended administrative action is generated and the ticket joins the live policy dashboard.",
                      Icon: ShieldAlert,
                    },
                  ].map((item) => (
                    <li key={item.step} className="flex gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-[11px] font-bold text-slate-400">
                        {item.step}
                      </span>
                      <div>
                        <p className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                          <item.Icon className="h-3.5 w-3.5 text-indigo-300" aria-hidden="true" />
                          {item.title}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-slate-400">{item.body}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </Panel>

              <Panel title="Live session snapshot" icon={Gauge}>
                <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-b-2xl bg-slate-800">
                  {[
                    { label: "Tickets in system", value: analytics.total },
                    { label: "Critical (U5)", value: analytics.critical },
                    { label: "Submitted this session", value: liveCount },
                    { label: "Gap index", value: `${analytics.gapIndex}/100` },
                  ].map((item) => (
                    <div key={item.label} className="flex flex-col gap-1 bg-slate-900/60 p-4">
                      <dt className="text-[11px] uppercase tracking-wider text-slate-500">
                        {item.label}
                      </dt>
                      <dd className="text-lg font-semibold tabular-nums text-slate-100">
                        {item.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Panel>

              <div className="rounded-2xl border border-indigo-500/25 bg-indigo-500/10 p-5">
                <p className="flex items-center gap-2 text-sm font-semibold text-indigo-100">
                  <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                  Life-safety emergency?
                </p>
                <p className="mt-2 text-xs leading-relaxed text-indigo-200/80">
                  This portal routes municipal grievances only. For immediate danger call the
                  national emergency services, then file here with the reference number so the
                  incident is attached to the ward record.
                </p>
              </div>
            </aside>
          </div>
        ) : (
          <div
            role="tabpanel"
            id="panel-policymaker"
            aria-labelledby="tab-policymaker"
            className="mt-6 flex flex-col gap-5"
          >
            <Panel
              title="AI Engine Status"
              subtitle="Live triage service telemetry"
              icon={Server}
            >
              <div className="flex flex-col gap-4 p-5">
                {telemetry ? (
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                    <span
                      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${
                        telemetry.mode === "primary"
                          ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
                          : "bg-amber-500/15 text-amber-300 ring-amber-500/30"
                      }`}
                    >
                      {telemetry.mode === "primary" ? (
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {telemetry.mode === "primary"
                        ? "Primary — Gemini cascade online"
                        : "Resilient Fail-Safe engaged"}
                    </span>
                    <span className="inline-flex items-center gap-2 text-xs text-slate-400">
                      <Timer className="h-3.5 w-3.5 text-indigo-300" aria-hidden="true" />
                      Latency{" "}
                      <span className="font-semibold tabular-nums text-slate-200">
                        {telemetry.latency_ms} ms
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-2 text-xs text-slate-400">
                      <Gauge className="h-3.5 w-3.5 text-indigo-300" aria-hidden="true" />
                      Confidence{" "}
                      <span className="font-semibold tabular-nums text-slate-200">
                        {Math.round(telemetry.confidence * 100)}%
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-2 text-xs text-slate-400">
                      <Stamp className="h-3.5 w-3.5 text-indigo-300" aria-hidden="true" />
                      Last ticket{" "}
                      <span className="font-semibold tabular-nums text-slate-200">
                        {reports[0]?.tracking_id ?? "—"}
                      </span>
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                    <span className="inline-flex items-center gap-2 rounded-full bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 ring-1 ring-slate-700">
                      <CircleCheckBig className="h-3.5 w-3.5 text-indigo-300" aria-hidden="true" />
                      Standby — awaiting first live analysis
                    </span>
                  </div>
                )}
                <p className="text-xs leading-relaxed text-slate-500">
                  Primary mode routes analysis through the Gemini model cascade. If every model in
                  the cascade is unavailable, the engine automatically engages the on-device
                  heuristic redressal resolver (Resilient Fail-Safe) so no grievance ever fails
                  to reach the ward desk.
                </p>
              </div>
            </Panel>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Total reports"
                value={String(analytics.total)}
                hint={`${liveCount} submitted in this session · ${analytics.total - liveCount} from the historical registry`}
                icon={FileText}
                tone="indigo"
              />
              <StatCard
                label="High urgency (4-5)"
                value={String(analytics.highUrgency)}
                hint={`${analytics.highUrgencyPct.toFixed(1)}% of all grievances need same-day or 24-hour intervention`}
                icon={BellRing}
                tone="red"
                progress={analytics.highUrgencyPct}
              />
              <StatCard
                label="Top problem category"
                value={analytics.topCategory.category}
                hint={`${analytics.topCategory.count} ticket${analytics.topCategory.count === 1 ? "" : "s"} · ${analytics.topCategory.demandPct.toFixed(1)}% of citizen demand`}
                icon={TrendingUp}
                tone="amber"
                progress={analytics.topCategory.demandPct}
              />
              <StatCard
                label="Infrastructure gap index"
                value={`${analytics.gapIndex}`}
                hint="0 = budget perfectly matched to citizen demand · 100 = total misalignment"
                icon={Scale}
                tone={
                  analytics.gapIndex >= 45
                    ? "red"
                    : analytics.gapIndex >= 25
                      ? "amber"
                      : "emerald"
                }
                progress={analytics.gapIndex}
              />
            </div>

            <div className="grid gap-5 xl:grid-cols-3">
              <Panel
                title="Ward grievance cluster map"
                subtitle={`${clusters.length} incident clusters plotted from ${visibleReports.length} of ${analytics.total} tickets`}
                icon={MapPin}
                className="xl:col-span-2"
                action={
                  <div className="flex flex-wrap items-center gap-2">
                    <div
                      role="group"
                      aria-label="Filter by severity"
                      className="inline-flex gap-1 rounded-lg border border-slate-800 bg-slate-950 p-1"
                    >
                      {(
                        [
                          { id: "all" as SeverityFilter, label: "All" },
                          { id: "high" as SeverityFilter, label: "Urgent 4-5" },
                          { id: "critical" as SeverityFilter, label: "Critical 5" },
                        ] as const
                      ).map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setSeverity(option.id)}
                          aria-pressed={severity === option.id}
                          className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition ${
                            severity === option.id
                              ? "bg-indigo-500 text-white"
                              : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                }
              >
                <div className="p-2">
                  <CivicMap reports={visibleReports} clusters={clusters} />
                </div>
              </Panel>

              <Panel
                title="Municipal budget vs. citizen demand"
                subtitle="Ward-level demand-gap analysis · simulated capex"
                icon={Wallet}
                action={
                  <label className="flex items-center gap-2 text-[11px] font-medium text-slate-400">
                    <Building className="h-3.5 w-3.5" aria-hidden="true" />
                    <select
                      value={wardScope ?? ""}
                      onChange={(event) =>
                        setWardScope(event.target.value === "" ? null : event.target.value)
                      }
                      className="max-w-[190px] rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 outline-none transition focus:border-indigo-400"
                      aria-label="Scope analysis by ward"
                    >
                      <option value="">All wards (city-wide)</option>
                      {WARD_GRID.map((ward) => (
                        <option key={ward.ward} value={ward.ward}>
                          {wardLabel(ward.ward)}
                        </option>
                      ))}
                    </select>
                  </label>
                }
              >
                <div className="flex flex-col gap-5 p-5">
                  {wardDemand.mismatches.length > 0 ? (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
                      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-red-300">
                        <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                        Reallocation required
                      </p>
                      <p className="mt-2 text-sm leading-relaxed text-red-50">
                        <span className="font-semibold">
                          {wardDemand.mismatches[0].category}
                        </span>{" "}
                        absorbs{" "}
                        <span className="font-semibold">
                          {wardDemand.mismatches[0].demandPct.toFixed(1)}%
                        </span>{" "}
                        of citizen demand but only{" "}
                        <span className="font-semibold">
                          {wardDemand.mismatches[0].budgetPct}%
                        </span>{" "}
                        of ward capex — a{" "}
                        <span className="font-semibold">
                          {wardDemand.mismatches[0].deficitPct.toFixed(1)} pp shortfall
                        </span>
                        . Reallocate{" "}
                        <span className="font-semibold tabular-nums">
                          {formatCurrency(budgetShiftAmount(wardDemand.mismatches[0].deficitPct))}
                        </span>{" "}
                        of municipal capex to{" "}
                        {wardDemand.mismatches[0].category.toLowerCase()} this cycle.
                      </p>
                      {wardDemand.mismatches.length > 1 ? (
                        <ul className="mt-3 flex flex-wrap gap-2">
                          {wardDemand.mismatches.slice(1).map((row) => (
                            <li
                              key={row.category}
                              className="rounded-full bg-red-500/15 px-2.5 py-1 text-[10px] font-semibold text-red-200 ring-1 ring-red-500/30"
                            >
                              {row.category} +{row.deficitPct.toFixed(1)} pp
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                      Budget allocation is currently tracking citizen demand. No reallocation is
                      required this cycle.
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-4 rounded-full bg-indigo-400" aria-hidden="true" />
                      Citizen demand
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-4 rounded-full bg-slate-500" aria-hidden="true" />
                      Budget share
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      Gap index{" "}
                      <span className="font-semibold tabular-nums text-slate-300">
                        {wardDemand.gapIndex}
                      </span>
                      /100 · {wardDemand.total} ticket{wardDemand.total === 1 ? "" : "s"} in scope
                    </span>
                  </div>

                  <ul className="flex flex-col gap-4">
                    {wardDemand.allocations.map((row) => {
                      const underfunded = row.deficitPct > 0;
                      return (
                        <li key={row.category} className="flex flex-col gap-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                              <CategoryGlyph category={row.category} className="h-3.5 w-3.5 text-slate-400" />
                              {row.category}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${
                                underfunded
                                  ? "bg-red-500/15 text-red-300 ring-red-500/30"
                                  : "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
                              }`}
                            >
                              {row.deficitPct >= 0 ? (
                                <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                              ) : (
                                <ArrowDownRight className="h-3 w-3" aria-hidden="true" />
                              )}
                              {row.deficitPct >= 0 ? "+" : ""}
                              {row.deficitPct.toFixed(1)} pp
                            </span>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                              <div
                                className="h-full rounded-full bg-indigo-400"
                                style={{ width: `${Math.min(100, row.demandPct)}%` }}
                              />
                            </div>
                            <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-slate-400">
                              {row.demandPct.toFixed(1)}% demand
                            </span>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                              <div
                                className="h-full rounded-full bg-slate-500"
                                style={{ width: `${Math.min(100, row.budgetPct)}%` }}
                              />
                            </div>
                            <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-slate-500">
                              {row.budgetPct}% budget
                            </span>
                          </div>

                          <p className="text-[11px] text-slate-500">
                            {row.complaints} ticket{row.complaints === 1 ? "" : "s"} routed in{" "}
                            {wardScope ? wardLabel(wardScope) : "this scope"}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </Panel>
            </div>

            <div className="grid gap-5 xl:grid-cols-3">
              <Panel
                title="Recent tickets"
                subtitle="Newest grievances, live"
                icon={FileText}
                className="xl:col-span-2"
                action={
                  <button
                    type="button"
                    onClick={exportTickets}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:border-indigo-400/60 hover:text-white"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    Export CSV
                  </button>
                }
              >
                <ul className="flex max-h-[520px] flex-col divide-y divide-slate-800 overflow-y-auto">
                  {visibleReports.map((report) => {
                    const memberCount = clusterCountFor.get(report.id) ?? 1;
                    return (
                      <li key={report.id}>
                        <div className="flex w-full flex-col gap-3 px-5 py-4 text-left">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="tabular-nums text-[11px] font-semibold text-slate-400">
                                {report.tracking_id}
                              </span>
                              <CategoryBadge category={report.category} />
                              <UrgencyBadge score={report.urgency_score} />
                              {report.source === "live" ? (
                                <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-semibold text-indigo-300 ring-1 ring-indigo-500/30">
                                  New
                                </span>
                              ) : null}
                              {memberCount > 1 ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-amber-300 ring-1 ring-amber-500/30">
                                  <Siren className="h-3 w-3" aria-hidden="true" />
                                  Consolidated Cluster · {memberCount} Citizens Impacted
                                </span>
                              ) : null}
                            </div>
                            <RelativeTime value={report.created_at} />
                          </div>

                          <p className="text-sm leading-relaxed text-slate-200">
                            {report.summary_en}
                          </p>

                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
                              <MapPin className="h-3 w-3" aria-hidden="true" />
                              {report.extracted_location} · {wardLabel(report.ward)}
                              <span className="tabular-nums">
                                · {formatCoordinate(report.lat)}, {formatCoordinate(report.lng)}
                              </span>
                            </span>
                            <UrgencyMeter score={report.urgency_score} />
                          </div>

                          <p className="flex items-start gap-2 rounded-lg bg-slate-950/60 px-3 py-2 text-[11px] leading-relaxed text-slate-400">
                            <Lightbulb className="mt-0.5 h-3 w-3 shrink-0 text-indigo-300" aria-hidden="true" />
                            <span>
                              <span className="font-semibold text-slate-300">Action: </span>
                              {report.actionable_recommendation}
                            </span>
                          </p>
                        </div>
                      </li>
                    );
                  })}

                  {visibleReports.length === 0 ? (
                    <li className="px-5 py-12 text-center text-sm text-slate-500">
                      No tickets match this severity filter.
                    </li>
                  ) : null}
                </ul>
              </Panel>

              <div className="flex flex-col gap-5">
                <Panel title="Demand distribution" icon={ChartColumn}>
                  <ul className="flex flex-col gap-3.5 p-5">
                    {analytics.ranked.map((row) => (
                      <li key={row.category} className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="flex items-center gap-2 font-medium text-slate-300">
                            <CategoryGlyph
                              category={row.category}
                              className="h-3.5 w-3.5 text-slate-500"
                            />
                            {row.category}
                          </span>
                          <span className="tabular-nums text-slate-500">
                            {row.count} · {row.demandPct.toFixed(1)}%
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-sky-400"
                            style={{ width: `${Math.min(100, row.demandPct)}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </Panel>

                <Panel title="Priority queue" subtitle="Highest urgency first" icon={Target}>
                  <ol className="flex flex-col gap-2 p-4">
                    {[...reports]
                      .sort((a, b) => b.urgency_score - a.urgency_score)
                      .slice(0, 5)
                      .map((report, index) => (
                        <li key={report.id}>
                          <div className="flex w-full items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2.5 text-left">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-800 text-[11px] font-bold text-slate-400">
                              {index + 1}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-semibold text-slate-200">
                                {report.extracted_location}
                              </span>
                              <span className="block truncate text-[11px] text-slate-500">
                                {report.category}
                              </span>
                            </span>
                            <UrgencyBadge score={report.urgency_score} />
                          </div>
                        </li>
                      ))}
                  </ol>
                </Panel>
              </div>
            </div>
          </div>
        )}

        <footer className="mt-8 border-t border-slate-800/80 pt-5 text-[11px] leading-relaxed text-slate-600">
          CivicLens prototype · Grievances are classified, scored and geotagged by an AI triage
          service. Allocated budget figures are simulated for demonstration and do not reflect
          real municipal accounts.
        </footer>
      </div>
    </div>
  );
}

function TriageSkeleton() {
  return (
    <div className={`${PANEL} flex flex-col gap-4 p-5`} aria-live="polite">
      <div className="flex items-center gap-3">
        <LoaderCircle className="h-5 w-5 animate-spin text-indigo-400" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-slate-100">Analysing grievance</p>
          <p className="text-xs text-slate-500">
            Translating, classifying and scoring urgency on the civic intelligence service.
          </p>
        </div>
      </div>
      <div className="h-4 w-2/5 animate-pulse rounded bg-slate-800" />
      <div className="h-3 w-full animate-pulse rounded bg-slate-800/80" />
      <div className="h-3 w-11/12 animate-pulse rounded bg-slate-800/80" />
      <div className="h-3 w-3/4 animate-pulse rounded bg-slate-800/80" />
    </div>
  );
}

function ReceiptCard({ report }: { report: CivicReport }) {
  const [copied, setCopied] = useState(false);
  const deadlineMs = new Date(report.created_at).getTime() + report.sla_hours * 3_600_000;

  const copyReference = () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard
      .writeText(`CivicLens Receipt ${report.tracking_id} · REF-${report.reference_hash}`)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => setCopied(false));
  };

  const downloadReceipt = () => {
    const blob = new Blob([buildReceiptHtml(report)], { type: "text/html;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `civic-receipt-${report.tracking_id}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <section
      aria-live="polite"
      className="flex flex-col gap-5 rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/10 via-slate-900/60 to-sky-500/10 p-5 shadow-xl shadow-indigo-950/30"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-indigo-300">
            <ScrollText className="h-3.5 w-3.5" aria-hidden="true" />
            Official Filing Receipt
          </p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-slate-100">
            {report.tracking_id}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            Filed to the {wardLabel(report.ward)} queue and routed to the ward desk.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-500/30">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Dispatched · Under Investigation
          </span>
          <RelativeTime value={report.created_at} />
        </div>
      </header>

      {report.is_fallback ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Analysed by the Resilient Fail-Safe redressal engine — the Gemini model cascade was
          unavailable at submission time.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 rounded-xl border border-slate-800 bg-slate-950/50 p-3.5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            <Building className="h-3 w-3" aria-hidden="true" />
            Dispatched department
          </p>
          <p className="text-xs font-medium leading-relaxed text-slate-200">{report.department}</p>
        </div>
        <div className="flex flex-col gap-1.5 rounded-xl border border-slate-800 bg-slate-950/50 p-3.5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {slapolicyLabel(report.urgency_score)}
          </p>
          <p className="text-sm font-semibold text-slate-100">
            <SlaCountdown deadline={deadlineMs} />
          </p>
          {report.urgency_score >= 5 ? (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-red-300">
              Emergency Dispatch within 2 Hours
              <span className="mt-0.5 block font-normal normal-case text-slate-500">
                Target resolution window: 2 - 4 hours
              </span>
            </p>
          ) : (
            <p className="text-[11px] tabular-nums text-slate-500">
              Resolve by{" "}
              {new Date(deadlineMs).toLocaleString("en-IN", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <span className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs font-semibold tabular-nums text-slate-200">
          <Fingerprint className="h-3.5 w-3.5 text-indigo-300" aria-hidden="true" />
          REF-{report.reference_hash}
        </span>
        <button
          type="button"
          onClick={copyReference}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] font-semibold text-slate-200 transition hover:border-indigo-400/60 hover:text-white"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              Copy tracking ID &amp; hash
            </>
          )}
        </button>
        <button
          type="button"
          onClick={downloadReceipt}
          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-400/40 bg-indigo-500/15 px-3 py-2 text-[11px] font-semibold text-indigo-200 transition hover:bg-indigo-500/25"
        >
          <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
          Download receipt
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <CategoryBadge category={report.category} />
        <UrgencyBadge score={report.urgency_score} />
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800/80 px-2.5 py-1 text-[11px] font-medium text-slate-300 ring-1 ring-slate-700">
          <MapPin className="h-3 w-3" aria-hidden="true" />
          {report.extracted_location}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-slate-300">Urgency rating</span>
          <span className="tabular-nums text-slate-400">
            {report.urgency_score} / 5 · {urgencyLabel(report.urgency_score)}
          </span>
        </div>
        <UrgencyMeter score={report.urgency_score} className="gap-1.5 [&>span]:h-2.5 [&>span]:w-full" />
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          English summary
        </p>
        <p className="text-sm leading-relaxed text-slate-100">{report.summary_en}</p>
      </div>

      <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-300">
          <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
          Recommended civic action
        </p>
        <p className="mt-2 text-sm leading-relaxed text-emerald-50">
          {report.actionable_recommendation}
        </p>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-slate-800 pt-4">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          <Languages className="h-3.5 w-3.5" aria-hidden="true" />
          Original submission
        </p>
        <p className="text-xs leading-relaxed text-slate-400">{report.input_text}</p>
        <p className="text-[11px] tabular-nums text-slate-600">
          Geotagged at {formatCoordinate(report.lat)}, {formatCoordinate(report.lng)} ·{" "}
          {wardLabel(report.ward)}
        </p>
      </div>
    </section>
  );
}

function SlaCountdown({ deadline }: { deadline: number }) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setRemaining(Math.max(0, deadline - Date.now()));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [deadline]);

  if (remaining === null) {
    return (
      <span className="tabular-nums text-slate-100" suppressHydrationWarning>
        --h --m --s
      </span>
    );
  }

  const totalSeconds = Math.floor(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const expired = remaining <= 0;

  if (expired) {
    return <span className="text-red-300">SLA EXPIRED</span>;
  }
  return (
    <span className="tabular-nums text-slate-100">
      {hours}h {minutes}m {seconds}s
    </span>
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildReceiptHtml(report: CivicReport): string {
  const issuedAt = new Date(report.created_at);
  const deadline = new Date(issuedAt.getTime() + report.sla_hours * 3_600_000);
  const remainingMs = Math.max(0, deadline.getTime() - Date.now());
  const hours = Math.floor(remainingMs / 3_600_000);
  const minutes = Math.floor((remainingMs % 3_600_000) / 60_000);

  const row = (label: string, value: string) =>
    `<tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b;width:40%">${label}</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:13px;color:#0f172a;font-weight:600">${value}</td></tr>`;

  const rows = [
    row("Tracking ID", escapeHtml(report.tracking_id)),
    row("Reference Hash", `REF-${escapeHtml(report.reference_hash)}`),
    row("Status", "Dispatched · Under Investigation"),
    row("Category", escapeHtml(report.category)),
    row("Urgency", `${report.urgency_score} / 5 · ${urgencyLabel(report.urgency_score)}`),
    row("Ward", escapeHtml(wardLabel(report.ward))),
    row("Location", escapeHtml(report.extracted_location)),
    row("Department", escapeHtml(report.department)),
    row("SLA tier", slapolicyLabel(report.urgency_score)),
    row(
      "Dispatch window",
      report.urgency_score >= 5
        ? "Emergency dispatch within 2 hours"
        : `Resolve by ${deadline.toLocaleString("en-IN")}`,
    ),
    row("SLA remaining (snapshot)", `${hours}h ${minutes}m`),
    row("Issued", issuedAt.toLocaleString("en-IN")),
    row("Geotag", `${formatCoordinate(report.lat)}, ${formatCoordinate(report.lng)}`),
  ].join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>CivicLens Filing Receipt ${escapeHtml(report.tracking_id)}</title>
  </head>
  <body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;background:#f8fafc;color:#0f172a">
    <div style="max-width:640px;margin:32px auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
      <div style="background:linear-gradient(90deg,#4f46e5,#0ea5e9);padding:20px 24px;color:#ffffff">
        <div style="font-size:14px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">Official Filing Receipt</div>
        <div style="font-size:11px;opacity:0.85;margin-top:4px">CivicLens AI Civic Intelligence Platform</div>
      </div>
      <div style="padding:24px">
        <table style="width:100%;border-collapse:collapse">${rows}</table>
        <div style="margin-top:20px;padding:12px 16px;background:#f1f5f9;border-radius:8px;font-size:12px;color:#334155;line-height:1.6">
          <strong>Summary:</strong> ${escapeHtml(report.summary_en)}
        </div>
        <div style="margin-top:12px;padding:12px 16px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;font-size:12px;color:#065f46;line-height:1.6">
          <strong>Recommended civic action:</strong> ${escapeHtml(report.actionable_recommendation)}
        </div>
        <p style="margin-top:20px;font-size:11px;color:#94a3b8;line-height:1.6">
          This receipt is auto-generated by the CivicLens grievance triage service. Keep the
          tracking ID and reference hash for follow-up correspondence. Budget figures shown in the
          policymaker workspace are simulated for demonstration.
        </p>
      </div>
    </div>
  </body>
</html>`;
}
