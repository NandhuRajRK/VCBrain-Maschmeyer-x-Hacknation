/**
 * 3-Axis Scoring Engine
 *
 * Scores every opportunity on three independent axes:
 *   1. Founder: who they are, track record, technical depth
 *   2. Market: size, growth, competition, timing
 *   3. Idea-vs-Market: does the idea survive scrutiny, or is the
 *      team strong enough to pivot?
 *
 * The axes are NEVER averaged into a single number. Each one
 * stands alone with its own trend direction. This lets the
 * investor see "great founder, weak market" instead of a
 * misleading composite.
 *
 * Every raw score is adjusted by evidence quality:
 *   adjusted = raw × evidence_confidence × source_independence × freshness
 */

// ── Types ──────────────────────────────────────────────────────

export type Trend = "improving" | "stable" | "declining";

export interface AxisScore {
  /** Which axis this score represents */
  axis: "founder" | "market" | "idea_vs_market";

  /** Raw score before evidence adjustment (0-100) */
  rawScore: number;

  /** Score after adjusting for evidence quality (0-100) */
  adjustedScore: number;

  /** How confident we are in this score (0-1) */
  confidence: number;

  /** Direction of momentum */
  trend: Trend;

  /** Claim IDs that support this score */
  supportingClaimIds: string[];

  /** Claim IDs that contradict or weaken this score */
  contradictingClaimIds: string[];

  /** Human-readable notes explaining the score */
  notes: string[];
}

export interface ScoringResult {
  companyId: string;
  founder: AxisScore;
  market: AxisScore;
  ideaVsMarket: AxisScore;

  /** Overall evidence quality across all axes (0-1) */
  overallConfidence: number;

  /** Whether any founder is flagged as cold-start */
  coldStart: boolean;

  /** Key risks surfaced during scoring */
  risks: string[];

  /** Timestamp of when this scoring was produced */
  scoredAt: string;
}

// ── Dossier shape (matches Nandhu's GET /companies/{id}/dossier) ──

export interface Claim {
  id: string;
  company_id: string;
  kind: "company" | "founder" | "traction" | "market" | "product" | "financial";
  text: string;
  status: "extracted" | "supported" | "disputed" | "missing_evidence";
  evidence_ids: string[];
  confidence: number;
}

export interface Evidence {
  id: string;
  source_id: string;
  segment_id: string;
  quote: string;
  confidence: number;

  /** Fields from Nandhu's evidence pipeline (consumed directly, not re-derived) */
  source_reliability: number;
  source_independence: "third_party" | "company_owned" | "founder_provided" | "unknown";
  freshness_days: number | null;
  directness: "direct" | "inferred" | "indirect";
  confidence_reason: string;
}

export interface FounderData {
  id: string;
  company_id: string;
  name: string;
  role?: string | null;
  linkedin?: string | null;
  github?: string | null;
  cold_start: boolean;
}

export interface FounderScoreData {
  founder_id: string;
  score: number;
  confidence: number;
  cold_start: boolean;
  evidence_count: number;
  evidence_coverage: number;
  contradiction_count: number;
  notes: string[];
}

export interface Source {
  id: string;
  company_id: string;
  source_type: string;
  title: string;
  url?: string | null;
  text?: string | null;
  metadata: Record<string, unknown>;
  status: string;
  submitted_at: string;
}

export interface DossierInput {
  company: {
    id: string;
    name: string;
    sector?: string | null;
    stage?: string | null;
    geography?: string | null;
    description?: string | null;
  };
  founders: FounderData[];
  sources: Source[];
  claims: Claim[];
  evidence: Evidence[];
  founder_scores: FounderScoreData[];
}

// ── Evidence adjustment helpers ────────────────────────────────

/**
 * How independent are the sources backing this claim?
 * Consumes the source_independence field that Nandhu's evidence pipeline already computed.
 * Maps the string categories to a 0-1 factor.
 */
function sourceIndependence(claim: Claim, _sources: Source[], evidence: Evidence[]): number {
  const claimEvidence = evidence.filter((e) => claim.evidence_ids.includes(e.id));
  if (claimEvidence.length === 0) return 0.2;

  const factors: Record<string, number> = {
    third_party: 1.0,
    company_owned: 0.65,
    founder_provided: 0.4,
    unknown: 0.3,
  };

  let total = 0;
  for (const ev of claimEvidence) {
    total += factors[ev.source_independence] ?? 0.3;
  }
  return total / claimEvidence.length;
}

/**
 * How fresh is the evidence? Consumes freshness_days from Nandhu's evidence pipeline.
 * Matches his tiered decay: <=30d = 1.0, <=180d = 0.85, <=365d = 0.7, >365d = 0.55.
 */
function freshness(claim: Claim, _sources: Source[], evidence: Evidence[]): number {
  const claimEvidence = evidence.filter((e) => claim.evidence_ids.includes(e.id));
  if (claimEvidence.length === 0) return 0.5;

  let total = 0;
  for (const ev of claimEvidence) {
    const days = ev.freshness_days;
    if (days === null || days === undefined) {
      total += 0.75;
    } else if (days <= 30) {
      total += 1.0;
    } else if (days <= 180) {
      total += 0.85;
    } else if (days <= 365) {
      total += 0.7;
    } else {
      total += 0.55;
    }
  }
  return total / claimEvidence.length;
}

/**
 * Apply the evidence adjustment formula:
 *   adjusted = raw × confidence × independence × freshness
 */
function adjustScore(
  rawScore: number,
  claim: Claim,
  sources: Source[],
  evidence: Evidence[]
): number {
  const conf = claim.confidence;
  const indep = sourceIndependence(claim, sources, evidence);
  const fresh = freshness(claim, sources, evidence);
  return rawScore * conf * indep * fresh;
}

// ── Axis scoring ───────────────────────────────────────────────

function scoreFounderAxis(dossier: DossierInput): AxisScore {
  const { founders, founder_scores, claims, sources, evidence } = dossier;

  const founderClaims = claims.filter((c) => c.kind === "founder");
  const supporting = founderClaims.filter((c) => c.status === "supported");
  const disputed = founderClaims.filter((c) => c.status === "disputed");

  const isColdStart = founders.length === 0 || founders.some((f) => f.cold_start);
  const hasGithub = founders.some((f) => f.github);
  const hasLinkedin = founders.some((f) => f.linkedin);

  // Neutral baseline for an unknown founder. The backend founder score pulls
  // it up or down IN PROPORTION TO ITS OWN CONFIDENCE, so thin founder data
  // (low confidence) stays near neutral instead of collapsing to ~15 and
  // auto-rejecting. Thin data shows up as low confidence, not a hard reject.
  let rawScore = 50;
  let founderConfidence = 0.35;
  if (founder_scores.length > 0) {
    const avg =
      founder_scores.reduce((sum, fs) => sum + fs.score, 0) / founder_scores.length;
    const backendConfidence =
      founder_scores.reduce((sum, fs) => sum + fs.confidence, 0) / founder_scores.length;
    rawScore = 50 * (1 - backendConfidence) + avg * backendConfidence;
    founderConfidence = backendConfidence;
  }

  // Boost for multiple founders (team > solo)
  if (founders.length >= 2) rawScore = Math.min(100, rawScore + 8);

  // Boost for public presence
  if (hasGithub) {
    rawScore = Math.min(100, rawScore + 6);
    founderConfidence = Math.max(founderConfidence, 0.5);
  }
  if (hasLinkedin) rawScore = Math.min(100, rawScore + 3);

  // Penalize disputes
  rawScore = Math.max(0, rawScore - disputed.length * 6);

  // Cold-start cap: be transparent, don't inflate
  if (isColdStart) rawScore = Math.min(rawScore, 50);

  // Evidence-adjusted score
  const avgConfidence =
    founderClaims.length > 0
      ? founderClaims.reduce((sum, c) => sum + c.confidence, 0) / founderClaims.length
      : 0.3;

  const avgIndependence =
    founderClaims.length > 0
      ? founderClaims.reduce((sum, c) => sum + sourceIndependence(c, sources, evidence), 0) /
        founderClaims.length
      : 0.3;

  const avgFreshness =
    founderClaims.length > 0
      ? founderClaims.reduce((sum, c) => sum + freshness(c, sources, evidence), 0) /
        founderClaims.length
      : 0.5;

  const evidenceQuality =
    founderClaims.length > 0
      ? (avgConfidence + avgIndependence + avgFreshness) / 3
      : Math.max(0.5, founderConfidence);
  const adjustedScore = Math.round(rawScore * (0.55 + 0.45 * evidenceQuality));

  // Notes
  const notes: string[] = [];
  if (isColdStart) notes.push("Cold-start founder, limited track record, score capped at 50");
  if (founders.length === 1) notes.push("Single founder, higher execution risk");
  if (founders.length >= 2) notes.push(`Team of ${founders.length} founders`);
  if (hasGithub) notes.push("GitHub presence detected");
  if (disputed.length > 0) notes.push(`${disputed.length} disputed claim(s) on founder`);
  if (founderClaims.length === 0) notes.push("No founder-specific claims, scoring from minimal data");

  return {
    axis: "founder",
    rawScore: Math.round(rawScore),
    adjustedScore,
    confidence: Math.round((founderClaims.length > 0 ? avgConfidence : founderConfidence) * 100) / 100,
    trend: isColdStart ? "stable" : supporting.length > disputed.length ? "improving" : "stable",
    supportingClaimIds: supporting.map((c) => c.id),
    contradictingClaimIds: disputed.map((c) => c.id),
    notes,
  };
}

function scoreMarketAxis(dossier: DossierInput): AxisScore {
  const { claims, sources, evidence, company } = dossier;

  const marketClaims = claims.filter((c) => c.kind === "market");
  const tractionClaims = claims.filter((c) => c.kind === "traction");
  const allRelevant = [...marketClaims, ...tractionClaims];
  const supporting = allRelevant.filter((c) => c.status === "supported");
  const disputed = allRelevant.filter((c) => c.status === "disputed");

  let rawScore = 40; // baseline, markets are hard to assess from limited data

  // More market claims = more evidence of market understanding
  rawScore = Math.min(100, rawScore + marketClaims.length * 6);

  // Traction claims suggest real market pull
  rawScore = Math.min(100, rawScore + tractionClaims.length * 8);

  // External signals (HN, ProductHunt) suggest market interest
  const externalSignals = sources.filter(
    (s) => s.source_type === "hacker_news" || s.source_type === "product_hunt"
  );
  rawScore = Math.min(100, rawScore + externalSignals.length * 5);

  // Penalize disputes
  rawScore = Math.max(0, rawScore - disputed.length * 7);

  // Evidence adjustment
  const avgConfidence =
    allRelevant.length > 0
      ? allRelevant.reduce((sum, c) => sum + c.confidence, 0) / allRelevant.length
      : 0.3;

  const avgIndependence =
    allRelevant.length > 0
      ? allRelevant.reduce((sum, c) => sum + sourceIndependence(c, sources, evidence), 0) /
        allRelevant.length
      : 0.3;

  const avgFreshness =
    allRelevant.length > 0
      ? allRelevant.reduce((sum, c) => sum + freshness(c, sources, evidence), 0) /
        allRelevant.length
      : 0.5;

  const evidenceQuality = (avgConfidence + avgIndependence + avgFreshness) / 3;
  const adjustedScore = Math.round(rawScore * (0.55 + 0.45 * evidenceQuality));

  const notes: string[] = [];
  if (marketClaims.length === 0) notes.push("No market-specific claims, relying on inferred signals");
  if (tractionClaims.length > 0) notes.push(`${tractionClaims.length} traction signal(s) detected`);
  if (externalSignals.length > 0) notes.push("External community traction (HN/ProductHunt)");
  if (disputed.length > 0) notes.push(`${disputed.length} disputed market/traction claim(s)`);
  if (!company.sector) notes.push("No sector identified, market sizing not possible");

  return {
    axis: "market",
    rawScore: Math.round(rawScore),
    adjustedScore,
    confidence: Math.round(avgConfidence * 100) / 100,
    trend: tractionClaims.length >= 2 ? "improving" : "stable",
    supportingClaimIds: supporting.map((c) => c.id),
    contradictingClaimIds: disputed.map((c) => c.id),
    notes,
  };
}

function scoreIdeaVsMarketAxis(dossier: DossierInput): AxisScore {
  const { claims, sources, evidence, founders, founder_scores } = dossier;

  const productClaims = claims.filter((c) => c.kind === "product");
  const marketClaims = claims.filter((c) => c.kind === "market");
  const tractionClaims = claims.filter((c) => c.kind === "traction");
  const allRelevant = [...productClaims, ...marketClaims];
  const supporting = allRelevant.filter((c) => c.status === "supported");
  const disputed = allRelevant.filter((c) => c.status === "disputed");

  let rawScore = 35; // baseline

  // Product claims indicate idea articulation
  rawScore = Math.min(100, rawScore + productClaims.length * 7);

  // Traction validates the idea actually works in market
  rawScore = Math.min(100, rawScore + tractionClaims.length * 10);

  // If the team is strong (high founder scores), the idea can pivot
  const avgFounderScore =
    founder_scores.length > 0
      ? founder_scores.reduce((sum, fs) => sum + fs.score, 0) / founder_scores.length
      : 30;
  if (avgFounderScore >= 60) {
    rawScore = Math.min(100, rawScore + 10);
  }

  // Multiple founders with complementary signals
  const hasTechnical = founders.some((f) => f.github);
  const hasBusiness = founders.some((f) => f.linkedin && !f.github);
  if (hasTechnical && hasBusiness) rawScore = Math.min(100, rawScore + 7);

  // Penalize disputes
  rawScore = Math.max(0, rawScore - disputed.length * 6);

  // Evidence adjustment
  const avgConfidence =
    allRelevant.length > 0
      ? allRelevant.reduce((sum, c) => sum + c.confidence, 0) / allRelevant.length
      : 0.3;

  const avgIndependence =
    allRelevant.length > 0
      ? allRelevant.reduce((sum, c) => sum + sourceIndependence(c, sources, evidence), 0) /
        allRelevant.length
      : 0.3;

  const avgFreshness =
    allRelevant.length > 0
      ? allRelevant.reduce((sum, c) => sum + freshness(c, sources, evidence), 0) /
        allRelevant.length
      : 0.5;

  const evidenceQuality = (avgConfidence + avgIndependence + avgFreshness) / 3;
  const adjustedScore = Math.round(rawScore * (0.55 + 0.45 * evidenceQuality));

  const notes: string[] = [];
  if (productClaims.length === 0) notes.push("No product claims, idea not well articulated in sources");
  if (tractionClaims.length > 0) notes.push("Traction validates idea-market alignment");
  if (avgFounderScore >= 60) notes.push("Strong founder score, team can pivot if needed");
  if (disputed.length > 0) notes.push(`${disputed.length} disputed claim(s) on product/market fit`);

  return {
    axis: "idea_vs_market",
    rawScore: Math.round(rawScore),
    adjustedScore,
    confidence: Math.round(avgConfidence * 100) / 100,
    trend:
      tractionClaims.length >= 2 && disputed.length === 0
        ? "improving"
        : disputed.length > supporting.length
          ? "declining"
          : "stable",
    supportingClaimIds: supporting.map((c) => c.id),
    contradictingClaimIds: disputed.map((c) => c.id),
    notes,
  };
}

// ── Main entry point ───────────────────────────────────────────

export function scoreDossier(dossier: DossierInput): ScoringResult {
  const founder = scoreFounderAxis(dossier);
  const market = scoreMarketAxis(dossier);
  const ideaVsMarket = scoreIdeaVsMarketAxis(dossier);

  const isColdStart = dossier.founders.length === 0 || dossier.founders.some((f) => f.cold_start);

  const overallConfidence =
    Math.round(
      ((founder.confidence + market.confidence + ideaVsMarket.confidence) / 3) * 100
    ) / 100;

  // Surface key risks
  const risks: string[] = [];
  if (isColdStart) risks.push("Cold-start founder, minimal verifiable track record");
  if (founder.adjustedScore < 30) risks.push("Founder score critically low");
  if (market.adjustedScore < 25) risks.push("Market evidence insufficient for conviction");
  if (ideaVsMarket.adjustedScore < 20) risks.push("Idea-market fit unvalidated");

  const disputed = dossier.claims.filter((c) => c.status === "disputed");
  if (disputed.length > 0) risks.push(`${disputed.length} claim(s) with contradictory evidence`);

  const missingEvidence = dossier.claims.filter((c) => c.status === "missing_evidence");
  if (missingEvidence.length > 0) risks.push(`${missingEvidence.length} claim(s) missing evidence`);

  return {
    companyId: dossier.company.id,
    founder,
    market,
    ideaVsMarket,
    overallConfidence,
    coldStart: isColdStart,
    risks,
    scoredAt: new Date().toISOString(),
  };
}
