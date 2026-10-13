import type { Response } from "express";
import { z } from "zod";

// 400 with the first message (for display) plus per-field messages
export function sendValidationError(res: Response, error: z.ZodError) {
  const { fieldErrors } = z.flattenError(error);
  res.status(400).json({ error: error.issues[0]?.message ?? "Invalid input", fieldErrors });
}
