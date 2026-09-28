"use client";

/* Shared presentational primitives for both CivicLens routes.
   Theme-agnostic by construction: every colour resolves through a semantic
   --civic-* token (or an explicit light/dark pair) so the citizen portal and
   the authority command center share one visual language. */

import { createElement, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Droplets,
  Landmark,
  Recycle,
  Wrench,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { formatRelativeTime, urgencyLabel } from "@/app/civic-shared";

export const PANEL =
  "civic-panel rounded-2xl border border-civic-line bg-civic-surface";

const CATEGORY_ICON: Record<string, LucideIcon> = {
  Drainage: Droplets,
  "Roads & Transport": Wrench,
  "Water Supply": Droplets,
  Electricity: Zap,
  "Sanitation / Civic Maintenance": Recycle,
};

/* Light-mode shades are the darker step; the dark: twin restores the -300 neon
   that only reads on a near-black surface. */
const CATEGORY_TINT: Record<string, string> = {
  Drainage: "text-blue-700 dark:text-blue-300 bg-blue-500/10 ring-blue-400/25",
  "Roads & Transport": "text-amber-600 dark:text-amber-300 bg-amber-500/10 ring-amber-400/25",
  "Water Supply": "text-sky-700 dark:text-sky-300 bg-sky-500/10 ring-sky-400/25",
  Electricity: "text-slate-700 dark:text-slate-200 bg-slate-500/10 ring-slate-400/25",
  "Sanitation / Civic Maintenance": "text-emerald-600 dark:text-emerald-300 bg-emerald-500/10 ring-emerald-400/25",
};

/* civic-shared.ts also exports urgencyBadgeClass, but those values are tuned for
   a dark surface only, so the Day-safe presentation lives here. */
export function urgencyBadgeTone(score: number): string {
  if (score >= 5) return "bg-rose-500/10 text-rose-700 dark:text-rose-400 ring-rose-500/30";
  if (score === 4) return "bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-500/30";
  if (score === 3) return "bg-blue-500/10 text-blue-700 dark:text-blue-300 ring-blue-400/25";
  return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 ring-emerald-400/25";
}

export function urgencyBarTone(score: number): string {
  if (score >= 5) return "bg-rose-500";
  if (score === 4) return "bg-amber-500";
  if (score === 3) return "bg-civic-blue";
  return "bg-emerald-500";
}

export function categoryIcon(category: string): LucideIcon {
  const direct = CATEGORY_ICON[category];
  if (direct) return direct;
  const match = Object.entries(CATEGORY_ICON).find(([key]) =>
    category.toLowerCase().includes(key.toLowerCase().split(" ")[0]),
  );
  return match ? match[1] : Landmark;
}

export function categoryTint(category: string): string {
  return (
    CATEGORY_TINT[category] ?? "text-civic-blue bg-civic-soft ring-civic-line"
  );
}

/* Derives a human engine label from the REAL active_model reported by the API.
   Never hardcodes "online" — if the model is unknown we say so. */
export function engineDisplayName(
  model: string | undefined,
  mode: "primary" | "resilient",
): string {
  if (!model) return "Standby";
  if (mode === "resilient" || model === "heuristic-fail-safe") {
    return "Resilient Fail-Safe";
  }
  if (model.includes("lite")) return "Gemini Flash Lite (Google AI Studio)";
  return "Gemini Flash (Google AI Studio)";
}

export function TricolorRule({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`civic-tricolor-rule w-full ${className}`} />
  );
}

export function Panel({
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
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-civic-line bg-civic-soft/60 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-civic-blue/10 ring-1 ring-civic-blue/20">
            <Icon className="h-4.5 w-4.5 text-civic-blue" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-civic-ink">{title}</h2>
            {subtitle ? (
              <p className="text-xs text-civic-muted">{subtitle}</p>
            ) : null}
          </div>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function StatCard({
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
  tone: "blue" | "red" | "amber" | "green";
  progress?: number;
}) {
  const tones: Record<string, string> = {
    blue: "text-civic-blue bg-civic-soft ring-civic-blue/20",
    red: "text-civic-critical bg-rose-500/10 ring-rose-500/30",
    amber: "text-civic-warning bg-amber-500/10 ring-amber-500/30",
    green: "text-civic-green bg-emerald-500/10 ring-emerald-400/25",
  };
  const bars: Record<string, string> = {
    blue: "bg-civic-blue",
    red: "bg-civic-critical",
    amber: "bg-civic-warning",
    green: "bg-civic-green",
  };

  return (
    <div
      className={`${PANEL} flex flex-col gap-3 p-5 transition-shadow duration-200 hover:shadow-[0_1px_2px_rgba(0,0,0,0.5),0_14px_30px_-14px_rgba(0,0,0,0.8)]`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-civic-muted">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold leading-tight tracking-tight tabular-nums text-civic-ink">
            {value}
          </p>
        </div>
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${tones[tone]}`}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      {typeof progress === "number" ? (
        <div className="h-1.5 w-full overflow-hidden rounded-full civic-track">
          <div
            className={`civic-grow h-full rounded-full ${bars[tone]}`}
            style={{ width: `${Math.min(100, Math.max(2, progress))}%` }}
          />
        </div>
      ) : null}
      <p className="text-xs leading-relaxed text-civic-muted">{hint}</p>
    </div>
  );
}

export function RelativeTime({ value }: { value: string }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setLabel(formatRelativeTime(value));
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, [value]);

  return (
    <time dateTime={value} className="whitespace-nowrap tabular-nums text-civic-muted">
      {label ?? "—"}
    </time>
  );
}

export function UrgencyMeter({
  score,
  className = "",
}: {
  score: number;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-1 ${className}`} aria-hidden="true">
      {[1, 2, 3, 4, 5].map((step) => (
        <span
          key={step}
          className={`h-1.5 w-4 rounded-full ${
            step <= score ? urgencyBarTone(score) : "civic-track"
          }`}
        />
      ))}
    </div>
  );
}

export function CategoryGlyph({
  category,
  className,
}: {
  category: string;
  className?: string;
}) {
  return createElement(categoryIcon(category), { className, "aria-hidden": true });
}

export function CategoryBadge({ category }: { category: string }) {
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

export function UrgencyBadge({ score }: { score: number }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${urgencyBadgeTone(
        score,
      )}`}
    >
      <span className="tabular-nums">U{score}</span>
      <span className="opacity-40" aria-hidden="true">
        ·
      </span>
      {urgencyLabel(score)}
    </span>
  );
}
