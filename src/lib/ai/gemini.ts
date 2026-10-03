import { GoogleGenAI } from "@google/genai";

export async function generateAI(prompt: string) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY não configurada.");
  }

  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";

  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      temperature: 0.4,
      maxOutputTokens: 1200,
    },
  });

  return response.text?.trim() ?? "";
}
