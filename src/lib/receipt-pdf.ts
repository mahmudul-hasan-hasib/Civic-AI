/* Official acknowledgement receipt, rendered to a real .pdf on the client.

   jsPDF is imported dynamically at call time so the library stays out of the
   initial route bundle. The layout mirrors the in-app receipt: navy masthead,
   tracking block, particulars grid, issue summary, allocation and SLA. */

import { formatCoordinate, slapolicyLabel, urgencyLabel, wardLabel } from "@/app/civic-shared";
import type { CivicReport } from "@/app/civic-shared";
import type { jsPDF } from "jspdf";

type Rgb = [number, number, number];

/* A4 portrait in points, matching jsPDF's own page geometry. */
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const LEADING = 13;
const LABEL_COLUMN = 150;

const NAVY: Rgb = [16, 59, 110];
const INK: Rgb = [15, 41, 74];
const MUTED: Rgb = [100, 116, 139];
const HAIRLINE: Rgb = [203, 213, 225];
const SOFT: Rgb = [241, 245, 249];
const EMERALD: Rgb = [4, 120, 87];
const AMBER: Rgb = [180, 83, 9];

/* The built-in fonts are WinAnsi-encoded, so Indic scripts (Bengali, Hindi,
   Tamil, Telugu) would render as missing-glyph boxes. Fold the typography we
   do use into ASCII, then drop whatever the font cannot represent. */
function pdfSafe(value: string): string {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u00b7\u2022]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[^\x20-\x7e\xa0-\xff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildReceiptPdf(doc: jsPDF, report: CivicReport, citizenName: string): void {
  const issuedAt = new Date(report.created_at);
  const deadline = new Date(issuedAt.getTime() + report.sla_hours * 3_600_000);
  const stamp = (value: Date) =>
    value.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

  doc.setProperties({
    title: `CivicLens Receipt ${report.tracking_id}`,
    subject: "Citizen Grievance Acknowledgement",
    author: "CivicLens AI Civic Intelligence Platform",
    creator: "CivicLens",
  });

  /* ------------------------------- masthead ----------------------------- */

  doc.setFillColor(...NAVY);
  doc.rect(0, 0, PAGE_WIDTH, 104, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("CIVICLENS  /  AI CIVIC INTELLIGENCE PLATFORM", MARGIN, 36);
  doc.setFontSize(15);
  doc.text("CITIZEN GRIEVANCE ACKNOWLEDGEMENT", MARGIN, 60);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(191, 211, 233);
  doc.text("Digital Public Infrastructure  |  Ward Civic Services", MARGIN, 78);

  doc.setFillColor(245, 158, 11);
  doc.rect(MARGIN, 88, 54, 4, "F");
  doc.setFillColor(255, 255, 255);
  doc.rect(MARGIN + 54, 88, 54, 4, "F");
  doc.setFillColor(16, 185, 129);
  doc.rect(MARGIN + 108, 88, 54, 4, "F");

  /* --------------------------- tracking block -------------------------- */

  doc.setFillColor(...SOFT);
  doc.roundedRect(MARGIN, 120, CONTENT_WIDTH, 60, 6, 6, "F");
  doc.setDrawColor(...HAIRLINE);
  doc.roundedRect(MARGIN, 120, CONTENT_WIDTH, 60, 6, 6, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text("TRACKING REFERENCE NUMBER", MARGIN + 16, 140);
  doc.setFontSize(18);
  doc.setTextColor(...NAVY);
  doc.text(`#${pdfSafe(report.tracking_id)}`, MARGIN + 16, 166);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text("REFERENCE HASH", PAGE_WIDTH - MARGIN - 16, 140, { align: "right" });
  doc.setFont("courier", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(`REF-${pdfSafe(report.reference_hash)}`, PAGE_WIDTH - MARGIN - 16, 158, {
    align: "right",
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text("STATUS: DISPATCHED - UNDER INVESTIGATION", PAGE_WIDTH - MARGIN - 16, 170, {
    align: "right",
  });

  /* ----------------------------- body helpers -------------------------- */

  let y = 212;
  let page = 1;

  /* Reserves room for the footer rule before starting a new page. */
  const continueIfNeeded = (reserve: number) => {
    if (y + reserve > PAGE_HEIGHT - 78) {
      page += 1;
      doc.addPage();
      y = 64;
    }
  };

  const sectionTitle = (title: string) => {
    continueIfNeeded(72);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...NAVY);
    doc.text(title.toUpperCase(), MARGIN, y);
    y += 7;
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(1);
    doc.line(MARGIN, y, MARGIN + 40, y);
    y += 18;
  };

  const fieldRow = (
    label: string,
    value: string,
    options: { mono?: boolean; tone?: Rgb } = {},
  ) => {
    continueIfNeeded(40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(label.toUpperCase(), MARGIN, y);
    doc.setFont(options.mono ? "courier" : "helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...(options.tone ?? INK));
    doc.text(pdfSafe(value), MARGIN + LABEL_COLUMN, y, {
      maxWidth: CONTENT_WIDTH - LABEL_COLUMN,
    });
    y += 5;
    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(0.6);
    doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
    y += 19;
  };

  const paragraph = (value: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    const lines = doc.splitTextToSize(pdfSafe(value), CONTENT_WIDTH) as string[];
    for (const line of lines) {
      continueIfNeeded(LEADING + 8);
      doc.text(line, MARGIN, y);
      y += LEADING;
    }
    y += 6;
  };

  /* ------------------------------- content ----------------------------- */

  sectionTitle("Filing particulars");
  fieldRow("Citizen name", citizenName);
  fieldRow("Submitted at", stamp(issuedAt));
  fieldRow("Grievance category", report.category);
  fieldRow("Urgency score", `${report.urgency_score} of 5 - ${urgencyLabel(report.urgency_score)}`, {
    tone: report.urgency_score >= 5 ? AMBER : EMERALD,
  });
  fieldRow("Ward", wardLabel(report.ward));
  fieldRow("Extracted locality", report.extracted_location);
  fieldRow("GPS coordinates", `${formatCoordinate(report.lat)}, ${formatCoordinate(report.lng)}`, {
    mono: true,
  });

  sectionTitle("Issue summary");
  paragraph(report.summary_en);

  sectionTitle("Allocation and service level");
  fieldRow("Allocated department", report.department);
  fieldRow("SLA policy", slapolicyLabel(report.urgency_score));
  fieldRow(
    "SLA target time",
    report.urgency_score >= 5
      ? "Emergency dispatch within 2 hours"
      : `Resolution by ${stamp(deadline)}`,
  );

  sectionTitle("Recommended civic action");
  paragraph(report.actionable_recommendation);

  /* -------------------------------- footer ----------------------------- */

  for (let index = 1; index <= page; index += 1) {
    doc.setPage(index);
    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(0.6);
    doc.line(MARGIN, PAGE_HEIGHT - 62, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 62);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(
      "Auto-generated by the CivicLens grievance triage service. Quote the tracking reference for any follow-up correspondence.",
      MARGIN,
      PAGE_HEIGHT - 46,
      { maxWidth: CONTENT_WIDTH - 70 },
    );
    doc.text(`Page ${index} of ${page}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 46, {
      align: "right",
    });
  }
}

export async function downloadReceiptPdf(
  report: CivicReport,
  citizenName: string,
): Promise<void> {
  const { jsPDF: JsPdf } = await import("jspdf");
  const doc = new JsPdf({ unit: "pt", format: "a4", orientation: "portrait" });
  buildReceiptPdf(doc, report, citizenName);
  doc.save(`CivicLens_Receipt_${pdfSafe(report.tracking_id)}.pdf`);
}
