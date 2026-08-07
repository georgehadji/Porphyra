// Adapted from santifer/jobber (MIT) — see /NOTICE.md.
// Source: lib/llm-providers.mjs
//
// Single source of truth for provider facts: default model, env-var names,
// context window, per-token pricing. Porphyra pays for AI (platform-paid,
// Anthropic default — see the Phase 3 quota system), so accurate `RATES`
// data feeds real per-user cost tracking, not just a CLI cost estimate.
// Server-only module — never import this from a browser bundle (it reads
// process.env directly).

export const MAX_OUTPUT_TOKENS = 8192;
export const DEFAULT_REQUEST_TIMEOUT_MS = 300_000;

export interface ProviderSpec {
  defaultModel?: string;
  modelEnv?: string;
  keyEnv?: string;
  baseUrl?: string;
  baseUrlEnv?: string;
  timeoutEnv?: string;
  contextTokens?: number;
  /** No runner calls this provider directly; the entry exists for cost
   * estimation / comparison only. */
  pricingOnly?: boolean;
}

export const PROVIDERS: Record<string, ProviderSpec> = {
  anthropic: {
    defaultModel: "claude-sonnet-5",
    modelEnv: "ANTHROPIC_MODEL",
    keyEnv: "ANTHROPIC_API_KEY",
    baseUrl: "https://api.anthropic.com/v1",
    timeoutEnv: "ANTHROPIC_TIMEOUT_MS",
    contextTokens: 200_000,
  },
  openai: {
    defaultModel: "gpt-4o-mini",
    modelEnv: "OPENAI_MODEL",
    keyEnv: "OPENAI_API_KEY",
    baseUrl: "https://api.openai.com/v1",
    baseUrlEnv: "OPENAI_BASE_URL",
    timeoutEnv: "OPENAI_TIMEOUT_MS",
    contextTokens: 128_000,
  },
  gemini: {
    defaultModel: "gemini-3.6-flash",
    modelEnv: "GEMINI_MODEL",
    keyEnv: "GEMINI_API_KEY",
    contextTokens: 1_048_576,
  },
};

/** Platform default — see the "Platform pays, Anthropic default,
 * provider-abstracted" product decision. Swappable per-deployment via
 * `AI_DEFAULT_PROVIDER` (see .env.example) without touching call sites. */
export const DEFAULT_PROVIDER = "anthropic";

export function providerSpec(name: string): ProviderSpec | undefined {
  return PROVIDERS[name];
}

export function defaultModelFor(name: string): string | undefined {
  const spec = providerSpec(name);
  if (!spec) return undefined;
  const override = spec.modelEnv ? process.env[spec.modelEnv] : undefined;
  return override || spec.defaultModel;
}

export function baseUrlFor(name: string): string {
  const spec = providerSpec(name);
  if (!spec) return "";
  const raw = (spec.baseUrlEnv ? process.env[spec.baseUrlEnv] : "") || spec.baseUrl || "";
  return raw.replace(/\/$/, "");
}

export function apiKeyFor(name: string): string {
  const spec = providerSpec(name);
  return (spec?.keyEnv ? process.env[spec.keyEnv] : "") || "";
}

export function requestTimeoutMsFor(name: string): number {
  const envVar = providerSpec(name)?.timeoutEnv;
  const raw = envVar ? process.env[envVar] : undefined;
  if (raw === undefined || raw === "") return DEFAULT_REQUEST_TIMEOUT_MS;
  const ms = Number.parseInt(raw, 10);
  if (Number.isNaN(ms) || ms <= 0) {
    throw new Error(`Invalid ${envVar}: "${raw}" — must be a positive integer (milliseconds).`);
  }
  return ms;
}

export function contextTokensFor(name: string): number | undefined {
  return providerSpec(name)?.contextTokens;
}

export interface Rate {
  input: number; // USD per token
  output: number; // USD per token
  cachedInput?: number;
}

/** USD per token, by model id — feeds ai_jobs cost tracking and per-user
 * quota enforcement (Phase 4). Keep in sync with each provider's published
 * pricing; a stale rate under-bills the platform, not the user. */
export const RATES: Record<string, Rate> = {
  "claude-sonnet-5": { input: 3.0 / 1_000_000, output: 15.0 / 1_000_000 },
  "claude-haiku-4-5": { input: 0.8 / 1_000_000, output: 4.0 / 1_000_000 },
  "claude-opus-5": { input: 15.0 / 1_000_000, output: 75.0 / 1_000_000 },
  "gpt-4o-mini": { input: 0.15 / 1_000_000, output: 0.6 / 1_000_000 },
  "gpt-4o": { input: 2.5 / 1_000_000, output: 10.0 / 1_000_000 },
  "gemini-3.6-flash": {
    input: 1.5 / 1_000_000,
    output: 7.5 / 1_000_000,
    cachedInput: 0.15 / 1_000_000,
  },
};

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rate = RATES[model];
  if (!rate) return 0;
  return inputTokens * rate.input + outputTokens * rate.output;
}
