import { ApiError, GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";

const MODEL_CASCADE = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
] as const;

const DEFAULT_LAT = 23.8103;
const DEFAULT_LNG = 90.4125;
const ATTEMPT_TIMEOUT_MS = 40_000;
const MAX_INPUT_LENGTH = 4000;
const FALLBACK_CATEGORY = "Sanitation / Civic Maintenance";
const FALLBACK_LOCATION = "Reported Region / Local Ward";

const CRITICAL_TRIGGERS = [
  "broken",
  "danger",
  "dangerous",
  "flood",
  "flooding",
  "fire",
  "emergency",
  "accidental",
  "severe",
  "collapse",
  "crash",
  "injury",
  "ভেঙে",
  "পানি",
  "বিপদ",
  "জরুরি",
  "আগুন",
  "বন্যা",
  "ভয়াবহ",
  "ধস",
  "দুর্ঘটনা",
];

const MODERATE_TRIGGERS = [
  "leak",
  "pothole",
  "water",
  "pipe",
  "drain",
  "power",
  "road",
  "issue",
  "problem",
  "সমস্যা",
  "গর্ত",
  "ড্রেন",
  "বিদ্যুৎ",
  "রাস্তা",
  "লিক",
];

const CATEGORY_RULES: { category: string; keywords: string[] }[] = [
  {
    category: "Roads & Transport",
    keywords: ["road", "pothole", "traffic", "lane", "bridge", "রাস্তা", "গর্ত", "যানজট", "সড়ক"],
  },
  {
    category: "Water Supply",
    keywords: ["water", "pipe", "leak", "pipeline", "tank", "পানি", "পাইপ", "লিক", "সরবরাহ"],
  },
  {
    category: "Drainage",
    keywords: ["drain", "waterlogging", "sewer", "ড্রেন", "জলাবদ্ধতা", "নর্দমা"],
  },
  {
    category: "Electricity",
    keywords: ["power", "wire", "current", "shock", "outage", "বিদ্যুৎ", "তার", "কারেন্ট", "লোডশেডিং"],
  },
];

const LOCATION_PATTERNS: { re: RegExp; label: (match: RegExpExecArray) => string }[] = [
  {
    re: /(?:ওয়ার্ড|ওয়ারড|ward)\s*(?:নং|no\.?|#)?\s*(\d+)/i,
    label: (match) => `Ward ${match[1]}`,
  },
  {
    re: /(?:সেক্টর|sector)\s*(\d+)/i,
    label: (match) => `Sector ${match[1]}`,
  },
  {
    re: /(?:ব্লক|block)\s+([a-z0-9]+)/i,
    label: (match) => `Block ${match[1].toUpperCase()}`,
  },
  {
    re: /(?:রোড|road|সড়ক|সড়ক)\s*(?:নং|no\.?)?\s*([a-z]*\d+[a-z-]*)/i,
    label: (match) => `Road ${match[1]}`,
  },
];

const NEAR_RE =
  /(?:\bnear\b|\bbeside\b|\bat\b|\bpast\b|পাশে|মোড়ে|মোড়|সামনে|উল্টো)\s+([^,.।\n]{2,80})/i;

const AREA_RE =
  /(?:এলাকা|মহল্লা|থানা|upazila|thana)\s*[:\- ]+\s*([^,.।\n]{2,80})/i;

type AnalyzedResult = {
  category: string;
  urgency_score: number;
  summary_en: string;
  extracted_location: string;
  actionable_recommendation: string;
  lat: number;
  lng: number;
  created_at: string;
  is_fallback: boolean;
};

function toFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function clampUrgency(value: number, fallback = 2): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(5, Math.max(1, Math.round(value)));
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function ok(result: AnalyzedResult): NextResponse {
  return NextResponse.json({ success: true, data: result }, { status: 200 });
}

function describeError(error: unknown): string {
  let parts = "";
  if (error instanceof ApiError) {
    parts = `status=${error.status}`;
  } else if (error && typeof error === "object") {
    const record = error as { status?: unknown; response?: { status?: unknown }; code?: unknown };
    const status = record.status ?? record.response?.status;
    if (typeof status === "number") parts = `status=${status}`;
    if (typeof record.code === "string" && record.code.length > 0) {
      parts = parts ? `${parts} code=${record.code}` : `code=${record.code}`;
    }
  }
  const message = error instanceof Error ? error.message : JSON.stringify(error);
  return parts ? `${parts} ${message}` : message ?? "unknown error";
}

function buildPrompt(inputText: string, lat: number, lng: number): string {
  return `You are a civic intelligence agent for public governance. Analyze this citizen complaint submitted in a regional or local language (e.g. Bengali, Hindi, or English).
Translate it to clear English, extract the category, determine the urgency score (1 to 5), summarize the key issue, and suggest an immediate administrative action.

Citizen Input: "${inputText}"
Provided Coordinates: Lat ${lat}, Lng ${lng}`;
}

async function attemptWithModel(
  ai: GoogleGenAI,
  model: string,
  prompt: string,
  inputText: string,
  lat: number,
  lng: number,
): Promise<AnalyzedResult> {
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          category: {
            type: Type.STRING,
            description:
              "Category: 'Roads & Transport', 'Water Supply', 'Drainage', 'Electricity', or 'Sanitation / Civic Maintenance'",
          },
          urgency_score: {
            type: Type.INTEGER,
            description: "Urgency scale from 1 (minor issue) to 5 (critical/life-threatening emergency)",
          },
          summary_en: {
            type: Type.STRING,
            description: "Concise summary in English",
          },
          extracted_location: {
            type: Type.STRING,
            description: "Area, landmark, ward, or neighborhood mentioned in the text",
          },
          actionable_recommendation: {
            type: Type.STRING,
            description: "Recommended operational action for the civic authorities",
          },
        },
        required: [
          "category",
          "urgency_score",
          "summary_en",
          "extracted_location",
          "actionable_recommendation",
        ],
      },
      maxOutputTokens: 1200,
      abortSignal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
    },
  });

  return normalizeGeminiResult(response.text ?? "{}", inputText, lat, lng);
}

function normalizeGeminiResult(
  rawText: string,
  inputText: string,
  lat: number,
  lng: number,
): AnalyzedResult {
  let record: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(rawText) as unknown;
    if (parsed && typeof parsed === "object") record = parsed as Record<string, unknown>;
  } catch {
    record = {};
  }

  const category = cleanText(record.category) ?? FALLBACK_CATEGORY;
  const urgency = clampUrgency(toFiniteNumber(record.urgency_score, 2));
  const location = cleanText(record.extracted_location) ?? FALLBACK_LOCATION;
  const summary = cleanText(record.summary_en) ?? (inputText.trim() || category);
  const action =
    cleanText(record.actionable_recommendation) ?? compileAction(category, urgency, location);

  return {
    category,
    urgency_score: urgency,
    summary_en: summary,
    extracted_location: location,
    actionable_recommendation: action,
    lat,
    lng,
    created_at: new Date().toISOString(),
    is_fallback: false,
  };
}

function inferCategory(haystack: string): string {
  let best = { category: FALLBACK_CATEGORY, hits: 0 };
  for (const rule of CATEGORY_RULES) {
    const hits = rule.keywords.reduce(
      (count, keyword) => (haystack.includes(keyword) ? count + 1 : count),
      0,
    );
    if (hits > best.hits) best = { category: rule.category, hits };
  }
  return best.category;
}

function inferUrgency(haystack: string): number {
  const criticalHits = CRITICAL_TRIGGERS.filter((trigger) => haystack.includes(trigger));
  if (criticalHits.length >= 2) return 5;
  if (criticalHits.length === 1) return 4;
  const moderateHits = MODERATE_TRIGGERS.filter((trigger) => haystack.includes(trigger));
  return moderateHits.length > 0 ? 3 : 2;
}

function inferLocation(text: string): string {
  const parts: string[] = [];
  for (const pattern of LOCATION_PATTERNS) {
    const match = pattern.re.exec(text);
    if (match && match[1]) parts.push(pattern.label(match));
  }
  const near = NEAR_RE.exec(text);
  if (near && near[1]) parts.push(near[1].trim());
  const area = AREA_RE.exec(text);
  if (area && area[1]) parts.push(area[1].trim());

  const unique = Array.from(
    new Set(parts.map((part) => part.replace(/\s+/g, " ").trim())),
  ).filter(Boolean);
  return unique.length > 0 ? unique.slice(0, 3).join(", ") : FALLBACK_LOCATION;
}

function compileAction(category: string, urgency: number, location: string): string {
  if (urgency >= 5) {
    return `Immediate emergency dispatch for ${location}: deploy a ${category} rescue and repair unit and alert the ward control room within 30 minutes.`;
  }
  if (urgency === 4) {
    return `Urgent civic dispatch for ${location}: deploy a ${category} inspection and repair crew within 24 hours and cordon off the affected site.`;
  }
  return `Routine civic dispatch for ${location}: schedule a ${category} inspection and repair crew within 72 hours and notify the ward supervisor.`;
}

function heuristicAnalyze(inputText: string, lat: number, lng: number): AnalyzedResult {
  const haystack = inputText.toLowerCase();
  const category = inferCategory(haystack);
  const urgency = inferUrgency(haystack);
  const location = inferLocation(inputText);

  return {
    category,
    urgency_score: urgency,
    summary_en: `[Heuristic Fallback Redressal]: Citizen issue regarding ${category}`,
    extracted_location: location,
    actionable_recommendation: compileAction(category, urgency, location),
    lat,
    lng,
    created_at: new Date().toISOString(),
    is_fallback: true,
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  let inputText = "";
  let lat = DEFAULT_LAT;
  let lng = DEFAULT_LNG;

  try {
    const body = (await request.json()) as {
      input_text?: unknown;
      lat?: unknown;
      lng?: unknown;
    } | null;
    const rawText = cleanText(body?.input_text);
    if (rawText) inputText = rawText.slice(0, MAX_INPUT_LENGTH);
    lat = toFiniteNumber(body?.lat, DEFAULT_LAT);
    lng = toFiniteNumber(body?.lng, DEFAULT_LNG);
  } catch (error) {
    console.warn(`[CivicAnalyze] Malformed request body: ${describeError(error)}`);
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || !inputText) {
      console.warn(
        inputText
          ? "[CivicAnalyze] GEMINI_API_KEY not set — using heuristic fallback."
          : "[CivicAnalyze] Empty input — returning heuristic fallback.",
      );
      return ok(heuristicAnalyze(inputText, lat, lng));
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = buildPrompt(inputText, lat, lng);

    for (const model of MODEL_CASCADE) {
      try {
        return ok(await attemptWithModel(ai, model, prompt, inputText, lat, lng));
      } catch (error) {
        console.warn(`[CivicAnalyze] Model ${model} failed (${describeError(error)}); trying next.`);
      }
    }

    console.error("[CivicAnalyze] All Gemini models failed — using heuristic fallback.");
  } catch (error) {
    console.error(`[CivicAnalyze] Gemini client error — using heuristic fallback: ${describeError(error)}`);
  }

  return ok(heuristicAnalyze(inputText, lat, lng));
}