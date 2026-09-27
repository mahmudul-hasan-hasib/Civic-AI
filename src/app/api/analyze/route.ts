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
const FALLBACK_CATEGORY = "Sanitation";
const FALLBACK_LOCATION = "Reported Region / Local Ward";

const HAZARD_CATEGORY = "Hazardous Infrastructure & Grid Emergency";
const HAZARD_DEPARTMENT = "State DISCOM / Power Emergency Cell";

const SYSTEM_INSTRUCTION = `You are a SENIOR MUNICIPAL PUBLIC TRIAGE AUTHORITY. You receive citizen grievances written in Hindi, Bengali, Hinglish, or English (often romanised or with spelling errors). You translate them into clear English, classify the service category, and score urgency for emergency dispatch.

You never discount a life-safety hazard. A single mention of sparking electrical equipment, a live wire, an electrocution risk, or an imminent threat to life is ALWAYS an immediate emergency.

STRICT SCORING CALIBRATION RUBRIC (assign urgency_score exactly on this scale):
- 5 (CRITICAL EMERGENCY / HAZARD): Active electrical fires, sparking transformers ("ट्रांसफॉर्मर में स्पार्किंग", "चिंगारियां"), live wires touching ground or water ("পানির উপর তার", "करंट"), gas leaks, structural or drain collapse with trapped victims, or open manholes on high-speed roads.
- 4 (HIGH PRIORITY / SEVERE DISRUPTION): Major water mains bursts flooding thoroughfares, district-wide blackouts, blocked arterial roads.
- 3 (MODERATE): Potholes, overflowing community waste bins, unlit neighbourhood streets.
- 1-2 (LOW / ROUTINE): Faded road markings, scheduled park trimming, non-hazardous cosmetic repairs.

MANDATORY POLICY: Any mention of sparking electrical equipment, electrocution risk, live wires, or imminent threat to life MUST receive an urgency_score of strictly 5 and the category "Hazardous Infrastructure & Grid Emergency".

RULES:
- "category" must be exactly one of: "Hazardous Infrastructure & Grid Emergency", "Water Supply", "Drainage", "Roads & Transport", "Sanitation", "Electricity / Lighting".
- "urgency_score" must be an integer from 1 to 5 per the rubric. Do not round a 5 down to 2-4.
- "summary_en" is a clear, actionable English summary of the complaint.
- "extracted_location" is the neighbourhood, ward, sector, or landmark mentioned; if none, write "Reported Region / Local Ward".
- "actionable_recommendation" is a single immediate dispatch instruction naming the crew/equipment and timeframe.
- "assigned_department" is the dispatch unit: "State DISCOM / Power Emergency Cell" for grid/hazard, "Municipal Jal Board" for water, "City Drainage Division" for drainage, "PWD Road Infrastructure Wing" for roads, "City Power Distribution Unit" for lighting/power, "Municipal Cleansing & Sanitation Wing" for waste.`;

const CRITICAL_HAZARD_RE =
  /(स्पार्किंग|चिंगारियां|ट्रांसफॉर्मर|करंट|तार टूट|আগ|বিদ্যুৎ|ছিঁড়ে|পানি|বিপদ|spark|transformer|electrocution|wire|fire|blast)/i;

const HARD_HAZARD_TERMS = [
  "स्पार्किंग",
  "चिंगारियां",
  "ट्रांसफॉर्मर",
  "करंट",
  "तार टूट",
  "আগুন",
  "spark",
  "transformer",
  "electrocution",
  "wire",
  "fire",
  "blast",
  "short circuit",
];

const HAZARD_COMBO_TERMS = ["তার", "বিদ্যুৎ", "ছিঁড়ে", "পানি", "पानी", "বিপদ"];

const CRITICAL_TRIGGERS = [
  "burst",
  "blocked",
  "blackout",
  "outage",
  "load shedding",
  "লোডশেডিং",
  "ব্ল্যাকআউট",
  "ফেটে",
  "অবরুদ্ধ",
  "danger",
  "dangerous",
  "flood",
  "flooding",
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
  "streetlight",
  "overflow",
  "garbage",
  "waste",
  "bin",
  "আলো",
  "আবর্জনা",
  "সমস্যা",
  "গর্ত",
  "ড্রেন",
  "বিদ্যুৎ",
  "রাস্তা",
  "লিক",
];

const ROUTINE_TRIGGERS = [
  "fade",
  "faded",
  "fading",
  "cosmetic",
  "paint",
  "painting",
  "marking",
  "trimming",
  "trim",
  "garden",
  "landscaping",
  "scheduled maintenance",
  "routine",
  "no hazard",
  "khatra nahi",
  "সাজানো",
  "সাজসজ্জা",
];

const CATEGORY_RULES: { category: string; keywords: string[] }[] = [
  {
    category: "Roads & Transport",
    keywords: ["road", "pothole", "traffic", "lane", "bridge", "রাস্তা", "গর্ত", "যানজট", "সড়ক"],
  },
  {
    category: "Water Supply",
    keywords: ["water", "pipe", "leak", "pipeline", "tank", "পানি", "पानी", "পাইপ", "লিক", "সরবরাহ"],
  },
  {
    category: "Drainage",
    keywords: ["drain", "waterlogging", "sewer", "ড্রেন", "জলাবদ্ধতা", "নর্দমা"],
  },
  {
    category: "Electricity / Lighting",
    keywords: ["power", "wire", "current", "shock", "outage", "বিদ্যুৎ", "তার", "করেন্ট", "কারেন্ট", "লোডশেডিং", "লাইট"],
  },
];

const DEPARTMENT_BY_CATEGORY: { match: string; department: string }[] = [
  { match: "hazard", department: HAZARD_DEPARTMENT },
  { match: "grid", department: HAZARD_DEPARTMENT },
  { match: "water", department: "Municipal Jal Board" },
  { match: "drain", department: "City Drainage Division" },
  { match: "road", department: "PWD Road Infrastructure Wing" },
  { match: "power", department: "City Power Distribution Unit" },
  { match: "light", department: "City Power Distribution Unit" },
  { match: "electric", department: "City Power Distribution Unit" },
  { match: "sanit", department: "Municipal Cleansing & Sanitation Wing" },
  { match: "waste", department: "Municipal Cleansing & Sanitation Wing" },
];

const FALLBACK_DEPARTMENT = "Municipal Ward Control Desk";

const LOCATION_PATTERNS: { re: RegExp; label: (match: RegExpExecArray) => string }[] = [
  {
    re: /(?:ওয়ার্ড|ওয়ার্ড|ward|वार्ड)\s*(?:নং|no\.?|#)?\s*(\d+)/i,
    label: (match) => `Ward ${match[1]}`,
  },
  {
    re: /(?:সেক্টর|sector|सेक्टर)\s*(\d+)/i,
    label: (match) => `Sector ${match[1]}`,
  },
  {
    re: /(?:ব্লক|block)\s+([a-z0-9]+)/i,
    label: (match) => `Block ${match[1].toUpperCase()}`,
  },
  {
    re: /(?:রোড|road|সড়ক|रोड)\s*(?:নং|no\.?)?\s*([a-z0-9]*\d+[a-z-]*)/i,
    label: (match) => `Road ${match[1]}`,
  },
  {
    re: /([a-z]{3,20})\s+(?:nagar|colony|market|bazaar|park|চর|বাজার|পার্ক)/i,
    label: (match) => `${match[1]} ${match[0].split(/\s+/)[1]}`,
  },
];

const NEAR_RE =
  /(?:\bnear\b|\bbeside\b|\bat\b|\bpast\b|पासে|नज़दीक|পাশে|মোড়ে|মোড়|সামনে|উল্টো)\s+([^,.।\n]{2,80})/i;

const AREA_RE =
  /(?:এলাকা|मोहल्ला|मोहल्ला|মহল্লা|থানा|upazila|thana)\s*[:\- ]+\s*([^,.।\n]{2,80})/i;

type AnalyzedResult = {
  category: string;
  urgency_score: number;
  summary_en: string;
  extracted_location: string;
  actionable_recommendation: string;
  assigned_department: string;
  lat: number;
  lng: number;
  created_at: string;
  is_fallback: boolean;
  latency_ms: number;
  confidence: number;
};

function toFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function clampUrgency(value: unknown, fallback = 2): number {
  return Math.min(5, Math.max(1, Math.round(toFiniteNumber(value, fallback))));
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

function isCriticalHazard(haystack: string): boolean {
  if (!CRITICAL_HAZARD_RE.test(haystack)) return false;
  if (HARD_HAZARD_TERMS.some((term) => haystack.includes(term))) return true;
  return HAZARD_COMBO_TERMS.filter((term) => haystack.includes(term)).length >= 2;
}

function compileDepartment(category: string): string {
  const haystack = category.toLowerCase();
  const match = DEPARTMENT_BY_CATEGORY.find((row) => haystack.includes(row.match));
  return match ? match.department : FALLBACK_DEPARTMENT;
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
  if (isCriticalHazard(haystack)) return 5;
  const criticalHits = CRITICAL_TRIGGERS.filter((trigger) => haystack.includes(trigger));
  if (criticalHits.length >= 2) return 5;
  if (criticalHits.length === 1) return 4;
  const moderateHits = MODERATE_TRIGGERS.filter((trigger) => haystack.includes(trigger));
  if (moderateHits.length === 0) return 2;
  const routineHits = ROUTINE_TRIGGERS.filter((trigger) => haystack.includes(trigger));
  return routineHits.length > 0 ? 2 : 3;
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
    return `Immediate emergency dispatch for ${location}: deploy a ${category} rescue and repair unit and alert the ward control room within 2 hours.`;
  }
  if (urgency === 4) {
    return `Priority dispatch for ${location}: deploy a ${category} inspection and repair crew within 12 hours and cordon off the affected site.`;
  }
  if (urgency === 3) {
    return `Standard operational response for ${location}: schedule a ${category} inspection and repair crew within 48 hours.`;
  }
  return `Routine maintenance for ${location}: schedule a ${category} inspection and repair crew within 72 to 120 hours and notify the ward supervisor.`;
}

function heuristicAnalyze(inputText: string, lat: number, lng: number, latencyMs: number): AnalyzedResult {
  const haystack = inputText.toLowerCase();
  const hazard = isCriticalHazard(haystack);
  const category = hazard ? HAZARD_CATEGORY : inferCategory(haystack);
  const urgency = inferUrgency(haystack);
  const location = inferLocation(inputText);
  const assigned_department = hazard ? HAZARD_DEPARTMENT : compileDepartment(category);

  const signals =
    CRITICAL_TRIGGERS.filter((trigger) => haystack.includes(trigger)).length +
    MODERATE_TRIGGERS.filter((trigger) => haystack.includes(trigger)).length +
    HARD_HAZARD_TERMS.filter((trigger) => haystack.includes(trigger)).length +
    HAZARD_COMBO_TERMS.filter((trigger) => haystack.includes(trigger)).length +
    (category !== FALLBACK_CATEGORY ? 1 : 0) +
    (location !== FALLBACK_LOCATION ? 1 : 0) +
    (inputText.trim().length >= 20 ? 1 : 0);
  const confidence = Math.min(0.9, Math.max(0.5, 0.5 + signals * 0.07));

  return {
    category,
    urgency_score: urgency,
    summary_en: hazard
      ? `[Heuristic Fallback Redressal]: Life-safety grid hazard reported - ${category}`
      : `[Heuristic Fallback Redressal]: Citizen issue regarding ${category}`,
    extracted_location: location,
    actionable_recommendation: compileAction(category, urgency, location),
    assigned_department,
    lat,
    lng,
    created_at: new Date().toISOString(),
    is_fallback: true,
    latency_ms: latencyMs,
    confidence: Math.round(confidence * 100) / 100,
  };
}

function buildUserPrompt(inputText: string, lat: number, lng: number): string {
  return `Citizen Input: "${inputText}"
Provided Coordinates: Lat ${lat}, Lng ${lng}`;
}

function buildResponseSchema() {
  return {
    type: Type.OBJECT,
    properties: {
      category: {
        type: Type.STRING,
        description:
          "One of: 'Hazardous Infrastructure & Grid Emergency', 'Water Supply', 'Drainage', 'Roads & Transport', 'Sanitation', 'Electricity / Lighting'",
      },
      urgency_score: {
        type: Type.INTEGER,
        description:
          "Calibrated strictly 1-5. 5 = active electrical fire, sparking transformer, live wire touching ground/water, gas leak, structural/drain collapse with trapped victims, or open manhole on a high-speed road. 4 = major water main burst flooding a thoroughfare, district-wide blackout, or blocked arterial road. 3 = pothole, overflowing waste bin, or unlit street. 1-2 = faded markings or routine cosmetic repair. Any mention of sparking equipment, electrocution risk, live wire, or imminent threat to life MUST be exactly 5.",
      },
      summary_en: {
        type: Type.STRING,
        description: "Clear, actionable English summary of the complaint",
      },
      extracted_location: {
        type: Type.STRING,
        description: "Extracted neighbourhood, ward, sector, or landmark; default 'Reported Region / Local Ward'",
      },
      actionable_recommendation: {
        type: Type.STRING,
        description: "Immediate dispatch instruction naming the crew/equipment and timeframe",
      },
      assigned_department: {
        type: Type.STRING,
        description:
          "Dispatch unit, e.g. 'State DISCOM / Power Emergency Cell', 'Municipal Jal Board', 'PWD Road Infrastructure Wing', 'City Drainage Division', 'City Power Distribution Unit', 'Municipal Cleansing & Sanitation Wing'",
      },
    },
    required: [
      "category",
      "urgency_score",
      "summary_en",
      "extracted_location",
      "actionable_recommendation",
      "assigned_department",
    ],
  };
}

async function attemptWithModel(
  ai: GoogleGenAI,
  model: string,
  inputText: string,
  lat: number,
  lng: number,
  latencyMs: number,
): Promise<AnalyzedResult> {
  const response = await ai.models.generateContent({
    model,
    contents: buildUserPrompt(inputText, lat, lng),
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: buildResponseSchema(),
      temperature: 0,
      maxOutputTokens: 1200,
      abortSignal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
    },
  });

  return normalizeGeminiResult(response.text ?? "{}", inputText, lat, lng, latencyMs);
}

function normalizeGeminiResult(
  rawText: string,
  inputText: string,
  lat: number,
  lng: number,
  latencyMs: number,
): AnalyzedResult {
  let record: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(rawText) as unknown;
    if (parsed && typeof parsed === "object") record = parsed as Record<string, unknown>;
  } catch {
    record = {};
  }

  const haystack = inputText.toLowerCase();
  const rawCategory = cleanText(record.category) ?? FALLBACK_CATEGORY;
  const summary = cleanText(record.summary_en) ?? (inputText.trim() || rawCategory);
  const summaryHaystack = summary.toLowerCase();

  const hazardSignalled =
    isCriticalHazard(haystack) ||
    isCriticalHazard(summaryHaystack) ||
    rawCategory.toLowerCase().includes("hazard") ||
    rawCategory.toLowerCase().includes("grid");

  const category = hazardSignalled ? HAZARD_CATEGORY : rawCategory;
  const urgency = hazardSignalled ? 5 : clampUrgency(record.urgency_score);
  const location = cleanText(record.extracted_location) ?? FALLBACK_LOCATION;
  const action =
    cleanText(record.actionable_recommendation) ?? compileAction(category, urgency, location);
  const department =
    cleanText(record.assigned_department) ??
    (hazardSignalled ? HAZARD_DEPARTMENT : compileDepartment(category));

  return {
    category,
    urgency_score: urgency,
    summary_en: summary,
    extracted_location: location,
    actionable_recommendation: action,
    assigned_department: department,
    lat,
    lng,
    created_at: new Date().toISOString(),
    is_fallback: false,
    latency_ms: latencyMs,
    confidence: 0.92,
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  const startedAt = Date.now();
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
          ? "[CivicAnalyze] GEMINI_API_KEY not set - using heuristic fallback."
          : "[CivicAnalyze] Empty input - returning heuristic fallback.",
      );
      return ok(heuristicAnalyze(inputText, lat, lng, Date.now() - startedAt));
    }

    const ai = new GoogleGenAI({ apiKey });

    for (const model of MODEL_CASCADE) {
      try {
        return ok(await attemptWithModel(ai, model, inputText, lat, lng, Date.now() - startedAt));
      } catch (error) {
        console.warn(
          `[CivicAnalyze] Model ${model} failed (${describeError(error)}); trying next model.`,
        );
      }
    }

    console.error("[CivicAnalyze] All Gemini models failed - using heuristic fallback.");
  } catch (error) {
    console.error(
      `[CivicAnalyze] Gemini client error - using heuristic fallback: ${describeError(error)}`,
    );
  }

  return ok(heuristicAnalyze(inputText, lat, lng, Date.now() - startedAt));
}
