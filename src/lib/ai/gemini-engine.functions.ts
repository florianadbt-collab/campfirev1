import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AIRequest, AIResult } from "./types";

/**
 * Unique frontière réseau entre Campfire et Gemini.
 * Le navigateur n'appelle jamais Gemini directement : il appelle ceci.
 */
export const geminiEngine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: AIRequest) => data)
  .handler(async ({ data }): Promise<AIResult> => {
    const { runGeminiEngine } = await import("./gemini-engine.server");
    return runGeminiEngine(data);
  });
