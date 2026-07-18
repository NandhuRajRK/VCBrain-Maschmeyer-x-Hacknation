/**
 * Thesis Engine
 *
 * The fund's investment preferences as a configurable filter.
 * Every company that enters the pipeline is checked against this
 * before any scoring happens. If it fails a hard filter, it's
 * an instant pass — no resources wasted on analysis.
 */

// ── Types ──────────────────────────────────────────────────────

export interface ThesisConfig {
  /** Sectors the fund invests in (e.g. "cybersecurity", "ai_infra", "fintech") */
  sectors: string[];

  /** Acceptable company stages (e.g. "pre_seed", "seed", "series_a") */
  stages: string[];

  /** Target geographies (e.g. "DACH", "US", "EU") */
  geographies: string[];

  /** Check size range in USD */
  checkSize: { min: number; max: number };

  /** Target ownership percentage post-investment */
  ownershipTarget: number;

  /** How much risk the fund tolerates — affects soft scoring */
  riskAppetite: "conservative" | "moderate" | "aggressive";

  /** Business models the fund prefers (e.g. "b2b_saas", "marketplace") */
  preferredModels: string[];

  /** Hard exclusions — any match is an instant reject */
  exclusions: string[];
}

export interface ThesisResult {
  /** Did the company pass all hard filters? */
  pass: boolean;

  /** Hard filter failures — any of these means instant reject */
  hardFailures: string[];

  /** Soft matches — things the fund likes that this company has */
  softMatches: string[];

  /** Soft mismatches — preferences the company doesn't meet */
  softMismatches: string[];

  /** 0-1 score representing overall thesis alignment */
  fitScore: number;
}

// ── Matching logic (case-insensitive, substring-aware) ─────────

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

function matchesAny(value: string | null | undefined, targets: string[]): boolean {
  if (!value || targets.length === 0) return true; // no constraint = pass
  const norm = normalize(value);
  return targets.some(
    (t) => norm.includes(normalize(t)) || normalize(t).includes(norm)
  );
}

function matchesExclusion(
  company: CompanyData,
  exclusions: string[]
): string | null {
  if (exclusions.length === 0) return null;
  const blob = normalize(
    [company.name, company.sector, company.stage, company.geography, company.description]
      .filter(Boolean)
      .join(" ")
  );
  for (const ex of exclusions) {
    if (blob.includes(normalize(ex))) {
      return ex;
    }
  }
  return null;
}

// ── Company shape (mirrors Nandhu's API response) ──────────────

export interface CompanyData {
  name: string;
  sector?: string | null;
  stage?: string | null;
  geography?: string | null;
  description?: string | null;
}

// ── Core filter ────────────────────────────────────────────────

export function evaluateThesis(
  company: CompanyData,
  thesis: ThesisConfig
): ThesisResult {
  const hardFailures: string[] = [];
  const softMatches: string[] = [];
  const softMismatches: string[] = [];

  // Hard filters — any failure = instant reject

  if (!matchesAny(company.sector, thesis.sectors)) {
    hardFailures.push(`Sector "${company.sector ?? "unknown"}" outside fund thesis`);
  }

  if (!matchesAny(company.stage, thesis.stages)) {
    hardFailures.push(`Stage "${company.stage ?? "unknown"}" outside fund thesis`);
  }

  if (!matchesAny(company.geography, thesis.geographies)) {
    hardFailures.push(
      `Geography "${company.geography ?? "unknown"}" outside fund thesis`
    );
  }

  const excluded = matchesExclusion(company, thesis.exclusions);
  if (excluded) {
    hardFailures.push(`Matches exclusion: "${excluded}"`);
  }

  // Soft preferences — influence fit score but don't reject

  if (company.description) {
    const desc = normalize(company.description);
    for (const model of thesis.preferredModels) {
      if (desc.includes(normalize(model))) {
        softMatches.push(model);
      } else {
        softMismatches.push(`No signal for preferred model: ${model}`);
      }
    }
  } else if (thesis.preferredModels.length > 0) {
    softMismatches.push("No description available to check business model");
  }

  // Fit score: 0-1 based on how many soft preferences match

  const totalSoftChecks = softMatches.length + softMismatches.length;
  const softScore = totalSoftChecks > 0 ? softMatches.length / totalSoftChecks : 0.5;
  const hardScore = hardFailures.length === 0 ? 1 : 0;
  const fitScore = hardScore * (0.6 + 0.4 * softScore);

  return {
    pass: hardFailures.length === 0,
    hardFailures,
    softMatches,
    softMismatches,
    fitScore: Math.round(fitScore * 100) / 100,
  };
}

// ── Default thesis (for demo / initial setup) ──────────────────

export const DEFAULT_THESIS: ThesisConfig = {
  sectors: ["ai", "cybersecurity", "fintech", "developer_tools", "ai_infra"],
  stages: ["pre_seed", "seed"],
  geographies: ["US", "EU", "DACH", "UK"],
  checkSize: { min: 50_000, max: 150_000 },
  ownershipTarget: 5,
  riskAppetite: "moderate",
  preferredModels: ["b2b_saas", "api", "platform"],
  exclusions: ["gambling", "tobacco", "weapons"],
};
