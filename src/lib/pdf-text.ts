/* Shared text sanitiser for the client-side PDF exports.
   The built-in jsPDF fonts are WinAnsi-encoded, so Indic scripts (Bengali,
   Hindi, Tamil, Telugu) and Devanagari headings would render as missing-glyph
   boxes. Fold the typography we do use into ASCII, then drop whatever the font
   cannot represent. */

export function pdfSafe(value: string): string {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u00b7\u2022]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[^\x20-\x7e\xa0-\xff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
