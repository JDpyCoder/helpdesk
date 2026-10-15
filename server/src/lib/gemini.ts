import { google } from "@ai-sdk/google";

// Shared by the AI features (reply polishing, ticket summaries). The Google provider reads
// GOOGLE_GENERATIVE_AI_API_KEY itself; GEMINI_MODEL overrides the model.
export const geminiModel = google(process.env.GEMINI_MODEL || "gemini-3.8-flash");

export function isGeminiConfigured() {
  return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
}
