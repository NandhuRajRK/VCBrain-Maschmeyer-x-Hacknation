/**
 * Memo Generator
 *
 * Takes the 3-axis scores, claims, evidence, and thesis result,
 * and produces a structured investment memo. The memo has five
 * required sections from the challenge brief:
 *
 *   1. Company Snapshot
 *   2. Investment Hypotheses (why this could work)
 *   3. SWOT Analysis
 *   4. Problem & Product
 *   5. Traction & KPIs
 *
 * Plus two differentiators:
 *   - Red-team analysis: strongest reason NOT to invest
 *   - Decision-flip logic: what would change the decision
 *
 * Every section links back to specific claims and evidence,
 * so the investor can trace any statement to its source.
 */

import type {
  ScoringResult,
  AxisScore,
  Claim,
  Evidence,
  Source,
  FounderData,
  FounderScoreData,
  DossierInput,
} from "./scoring";

import type { ThesisResult } from "./thesis";

// ── Types ──────────────────────────────────────────────────────

export type Decision = "invest" | "conditional_invest" | "hold" | "reject";

export interface DecisionFlip {
  /** What the current decision is */
  current: Decision;

  /** What would make the decision upgrade (e.g. reject → hold, hold → invest) */
  becomesInvestIf: string[];

  /** What would make the decision downgrade */
  becomesRejectIf: string[];
}

export interface ClaimReference {
  claimId: string;
  text: string;
  kind: string;
  status: string;
  confidence: number;
}

export interface MemoSection {
  /** Section title */
  title: string;

  /** Main content -- plain text paragraphs */
  content: string;

  /** Claims that back statements in this section */
  supportingClaims: ClaimReference[];

  /** Gaps -- things we expected to find but didn't */
  gaps: string[];
}

export interface RedTeam {
  /** The single strongest reason NOT to invest */
  headline: string;

  /** Supporting detail for the bear case */
  detail: string;

  /** Claims or evidence that support the bear case */
  supportingClaims: ClaimReference[];

  /** What the company would need to do to address this */
  mitigation: string;
}

export interface InvestmentMemo {
  companyId: string;
  companyName: string;

  /** The five required sections */
  sections: {
    companySnapshot: MemoSection;
    investmentHypotheses: MemoSection;
    swot: MemoSection;
    problemAndProduct: MemoSection;
    tractionAndKpis: MemoSection;
  };

  /** Red-team: strongest bear case */
  redTeam: RedTeam;

  /** Invest / Conditional / Hold / Reject with conditions */
  decision: Decision;

  /** What would change the decision in either direction */
  decisionFlip: DecisionFlip;

  /** Overall scoring snapshot (not averaged -- each axis separate) */
  scores: {
    founder: { adjusted: number; confidence: number; trend: string };
    market: { adjusted: number; confidence: number; trend: string };
    ideaVsMarket: { adjusted: number; confidence: number; trend: string };
  };

  /** True if any founder is cold-start */
  coldStart: boolean;

  /** Thesis alignment score from the thesis engine */
  thesisFit: number;

  /** When this memo was generated */
  generatedAt: string;
}

// ── Helpers ────────────────────────────────────────────────────

function claimRef(claim: Claim): ClaimReference {
  return {
    claimId: claim.id,
    text: claim.text,
    kind: claim.kind,
    status: claim.status,
    confidence: claim.confidence,
  };
}

function claimsByKind(claims: Claim[], kind: string): Claim[] {
  return claims.filter((c) => c.kind === kind);
}

function supportedClaims(claims: Claim[]): Claim[] {
  return claims.filter(
    (c) => c.status === "supported" || c.status === "extracted"
  );
}

function disputedClaims(claims: Claim[]): Claim[] {
  return claims.filter((c) => c.status === "disputed");
}

function missingEvidenceClaims(claims: Claim[]): Claim[] {
  return claims.filter((c) => c.status === "missing_evidence");
}

function highConfidenceClaims(claims: Claim[], threshold = 0.7): Claim[] {
  return claims.filter((c) => c.confidence >= threshold);
}

function averageConfidence(claims: Claim[]): number {
  if (claims.length === 0) return 0;
  return claims.reduce((sum, c) => sum + c.confidence, 0) / claims.length;
}

/**
 * Builds a readable summary sentence for a list of claims.
 * Used to auto-generate memo section content from the claim data.
 */
function summarizeClaims(claims: Claim[]): string {
  if (claims.length === 0) return "No relevant claims available.";
  return claims.map((c) => c.text).join(" ");
}

// ── Section builders ──────────────────────────────────────────

function buildCompanySnapshot(
  dossier: DossierInput,
  scores: ScoringResult,
  thesisResult: ThesisResult
): MemoSection {
  const { company, founders, claims } = dossier;
  const companyClaims = claimsByKind(claims, "company");

  const founderNames = founders.map((f) => f.name).join(", ") || "Unknown";
  const founderRoles = founders
    .filter((f) => f.role)
    .map((f) => `${f.name} (${f.role})`)
    .join(", ");

  const parts: string[] = [];

  parts.push(
    `${company.name} is a ${company.stage ?? "early-stage"} ` +
      `${company.sector ?? ""} company` +
      `${company.geography ? ` based in ${company.geography}` : ""}.`
  );

  if (company.description) {
    parts.push(company.description);
  }

  parts.push(`Founded by ${founderRoles || founderNames}.`);

  if (thesisResult.pass) {
    parts.push(
      `Thesis alignment: ${Math.round(thesisResult.fitScore * 100)}%.`
    );
  } else {
    parts.push(
      `Warning: fails thesis hard filters -- ${thesisResult.hardFailures.join("; ")}.`
    );
  }

  if (scores.coldStart) {
    parts.push(
      "Note: limited data available on one or more founders (cold-start). " +
        "Confidence scores reflect this uncertainty."
    );
  }

  const gaps: string[] = [];
  if (!company.sector) gaps.push("Sector not specified");
  if (!company.geography) gaps.push("Geography not specified");
  if (!company.description) gaps.push("No company description available");
  if (founders.length === 0) gaps.push("No founders identified");

  return {
    title: "Company Snapshot",
    content: parts.join(" "),
    supportingClaims: companyClaims.map(claimRef),
    gaps,
  };
}

function buildInvestmentHypotheses(
  dossier: DossierInput,
  scores: ScoringResult
): MemoSection {
  const { claims } = dossier;
  const gaps: string[] = [];

  // Investment hypotheses come from the strongest signals across all axes
  const hypotheses: string[] = [];

  // Founder hypothesis
  if (scores.founder.adjustedScore >= 60) {
    const founderClaims = highConfidenceClaims(claimsByKind(claims, "founder"));
    if (founderClaims.length > 0) {
      hypotheses.push(
        `Strong founder signal (${scores.founder.adjustedScore}/100): ${summarizeClaims(founderClaims.slice(0, 3))}`
      );
    } else {
      hypotheses.push(
        `Founder score is ${scores.founder.adjustedScore}/100 but supporting claims lack high confidence.`
      );
    }
  } else {
    gaps.push("Founder signal below investment threshold");
  }

  // Market hypothesis
  if (scores.market.adjustedScore >= 50) {
    const marketClaims = highConfidenceClaims(claimsByKind(claims, "market"));
    if (marketClaims.length > 0) {
      hypotheses.push(
        `Favorable market conditions (${scores.market.adjustedScore}/100): ${summarizeClaims(marketClaims.slice(0, 3))}`
      );
    } else {
      hypotheses.push(
        `Market score is ${scores.market.adjustedScore}/100 but lacks high-confidence backing.`
      );
    }
  } else {
    gaps.push("Market signal below investment threshold");
  }

  // Product-market fit hypothesis
  if (scores.ideaVsMarket.adjustedScore >= 50) {
    const productClaims = highConfidenceClaims(claimsByKind(claims, "product"));
    if (productClaims.length > 0) {
      hypotheses.push(
        `Product-market alignment (${scores.ideaVsMarket.adjustedScore}/100): ${summarizeClaims(productClaims.slice(0, 3))}`
      );
    } else {
      hypotheses.push(
        `Idea-vs-market score is ${scores.ideaVsMarket.adjustedScore}/100 but product claims are thin.`
      );
    }
  } else {
    gaps.push("Product-market fit signal below threshold");
  }

  // Traction as bonus hypothesis
  const tractionClaims = supportedClaims(claimsByKind(claims, "traction"));
  if (tractionClaims.length > 0) {
    hypotheses.push(
      `Early traction signals: ${summarizeClaims(tractionClaims.slice(0, 2))}`
    );
  }

  if (hypotheses.length === 0) {
    hypotheses.push(
      "No strong investment hypotheses could be formed from available data."
    );
  }

  const allRelevantClaims = [
    ...claimsByKind(claims, "founder"),
    ...claimsByKind(claims, "market"),
    ...claimsByKind(claims, "product"),
    ...claimsByKind(claims, "traction"),
  ];

  return {
    title: "Investment Hypotheses",
    content: hypotheses.join("\n\n"),
    supportingClaims: highConfidenceClaims(allRelevantClaims).map(claimRef),
    gaps,
  };
}

function buildSwot(
  dossier: DossierInput,
  scores: ScoringResult
): MemoSection {
  const { claims } = dossier;

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const opportunities: string[] = [];
  const threats: string[] = [];

  // Strengths: high-scoring axes + supported claims
  if (scores.founder.adjustedScore >= 70) {
    strengths.push(`Strong founder profile (${scores.founder.adjustedScore}/100)`);
  }
  if (scores.market.adjustedScore >= 70) {
    strengths.push(`Attractive market (${scores.market.adjustedScore}/100)`);
  }
  if (scores.ideaVsMarket.adjustedScore >= 70) {
    strengths.push(`Solid product-market fit (${scores.ideaVsMarket.adjustedScore}/100)`);
  }

  const supportedTraction = supportedClaims(claimsByKind(claims, "traction"));
  if (supportedTraction.length > 0) {
    strengths.push("Verified traction signals exist");
  }

  // Weaknesses: low-scoring axes + disputed claims
  if (scores.founder.adjustedScore < 50) {
    weaknesses.push(`Weak founder signal (${scores.founder.adjustedScore}/100): ${scores.founder.notes.slice(0, 2).join("; ") || "limited verified founder evidence"}`);
  }
  if (scores.market.adjustedScore < 50) {
    weaknesses.push(`Unfavorable market conditions (${scores.market.adjustedScore}/100): ${scores.market.notes.slice(0, 2).join("; ") || "market claims lack enough independent support"}`);
  }
  if (scores.ideaVsMarket.adjustedScore < 50) {
    weaknesses.push(`Weak product-market fit (${scores.ideaVsMarket.adjustedScore}/100): ${scores.ideaVsMarket.notes.slice(0, 2).join("; ") || "product and market claims are not yet sufficiently connected"}`);
  }

  const disputed = disputedClaims(claims);
  if (disputed.length > 0) {
    weaknesses.push(
      `${disputed.length} claim(s) disputed by evidence -- internal contradictions detected`
    );
  }

  const missing = missingEvidenceClaims(claims);
  if (missing.length > 0) {
    weaknesses.push(
      `${missing.length} claim(s) lack supporting evidence`
    );
  }

  // Opportunities: improving trends
  if (scores.founder.trend === "improving") {
    opportunities.push("Founder trajectory is improving");
  }
  if (scores.market.trend === "improving") {
    opportunities.push("Market conditions improving");
  }
  if (scores.ideaVsMarket.trend === "improving") {
    opportunities.push("Product-market fit strengthening");
  }

  // Threats: declining trends + contradictions
  if (scores.founder.trend === "declining") {
    threats.push("Founder momentum declining");
  }
  if (scores.market.trend === "declining") {
    threats.push("Market conditions deteriorating");
  }
  if (scores.ideaVsMarket.trend === "declining") {
    threats.push("Product-market fit weakening");
  }

  if (scores.coldStart) {
    threats.push(
      "Cold-start founder(s): limited historical data makes scoring unreliable"
    );
  }

  // Pad empty quadrants so the SWOT is always complete
  if (strengths.length === 0) strengths.push("No clear strengths identified");
  if (weaknesses.length === 0) weaknesses.push("No major weaknesses flagged");
  if (opportunities.length === 0) opportunities.push("No clear opportunities identified");
  if (threats.length === 0) threats.push("No immediate threats flagged");

  const content = [
    `Strengths: ${strengths.join("; ")}.`,
    `Weaknesses: ${weaknesses.join("; ")}.`,
    `Opportunities: ${opportunities.join("; ")}.`,
    `Threats: ${threats.join("; ")}.`,
  ].join("\n\n");

  const gaps: string[] = [];
  if (scores.overallConfidence < 0.4) {
    gaps.push("Overall evidence confidence is low -- SWOT may shift with more data");
  }

  return {
    title: "SWOT Analysis",
    content,
    supportingClaims: [
      ...disputed.map(claimRef),
      ...missing.map(claimRef),
    ],
    gaps,
  };
}

function buildProblemAndProduct(
  dossier: DossierInput,
  scores: ScoringResult
): MemoSection {
  const { claims, company } = dossier;

  const productClaims = claimsByKind(claims, "product");
  const companyClaims = claimsByKind(claims, "company");
  const gaps: string[] = [];

  const parts: string[] = [];

  // Problem statement -- pull from company-level claims
  const problemClaims = companyClaims.filter(
    (c) =>
      c.text.toLowerCase().includes("problem") ||
      c.text.toLowerCase().includes("pain") ||
      c.text.toLowerCase().includes("challenge")
  );

  if (problemClaims.length > 0) {
    parts.push(`Problem: ${summarizeClaims(problemClaims)}`);
  } else if (company.description) {
    parts.push(`Problem context: ${company.description}`);
  } else {
    parts.push("Problem statement not explicitly stated in available data.");
    gaps.push("No clear problem statement found");
  }

  // Product description
  if (productClaims.length > 0) {
    parts.push(`Product: ${summarizeClaims(productClaims)}`);
  } else {
    parts.push("No explicit product claims found in the data.");
    gaps.push("No product description claims");
  }

  // Idea-vs-market fit commentary
  parts.push(
    `Idea-vs-market alignment scored ${scores.ideaVsMarket.adjustedScore}/100 ` +
      `(confidence: ${Math.round(scores.ideaVsMarket.confidence * 100)}%, ` +
      `trend: ${scores.ideaVsMarket.trend}).`
  );

  if (scores.ideaVsMarket.notes.length > 0) {
    parts.push(scores.ideaVsMarket.notes.join(" "));
  }

  return {
    title: "Problem & Product",
    content: parts.join("\n\n"),
    supportingClaims: [...productClaims, ...problemClaims].map(claimRef),
    gaps,
  };
}

function buildTractionAndKpis(
  dossier: DossierInput,
  scores: ScoringResult
): MemoSection {
  const { claims } = dossier;

  const tractionClaims = claimsByKind(claims, "traction");
  const financialClaims = claimsByKind(claims, "financial");
  const gaps: string[] = [];

  const parts: string[] = [];

  if (tractionClaims.length > 0) {
    const supported = supportedClaims(tractionClaims);
    const unsupported = missingEvidenceClaims(tractionClaims);

    if (supported.length > 0) {
      parts.push(`Verified traction: ${summarizeClaims(supported)}`);
    }

    if (unsupported.length > 0) {
      parts.push(
        `Unverified traction claims (${unsupported.length}): ${summarizeClaims(unsupported)}`
      );
      gaps.push(`${unsupported.length} traction claim(s) lack evidence`);
    }
  } else {
    parts.push("No traction claims found. This is common for pre-seed companies.");
    gaps.push("No traction data available");
  }

  if (financialClaims.length > 0) {
    parts.push(`Financial signals: ${summarizeClaims(financialClaims)}`);
  } else {
    gaps.push("No financial data available");
  }

  // Flag contradictions in traction data specifically
  const disputedTraction = disputedClaims(tractionClaims);
  if (disputedTraction.length > 0) {
    parts.push(
      `Warning: ${disputedTraction.length} traction claim(s) are contradicted by other evidence. ` +
        `${summarizeClaims(disputedTraction)}`
    );
  }

  if (parts.length === 0) {
    parts.push("Insufficient data to assess traction or KPIs.");
  }

  return {
    title: "Traction & KPIs",
    content: parts.join("\n\n"),
    supportingClaims: [...tractionClaims, ...financialClaims].map(claimRef),
    gaps,
  };
}

// ── Red Team ──────────────────────────────────────────────────

function buildRedTeam(
  dossier: DossierInput,
  scores: ScoringResult
): RedTeam {
  const { claims } = dossier;

  // Find the weakest axis -- that's the bear case
  const axes: { axis: AxisScore; label: string }[] = [
    { axis: scores.founder, label: "Founder" },
    { axis: scores.market, label: "Market" },
    { axis: scores.ideaVsMarket, label: "Product-market fit" },
  ];

  // Sort weakest first
  axes.sort((a, b) => a.axis.adjustedScore - b.axis.adjustedScore);
  const weakest = axes[0];

  // Gather contradicting evidence
  const contradictingClaims = claims.filter((c) =>
    weakest.axis.contradictingClaimIds.includes(c.id)
  );

  // Also consider disputed claims across all axes
  const allDisputed = disputedClaims(claims);

  let headline: string;
  let detail: string;
  let mitigation: string;

  if (weakest.axis.adjustedScore < 40) {
    headline = `Critical weakness: ${weakest.label} scores only ${weakest.axis.adjustedScore}/100`;
    detail =
      `The ${weakest.label.toLowerCase()} axis is significantly below investment threshold. ` +
      (contradictingClaims.length > 0
        ? `${contradictingClaims.length} contradicting claim(s) found. `
        : "") +
      (weakest.axis.trend === "declining"
        ? "The trend is declining, suggesting the situation may worsen."
        : "");
    mitigation =
      `Would need ${weakest.label.toLowerCase()} score above 60 with supporting evidence ` +
      `to reconsider. Specific areas: ${weakest.axis.notes.slice(0, 2).join("; ") || "more data needed"}.`;
  } else if (allDisputed.length >= 2) {
    headline = `Internal contradictions: ${allDisputed.length} claims disputed by evidence`;
    detail =
      "Multiple claims made by the company are contradicted by independent evidence. " +
      "This pattern can indicate either data quality issues or deliberate misrepresentation. " +
      `Disputed claims: ${summarizeClaims(allDisputed.slice(0, 3))}`;
    mitigation =
      "Resolve contradictions through direct founder conversation or additional due diligence. " +
      "Each disputed claim should be addressed individually.";
  } else if (scores.coldStart) {
    headline = "Cold-start risk: insufficient data on founder(s)";
    detail =
      "One or more founders have minimal public track record. " +
      "Scores are capped and confidence is low. Investment would rely heavily " +
      "on direct evaluation rather than data-driven assessment.";
    mitigation =
      "Conduct extended founder interview. Look for references, prior work samples, " +
      "or domain expertise signals that might not appear in public data.";
  } else {
    // Everything looks decent -- find the most concerning signal
    const lowestConfidenceAxis = axes.sort(
      (a, b) => a.axis.confidence - b.axis.confidence
    )[0];

    headline = `Thin evidence: ${lowestConfidenceAxis.label} confidence is only ${Math.round(lowestConfidenceAxis.axis.confidence * 100)}%`;
    detail =
      `While scores are reasonable, the evidence base for ${lowestConfidenceAxis.label.toLowerCase()} ` +
      "is thin. The scores could shift significantly with new information.";
    mitigation =
      "Gather additional data sources before committing capital. " +
      "Even one strong independent source could materially change confidence levels.";
  }

  return {
    headline,
    detail,
    supportingClaims: [
      ...contradictingClaims.map(claimRef),
      ...allDisputed.slice(0, 3).map(claimRef),
    ],
    mitigation,
  };
}

// ── Decision Engine ───────────────────────────────────────────

/**
 * Makes the invest/pass decision based on axis scores, thesis fit,
 * and evidence quality. The logic is transparent -- every threshold
 * is documented so the investor knows exactly why.
 *
 * Decision ladder:
 *   INVEST:              All axes >= 60, thesis pass, confidence >= 0.5
 *   CONDITIONAL INVEST:  At least one axis >= 60, thesis pass, some gaps
 *   HOLD:                Mixed signals or thin evidence
 *   REJECT:              Any axis < 30, thesis fail, or severe contradictions
 */
function makeDecision(
  scores: ScoringResult,
  thesisResult: ThesisResult,
  claims: Claim[]
): Decision {
  // Hard reject: thesis failure
  if (!thesisResult.pass) {
    return "reject";
  }

  const axisScores = [
    scores.founder.adjustedScore,
    scores.market.adjustedScore,
    scores.ideaVsMarket.adjustedScore,
  ];

  const minScore = Math.min(...axisScores);
  const maxScore = Math.max(...axisScores);

  // Hard reject: any axis critically low
  if (minScore < 30) {
    return "reject";
  }

  // Hard reject: too many contradictions relative to total claims
  const disputed = disputedClaims(claims);
  if (claims.length > 0 && disputed.length / claims.length > 0.4) {
    return "reject";
  }

  // Invest: all axes strong, good confidence
  if (minScore >= 60 && scores.overallConfidence >= 0.5) {
    return "invest";
  }

  // Conditional invest: at least one strong axis, rest acceptable
  if (maxScore >= 60 && minScore >= 40) {
    return "conditional_invest";
  }

  // Everything else is a hold -- not bad enough to reject, not strong enough to invest
  return "hold";
}

/**
 * Builds the decision-flip analysis: what specific changes would
 * push the decision in either direction. This is the "wow factor" --
 * the investor sees not just the decision, but the exact conditions
 * that would change it.
 */
function buildDecisionFlip(
  decision: Decision,
  scores: ScoringResult,
  thesisResult: ThesisResult,
  claims: Claim[]
): DecisionFlip {
  const becomesInvestIf: string[] = [];
  const becomesRejectIf: string[] = [];

  const axes = [
    { label: "Founder", score: scores.founder },
    { label: "Market", score: scores.market },
    { label: "Idea-vs-market", score: scores.ideaVsMarket },
  ];

  // What would push toward invest
  if (decision !== "invest") {
    for (const a of axes) {
      if (a.score.adjustedScore < 60) {
        becomesInvestIf.push(
          `${a.label} score rises to 60+ (currently ${a.score.adjustedScore})`
        );
      }
    }

    if (scores.overallConfidence < 0.5) {
      becomesInvestIf.push(
        `Overall evidence confidence reaches 50%+ (currently ${Math.round(scores.overallConfidence * 100)}%)`
      );
    }

    if (!thesisResult.pass) {
      becomesInvestIf.push(
        `Thesis hard filters addressed: ${thesisResult.hardFailures.join(", ")}`
      );
    }

    if (scores.coldStart) {
      becomesInvestIf.push(
        "Cold-start founders build public track record or provide verifiable references"
      );
    }
  }

  // What would push toward reject
  if (decision !== "reject") {
    for (const a of axes) {
      if (a.score.adjustedScore >= 30) {
        becomesRejectIf.push(
          `${a.label} score drops below 30 (currently ${a.score.adjustedScore})`
        );
      }
      if (a.score.trend === "declining") {
        becomesRejectIf.push(
          `${a.label} decline continues -- already trending down`
        );
      }
    }

    const disputed = disputedClaims(claims);
    const disputeRatio = claims.length > 0 ? disputed.length / claims.length : 0;
    if (disputeRatio < 0.4) {
      becomesRejectIf.push(
        `Contradiction rate exceeds 40% (currently ${Math.round(disputeRatio * 100)}%)`
      );
    }

    if (thesisResult.pass) {
      becomesRejectIf.push("Company pivots into excluded sector or geography");
    }
  }

  // Ensure at least one entry in each direction
  if (becomesInvestIf.length === 0) {
    becomesInvestIf.push("Already at invest -- maintain current trajectory");
  }
  if (becomesRejectIf.length === 0) {
    becomesRejectIf.push("Already at reject -- no further downside to flag");
  }

  return {
    current: decision,
    becomesInvestIf,
    becomesRejectIf,
  };
}

// ── Main export ───────────────────────────────────────────────

/**
 * Generates a complete investment memo from a dossier and scoring results.
 *
 * This is a pure function -- no API calls, no LLM involved.
 * It structures the data into a readable memo format with every
 * statement traceable to specific claims and evidence.
 */
export function generateMemo(
  dossier: DossierInput,
  scores: ScoringResult,
  thesisResult: ThesisResult
): InvestmentMemo {
  const decision = makeDecision(scores, thesisResult, dossier.claims);

  return {
    companyId: dossier.company.id,
    companyName: dossier.company.name,

    sections: {
      companySnapshot: buildCompanySnapshot(dossier, scores, thesisResult),
      investmentHypotheses: buildInvestmentHypotheses(dossier, scores),
      swot: buildSwot(dossier, scores),
      problemAndProduct: buildProblemAndProduct(dossier, scores),
      tractionAndKpis: buildTractionAndKpis(dossier, scores),
    },

    redTeam: buildRedTeam(dossier, scores),

    decision,
    decisionFlip: buildDecisionFlip(decision, scores, thesisResult, dossier.claims),

    scores: {
      founder: {
        adjusted: scores.founder.adjustedScore,
        confidence: scores.founder.confidence,
        trend: scores.founder.trend,
      },
      market: {
        adjusted: scores.market.adjustedScore,
        confidence: scores.market.confidence,
        trend: scores.market.trend,
      },
      ideaVsMarket: {
        adjusted: scores.ideaVsMarket.adjustedScore,
        confidence: scores.ideaVsMarket.confidence,
        trend: scores.ideaVsMarket.trend,
      },
    },

    coldStart: scores.coldStart,
    thesisFit: thesisResult.fitScore,
    generatedAt: new Date().toISOString(),
  };
}
