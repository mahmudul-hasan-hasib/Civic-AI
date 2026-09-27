import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { input_text, lat, lng } = await req.json();

    if (!input_text) {
      return NextResponse.json(
        { error: "Text or complaint is required" },
        { status: 400 }
      );
    }

    const prompt = `You are a civic intelligence agent for public governance. Analyze this citizen complaint submitted in a regional or local language (e.g. Bengali, Hindi, or English).
Translate it to clear English, extract the category, determine the urgency score (1 to 5), summarize the key issue, and suggest an immediate administrative action.

Citizen Input: "${input_text}"
Provided Coordinates: Lat ${lat || "N/A"}, Lng ${lng || "N/A"}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: {
              type: Type.STRING,
              description: "Category such as 'Roads & Transport', 'Water Supply', 'Drainage', 'Sanitation', or 'Electricity'",
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
      },
    });

    const parsedData = JSON.parse(response.text || "{}");

    return NextResponse.json({
      success: true,
      data: {
        ...parsedData,
        lat: lat || 23.8103, // default to center if missing
        lng: lng || 90.4125,
        created_at: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Analysis Error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to analyze grievance" },
      { status: 500 }
    );
  }
}