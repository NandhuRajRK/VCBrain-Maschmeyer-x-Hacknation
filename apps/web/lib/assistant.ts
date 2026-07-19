/* ── Assistant helpers ──────────────────────────────────────────
 * Turns the analysed pipeline into a compact text context the model
 * can reason over, plus the chat message shape and a few starter
 * questions. The context is rebuilt from live data every time, so the
 * assistant always answers over the current portfolio.
 */

import type { PipelineResult } from "./api";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface PortfolioItem {
  company: {
    name: string;
    sector: string | null;
    stage: string | null;
    geography: string | null;
    description: string | null;
  };
  pipeline: PipelineResult;
}

export const SUGGESTED_QUESTIONS: string[] = [
  "Which companies are closest to an invest decision?",
  "What are the biggest risks across the pipeline?",
  "Which founders are cold starts?",
  "Who has the strongest market score?",
];

function decisionWords(decision: string): string {
  switch (decision) {
    case "invest":
      return "invest";
    case "conditional_invest":
      return "conditional invest";
    case "hold":
      return "hold";
    case "reject":
      return "reject";
    default:
      return decision;
  }
}

/** One dense line per company, plus a header. Kept compact on purpose. */
export function buildPortfolioContext(items: PortfolioItem[]): string {
  if (items.length === 0) return "";

  const lines = items.map((item) => {
    const c = item.company;
    const s = item.pipeline.scores;
    const t = item.pipeline.thesis;
    const f = s.founder.adjustedScore;
    const m = s.market.adjustedScore;
    const i = s.ideaVsMarket.adjustedScore;
    const weakest = Math.min(f, m, i);
    const where = [c.sector, c.stage, c.geography].filter(Boolean).join(", ") || "details unknown";
    const fit = Math.round(t.fitScore * 100);
    const conf = Math.round(s.overallConfidence * 100);
    const risks = s.risks.length > 0 ? `risks: ${s.risks.join("; ")}` : "no flagged risks";
    const cold = s.coldStart ? "cold start founder; " : "";
    return (
      `- ${c.name} (${where}): decision ${decisionWords(item.pipeline.memo.decision)}; ` +
      `founder ${f}, market ${m}, idea vs market ${i} (weakest ${weakest}); ` +
      `thesis fit ${fit}% ${t.pass ? "pass" : "fail"}; evidence quality ${conf}%; ` +
      `${cold}${risks}.`
    );
  });

  return `Portfolio of ${items.length} compan${items.length === 1 ? "y" : "ies"} under review:\n${lines.join("\n")}`;
}
