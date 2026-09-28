"use client";

/* Submission confirmation receipt for the citizen portal.

   Shows the tracking reference, target municipal wing, estimated SLA and the
   urgency rating, and exports a real .pdf acknowledgement via @/lib/receipt-pdf. */

import { useEffect, useState } from "react";
import {
  BadgeCheck,
  Building,
  Check,
  Clock,
  Copy,
  FileDown,
  FileText,
  Fingerprint,
  Languages,
  Loader2,
  MapPin,
  ScrollText,
  ShieldAlert,
} from "lucide-react";

import {
  formatCoordinate,
  slapolicyLabel,
  urgencyLabel,
  wardLabel,
} from "@/app/civic-shared";
import type { CivicReport } from "@/app/civic-shared";
import { CategoryBadge, RelativeTime, TricolorRule, UrgencyBadge, UrgencyMeter } from "@/components/civic-ui";
import { downloadReceiptPdf } from "@/lib/receipt-pdf";

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
      <span className="tabular-nums text-civic-ink" suppressHydrationWarning>
        --h --m --s
      </span>
    );
  }

  const totalSeconds = Math.floor(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (remaining <= 0) {
    return <span className="text-rose-700 dark:text-rose-400">SLA EXPIRED</span>;
  }
  return (
    <span className="tabular-nums text-civic-ink">
      {hours}h {minutes}m {seconds}s
    </span>
  );
}

export default function ReceiptCard({
  report,
  citizenName,
}: {
  report: CivicReport;
  citizenName: string;
}) {
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
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

  const exportPdf = async () => {
    setExporting(true);
    try {
      await downloadReceiptPdf(report, citizenName);
    } catch {
      /* A blocked download or a failed dynamic import must not break the page. */
    } finally {
      setExporting(false);
    }
  };

  return (
    <section
      aria-live="polite"
      data-testid="receipt-card"
      className="civic-panel relative flex flex-col gap-5 overflow-hidden p-5 sm:p-6"
    >
      <TricolorRule />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-civic-blue">
            <ScrollText className="h-3.5 w-3.5" aria-hidden="true" />
            Citizen Transparency Card
          </p>
          <p className="mt-1 text-sm font-semibold text-civic-ink">
            Tracking Ref:{" "}
            <span className="tabular-nums text-civic-blue">#{report.tracking_id}</span>
          </p>
          <p className="mt-0.5 text-xs text-civic-muted">
            Filed to the {wardLabel(report.ward)} queue and routed to the ward desk.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-300 ring-1 ring-emerald-400/25">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Dispatched · Under Investigation
          </span>
          <RelativeTime value={report.created_at} />
        </div>
      </header>

      {report.is_fallback ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-600 dark:text-amber-300">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Analysed by the Resilient Fail-Safe redressal engine — the Gemini model cascade was
          unavailable at submission time.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 rounded-xl border border-civic-line bg-civic-soft p-3.5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-civic-muted">
            <Building className="h-3 w-3" aria-hidden="true" />
            Target municipal wing
          </p>
          <p className="text-xs font-medium leading-relaxed text-civic-ink">
            {report.department}
          </p>
          <p className="text-[11px] text-civic-muted">
            Routed to {wardLabel(report.ward)} · {report.category}
          </p>
        </div>
        <div className="flex flex-col gap-1.5 rounded-xl border border-civic-line bg-civic-soft p-3.5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-civic-muted">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {slapolicyLabel(report.urgency_score)}
          </p>
          <p className="text-sm font-semibold text-civic-ink">
            <SlaCountdown deadline={deadlineMs} />
          </p>
          {report.urgency_score >= 5 ? (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-400">
              Emergency Dispatch SLA: 2 - 4 Hours
              <span className="mt-0.5 block font-normal normal-case text-civic-muted">
                Dispatch committed within {report.sla_hours} hours
              </span>
            </p>
          ) : (
            <p className="text-[11px] tabular-nums text-civic-muted">
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
        <span className="inline-flex items-center gap-2 rounded-lg border border-civic-line bg-civic-soft px-3 py-2 text-xs font-semibold tabular-nums text-civic-ink">
          <Fingerprint className="h-3.5 w-3.5 text-civic-blue" aria-hidden="true" />
          REF-{report.reference_hash}
        </span>
        <button
          type="button"
          onClick={copyReference}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-civic-line bg-civic-soft px-3 py-2 text-[11px] font-semibold text-civic-ink transition hover:border-civic-blue hover:text-civic-blue focus:outline-none focus:ring-2 focus:ring-civic-blue/25"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300" aria-hidden="true" />
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
          onClick={exportPdf}
          disabled={exporting}
          aria-label="Download PDF receipt"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-civic-blue px-3 py-2 text-[11px] font-semibold text-white shadow-sm transition hover:bg-civic-navy focus:outline-none focus:ring-2 focus:ring-civic-blue/25 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {exporting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Preparing PDF
            </>
          ) : (
            <>
              <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
              Download PDF receipt
            </>
          )}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <CategoryBadge category={report.category} />
        <UrgencyBadge score={report.urgency_score} />
        <span className="inline-flex items-center gap-1.5 rounded-full border border-civic-line bg-civic-soft px-2.5 py-1 text-[11px] font-medium text-civic-ink">
          <MapPin className="h-3 w-3" aria-hidden="true" />
          {report.extracted_location}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-civic-ink">Urgency rating</span>
          <span className="tabular-nums text-civic-muted">
            {report.urgency_score} / 5 · {urgencyLabel(report.urgency_score)}
          </span>
        </div>
        <UrgencyMeter score={report.urgency_score} className="gap-1.5 [&>span]:h-2.5 [&>span]:w-full" />
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-civic-muted">
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          English summary
        </p>
        <p className="text-sm leading-relaxed text-civic-ink">{report.summary_en}</p>
      </div>

      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-300">
          <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
          Recommended civic action
        </p>
        <p className="mt-2 text-sm leading-relaxed text-emerald-700 dark:text-emerald-200">
          {report.actionable_recommendation}
        </p>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-civic-line pt-4">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-civic-muted">
          <Languages className="h-3.5 w-3.5" aria-hidden="true" />
          Original submission
        </p>
        <p className="text-xs leading-relaxed text-civic-muted">{report.input_text}</p>
        <p className="text-[11px] tabular-nums text-civic-muted/80">
          Geotagged at {formatCoordinate(report.lat)}, {formatCoordinate(report.lng)} ·{" "}
          {wardLabel(report.ward)}
        </p>
      </div>
    </section>
  );
}
