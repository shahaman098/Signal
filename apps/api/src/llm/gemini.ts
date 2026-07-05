import { GoogleGenAI } from "@google/genai";

/**
 * Thin Gemini wrapper — the single LLM touchpoint for the API. Callers pass a
 * system instruction + prompt (and optionally a JSON schema for structured
 * output) and get text back, or null when no key is configured / the call
 * fails — every caller has a deterministic offline fallback.
 */
export class GeminiClient {
  private ai?: GoogleGenAI;

  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    if (apiKey) this.ai = new GoogleGenAI({ apiKey });
  }

  get enabled(): boolean {
    return this.ai !== undefined;
  }

  async complete(opts: {
    system: string;
    prompt: string;
    maxTokens?: number;
    /** When set, requests application/json output constrained to this schema. */
    jsonSchema?: Record<string, unknown>;
  }): Promise<string | null> {
    if (!this.ai) return null;
    try {
      const interaction = await this.ai.interactions.create({
        model: this.model,
        system_instruction: opts.system,
        input: opts.prompt,
        generation_config: { maxOutputTokens: opts.maxTokens ?? 2048 },
        ...(opts.jsonSchema
          ? {
              response_format: {
                type: "text",
                mime_type: "application/json",
                schema: opts.jsonSchema,
              },
            }
          : {}),
      } as Parameters<GoogleGenAI["interactions"]["create"]>[0]);
      const text = (interaction as { output_text?: string }).output_text;
      return typeof text === "string" && text.length > 0 ? text : null;
    } catch (err) {
      console.warn(
        `[gemini] ${this.model} call failed: ${err instanceof Error ? err.message.slice(0, 160) : err}`,
      );
      return null;
    }
  }
}
