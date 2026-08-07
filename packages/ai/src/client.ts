import Anthropic from "@anthropic-ai/sdk";
import { apiKeyFor, DEFAULT_PROVIDER, defaultModelFor, requestTimeoutMsFor } from "./providers";

let cachedClient: Anthropic | null = null;

/** Server-only. Never import from a browser bundle — it reads an API key
 * from process.env. */
export function anthropicClient(): Anthropic {
  if (cachedClient) return cachedClient;
  const apiKey = apiKeyFor(DEFAULT_PROVIDER);
  if (!apiKey) {
    throw new Error(
      `${DEFAULT_PROVIDER} API key not set — see .env.example's ANTHROPIC_API_KEY.`,
    );
  }
  cachedClient = new Anthropic({ apiKey, timeout: requestTimeoutMsFor(DEFAULT_PROVIDER) });
  return cachedClient;
}

export function currentModel(): string {
  const model = defaultModelFor(DEFAULT_PROVIDER);
  if (!model) throw new Error(`No default model configured for provider ${DEFAULT_PROVIDER}.`);
  return model;
}
