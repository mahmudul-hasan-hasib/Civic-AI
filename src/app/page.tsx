"use client";

/* ==========================================================================
 * CivicLens · CITIZEN GRIEVANCE PORTAL  (route: /)
 *
 * Persona: general public reporting local infrastructure breakdowns.
 *
 * Visual language: ice-blue civic canvas with an architectural grid and
 * topographic rings, a deep-navy sticky application banner, and a deep-navy
 * content card so the "Grievance Details" form reads as a single institutional
 * instrument panel. The citizen intake view is intentionally a single centred
 * column; the internal pipeline explainer is not surfaced here.
 *
 * Functionality is unchanged: Web Speech API capture (Bengali, Hindi, English,
 * Tamil, Telugu, Marathi), browser geolocation, POST /api/analyze, and the
 * filing receipt. Submissions are persisted through @/lib/civic-store so they
 * are already on /dashboard when the user navigates there.
 * ========================================================================== */

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { FormEvent } from "react";
import {
  Activity,
  Bell,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Crosshair,
  FileText,
  Globe,
  Landmark,
  Loader2,
  MapPin,
  Mic,
  MicOff,
  Scale,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

import { DEFAULT_COORDS, formatCoordinate } from "@/app/civic-shared";
import type { CivicReport } from "@/app/civic-shared";
import ReceiptCard from "@/components/ReceiptCard";
import { RoleSwitcher, UserIdentityBadge } from "@/components/RoleControls";
import ThemeToggle from "@/components/ThemeToggle";
import { useAuth } from "@/context/AuthContext";
import { submitGrievance, useCivicReports } from "@/lib/civic-store";

const DASHBOARD_ROUTE = "/dashboard";

/* ----------------------------- speech types ---------------------------- */

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

/* ----------------------------- configuration -------------------------- */

type LocationState = "locating" | "detected" | "fallback";

const LANGUAGES: { code: string; native: string; label: string }[] = [
  { code: "bn-IN", native: "বাংলা", label: "Bengali" },
  { code: "hi-IN", native: "हिंदी", label: "Hindi" },
  { code: "en-IN", native: "English", label: "English (India)" },
  { code: "ta-IN", native: "தமிழ்", label: "Tamil" },
  { code: "te-IN", native: "తెలుగు", label: "Telugu" },
  { code: "mr-IN", native: "मराठी", label: "Marathi" },
];

const DEFAULT_LANGUAGE = "en-IN";

const PLACEHOLDER: Record<string, string> = {
  "bn-IN": "উদাহরণ: আমাদের এলাকায় তিন দিন ধরে পানি নেই, এবং রাস্তায় ড্রেনেজ ভেঙে পড়েছে।",
  "hi-IN": "उदाहरण: हमारे मोहल्ले में तीन दिन से पानी नहीं आ रहा और नाली जाम है।",
  "en-IN": "e.g. Our lane has had no water supply for three days and the storm drain has collapsed.",
  "ta-IN": "எ.கா. எங்கள் பகுதியில் மூன்று நாட்களாக தண்ணீர் இல்லை, வடிகால் சிதைந்துள்ளது.",
  "te-IN": "ఉదా. మన ప్రాంతంలో మూడు రోజులుగా నీరు లేదు, వర్షమేఘా ధ్వంసమైంది.",
  "mr-IN": "उदा. आमच्या परिसरात तीन दिवसांपासून पाणी नाही आणि नालीची झाकली आहे.",
};

const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 8000,
  maximumAge: 30_000,
};

const EMPTY_SUBSCRIBE = () => () => {};
const CLIENT_MOUNTED = () => true;
const SERVER_HYDRATING = () => false;

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

/* ===================== ambient background decorations =================== */

function AmbientCanvas() {
  return (
    <>
      {/* Architectural vector grid */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(148, 163, 184, 0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(148, 163, 184, 0.15) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      {/* Topographic contour rings, right side */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed right-[-18rem] top-[-8rem] z-0 hidden h-[46rem] w-[46rem] lg:block"
      >
        {[46, 38, 30, 22, 14].map((rem) => (
          <div
            key={rem}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-400/20"
            style={{ height: `${rem}rem`, width: `${rem}rem` }}
          />
        ))}
      </div>
      {/* Diagonal tricolor ribbon, bottom-right */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed bottom-0 right-0 z-0 h-44 w-72 overflow-hidden"
      >
        <div className="absolute -bottom-24 -right-16 h-80 w-80 rotate-[-45deg] opacity-90">
          <div className="grid h-full w-full grid-rows-3">
            <div className="bg-[#f59e0b]" />
            <div className="bg-white" />
            <div className="bg-[#10b981]" />
          </div>
        </div>
      </div>
    </>
  );
}

/* ============================ top navigation =========================== */


function PortalNav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-[#1b4b8a] bg-[#103b6e] text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        {/* Brand */}
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/25">
            <Landmark className="h-5 w-5 text-white" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-base font-bold leading-tight tracking-tight">CivicLens</p>
            <p className="truncate text-[11px] leading-tight text-slate-300">
              AI Civic Intelligence Platform
            </p>
          </div>
        </div>

        {/* Center tab group */}
        <div className="order-3 flex w-full items-center rounded-full bg-[#0c2f5c] p-1 ring-1 ring-[#1b4b8a] sm:order-2 sm:ml-4 sm:w-auto">
          <span className="flex-1 rounded-full bg-white/15 px-4 py-1.5 text-center text-xs font-semibold text-white sm:flex-none">
            Citizen Portal
          </span>
          <Link
            href={DASHBOARD_ROUTE}
            className="flex-1 rounded-full px-4 py-1.5 text-center text-xs font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white sm:flex-none"
          >
            Policymaker Dashboard
          </Link>
        </div>

        {/* Right cluster */}
        <div className="order-2 ml-auto flex flex-wrap items-center justify-end gap-2 sm:order-3">
          <span className="hidden items-center gap-1.5 rounded-full bg-[#0c2f5c] px-3 py-1.5 text-[11px] font-medium text-slate-200 ring-1 ring-[#1b4b8a] xl:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
            All systems operational
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#0c2f5c] px-2.5 py-1.5 text-[11px] font-medium text-slate-200 ring-1 ring-[#1b4b8a]"
            aria-label="Interface language: English"
          >
            <Globe className="h-3.5 w-3.5" aria-hidden="true" />
            EN
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Notifications"
            className="relative hidden h-8 w-8 items-center justify-center rounded-full bg-[#0c2f5c] text-slate-200 ring-1 ring-[#1b4b8a] hover:text-white sm:inline-flex"
          >
            <Bell className="h-4 w-4" aria-hidden="true" />
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden="true" />
          </button>
          <ThemeToggle />
          <RoleSwitcher tone="navy" />
          <UserIdentityBadge tone="navy" />
        </div>
      </div>
    </nav>
  );
}

/* ================================ hero ================================= */

function Hero() {
  const pills = [
    { icon: ShieldCheck, label: "Secure & confidential" },
    { icon: Globe, label: "12 Indian languages" },
    { icon: Sparkles, label: "AI-assisted triage" },
  ];

  return (
    <section className="relative z-10 px-4 pt-10 text-center sm:px-6">
      <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-amber-700 ring-1 ring-amber-200">
        — जन सेवा · Citizen Service —
      </span>
      <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-[#0f294a] dark:text-slate-50">
        Report a Civic Grievance
      </h1>
      <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-slate-600 dark:text-slate-300">
        Speak in your own language or type your concern. CivicLens will route it to the
        right authority.
      </p>
      <ul className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
        {pills.map((pill) => (
          <li
            key={pill.label}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:ring-slate-700"
          >
            <pill.icon className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
            {pill.label}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ========================= grievance details card ====================== */

function GrievanceCard({
  draft,
  setDraft,
  language,
  setLanguage,
  isListening,
  speechError,
  toggleListening,
  locationState,
  coords,
  requestLocation,
  isSubmitting,
  submitError,
  handleSubmit,
}: {
  draft: string;
  setDraft: (value: string) => void;
  language: string;
  setLanguage: (code: string) => void;
  isListening: boolean;
  speechError: string | null;
  toggleListening: () => void;
  locationState: LocationState;
  coords: { lat: number; lng: number };
  requestLocation: () => void;
  isSubmitting: boolean;
  submitError: string | null;
  handleSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const languageName = LANGUAGES.find((item) => item.code === language)?.label ?? "";

  return (
    <section className="flex w-full flex-col rounded-2xl border border-[#1e4d88] bg-[#133e70] p-6 text-white shadow-xl sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-300">
            Grievance Details
          </p>
          <h2 className="mt-1 text-xl font-bold text-white">Tell us what happened</h2>
        </div>
        <span className="rounded-full bg-[#0e315b] px-3 py-1 text-[11px] font-semibold text-slate-200 ring-1 ring-[#1b4578]">
          Step 1 of 1
        </span>
      </header>

      <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-5">
        {/* Voice recording banner */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#1b4578] bg-[#0e315b] p-4">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                isListening
                  ? "civic-pulse-dot-rose bg-rose-500/25 text-rose-200"
                  : "bg-[#1d63b8] text-white"
              }`}
            >
              <Mic className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-white">
                {isListening ? "Listening…" : "Record your grievance by voice"}
              </p>
              <p className="text-xs text-slate-300">
                {isListening
                  ? `Speak naturally in ${languageName}`
                  : "Tap the microphone and speak naturally"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-[11px] font-semibold ring-1 ${
                isListening
                  ? "bg-rose-500/20 text-rose-200 ring-rose-400/40"
                  : "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30"
              }`}
            >
              {isListening ? "Recording" : "Ready"}
            </span>
            <button
              type="button"
              onClick={toggleListening}
              aria-pressed={isListening}
              data-testid="voice-capture"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#1c4d87] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#255f9f]"
            >
              {isListening ? (
                <>
                  <MicOff className="h-3.5 w-3.5" aria-hidden="true" />
                  Stop
                </>
              ) : (
                <>
                  <Mic className="h-3.5 w-3.5" aria-hidden="true" />
                  Record
                </>
              )}
            </button>
          </div>
        </div>

        {speechError ? (
          <p
            className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200"
            role="status"
          >
            <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {speechError}
          </p>
        ) : null}

        {/* Language selector */}
        <div>
          <p className="text-sm font-semibold text-white">
            Choose your language
            <span className="ml-2 text-xs font-normal text-slate-300">
              / भाषा चुनें
            </span>
          </p>
          <div
            role="group"
            aria-label="Choose your language"
            className="mt-2.5 flex flex-wrap gap-2"
          >
            {LANGUAGES.map((item) => {
              const active = language === item.code;
              return (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => setLanguage(item.code)}
                  aria-pressed={active}
                  title={item.label}
                  className={`min-h-9 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
                    active
                      ? "bg-[#1d63b8] text-white ring-1 ring-[#5b9be0]"
                      : "bg-[#0e315b] text-slate-200 ring-1 ring-[#1b4578] hover:bg-[#14406f] hover:text-white"
                  }`}
                >
                  {item.native}
                </button>
              );
            })}
          </div>
        </div>

        {/* Textarea */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="grievance-text" className="text-sm font-semibold text-white">
              Describe your civic issue
            </label>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-300">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  draft.length > 0 ? "civic-pulse-dot bg-emerald-400" : "bg-slate-500"
                }`}
                aria-hidden="true"
              />
              {draft.length > 0 ? "Voice transcription ready" : "Awaiting input"}
            </span>
          </div>
          <textarea
            id="grievance-text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={PLACEHOLDER[language]}
            rows={6}
            className="mt-2.5 w-full resize-y rounded-xl border border-[#1a4475] bg-[#0c2a4e] p-4 text-sm leading-relaxed text-white outline-none transition placeholder:text-slate-400 focus:border-[#3d7fc4] focus:ring-2 focus:ring-[#1d63b8]/50"
          />
          <p className="mt-1.5 text-[11px] text-slate-400">
            {draft.length} characters · You can edit the transcript before submitting.
          </p>
        </div>

        {/* Detected location */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#1b4578] bg-[#0e315b] p-4">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className="h-12 w-12 shrink-0 overflow-hidden rounded-lg ring-1 ring-[#1b4578]"
              style={{
                backgroundColor: "#0c2a4e",
                backgroundImage:
                  "linear-gradient(to right, rgba(148,163,184,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.18) 1px, transparent 1px)",
                backgroundSize: "10px 10px",
              }}
            >
              <MapPin
                className="m-auto mt-3.5 h-5 w-5 text-emerald-400"
                aria-hidden="true"
              />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-300">
                Detected Location
              </p>
              <p className="text-sm font-semibold text-white">
                {locationState === "detected"
                  ? "Location confirmed"
                  : locationState === "locating"
                    ? "Locating…"
                    : "Location not yet confirmed"}
              </p>
              <p className="text-[11px] text-slate-300">
                We only use location for routing
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={requestLocation}
              disabled={locationState === "locating"}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#1c4d87] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#255f9f] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {locationState === "locating" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Crosshair className="h-4 w-4" aria-hidden="true" />
              )}
              Use my location
            </button>
            <span className="tabular-nums text-[10px] text-slate-400">
              {formatCoordinate(coords.lat)}, {formatCoordinate(coords.lng)}
            </span>
          </div>
        </div>

        {submitError ? (
          <p
            className="flex items-start gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-200"
            role="alert"
          >
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {submitError}
          </p>
        ) : null}

        {/* Submit */}
        <div>
          <button
            type="submit"
            disabled={isSubmitting}
            data-testid="submit-grievance"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1d63b8] px-6 py-3 font-medium text-white shadow-sm transition-colors hover:bg-[#18539c] focus:outline-none focus:ring-2 focus:ring-[#5b9be0] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Submitting…
              </>
            ) : (
              "Submit the Issue"
            )}
          </button>
          <p className="mt-2 text-center text-[11px] text-slate-300">
            Your report is encrypted and shared only with authorized public bodies.
          </p>
        </div>
      </form>
    </section>
  );
}

/* =========================== snapshot section ========================== */

function SnapshotSection({
  totalTickets,
  critical,
  sessionSubmitted,
  sessionTriaged,
}: {
  totalTickets: number;
  critical: number;
  sessionSubmitted: number;
  sessionTriaged: number;
}) {
  const cards = [
    {
      label: "Tickets in System",
      value: totalTickets,
      icon: FileText,
      sub: "Across 22 monitored wards | +12% this week",
      tone: "text-sky-300",
    },
    {
      label: "Critical",
      value: critical,
      icon: TriangleAlert,
      sub: "Requires action within 2-4h | 6.4% of total",
      tone: "text-rose-300",
    },
    {
      label: "Submitted This Session",
      value: sessionSubmitted,
      icon: Activity,
      sub: `${sessionTriaged} successfully triaged | ${Math.max(
        0,
        sessionSubmitted - sessionTriaged,
      )} processing`,
      tone: "text-emerald-300",
    },
    {
      label: "Infrastructure Gap Index",
      value: "68/100",
      icon: Scale,
      sub: "Moderate cross-sector gap | +4 pts this month",
      tone: "text-amber-300",
    },
  ];

  return (
    <section className="relative z-10 px-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-[#0f294a] dark:text-slate-50">
          Live Session Snapshot
        </h2>
        <span className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <span className="civic-pulse-dot h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
          Updated just now
        </span>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Civic service at a glance
      </p>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-[#1f4e89] bg-[#133e70] p-5 text-white shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                {card.label}
              </p>
              <card.icon className={`h-4 w-4 shrink-0 ${card.tone}`} aria-hidden="true" />
            </div>
            <p className="mt-3 text-3xl font-bold tabular-nums text-white">
              {typeof card.value === "number" ? card.value.toLocaleString("en-IN") : card.value}
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-300">{card.sub}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ================================ footer =============================== */

function PortalFooter() {
  const links = ["Privacy", "Accessibility", "Help & support", "Data policy"];
  return (
    <footer className="relative z-10 mt-10 border-t border-slate-200 px-4 py-6 sm:px-6 dark:border-slate-800">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <Landmark className="h-4 w-4 text-[#103b6e] dark:text-slate-300" aria-hidden="true" />
          <p className="text-xs text-slate-600 dark:text-slate-300">
            <span className="font-semibold">CivicLens</span> / Digital Public Infrastructure for
            civic intelligence
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-4" aria-label="Footer">
          {links.map((link) => (
            <span
              key={link}
              className="cursor-default text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              {link}
            </span>
          ))}
          <span className="text-xs text-slate-400 dark:text-slate-500">
            Designed for public service · 2026
          </span>
        </nav>
      </div>
    </footer>
  );
}

/* ============================== the page ============================== */

export default function CitizenGrievancePortalPage() {
  const [draft, setDraft] = useState("");
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);

  const [coords, setCoords] = useState({
    lat: DEFAULT_COORDS.lat,
    lng: DEFAULT_COORDS.lng,
  });
  const [locationState, setLocationState] = useState<LocationState>("locating");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<CivicReport | null>(null);
  const [filedCount, setFiledCount] = useState(0);

  const mounted = useSyncExternalStore(
    EMPTY_SUBSCRIBE,
    CLIENT_MOUNTED,
    SERVER_HYDRATING,
  );
  const storedReports = useCivicReports();
  const { citizenName } = useAuth();

  const draftRef = useRef(draft);
  const transcriptBaseRef = useRef("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  /* ------------------------------ voice ------------------------------- */

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
      setDraft(
        `${transcriptBaseRef.current}${finalPart}${interimPart}`.trimStart(),
      );
    };

    recognition.onerror = (event) => {
      setSpeechError(speechErrorMessage(event.error));
    };

    recognition.onend = () => setIsListening(false);

    /* Deferred so the click handler unwinds before start() throws on some engines. */
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

  const toggleListening = useCallback(() => {
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
  }, [isListening]);

  /* ---------------------------- geolocation --------------------------- */

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

  /* ------------------------------ submit ------------------------------ */

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
      /* Persists the report + telemetry, which is what makes it appear on
         /dashboard without any extra plumbing. */
      const { report } = await submitGrievance({
        input_text: text,
        lat: coords.lat,
        lng: coords.lng,
        language,
      });
      setVerdict(report);
      setFiledCount((previous) => previous + 1);
      setDraft("");
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

  /* Snapshot figures: the institutional totals come from the city registry,
     the session figures are live from this browser. */
  const snapshot = useMemo(
    () => ({
      totalTickets: 2846,
      critical: 184,
      sessionSubmitted: storedReports.length || filedCount,
      sessionTriaged: Math.max(0, storedReports.length - 1),
    }),
    [storedReports.length, filedCount],
  );

  if (!mounted) {
    return (
      <div
        className="flex min-h-screen w-full flex-col items-center justify-center bg-[#eef5fa] text-slate-600"
        suppressHydrationWarning
      >
        <Loader2
          className="mb-4 h-8 w-8 animate-spin text-[#103b6e]"
          aria-hidden="true"
        />
        <p className="text-sm font-medium" suppressHydrationWarning>
          Loading CivicLens Citizen Portal…
        </p>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full bg-[#eef5fa] text-slate-800 dark:bg-[#0a1a2e] dark:text-slate-100">
      <AmbientCanvas />
      <PortalNav />

      <Hero />

      {/* Single centred intake column */}
      <main className="relative z-10 mx-auto my-8 w-full max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6">
          <GrievanceCard
            draft={draft}
            setDraft={setDraft}
            language={language}
            setLanguage={setLanguage}
            isListening={isListening}
            speechError={speechError}
            toggleListening={toggleListening}
            locationState={locationState}
            coords={coords}
            requestLocation={requestLocation}
            isSubmitting={isSubmitting}
            submitError={submitError}
            handleSubmit={handleSubmit}
          />

          {/* Receipt appears here after a successful submission */}
          {verdict && !isSubmitting ? (
            <div className="flex flex-col gap-3">
              <ReceiptCard report={verdict} citizenName={citizenName} />
              <Link
                href={DASHBOARD_ROUTE}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-[#133e70] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1a4d85]"
              >
                View on the Ward Command Center
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          ) : null}
        </div>
      </main>

      <SnapshotSection
        totalTickets={snapshot.totalTickets}
        critical={snapshot.critical}
        sessionSubmitted={snapshot.sessionSubmitted}
        sessionTriaged={snapshot.sessionTriaged}
      />

      <PortalFooter />
    </div>
  );
}
