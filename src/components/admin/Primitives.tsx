"use client";

/* ==========================================================================
 * CivicLens · COMMAND CENTER DESIGN PRIMITIVES
 *
 * The policymaker view is a deep-navy instrument panel: every surface is a
 * #133e70 card with a lighter #1e4d88 edge, the inset surfaces (AI signal
 * cards, map chrome) drop to #0d2e55 for depth, and the single interactive
 * accent is #1d63b8. These primitives exist so every widget in the route draws
 * from one definition of that system.
 * ========================================================================== */

import type { ReactNode } from "react";

/* ------------------------------- surfaces ------------------------------- */

export function AdminPanel({
  children,
  className = "",
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
}) {
  return (
    <Tag
      className={`rounded-2xl border border-[#1e4d88] bg-[#133e70] p-5 text-white shadow-md ${className}`}
    >
      {children}
    </Tag>
  );
}

export function AdminPanelHeader({
  eyebrow,
  title,
  count,
  subtitle,
  actions,
}: {
  eyebrow: string;
  title: string;
  count?: ReactNode;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-300">
          {eyebrow}
        </p>
        <h2 className="mt-1 flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider text-white">
          {title}
          {count}
        </h2>
        {subtitle ? (
          <p className="mt-1 text-[11px] leading-relaxed text-slate-300">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div> : null}
    </div>
  );
}

/* The small tracked uppercase rule that opens each page section. */
export function SectionTagline({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#3d6fa8]">
      — {children} —
    </p>
  );
}

/* ------------------------------ urgency --------------------------------- */

export type UrgencyTier = "Critical" | "High" | "Medium" | "Low";

const TIER_STYLE: Record<UrgencyTier, string> = {
  Critical: "border-rose-400/70 bg-rose-500/20 text-rose-100",
  High: "border-amber-400/70 bg-amber-500/20 text-amber-100",
  Medium: "border-cyan-300/70 bg-cyan-400/20 text-cyan-100",
  Low: "border-emerald-400/60 bg-emerald-500/15 text-emerald-100",
};

/* The whole platform scores urgency 1-5 (see clampUrgency in civic-shared), so
   the bands are 5/4/3 rather than the 8/6/4 an earlier 0-10 draft assumed. */
export function tierFor(score: number): UrgencyTier {
  if (score >= 5) return "Critical";
  if (score >= 4) return "High";
  if (score >= 3) return "Medium";
  return "Low";
}

export function UrgencyBadge({ tier, score }: { tier: UrgencyTier; score?: number }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${TIER_STYLE[tier]}`}
    >
      {tier}
      {typeof score === "number" ? (
        <span className="font-mono opacity-75">U{score}</span>
      ) : null}
    </span>
  );
}

/* ------------------------------ controls -------------------------------- */

export function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
        active
          ? "border-sky-300/60 bg-white/15 text-white"
          : "border-[#1b4578] text-slate-300 hover:border-[#2f6fb8] hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

export function AccentButton({
  children,
  onClick,
  disabled,
  type = "button",
  className = "",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
  title?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#1d63b8] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#2569bd] disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {children}
    </button>
  );
}

/* ------------------------------ sparkline ------------------------------- */

/* Inline SVG, no chart dependency: the deck is a fixed set of readings and a
   library would dwarf the payload of the route. */
export function Sparkline({
  points,
  className = "h-6 w-20",
  stroke = "currentColor",
}: {
  points: number[];
  className?: string;
  stroke?: string;
}) {
  if (points.length < 2) return null;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const path = points
    .map((value, index) => {
      const x = (index / (points.length - 1)) * 100;
      const y = 30 - ((value - min) / span) * 30;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d={`${path} L100,32 L0,32 Z`} fill={stroke} opacity="0.14" />
      <path d={path} fill="none" stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ------------------------------- legends -------------------------------- */

export const LEGEND_DOTS = [
  { label: "Normal", className: "bg-sky-300" },
  { label: "Elevated", className: "bg-amber-300" },
  { label: "Critical", className: "bg-rose-400" },
  { label: "Resolved", className: "bg-emerald-300" },
] as const;

export function DotLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {LEGEND_DOTS.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-[11px] text-slate-300">
          <span className={`h-2 w-2 rounded-full ${item.className}`} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
