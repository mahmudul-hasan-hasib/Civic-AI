"use client";

/* ==========================================================================
 * CivicLens · MUNICIPAL AUTHORITY & WARD COMMAND CENTER  (route: /dashboard)
 *
 * Persona: municipal engineers, Ward Commissioners and Public Works officers.
 * Full-width incident map, ward budget-vs-demand deficit, an actionable SLA
 * triage queue and the live AI telemetry badge.
 *
 * Reads grievances straight out of @/lib/civic-store, so anything filed on the
 * citizen portal at "/" is already on the map and in the queue on arrival.
 * ========================================================================== */

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BellRing,
  Building,
  ChartColumn,
  CircleCheckBig,
  Download,
  FileText,
  Gauge,
  HardHat,
  Lightbulb,
  LoaderCircle,
  MapPin,
  Scale,
  Server,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Stamp,
  Target,
  Timer,
  TrendingUp,
  TriangleAlert,
  Wallet,
  Zap,
} from "lucide-react";

import {
  WARD_GRID,
  budgetShiftAmount,
  clusterMemberCounts,
  clusterReports,
  demandAnalysis,
  formatCoordinate,
  formatCurrency,
  urgencyLabel,
  wardLabel,
} from "@/app/civic-shared";
import type { CivicReport } from "@/app/civic-shared";
import AuthorityGate from "@/components/AuthorityGate";
import NavBar, { CITIZEN_ROUTE } from "@/components/NavBar";
import { useAuth } from "@/context/AuthContext";
import {
  CategoryBadge,
  CategoryGlyph,
  Panel,
  RelativeTime,
  StatCard,
  UrgencyBadge,
  UrgencyMeter,
  engineDisplayName,
} from "@/components/civic-ui";
import {
  buildSeedReports,
  mergeReports,
  useCivicTelemetry,
  useDispatchedTickets,
  useCivicReports,
} from "@/lib/civic-store";

const CivicMap = dynamic(() => import("@/components/CivicMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[320px] w-full items-center justify-center rounded-xl border border-civic-line bg-civic-soft sm:h-[400px] lg:h-[480px]">
      <p className="flex items-center gap-2 text-sm font-medium text-civic-muted">
        <LoaderCircle className="h-4 w-4 animate-spin text-civic-blue" aria-hidden="true" />
        Loading OpenStreetMap civic layers…
      </p>
    </div>
  ),
});

type SeverityFilter = "all" | "high" | "critical";

const SEVERITY_FILTERS: { id: SeverityFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "high", label: "Urgent 4-5" },
  { id: "critical", label: "Critical 5" },
];

const EMPTY_SUBSCRIBE = () => () => {};
const CLIENT_MOUNTED = () => true;
const SERVER_HYDRATING = () => false;

export default function AuthorityCommandCenterPage() {
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [wardScope, setWardScope] = useState<string | null>(null);

  const mounted = useSyncExternalStore(
    EMPTY_SUBSCRIBE,
    CLIENT_MOUNTED,
    SERVER_HYDRATING,
  );

  const liveReports = useCivicReports();
  const telemetry = useCivicTelemetry();
  const { dispatched, toggleDispatch } = useDispatchedTickets();
  const { isAdmin } = useAuth();

  /* Seeds are deterministic demo history; live filings are layered on top so
     the command center reflects the current citizen session. */
  const reports = useMemo(() => mergeReports(liveReports, buildSeedReports()), [liveReports]);

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

  const liveCount = liveReports.length;
  const dispatchedCount = useMemo(
    () => reports.filter((report) => dispatched.has(report.id)).length,
    [reports, dispatched],
  );

  /* Level 5 hazards first, then the rest of the actionable backlog. */
  const triageQueue = useMemo(
    () =>
      [...reports]
        .filter((report) => report.source === "live" || report.urgency_score >= 3)
        .sort(
          (a, b) =>
            b.urgency_score - a.urgency_score ||
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
        .slice(0, 12),
    [reports],
  );

  const exportTickets = () => {
    const quote = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const header = [
      "Ticket ID",
      "Tracking ID",
      "Category",
      "Urgency",
      "Urgency Label",
      "Ward",
      "Department",
      "Location",
      "Summary",
      "Recommended Action",
      "Latitude",
      "Longitude",
      "Dispatched",
      "Reported At",
    ];
    const rows = reports.map((report) =>
      [
        report.id,
        report.tracking_id,
        report.category,
        report.urgency_score,
        urgencyLabel(report.urgency_score),
        wardLabel(report.ward),
        report.department,
        report.extracted_location,
        report.summary_en,
        report.actionable_recommendation,
        report.lat,
        report.lng,
        dispatched.has(report.id) ? "yes" : "no",
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
          Loading Ward Command Center…
        </p>
      </div>
    );
  }

  /* No 401/403 wall: a citizen (or a judge) gets a polite card with one-click
     demo access instead of a dead end. */
  if (!isAdmin) {
    return <AuthorityGate />;
  }

  return (
    <div className="min-h-screen w-full bg-civic-page text-civic-ink">
      <div
        aria-hidden="true"
        className="h-[2px] w-full bg-gradient-to-r from-amber-500 via-white to-emerald-500 opacity-80"
      />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60rem_38rem_at_12%_-12%,rgba(37,99,235,0.16),transparent),radial-gradient(48rem_32rem_at_100%_0%,rgba(16,185,129,0.10),transparent)]" />

      <div className="relative mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
        <NavBar
          persona="authority"
          eyebrow="Ward Command Center"
          title={
            <>
              Civic
              <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent dark:from-indigo-300 dark:to-violet-300">
                Lens
              </span>{" "}
              <span className="text-civic-muted">· Authority</span>
            </>
          }
          subtitle="Municipal operations, ward budgets and SLA triage for engineers and commissioners"
        >
          {/* Telemetry + throughput strip. Real values only — the badge never
              claims the model cascade is online when it is not. */}
          <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 lg:flex-wrap lg:overflow-visible">
            {telemetry ? (
              <span
                data-testid="telemetry-badge"
                className={`civic-glow inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 ${
                  telemetry.mode === "primary"
                    ? "border-emerald-500/30 bg-emerald-500/10"
                    : "border-amber-500/30 bg-amber-500/10"
                }`}
                title={
                  telemetry.active_model
                    ? `Active model: ${telemetry.active_model}`
                    : undefined
                }
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    telemetry.mode === "primary"
                      ? "civic-pulse-dot bg-emerald-500"
                      : "civic-pulse-dot-amber bg-amber-500"
                  }`}
                  aria-hidden="true"
                />
                <span
                  className={`text-xs font-semibold ${
                    telemetry.mode === "primary"
                      ? "text-emerald-600 dark:text-emerald-300"
                      : "text-amber-600 dark:text-amber-300"
                  }`}
                >
                  Engine: {engineDisplayName(telemetry.active_model, telemetry.mode)}
                </span>
                <span className="text-[10px] font-medium tabular-nums text-civic-muted">
                  {telemetry.latency_ms} ms · {Math.round(telemetry.confidence * 100)}%
                </span>
              </span>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-civic-line bg-civic-soft px-3 py-1.5 text-xs font-semibold text-civic-muted">
                <span className="h-2 w-2 rounded-full bg-slate-400" aria-hidden="true" />
                Engine: Standby
              </span>
            )}

            <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-civic-line bg-civic-soft px-3 py-1.5 text-xs font-medium text-civic-muted">
              <Activity className="h-3.5 w-3.5 text-civic-blue" aria-hidden="true" />
              {analytics.total} tickets · {liveCount} filed from citizen portal
            </span>

            <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-civic-line bg-civic-soft px-3 py-1.5 text-xs font-medium text-civic-muted">
              <Zap className="h-3.5 w-3.5 text-civic-saffron" aria-hidden="true" />
              {dispatchedCount} dispatched
            </span>
          </div>
        </NavBar>

        <main className="flex flex-col gap-5">
          <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-civic-ink sm:text-2xl">
                Municipal Authority &amp; Ward Operations
              </h1>
              <p className="mt-1 text-sm text-civic-muted">
                Spatial incident load, budget deficit against citizen demand, and the
                dispatchable SLA backlog.
              </p>
            </div>
            {liveCount === 0 ? (
              <Link
                href={CITIZEN_ROUTE}
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 self-start rounded-lg border border-civic-line bg-civic-soft px-3 py-2 text-[11px] font-semibold text-civic-ink transition hover:border-civic-blue/50 hover:text-civic-blue"
              >
                File a test grievance
                <HardHat className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            ) : null}
          </div>

          <Panel
            title="AI Triage Engine"
            subtitle="Live triage service telemetry"
            icon={Server}
          >
            <div className="flex flex-col gap-4 p-5">
              {telemetry ? (
                <>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span
                      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${
                        telemetry.mode === "primary"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 ring-emerald-500/30"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-300 ring-amber-500/30"
                      }`}
                    >
                      {telemetry.mode === "primary" ? (
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {telemetry.mode === "primary"
                        ? "Primary · Gemini cascade online"
                        : "Resilient fail-safe engaged"}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-civic-line bg-civic-soft px-2.5 py-1 text-[11px] font-medium text-civic-muted">
                      <Server className="h-3 w-3" aria-hidden="true" />
                      Active model{" "}
                      <span className="font-semibold text-civic-ink">
                        {telemetry.active_model || "—"}
                      </span>
                    </span>
                  </div>

                  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      {
                        label: "Active model",
                        value: telemetry.active_model || "—",
                        Icon: Server,
                      },
                      { label: "Latency", value: `${telemetry.latency_ms} ms`, Icon: Timer },
                      {
                        label: "Confidence",
                        value: `${Math.round(telemetry.confidence * 100)}%`,
                        Icon: Gauge,
                      },
                      {
                        label: "Mode",
                        value: telemetry.mode === "primary" ? "Primary" : "Resilient",
                        Icon: Activity,
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="flex flex-col gap-1 rounded-xl border border-civic-line bg-civic-soft/70 p-3.5"
                      >
                        <dt className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-civic-muted">
                          <item.Icon className="h-3 w-3" aria-hidden="true" />
                          {item.label}
                        </dt>
                        <dd className="truncate text-sm font-semibold tabular-nums text-civic-ink">
                          {item.value}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  <p className="flex items-center gap-2 text-xs text-civic-muted">
                    <Stamp className="h-3.5 w-3.5 text-civic-blue" aria-hidden="true" />
                    Last ticket{" "}
                    <span className="font-semibold tabular-nums text-civic-ink">
                      {liveReports[0]?.tracking_id ?? "—"}
                    </span>
                  </p>
                </>
              ) : (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                  <span className="inline-flex items-center gap-2 rounded-full border border-civic-line bg-civic-soft px-3 py-1.5 text-xs font-semibold text-civic-muted">
                    <CircleCheckBig className="h-3.5 w-3.5 text-civic-blue" aria-hidden="true" />
                    Standby — awaiting the first live analysis from the citizen portal
                  </span>
                </div>
              )}
              <p className="text-xs leading-relaxed text-civic-muted">
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
              hint={`${liveCount} filed from the citizen portal · ${analytics.total - liveCount} from the historical registry`}
              icon={FileText}
              tone="blue"
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
                    : "green"
              }
              progress={analytics.gapIndex}
            />
          </div>

          {/* Full-width interactive map with spatial clusters. */}
          <Panel
            title="Ward-Level Civic Incident Map"
            subtitle={`${clusters.length} incident clusters plotted from ${visibleReports.length} of ${analytics.total} tickets`}
            icon={MapPin}
            action={
              <div
                role="group"
                aria-label="Filter by severity"
                className="inline-flex gap-1 rounded-lg border border-civic-line bg-civic-soft p-1"
              >
                {SEVERITY_FILTERS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setSeverity(option.id)}
                    aria-pressed={severity === option.id}
                    className={`min-h-9 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition ${
                      severity === option.id
                        ? "bg-civic-blue text-white shadow-sm"
                        : "text-civic-muted hover:bg-civic-soft hover:text-civic-ink"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            }
          >
            <div className="p-3">
              <CivicMap reports={visibleReports} clusters={clusters} />
            </div>
          </Panel>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel
              title="Ward Budget vs. Citizen Demand"
              subtitle="Ward-level demand-gap analysis · simulated capex"
              icon={Wallet}
              action={
                <label className="flex items-center gap-2 text-[11px] font-medium text-civic-muted">
                  <Building className="h-3.5 w-3.5" aria-hidden="true" />
                  <select
                    value={wardScope ?? ""}
                    onChange={(event) =>
                      setWardScope(event.target.value === "" ? null : event.target.value)
                    }
                    className="max-w-[190px] rounded-lg border border-civic-line bg-civic-soft px-2.5 py-1.5 text-[11px] font-semibold text-civic-ink outline-none transition focus:border-civic-blue focus:ring-2 focus:ring-civic-blue/20"
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
                  <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-400">
                      <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                      Reallocation required
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-rose-700 dark:text-rose-200">
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
                            className="rounded-full bg-civic-soft px-2.5 py-1 text-[10px] font-semibold text-rose-700 dark:text-rose-400 ring-1 ring-rose-500/30"
                          >
                            {row.category} +{row.deficitPct.toFixed(1)} pp
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-600 dark:text-emerald-300">
                    Budget allocation is currently tracking citizen demand. No reallocation is
                    required this cycle.
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] text-civic-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-4 rounded-full bg-civic-blue" aria-hidden="true" />
                    Citizen demand
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-4 rounded-full bg-civic-saffron" aria-hidden="true" />
                    Budget share
                  </span>
                  <span>
                    Gap index{" "}
                    <span className="font-semibold tabular-nums text-civic-ink">
                      {wardDemand.gapIndex}
                    </span>
                    /100 · {wardDemand.total} ticket
                    {wardDemand.total === 1 ? "" : "s"} in scope
                  </span>
                </div>

                <ul className="flex flex-col gap-4">
                  {wardDemand.allocations.map((row) => {
                    /* Presentation only: the underlying deficitPct is untouched. */
                    const gapTone =
                      row.deficitPct > 20
                        ? "bg-rose-500/10 text-rose-700 dark:text-rose-400 ring-rose-500/30"
                        : row.deficitPct > 5
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-300 ring-amber-500/30"
                          : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 ring-emerald-400/25";
                    return (
                      <li key={row.category} className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 text-xs font-semibold text-civic-ink">
                            <CategoryGlyph
                              category={row.category}
                              className="h-3.5 w-3.5 text-civic-muted"
                            />
                            {row.category}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${gapTone}`}
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
                          <div className="civic-track h-2 flex-1 overflow-hidden rounded-full">
                            <div
                              className="civic-grow h-full rounded-full bg-civic-blue"
                              style={{ width: `${Math.min(100, row.demandPct)}%` }}
                            />
                          </div>
                          <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-civic-muted">
                            {row.demandPct.toFixed(1)}% demand
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="civic-track h-2 flex-1 overflow-hidden rounded-full">
                            <div
                              className="civic-grow h-full rounded-full bg-civic-saffron"
                              style={{ width: `${Math.min(100, row.budgetPct)}%` }}
                            />
                          </div>
                          <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-civic-muted">
                            {row.budgetPct}% budget
                          </span>
                        </div>

                        <p className="text-[11px] text-civic-muted">
                          {row.complaints} ticket{row.complaints === 1 ? "" : "s"} routed in{" "}
                          {wardScope ? wardLabel(wardScope) : "this scope"}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </Panel>

            {/* Actionable queue: Level 5 hazards float to the top and each row
                can trigger a dispatch without leaving the command center. */}
            <Panel
              title="SLA Triage Queue"
              subtitle="Level 5 hazards first · dispatch from here"
              icon={Target}
              action={
                <span className="inline-flex items-center gap-1.5 rounded-full border border-civic-line bg-civic-soft px-2.5 py-1 text-[11px] font-semibold text-civic-muted">
                  <HardHat className="h-3 w-3" aria-hidden="true" />
                  {dispatchedCount} dispatched
                </span>
              }
            >
              <ol className="flex flex-col gap-2 p-4" data-testid="triage-queue">
                {triageQueue.map((report, index) => (
                  <TriageRow
                    key={report.id}
                    report={report}
                    rank={index + 1}
                    isDispatched={dispatched.has(report.id)}
                    onToggleDispatch={() => toggleDispatch(report.id)}
                  />
                ))}
                {triageQueue.length === 0 ? (
                  <li className="px-4 py-10 text-center text-sm text-civic-muted">
                    Nothing in the actionable backlog for this filter.
                  </li>
                ) : null}
              </ol>
            </Panel>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel
              title="Recent Grievance Tickets"
              subtitle="Newest grievances, including citizen portal filings"
              icon={FileText}
              className="lg:col-span-2"
              action={
                <button
                  type="button"
                  onClick={exportTickets}
                  className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-civic-line bg-civic-soft px-3 py-1.5 text-[11px] font-semibold text-civic-ink transition hover:border-civic-blue hover:text-civic-blue"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  Export CSV
                </button>
              }
            >
              <ul className="flex max-h-[520px] flex-col divide-y divide-civic-line overflow-y-auto">
                {visibleReports.map((report) => {
                  const memberCount = clusterCountFor.get(report.id) ?? 1;
                  return (
                    <li
                      key={report.id}
                      className={`transition hover:bg-civic-soft/60 ${
                        dispatched.has(report.id) ? "bg-emerald-500/5" : ""
                      }`}
                    >
                      <div className="flex w-full flex-col gap-3 px-5 py-4 text-left">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="tabular-nums text-[11px] font-semibold text-civic-muted">
                              {report.tracking_id}
                            </span>
                            <CategoryBadge category={report.category} />
                            <UrgencyBadge score={report.urgency_score} />
                            {report.source === "live" ? (
                              <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-civic-blue ring-1 ring-blue-400/25">
                                New
                              </span>
                            ) : null}
                            {memberCount > 1 ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-300 ring-1 ring-amber-500/30">
                                <Siren className="h-3 w-3" aria-hidden="true" />
                                Consolidated Cluster · {memberCount} Citizens Impacted
                              </span>
                            ) : null}
                            {dispatched.has(report.id) ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-300 ring-1 ring-emerald-400/25">
                                <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                                Dispatched
                              </span>
                            ) : null}
                          </div>
                          <RelativeTime value={report.created_at} />
                        </div>

                        <p className="text-sm leading-relaxed text-civic-ink">
                          {report.summary_en}
                        </p>

                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <span className="inline-flex items-center gap-1.5 text-[11px] text-civic-muted">
                            <MapPin className="h-3 w-3" aria-hidden="true" />
                            {report.extracted_location} · {wardLabel(report.ward)}
                            <span className="tabular-nums">
                              · {formatCoordinate(report.lat)}, {formatCoordinate(report.lng)}
                            </span>
                          </span>
                          <UrgencyMeter score={report.urgency_score} />
                        </div>

                        <p className="flex items-start gap-2 rounded-lg border border-civic-line bg-civic-soft px-3 py-2 text-[11px] leading-relaxed text-civic-muted">
                          <Lightbulb className="mt-0.5 h-3 w-3 shrink-0 text-civic-blue" aria-hidden="true" />
                          <span>
                            <span className="font-semibold text-civic-ink">Action: </span>
                            {report.actionable_recommendation}
                          </span>
                        </p>
                      </div>
                    </li>
                  );
                })}

                {visibleReports.length === 0 ? (
                  <li className="px-5 py-12 text-center text-sm text-civic-muted">
                    No tickets match this severity filter.
                  </li>
                ) : null}
              </ul>
            </Panel>

            <div className="flex flex-col gap-5">
              <Panel title="Citizen Demand Distribution" icon={ChartColumn}>
                <ul className="flex flex-col gap-3.5 p-5">
                  {analytics.ranked.map((row) => (
                    <li key={row.category} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="flex items-center gap-2 font-medium text-civic-ink">
                          <CategoryGlyph
                            category={row.category}
                            className="h-3.5 w-3.5 text-civic-muted"
                          />
                          {row.category}
                        </span>
                        <span className="tabular-nums text-civic-muted">
                          {row.count} · {row.demandPct.toFixed(1)}%
                        </span>
                      </div>
                      <div className="civic-track h-2 overflow-hidden rounded-full">
                        <div
                          className="civic-grow h-full rounded-full bg-gradient-to-r from-civic-blue to-sky-400"
                          style={{ width: `${Math.min(100, row.demandPct)}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel title="Priority Queue" subtitle="Highest urgency first" icon={Target}>
                <ol className="flex flex-col gap-2 p-4">
                  {[...reports]
                    .sort((a, b) => b.urgency_score - a.urgency_score)
                    .slice(0, 5)
                    .map((report, index) => (
                      <li key={report.id}>
                        <div className="flex w-full items-center gap-3 rounded-lg border border-civic-line bg-civic-soft px-3 py-2.5 text-left transition hover:border-civic-blue/40">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-civic-surface text-[11px] font-bold tabular-nums text-civic-muted ring-1 ring-civic-line">
                            {index + 1}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-semibold text-civic-ink">
                              {report.extracted_location}
                            </span>
                            <span className="block truncate text-[11px] text-civic-muted">
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
        </main>

        <footer className="mt-8 border-t border-civic-line pt-5 text-[11px] leading-relaxed text-civic-muted">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-2xl">
              CivicLens prototype · Command center data is scoped to grievances filed in this
              browser plus a deterministic historical registry. Allocated budget figures are
              simulated for demonstration and do not reflect real municipal accounts.
            </p>
            <Link
              href={CITIZEN_ROUTE}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 self-start rounded-lg border border-civic-line bg-civic-soft px-3 py-2 text-[11px] font-semibold text-civic-ink transition hover:border-civic-blue/50 hover:text-civic-blue"
            >
              Back to Citizen Portal
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}

function TriageRow({
  report,
  rank,
  isDispatched,
  onToggleDispatch,
}: {
  report: CivicReport;
  rank: number;
  isDispatched: boolean;
  onToggleDispatch: () => void;
}) {
  const critical = report.urgency_score >= 5;

  return (
    <li
      className={`flex flex-col gap-3 rounded-xl border p-3.5 transition ${
        critical
          ? "border-rose-500/35 bg-rose-500/5"
          : "border-civic-line bg-civic-soft"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold tabular-nums ring-1 ${
            critical
              ? "bg-rose-500/10 text-rose-700 dark:text-rose-400 ring-rose-500/30"
              : "bg-civic-surface text-civic-muted ring-civic-line"
          }`}
        >
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums text-[11px] font-semibold text-civic-muted">
              {report.tracking_id}
            </span>
            <UrgencyBadge score={report.urgency_score} />
            {report.source === "live" ? (
              <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-civic-blue ring-1 ring-blue-400/25">
                Citizen filed
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 text-xs font-semibold leading-relaxed text-civic-ink">
            {report.summary_en}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-civic-muted">
            <span className="inline-flex items-center gap-1">
              <Building className="h-3 w-3" aria-hidden="true" />
              {report.department}
            </span>
            <span aria-hidden="true">·</span>
            <span>{wardLabel(report.ward)}</span>
            <span aria-hidden="true">·</span>
            <RelativeTime value={report.created_at} />
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-civic-muted">
          <Timer className="h-3 w-3" aria-hidden="true" />
          {report.sla_hours}h SLA
        </span>
        <button
          type="button"
          onClick={onToggleDispatch}
          aria-pressed={isDispatched}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition ${
            isDispatched
              ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
              : "bg-civic-blue text-white shadow-sm hover:bg-civic-navy"
          }`}
        >
          {isDispatched ? (
            <>
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Dispatched
            </>
          ) : (
            <>
              <HardHat className="h-3.5 w-3.5" aria-hidden="true" />
              Trigger dispatch
            </>
          )}
        </button>
      </div>

    </li>
  );
}
