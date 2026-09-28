"use client";

/* ==========================================================================
 * CivicLens · CITIZEN GRIEVANCE PORTAL  (route: /)
 *
 * Persona: general public reporting local infrastructure breakdowns.
 * Voice-first capture, geotagged submission, and a printable filing receipt.
 *
 * Everything filed here is persisted through @/lib/civic-store, so it is
 * already on the authority command center by the time the citizen (or a ward
 * officer) opens /dashboard — no manual refresh required.
 * ========================================================================== */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";
import {
  ChevronRight,
  CircleAlert,
  Crosshair,
  Languages,
  LoaderCircle,
  LocateFixed,
  MapPin,
  Mic,
  MicOff,
  PenLine,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Workflow,
} from "lucide-react";

import { DEFAULT_COORDS, formatCoordinate } from "@/app/civic-shared";
import NavBar, { AUTHORITY_ROUTE } from "@/components/NavBar";
import ReceiptCard from "@/components/ReceiptCard";
import { PANEL, TricolorRule } from "@/components/civic-ui";
import { submitGrievance, useCivicReports } from "@/lib/civic-store";
import type { CivicReport } from "@/app/civic-shared";

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

const SUPPORTED_LANGUAGES: {
  code: string;
  label: string;
  short: string;
  native: string;
}[] = [
  { code: "bn-IN", label: "বাংলা (Bengali)", short: "BN", native: "বাংলা" },
  { code: "hi-IN", label: "हिन्दी (Hindi)", short: "HI", native: "हिन्दी" },
  { code: "en-IN", label: "English (India)", short: "EN", native: "English" },
];

const PLACEHOLDER: Record<string, string> = {
  "bn-IN": "উদাহরণ: আমাদের এলাকায় তিন দিন ধরে পানি নেই, এবং রাস্তায় ড্রেনেজ ভেঙে পড়েছে।",
  "hi-IN": "उदाहरण: हमारे मोहल्ले में तीन दिन से पानी नहीं आ रहा और नाली जाम है।",
  "en-IN": "e.g. Our lane has had no water supply for three days and the storm drain has collapsed.",
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

const PIPELINE_STEPS = [
  {
    step: "01",
    title: "Capture",
    body: "Speech in Bengali, Hindi or English is transcribed live in the browser, or typed directly.",
    Icon: Mic,
    tone: "bg-civic-blue text-white ring-civic-blue",
    rail: "bg-civic-blue/25",
  },
  {
    step: "02",
    title: "Understand",
    body: "The grievance is translated to English, classified into a service category and scored 1-5 for urgency.",
    Icon: Sparkles,
    tone: "bg-[#0a6ede] text-white ring-[#0a6ede]",
    rail: "bg-civic-saffron/30",
  },
  {
    step: "03",
    title: "Locate",
    body: "Device GPS is attached to the ticket so it drops onto the ward map with a severity colour.",
    Icon: MapPin,
    tone: "bg-civic-saffron text-white ring-civic-saffron",
    rail: "bg-civic-green/30",
  },
  {
    step: "04",
    title: "Act",
    body: "A recommended administrative action is generated and the ticket reaches the ward command centre.",
    Icon: ShieldCheck,
    tone: "bg-civic-green text-white ring-civic-green",
    rail: "bg-transparent",
  },
];

function TriageSkeleton() {
  return (
    <div className={`${PANEL} flex flex-col gap-4 p-5`} aria-live="polite">
      <div className="flex items-center gap-3">
        <LoaderCircle className="h-5 w-5 animate-spin text-civic-blue" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-civic-ink">Analysing grievance</p>
          <p className="text-xs text-civic-muted">
            Translating, classifying and scoring urgency on the civic intelligence service.
          </p>
        </div>
      </div>
      <div className="civic-track h-4 w-2/5 animate-pulse rounded" />
      <div className="civic-track h-3 w-full animate-pulse rounded" />
      <div className="civic-track h-3 w-11/12 animate-pulse rounded" />
      <div className="civic-track h-3 w-3/4 animate-pulse rounded" />
    </div>
  );
}

export default function CitizenGrievancePortalPage() {
  const [draft, setDraft] = useState("");
  const [language, setLanguage] = useState(SUPPORTED_LANGUAGES[0].code);
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
  /* Live read of the shared store so this page can show how many grievances are
     already on the authority board without re-fetching anything. */
  const storedReports = useCivicReports();

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
      /* Persists the report and its telemetry, which is what makes it show up
         on /dashboard without any extra plumbing. */
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

  const locationCopy =
    locationState === "detected"
      ? "GPS location captured"
      : locationState === "locating"
        ? "Detecting your location…"
        : "Using city default (Dhaka)";

  if (!mounted) {
    return (
      <div
        className="flex min-h-screen w-full flex-col items-center justify-center bg-civic-page text-civic-muted"
        suppressHydrationWarning
      >
        <div
          className="civic-sweep relative mb-4 h-8 w-8 animate-spin rounded-full border-2 border-civic-blue border-t-transparent"
          suppressHydrationWarning
        />
        <p className="text-sm font-medium" suppressHydrationWarning>
          Loading CivicLens Citizen Portal…
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-civic-page text-civic-ink">
      {/* 2px tricolour accent — the institutional signature at the very top. */}
      <div
        aria-hidden="true"
        className="h-[2px] w-full bg-gradient-to-r from-amber-500 via-white to-emerald-500 opacity-80"
      />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60rem_38rem_at_12%_-12%,rgba(37,99,235,0.16),transparent),radial-gradient(48rem_32rem_at_100%_0%,rgba(16,185,129,0.10),transparent)]" />

      <div className="relative mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 sm:py-5">
        <NavBar
          persona="citizen"
          title={
            <>
              Civic
              <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent dark:from-indigo-300 dark:to-violet-300">
                Lens
              </span>
            </>
          }
          subtitle="AI-Powered Digital Public Infrastructure (DPI) for Citizen Grievance Redressal"
        />

        {/* Centred, card-first layout — the citizen journey is a single column. */}
        <main className="flex flex-col gap-5">
          <div className="flex flex-col gap-2 pt-1 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-civic-blue">
              Citizen Grievance Portal
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-civic-ink sm:text-3xl">
              Report a problem in your area
            </h1>
            <p className="mx-auto max-w-xl text-sm leading-relaxed text-civic-muted">
              Speak or type your grievance in Bengali, Hindi or English. CivicLens translates
              it, classifies the service category, scores the urgency and routes it to the
              correct municipal wing with a tracking reference.
            </p>
          </div>

          <section className={`${PANEL} flex flex-col`}>
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-civic-line bg-civic-soft/60 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-civic-blue/10 ring-1 ring-civic-blue/20">
                  <Mic className="h-4.5 w-4.5 text-civic-blue" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-civic-ink">
                    Report a Civic Grievance
                  </h2>
                  <p className="text-xs text-civic-muted">
                    Tell us what is happening. Speak or type in your preferred language.
                  </p>
                </div>
              </div>
            </header>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-medium text-civic-muted">
                  <Languages className="h-4 w-4 text-civic-blue" aria-hidden="true" />
                  Transcription language
                </div>
                <div
                  role="group"
                  aria-label="Transcription language"
                  className="inline-flex gap-1 rounded-xl border border-civic-line bg-civic-soft p-1"
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
                        className={`min-h-9 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                          active
                            ? "bg-civic-blue text-white shadow-sm"
                            : "text-civic-muted hover:bg-civic-soft hover:text-civic-ink"
                        }`}
                      >
                        {item.native}
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
                  data-testid="voice-capture"
                  className={`group relative flex min-h-14 w-full items-center justify-center gap-3 overflow-hidden rounded-xl border px-4 py-4 text-sm font-semibold transition ${
                    isListening
                      ? "civic-voice-ring border-rose-500/50 bg-rose-500/15 text-rose-700 dark:text-rose-200"
                      : "border-civic-blue/40 bg-civic-soft text-civic-ink shadow-[0_1px_2px_rgba(0,0,0,0.2)] hover:border-civic-blue/70 hover:bg-blue-500/15"
                  }`}
                >
                  {isListening ? (
                    <>
                      <span className="flex h-5 items-end gap-[3px]" aria-hidden="true">
                        {[0, 1, 2, 3, 4].map((bar) => (
                          <span
                            key={bar}
                            className="civic-wave-bar h-5 w-[3px] rounded-full bg-rose-400"
                            style={{ animationDelay: `${bar * 0.11}s` }}
                          />
                        ))}
                      </span>
                      <MicOff className="h-5 w-5" aria-hidden="true" />
                      Listening… tap to stop
                    </>
                  ) : (
                    <>
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-civic-blue text-white shadow-sm transition-transform duration-200 group-hover:scale-105">
                        <Mic className="h-4.5 w-4.5" aria-hidden="true" />
                      </span>
                      Record your grievance by voice
                    </>
                  )}
                </button>

                {isListening ? (
                  <p className="flex items-center gap-2 text-xs font-medium text-rose-700 dark:text-rose-300">
                    <span
                      className="civic-pulse-dot-rose h-2 w-2 rounded-full bg-rose-400"
                      aria-hidden="true"
                    />
                    Listening in{" "}
                    {SUPPORTED_LANGUAGES.find((item) => item.code === language)?.label} —
                    the transcript updates live below.
                  </p>
                ) : null}

                <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-civic-muted">
                  <Languages className="h-3.5 w-3.5 text-civic-blue" aria-hidden="true" />
                  <span>Supported:</span>
                  {SUPPORTED_LANGUAGES.map((item, index) => (
                    <span key={item.code} className="inline-flex items-center gap-1.5">
                      {index > 0 ? (
                        <span className="text-civic-muted/50" aria-hidden="true">
                          |
                        </span>
                      ) : null}
                      <span
                        className={
                          language === item.code
                            ? "font-semibold text-civic-ink"
                            : undefined
                        }
                      >
                        {item.native}
                      </span>
                    </span>
                  ))}
                  <span className="text-civic-muted/50" aria-hidden="true">
                    |
                  </span>
                  <span>(Auto-detected)</span>
                </p>

                {speechError ? (
                  <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-300">
                    <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {speechError}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-2">
                <label
                  htmlFor="grievance-text"
                  className="flex items-center justify-between text-xs font-medium text-civic-muted"
                >
                  <span className="inline-flex items-center gap-2">
                    <PenLine className="h-4 w-4 text-civic-muted" aria-hidden="true" />
                    Grievance transcript
                  </span>
                  <span className="tabular-nums text-civic-muted">
                    {draft.length} characters
                  </span>
                </label>
                <textarea
                  id="grievance-text"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={PLACEHOLDER[language]}
                  rows={6}
                  className="w-full resize-y rounded-xl border border-civic-line bg-civic-soft px-4 py-3 text-sm leading-relaxed text-civic-ink outline-none transition placeholder:text-civic-muted/70 focus:border-civic-blue focus:ring-2 focus:ring-civic-blue/20"
                />
                <p className="text-[11px] leading-relaxed text-civic-muted">
                  You can edit the voice transcript before submitting. Reports are translated to
                  English, categorised and scored for urgency automatically.
                </p>
              </div>

              <div className="civic-glass flex flex-col gap-3 rounded-xl border border-civic-line p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-civic-soft text-civic-blue ring-1 ring-civic-line">
                    <LocateFixed className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-civic-ink">{locationCopy}</p>
                    <p className="truncate text-[11px] tabular-nums text-civic-muted">
                      {formatCoordinate(coords.lat)}, {formatCoordinate(coords.lng)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={requestLocation}
                  disabled={locationState === "locating"}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-civic-line bg-civic-soft px-3 py-2 text-xs font-semibold text-civic-ink transition hover:border-civic-blue/50 hover:text-civic-blue disabled:cursor-not-allowed disabled:opacity-60"
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
                <p className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-700 dark:text-rose-400">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {submitError}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting}
                data-testid="submit-grievance"
                className="civic-cta group inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-black/20 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 dark:shadow-black/50"
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
                    <ChevronRight
                      className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
                      aria-hidden="true"
                    />
                  </>
                )}
              </button>
            </form>
          </section>

          {isSubmitting ? <TriageSkeleton /> : null}

          {verdict && !isSubmitting ? <ReceiptCard report={verdict} /> : null}

          {/* Only surfaces once a grievance has actually reached the board. */}
          {filedCount > 0 ? (
            <Link
              href={AUTHORITY_ROUTE}
              className="civic-glass flex flex-col gap-2 rounded-xl border border-civic-line p-4 transition hover:border-civic-blue/50"
            >
              <p className="text-xs font-semibold text-civic-ink">
                Your report is already on the authority board
              </p>
              <p className="text-[11px] leading-relaxed text-civic-muted">
                {filedCount} grievance{filedCount === 1 ? "" : "s"} filed from this device are
                visible in the command center map and triage queue.
              </p>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-civic-blue">
                Open Authority Portal Access
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </Link>
          ) : null}

          {storedReports.length > 0 && filedCount === 0 ? (
            <p className="text-center text-[11px] text-civic-muted">
              {storedReports.length} grievance
              {storedReports.length === 1 ? " has" : "s have"} been filed from this browser.
            </p>
          ) : null}

          <section className={`${PANEL} flex flex-col`}>
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-civic-line bg-civic-soft/60 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-civic-blue/10 ring-1 ring-civic-blue/20">
                  <Workflow className="h-4.5 w-4.5 text-civic-blue" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-civic-ink">
                    How the triage pipeline works
                  </h2>
                  <p className="text-xs text-civic-muted">
                    From your voice to a ward engineer in four steps
                  </p>
                </div>
              </div>
            </header>
            <ol className="flex flex-col p-5">
              {PIPELINE_STEPS.map((item, index, all) => (
                <li key={item.step} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ring-4 ring-civic-surface ${item.tone}`}
                    >
                      {item.step}
                    </span>
                    {index < all.length - 1 ? (
                      <span
                        className={`my-1 w-0.5 flex-1 rounded-full ${item.rail}`}
                        aria-hidden="true"
                      />
                    ) : null}
                  </div>
                  <div className="pb-5">
                    <p className="flex items-center gap-2 text-sm font-semibold text-civic-ink">
                      <item.Icon className="h-3.5 w-3.5 text-civic-blue" aria-hidden="true" />
                      {item.title}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-civic-muted">{item.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-600 dark:text-amber-300">
              <ShieldAlert className="h-4 w-4" aria-hidden="true" />
              Life-safety emergency?
            </p>
            <p className="mt-2 text-xs leading-relaxed text-amber-700 dark:text-amber-200/85">
              This portal routes municipal grievances only. For immediate danger call the
              national emergency services, then file here with the reference number so the
              incident is attached to the ward record.
            </p>
          </div>
        </main>

        <footer className="mt-8 flex flex-col gap-3 border-t border-civic-line pt-5">
          <TricolorRule />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-[11px] leading-relaxed text-civic-muted">
              CivicLens prototype · Grievances are classified, scored and geotagged by an AI
              triage service. Allocated budget figures are simulated for demonstration and do
              not reflect real municipal accounts.
            </p>
            <Link
              href={AUTHORITY_ROUTE}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 self-start rounded-lg border border-civic-line bg-civic-soft px-3 py-2 text-[11px] font-semibold text-civic-ink transition hover:border-civic-blue/50 hover:text-civic-blue"
            >
              Authority Portal Access
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
