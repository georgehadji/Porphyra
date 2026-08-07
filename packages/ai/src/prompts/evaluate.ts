// Adapted from santifer/jobber (MIT) — see /NOTICE.md.
// Source: modes/oferta.md (the interactive evaluation mode prompt)
//
// The source prompt is written for an agentic CLI session (markdown output,
// conversational framing, references to other files in a repo). This is
// the same A–F + G evaluation logic re-targeted at a single structured-output
// API call: Claude is forced to return JSON matching evaluationReportSchema
// via tool use, since there's no terminal here to render prose into and no
// human in the loop to re-prompt on a malformed response.

import { type EvaluationReport, evaluationReportSchema, type TargetProfile } from "@porphyra/core";
import { anthropicClient, currentModel } from "../client";
import { MAX_OUTPUT_TOKENS } from "../providers";

export interface EvaluateInput {
  /** Decrypted client-side, sent for this one request only — see the vault
   * item lifecycle in the plan's Encryption design § Consented AI path.
   * Never persisted server-side as plaintext (enforced by the caller, not
   * this function — see apps/app's /api/evaluate route). */
  cvPlaintext: string;
  jdPlaintext: string;
  jdUrl?: string;
  targetProfile: TargetProfile;
}

export interface EvaluateResult {
  report: EvaluationReport;
  inputTokens: number;
  outputTokens: number;
}

const REPORT_TOOL_NAME = "submit_evaluation";

/** Hand-written rather than derived from evaluationReportSchema via a
 * zod-to-json-schema step: Anthropic's tool `input_schema` wants plain JSON
 * Schema, and keeping this explicit means the prompt-facing shape and
 * descriptions are deliberately authored, not a mechanical dump of Zod
 * internals. Keep this in sync with packages/core's evaluationReportSchema
 * by hand — validateEvaluationReport() below is what actually catches drift
 * at runtime. */
const REPORT_JSON_SCHEMA = {
  type: "object",
  properties: {
    company: { type: "string" },
    role: { type: "string" },
    score: {
      type: "number",
      minimum: 0,
      maximum: 5,
      description: "Holistic 0-5 judgment integrating all six dimensions — NOT their average.",
    },
    legitimacyTier: {
      type: "string",
      enum: ["high_confidence", "proceed_with_caution", "suspicious"],
    },
    dimensions: {
      type: "object",
      description: "One entry per dimension key: cv_match, north_star, comp, cultural, red_flags, growth.",
      properties: {
        cv_match: { $ref: "#/$defs/dimensionScore" },
        north_star: { $ref: "#/$defs/dimensionScore" },
        comp: { $ref: "#/$defs/dimensionScore" },
        cultural: { $ref: "#/$defs/dimensionScore" },
        red_flags: { $ref: "#/$defs/dimensionScore" },
        growth: { $ref: "#/$defs/dimensionScore" },
      },
      required: ["cv_match", "north_star", "comp", "cultural", "red_flags", "growth"],
    },
    hardStops: { type: "array", items: { type: "string" } },
    softGaps: { type: "array", items: { type: "string" } },
    topStrengths: { type: "array", items: { type: "string" } },
    riskLevel: { type: "string", enum: ["low", "medium", "high"] },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    nextAction: { type: "string" },
    discardReasons: { type: "array", items: { type: "string" } },
    companyConfidential: { type: "boolean" },
    advertisedComp: { type: "string" },
    riskSummary: { type: "string" },
  },
  required: ["company", "role", "score", "legitimacyTier", "dimensions"],
  $defs: {
    dimensionScore: {
      type: "object",
      properties: {
        score: { type: "number", minimum: 0, maximum: 5 },
        note: { type: "string" },
      },
      required: ["score"],
    },
  },
} as const;

function buildSystemPrompt(): string {
  return [
    "You are Porphyra's job-posting evaluator. Score honestly — the product's",
    "entire premise is discouraging weak-fit applications, not flattering the",
    "user. Never invent experience, metrics, or claims not present in the CV.",
    "Never fabricate company facts not present in the JD.",
    "",
    "Scoring (1-5): 4.5+ strong match, apply now. 4.0-4.4 good, worth it.",
    "3.5-3.9 decent, apply only with a specific reason. Below 3.5: actively",
    "recommend against applying (put this in nextAction, don't just omit",
    "encouragement).",
    "",
    "Cultural signals dimension: if the candidate's stated requirements are",
    "CONTRADICTED by evidence in the JD, cap that dimension at 2 and say so",
    "explicitly in a softGap or hardStop — never let a strong technical match",
    "silently absorb a bad culture fit. If overall score would be 4.5+ but",
    "cultural signals are <=2, say so plainly in nextAction.",
    "",
    "Posting legitimacy is separate from the score — judge it on posting age,",
    "requirements realism, JD specificity, and any signals of a ghost listing,",
    "but present it as neutral information, never an accusation.",
    "",
    "Call the submit_evaluation tool exactly once with your full assessment.",
  ].join("\n");
}

function buildUserPrompt(input: EvaluateInput): string {
  const { targetProfile } = input;
  return [
    "## Candidate's target profile",
    `Role titles: ${targetProfile.roleTitles.join(", ")}`,
    targetProfile.signals.length ? `Signals to weigh: ${targetProfile.signals.join(", ")}` : "",
    targetProfile.seniority ? `Seniority: ${targetProfile.seniority}` : "",
    targetProfile.remotePreference ? `Remote preference: ${targetProfile.remotePreference}` : "",
    "",
    "## Candidate's CV",
    input.cvPlaintext,
    "",
    "## Job posting",
    input.jdUrl ? `Source URL: ${input.jdUrl}` : "",
    input.jdPlaintext,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function evaluateJobPosting(input: EvaluateInput): Promise<EvaluateResult> {
  const client = anthropicClient();
  const model = currentModel();

  const response = await client.messages.create({
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: buildSystemPrompt(),
    messages: [{ role: "user", content: buildUserPrompt(input) }],
    tools: [
      {
        name: REPORT_TOOL_NAME,
        description: "Submit the completed job posting evaluation.",
        // Cast rather than typing against the SDK's own Tool.InputSchema —
        // that type's exact import path has moved across SDK versions, and
        // this object is plain JSON Schema regardless; the real validation
        // that matters is evaluationReportSchema.safeParse() below, which
        // checks the model's actual response, not this request shape.
        input_schema: REPORT_JSON_SCHEMA as unknown as { type: "object" },
      },
    ],
    tool_choice: { type: "tool", name: REPORT_TOOL_NAME },
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Model did not return a structured evaluation.");
  }

  const parsed = evaluationReportSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new Error(
      `Model's evaluation didn't match the expected shape: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }

  return {
    report: parsed.data,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
