import { google } from "@ai-sdk/google";
import { SenderType } from "../generated/prisma/enums.ts";

// Shared by the AI features (reply polishing, ticket summaries, classification). The Google provider reads
// GOOGLE_GENERATIVE_AI_API_KEY itself; GEMINI_MODEL overrides the model.
export const geminiModel = google(process.env.GEMINI_MODEL || "gemini-3.8-flash");

export function isGeminiConfigured() {
  return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
}

// How each message's sender is named in the conversation context sent to Gemini
export const senderLabels: Record<SenderType, string> = {
  [SenderType.CUSTOMER]: "Customer",
  [SenderType.AGENT]: "Agent",
  [SenderType.AI]: "AI assistant",
};
