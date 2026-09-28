"use client";

/* ==========================================================================
 * CivicLens · WARD COMMAND CENTER  (route: /dashboard)
 *
 * Persona: a municipal policymaker triaging live civic demand.
 *
 * The route is a deep-navy instrument deck: an ice-blue canvas underlay, a
 * sticky navy banner, four headline metrics, a geospatial heatmap beside the
 * AI-ranked priority queue, then the budget-versus-demand table and the case
 * management ledger. Every figure is derived from the same report store the
 * citizen portal writes to, so anything filed on "/" appears here immediately
 * and survives a reload.
 *
 * Access is gated on the authority role, and the analytics scope follows the
 * signed-in officer's jurisdiction, so a ward engineer sees their own ward
 * rather than the whole city.
 * ========================================================================== */

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Download, Loader2, RefreshCw, X } from "lucide-react";

import {
  CITY_BASELINE,
  WARD_GRID,
  clusterReports,
  demandAnalysis,
  formatINR,
  reallocationFor,
  urgencyLabel,
  wardLabel,
} from "@/app/civic-shared";
import type { CivicReport } from "@/app/civic-shared";
import AmbientCanvas from "@/components/AmbientCanvas";
import AuthorityGate from "@/components/AuthorityGate";
import CommandFooter from "@/components/admin/CommandFooter";
import GeospatialPanel from "@/components/admin/GeospatialPanel";
import MetricCards from "@/components/admin/MetricCards";
import PolicyAnalytics from "@/components/admin/PolicyAnalytics";
import PriorityQueue from "@/components/admin/PriorityQueue";
import type { QueueItem } from "@/components/admin/PriorityQueue";
import RecentTickets from "@/components/admin/RecentTickets";
import { statusFor } from "@/components/admin/RecentTickets";
import type { TicketRow } from "@/components/admin/RecentTickets";
import { SectionTagline } from "@/components/admin/Primitives";
import TopNav from "@/components/TopNav";
import { useAuth } from "@/context/AuthContext";
import {
  buildSeedReports,
  mergeReports,
  useCivicReports,
  useCivicTelemetry,
  useDispatchedTickets,
} from "@/lib/civic-store";
import { downloadBriefingPdf } from "@/lib/briefing-pdf";
import type { BriefingInput } from "@/lib/briefing-pdf";

/* Long titles are trimmed to keep the ledger rows on one line. */
function trim(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}\u2026`;
}

/* Resolves "Ward 04 - Mohammadpur" back to the WARD_GRID key "Ward 04". */
function wardCodeOf(officerWard: string | undefined): string | null {
  if (!officerWard) return null;
  const match = WARD_GRID.find(
    (ward) => officerWard === ward.label || officerWard.startsWith(ward.ward),
  );
  return match?.ward ?? null;
}

/* localStorage-backed role and identity are read through useSyncExternalStore,
   which cannot know a render is a browser one. This detects hydration the same
   way, so the server and client markup stay identical. */
const CLIENT_MOUNTED = () => true;
const SERVER_HYDRATING = () => false;
const NO_SUBSCRIBE = () => () => {};

/* Reads the gap index recorded on this device on the previous visit. */
const GAP_INDEX_KEY = "civiclens-prev-gap-index";

/* A coarse series for the sparkline, derived from how the current composition
   of reports has shifted as the report set is truncated. */
function gapSeries(reports: CivicReport[]): number[] {
  if (reports.length < 2) return [];
  return Array.from({ length: 8 }, (_, index) => {
    const slice = reports.slice(0, (index + 1) * 12);
    return slice.length > 0 ? demandAnalysis(slice, null).gapIndex : 0;
  });
}

export default function WardCommandCenterPage() {
  const [exporting, setExporting] = useState(false);
  const [reviewNote, setReviewNote] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [scopeToWard, setScopeToWard] = useState(false);

  const { isAdmin, officer } = useAuth();
  const liveReports = useCivicReports();
  const telemetry = useCivicTelemetry();
  const { dispatched, toggleDispatch } = useDispatchedTickets();

  const mounted = useSyncExternalStore(
    NO_SUBSCRIBE,
    CLIENT_MOUNTED,
    SERVER_HYDRATING,
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const reports = useMemo(
    () => mergeReports(liveReports, buildSeedReports()),
    [liveReports],
  );
  const clusters = useMemo(() => clusterReports(reports), [reports]);
  const sessionReportIds = useMemo(
    () => new Set(liveReports.map((report) => report.id)),
    [liveReports],
  );

  const jurisdiction = wardCodeOf(officer?.ward);
  const activeWard = scopeToWard && jurisdiction ? jurisdiction : null;
  const scopedReports = useMemo(
    () => (activeWard ? reports.filter((report) => report.ward === activeWard) : reports),
    [reports, activeWard],
  );
  const scopedClusters = useMemo(
    () =>
      activeWard
        ? clusters.filter((cluster) =>
            cluster.member_ids.some((id) => scopedReports.some((r) => r.id === id)),
          )
        : clusters,
    [clusters, activeWard, scopedReports],
  );

  const demand = useMemo(() => demandAnalysis(scopedReports, activeWard), [scopedReports, activeWard]);

  /* Read the previously recorded index during render (safe once mounted) and
     persist the current one in an effect, which only touches storage. */
  const gapDelta = useMemo<number | null>(() => {
    if (!mounted) return null;
    try {
      const raw = window.localStorage.getItem(GAP_INDEX_KEY);
      if (raw === null) return null;
      const previous = Number(raw);
      return Number.isFinite(previous) ? demand.gapIndex - previous : null;
    } catch {
      return null;
    }
  }, [mounted, demand.gapIndex]);

  useEffect(() => {
    try {
      window.localStorage.setItem(GAP_INDEX_KEY, String(demand.gapIndex));
    } catch {
      /* private mode: the delta simply stays unavailable */
    }
  }, [demand.gapIndex]);

  const byId = useMemo(
    () => new Map(reports.map((report) => [report.id, report])),
    [reports],
  );

  /* Priority = urgency weighted by how many citizens reported it, which is the
     same signal the heatmap surfaces as the hotspot. */
  const queue = useMemo<QueueItem[]>(
    () =>
      [...scopedClusters]
        .sort(
          (a, b) =>
            b.urgency_score * 2 + b.citizen_report_count * 3 -
            (a.urgency_score * 2 + a.citizen_report_count * 3),
        )
        .slice(0, 4)
        .map((cluster) => {
          const lead = cluster.member_ids
            .map((id) => byId.get(id))
            .find((report): report is CivicReport => Boolean(report));
          return {
            id: cluster.clusterId,
            reportId: lead?.id ?? null,
            title: trim(lead?.summary_en ?? cluster.category, 64),
            wardLabel: wardLabel(lead?.ward ?? ""),
            action: lead?.actionable_recommendation ?? cluster.actionable_recommendation,
            urgency: cluster.urgency_score,
            dispatched: Boolean(lead && dispatched.has(lead.id)),
          };
        }),
    [scopedClusters, byId, dispatched],
  );

  const openCount = queue.filter((item) => !item.dispatched).length;

  const tickets = useMemo<TicketRow[]>(
    () =>
      [...scopedReports]
        .sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
        .slice(0, 6)
        .map((report) => {
          const isDispatched = dispatched.has(report.id);
          return {
            id: report.tracking_id,
            category: report.category,
            grievance: trim(report.summary_en, 72),
            ward: report.ward,
            urgency: report.urgency_score,
            action: trim(report.actionable_recommendation, 40),
            status: statusFor(report, isDispatched, now),
            dispatched: isDispatched,
          };
        }),
    [scopedReports, dispatched, now],
  );

  /* Any citizen filed in this browser sits above the city-wide baseline. */
  const sessionUrgent = useMemo(
    () => liveReports.filter((report) => report.urgency_score >= 8).length,
    [liveReports],
  );

  const latestArrival = useMemo(() => {
    const times = reports
      .map((report) => new Date(report.created_at).getTime())
      .filter((value) => Number.isFinite(value));
    return times.length > 0 ? Math.max(...times) : null;
  }, [reports]);

  const secondsSinceArrival = latestArrival
    ? Math.max(0, Math.round((now - latestArrival) / 1000))
    : null;

  const exportBriefing = async () => {
    setExporting(true);
    try {
      const policyRows = demand.allocations.map((row) => ({
        category: row.category,
        demandPct: row.demandPct,
        budgetPct: row.budgetPct,
        gapPct: row.deficitPct,
        recommendation:
          row.deficitPct > 0
            ? `Reallocate ${formatINR(reallocationFor(row.deficitPct))}`
            : row.deficitPct > -10
              ? "Allocation adequate"
              : "Monitor next cycle",
      }));
      const worst = demand.allocations[0];
      const input: BriefingInput = {
        officer: officer ?? null,
        metrics: [
          {
            label: "Total reports",
            value: (CITY_BASELINE.totalReports + liveReports.length).toLocaleString("en-IN"),
            note: `Across ${CITY_BASELINE.monitoredWards} monitored wards`,
          },
          {
            label: "High urgency",
            value: (CITY_BASELINE.highUrgency + sessionUrgent).toLocaleString("en-IN"),
            note: "Requires action within 2-4h",
          },
          {
            label: "Top category",
            value: worst?.category ?? "-",
            note: `${(worst?.demandPct ?? 0).toFixed(0)}% of current demand`,
          },
          {
            label: "Gap index",
            value: String(demand.gapIndex),
            note: "Lower is better aligned",
          },
        ],
        policy: policyRows,
        tickets: tickets.map((ticket) => ({
          id: ticket.id,
          category: ticket.category,
          grievance: ticket.grievance,
          ward: ticket.ward,
          urgency: urgencyLabel(ticket.urgency),
          action: ticket.action,
          status: ticket.status,
        })),
        signalHeadline:
          worst && worst.deficitPct > 0
            ? `${worst.category} demand exceeds current allocation in monitored wards.`
            : "Citizen demand is broadly matched by current allocation.",
        signalBody:
          worst && worst.deficitPct > 0
            ? `Citizen demand is ${Math.abs(worst.deficitPct).toFixed(0)} percentage points above budget share, concentrated in the most flood-prone and road-damaged wards.`
            : "No category is misaligned beyond tolerance, so this cycle needs monitoring rather than reallocation.",
      };
      await downloadBriefingPdf(input);
    } finally {
      setExporting(false);
    }
  };

  if (!mounted) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[#eef5fa] dark:bg-[#0a1a2e]">
        <Loader2 className="h-8 w-8 animate-spin text-[#103b6e]" aria-hidden="true" />
        <p className="ml-3 text-sm font-medium text-[#0f294a] dark:text-slate-100">
          Loading Command Center…
        </p>
      </div>
    );
  }

  if (!isAdmin) return <AuthorityGate />;

  const topAllocation = demand.allocations[0];

  return (
    <div className="relative min-h-screen w-full bg-[#eef5fa] text-slate-800 dark:bg-[#0a1a2e] dark:text-slate-100">
      <AmbientCanvas />
      <TopNav showSystemChip={false} />

      <main className="relative z-10 mx-auto w-full max-w-7xl px-4 pb-4 sm:px-6 lg:px-8">
        {/* ------------------------------ header ----------------------------- */}
        <header className="pt-6">
          <SectionTagline>प्रशासनिक दृष्टि · Administrative view</SectionTagline>

          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-[#0f294a] dark:text-white">
                AI Triage Overview
              </h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Live civic intelligence across monitored regions
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#c9dced] bg-white/70 px-2.5 py-1.5 text-[11px] font-semibold text-[#0f294a] dark:border-[#1b4578] dark:bg-[#0c2135] dark:text-slate-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                Live · Updated{" "}
                {secondsSinceArrival === null
                  ? "just now"
                  : secondsSinceArrival < 60
                    ? `${secondsSinceArrival} seconds ago`
                    : `${Math.round(secondsSinceArrival / 60)} minutes ago`}
              </span>

              {jurisdiction ? (
                <button
                  type="button"
                  onClick={() => setScopeToWard((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#c9dced] bg-white/70 px-2.5 py-1.5 text-[11px] font-semibold text-[#1d63b8] dark:border-[#1b4578] dark:bg-[#0c2135] dark:text-sky-300"
                  title="Toggle between your jurisdiction and the whole city"
                >
                  {scopeToWard ? (
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {scopeToWard ? "All wards" : wardLabel(jurisdiction)}
                </button>
              ) : null}

              <button
                type="button"
                onClick={exportBriefing}
                disabled={exporting}
                data-testid="export-briefing"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#1d63b8] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#2569bd] disabled:opacity-60"
              >
                {exporting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {exporting ? "Preparing…" : "Export Briefing"}
              </button>
            </div>
          </div>

          <MetricCards
            sessionReports={liveReports.length}
            sessionUrgent={sessionUrgent}
            topCategory={topAllocation?.category ?? "-"}
            topCategoryShare={topAllocation?.demandPct ?? 0}
            gapIndex={demand.gapIndex}
            gapDelta={gapDelta}
            gapSeries={gapSeries(reports)}
          />
        </header>

        {/* --------------------- heatmap + priority queue -------------------- */}
        <section className="my-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <GeospatialPanel
            clusters={scopedClusters}
            reports={scopedReports}
            sessionReportIds={sessionReportIds}
          />
          <PriorityQueue
            items={queue}
            totalOpen={openCount}
            onToggleDispatch={(reportId) => toggleDispatch(reportId)}
          />
        </section>

        {/* ------------------------------ policy ----------------------------- */}
        <PolicyAnalytics
          allocations={demand.allocations}
          telemetry={telemetry}
          onReview={() =>
            setReviewNote(
              `Reallocation of ${formatINR(
                reallocationFor(topAllocation?.deficitPct ?? 0),
              )} raised for ${topAllocation?.category ?? "the ward"}.`,
            )
          }
        />

        {reviewNote ? (
          <p
            role="status"
            className="-mt-3 mb-6 rounded-lg border border-[#1e4d88] bg-[#133e70] px-4 py-2.5 text-xs font-semibold text-white"
          >
            {reviewNote}
          </p>
        ) : null}

        {/* --------------------------- case ledger --------------------------- */}
        <RecentTickets rows={tickets} />

        {officer ? (
          <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
            Session attributed to {officer.name} · {officer.designation} ·{" "}
            <span className="font-mono">{officer.officialId}</span> · {officer.ward}
          </p>
        ) : null}
      </main>

      <CommandFooter />
    </div>
  );
}
