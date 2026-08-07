// Adapted from santifer/jobber (MIT) — see /NOTICE.md.
// Source: modes/_shared.md § Company Type and Compensation Reliability

export const COMPANY_TYPES = [
  "public_big_tech",
  "growth_stage_startup",
  "early_stage_startup",
  "enterprise",
  "agency_or_consulting",
  "local_smb",
  "sales_commission_heavy",
  "recruiter_or_staffing",
  "government_academic_nonprofit",
  "open_source_or_education_community",
  "unknown",
] as const;
export type CompanyType = (typeof COMPANY_TYPES)[number];

export const COMPANY_TYPE_LABELS: Record<CompanyType, string> = {
  public_big_tech: "Public big tech / mature tech",
  growth_stage_startup: "Growth-stage startup (VC-backed)",
  early_stage_startup: "Early-stage / pre-revenue startup",
  enterprise: "Enterprise / traditional corporate",
  agency_or_consulting: "Agency / outsourcing / consulting vendor",
  local_smb: "Local SMB / service business",
  sales_commission_heavy: "Sales / commission-heavy org",
  recruiter_or_staffing: "Recruiter / staffing listing",
  government_academic_nonprofit: "Government / academic / nonprofit",
  open_source_or_education_community: "Open-source or education community",
  unknown: "Unknown",
};

export const COMPENSATION_RELIABILITY_TIERS = ["high", "medium", "low", "unknown"] as const;
export type CompensationReliabilityTier = (typeof COMPENSATION_RELIABILITY_TIERS)[number];

export const COMPENSATION_RELIABILITY_MEANING: Record<CompensationReliabilityTier, string> = {
  high: "Stated as base or backed by structured public bands / multiple consistent sources.",
  medium: "Plausible range, but components are not fully separated.",
  low: "Public number likely includes variable, attendance, commission, subsidy, or \"up to\" components.",
  unknown: "No usable salary data.",
};

/** Typical (not guaranteed) reliability by company type — used only as a
 * starting default the evaluator can override with posting-specific
 * evidence, never as a substitute for reading the JD. */
export const TYPICAL_RELIABILITY_BY_COMPANY_TYPE: Record<
  CompanyType,
  CompensationReliabilityTier
> = {
  public_big_tech: "high",
  growth_stage_startup: "medium",
  early_stage_startup: "low",
  enterprise: "medium",
  agency_or_consulting: "low",
  local_smb: "low",
  sales_commission_heavy: "low",
  recruiter_or_staffing: "medium",
  government_academic_nonprofit: "high",
  open_source_or_education_community: "low",
  unknown: "low", // conservative default per the source rubric
};

/** If the brand differs from the legal employer, classify the actual
 * contract / hiring entity first — the source rubric's rule. */
export interface CompanyClassification {
  type: CompanyType;
  /** Set when the posting brand differs from the actual hiring/legal entity. */
  actualHiringEntity?: string;
  reliability: CompensationReliabilityTier;
}
