/* Policy briefing, rendered to a real .pdf on the client.

   The "Export Briefing" control on the command center produces an A4 document
   that stands on its own: an attribution block naming the responsible officer
   and their employee code, the headline metrics, the budget-versus-demand
   table and the open case list. jsPDF is imported dynamically at call time so
   the library stays out of the initial route bundle. */

import type { Officer } from "@/context/AuthContext";
import type { jsPDF } from "jspdf";

import { pdfSafe } from "@/lib/pdf-text";

type Rgb = [number, number, number];

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const NAVY: Rgb = [19, 62, 112];
const INK: Rgb = [15, 41, 74];
const MUTED: Rgb = [100, 116, 139];
const HAIRLINE: Rgb = [203, 213, 225];
const SOFT: Rgb = [241, 245, 249];
const ALERT: Rgb = [185, 28, 28];

export type BriefingMetric = { label: string; value: string; note: string };
export type BriefingPolicyRow = {
  category: string;
  demandPct: number;
  budgetPct: number;
  gapPct: number;
  recommendation: string;
};
export type BriefingTicket = {
  id: string;
  category: string;
  grievance: string;
  ward: string;
  urgency: string;
  action: string;
  status: string;
};

export type BriefingInput = {
  officer: Officer | null;
  metrics: BriefingMetric[];
  policy: BriefingPolicyRow[];
  tickets: BriefingTicket[];
  signalHeadline: string;
  signalBody: string;
};

function setFill(doc: jsPDF, color: Rgb) {
  doc.setFillColor(color[0], color[1], color[2]);
}
function setStroke(doc: jsPDF, color: Rgb) {
  doc.setDrawColor(color[0], color[1], color[2]);
}
function setInk(doc: jsPDF, color: Rgb) {
  doc.setTextColor(color[0], color[1], color[2]);
}

function sectionHeading(doc: jsPDF, text: string, y: number): number {
  setFill(doc, NAVY);
  doc.rect(MARGIN, y - 12, CONTENT_WIDTH, 18, "F");
  setInk(doc, [255, 255, 255]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(pdfSafe(text).toUpperCase(), MARGIN + 8, y + 1);
  return y + 22;
}

function wrap(doc: jsPDF, text: string, x: number, y: number, width: number, size: number) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(size);
  const lines = doc.splitTextToSize(pdfSafe(text), width) as string[];
  doc.text(lines, x, y);
  return y + lines.length * (size + 3);
}

function buildBriefingPdf(doc: jsPDF, input: BriefingInput): void {
  const issued = new Date();

  /* Masthead + attribution */
  setFill(doc, NAVY);
  doc.rect(0, 0, PAGE_WIDTH, 104, "F");
  setInk(doc, [255, 255, 255]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("CivicLens Policy Briefing", MARGIN, 44);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    "AI TRIAGE OVERVIEW - MUNICIPAL COMMAND CENTER",
    MARGIN,
    60,
  );
  const attribution = input.officer
    ? `${input.officer.name} / ${input.officer.designation} / ${input.officer.officialId} / ${input.officer.ward}`
    : "Issued without an authenticated officer account";
  doc.text(
    `Issued ${pdfSafe(issued.toISOString().slice(0, 16).replace("T", " "))} UTC`,
    MARGIN,
    76,
  );
  doc.text(pdfSafe(attribution), MARGIN, 88);

  let y = 132;

  /* Headline metrics */
  y = sectionHeading(doc, "Headline metrics", y);
  const cardWidth = (CONTENT_WIDTH - 12) / 2;
  input.metrics.forEach((metric, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = MARGIN + col * (cardWidth + 12);
    const top = y + row * 46;
    setFill(doc, SOFT);
    setStroke(doc, HAIRLINE);
    doc.roundedRect(x, top, cardWidth, 38, 4, 4, "FD");
    setInk(doc, MUTED);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(pdfSafe(metric.label).toUpperCase(), x + 10, top + 13);
    setInk(doc, INK);
    doc.setFontSize(15);
    doc.text(pdfSafe(metric.value), x + 10, top + 29);
    setInk(doc, MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(pdfSafe(metric.note).slice(0, 46), x + 10 + doc.getTextWidth(pdfSafe(metric.value)) + 10, top + 29);
  });
  y += Math.ceil(input.metrics.length / 2) * 46 + 14;

  /* AI policy signal */
  y = sectionHeading(doc, "AI-generated policy signal", y);
  setFill(doc, [13, 46, 85]);
  setStroke(doc, HAIRLINE);
  doc.roundedRect(MARGIN, y - 4, CONTENT_WIDTH, 52, 4, 4, "FD");
  setInk(doc, INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(pdfSafe(input.signalHeadline), MARGIN + 10, y + 12);
  y = wrap(doc, input.signalBody, MARGIN + 10, y + 26, CONTENT_WIDTH - 20, 8.5);
  y += 20;

  /* Budget vs demand */
  y = sectionHeading(doc, "Municipal budget vs citizen demand - FY 2025-26", y);
  const columns = [
    { title: "CATEGORY", x: MARGIN + 8, width: 150 },
    { title: "DEMAND", x: MARGIN + 168, width: 46 },
    { title: "BUDGET", x: MARGIN + 220, width: 46 },
    { title: "GAP", x: MARGIN + 272, width: 40 },
    { title: "RECOMMENDATION", x: MARGIN + 320, width: CONTENT_WIDTH - 328 },
  ];
  setFill(doc, SOFT);
  doc.rect(MARGIN, y - 10, CONTENT_WIDTH, 16, "F");
  setInk(doc, MUTED);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  for (const column of columns) {
    doc.text(column.title, column.x, y);
  }
  y += 12;

  input.policy.forEach((row) => {
    setInk(doc, INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(pdfSafe(row.category), columns[0].x, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`${row.demandPct.toFixed(0)}%`, columns[1].x, y);
    doc.text(`${row.budgetPct.toFixed(0)}%`, columns[2].x, y);
    setInk(doc, row.gapPct > 0 ? ALERT : MUTED);
    doc.setFont("helvetica", "bold");
    doc.text(`${row.gapPct > 0 ? "+" : ""}${row.gapPct.toFixed(0)}%`, columns[3].x, y);
    setInk(doc, MUTED);
    doc.setFont("helvetica", "normal");
    doc.text(pdfSafe(row.recommendation).slice(0, 42), columns[4].x, y);
    setStroke(doc, HAIRLINE);
    doc.line(MARGIN, y + 4, PAGE_WIDTH - MARGIN, y + 4);
    y += 16;
  });
  y += 18;

  /* Open cases */
  y = sectionHeading(doc, "Recent case management", y);
  input.tickets.forEach((ticket) => {
    setInk(doc, INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(pdfSafe(ticket.id), MARGIN + 8, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`${pdfSafe(ticket.category)} - ${pdfSafe(ticket.ward)}`, MARGIN + 66, y);
    setInk(doc, ticket.urgency.toLowerCase() === "critical" ? ALERT : MUTED);
    doc.text(pdfSafe(ticket.urgency).toUpperCase(), MARGIN + 250, y);
    setInk(doc, INK);
    doc.text(pdfSafe(ticket.action).slice(0, 40), MARGIN + 310, y);
    setInk(doc, MUTED);
    doc.text(pdfSafe(ticket.status), MARGIN + 420, y);
    setStroke(doc, HAIRLINE);
    doc.line(MARGIN, y + 4, PAGE_WIDTH - MARGIN, y + 4);
    y += 15;
  });

  /* Footer */
  setInk(doc, MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(
    pdfSafe(
      `CivicLens / Digital Public Infrastructure for civic intelligence / Designed for public service - ${issued.getFullYear()}`,
    ),
    MARGIN,
    PAGE_HEIGHT - 28,
  );
  doc.text("Page 1", PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 28, { align: "right" });
}

export async function downloadBriefingPdf(input: BriefingInput): Promise<void> {
  const { jsPDF: JsPdf } = await import("jspdf");
  const doc = new JsPdf({ unit: "pt", format: "a4" });
  buildBriefingPdf(doc, input);
  const officer = input.officer ? pdfSafe(input.officer.officialId) : "unsigned";
  doc.save(`CivicLens-Briefing-${officer}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
