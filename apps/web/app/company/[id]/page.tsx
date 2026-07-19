"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import styles from "./page.module.css";
import type { PipelineResult } from "../../../lib/api";
import { analyzePipeline } from "../../../lib/api";
import { DEFAULT_THESIS } from "../../../lib/thesis";
import { userError } from "../../../lib/errors";
import CompanyWorkspace from "./CompanyWorkspace";

const DECISION_LABELS: Record<string, string> = {
  invest: "Invest",
  conditional_invest: "Conditional invest",
  hold: "Hold",
  reject: "Reject",
};

const DECISION_SUMMARIES: Record<string, string> = {
  invest: "The evidence clears the current underwriting bar.",
  conditional_invest: "Promising, with specific evidence still needed before committing.",
  hold: "Worth tracking, but not yet strong enough to advance.",
  reject: "The current evidence does not meet the investment bar.",
};

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export default function CompanyDetail() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!id) return;
    void analyzePipeline(id, DEFAULT_THESIS)
      .then((pipeline) => { if (!cancelled) setResult(pipeline); })
      .catch((caught) => { if (!cancelled) setError(userError(caught, "company")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  if (loading) return <div className={styles.state}>Preparing the decision workspace…</div>;
  if (error) return <div className={styles.page}><Link href="/" className={styles.back}>← Dashboard</Link><div className={styles.stateError}>{error}</div></div>;
  if (!result) return <div className={styles.state}>No data available.</div>;

  const { dossier, thesis, scores, memo } = result;
  const company = dossier.company;
  const advanceSignals = memo.decisionFlip.becomesInvestIf.slice(0, 2);

  return <div className={styles.page}>
    <Link href="/" className={styles.back}>← Dashboard</Link>
    <header className={styles.verdict}>
      <div className={styles.verdictMain}>
        <p className={styles.decisionEyebrow}>Investment decision</p>
        <h1 className={styles.title}>{company.name}</h1>
        <p className={styles.meta}>{[company.sector, company.stage, company.geography].filter(Boolean).join(" · ") || "Profile in progress"}</p>
        <p className={styles.verdictSummary}>{DECISION_SUMMARIES[memo.decision] ?? "Review the evidence before advancing."}</p>
        {advanceSignals.length > 0 && <p className={styles.advanceCue}><span>To advance</span>{advanceSignals.join(" · ")}</p>}
      </div>
      <div className={styles.verdictSide}>
        <span className={styles.decision} data-decision={memo.decision}>{DECISION_LABELS[memo.decision] ?? memo.decision}</span>
        <div className={styles.verdictStats}>
          <div className={styles.verdictStat}><span className={styles.verdictStatValue}>{pct(thesis.fitScore)}</span><span className={styles.verdictStatLabel}>Thesis fit</span></div>
          <div className={styles.verdictStat}><span className={styles.verdictStatValue}>{pct(scores.overallConfidence)}</span><span className={styles.verdictStatLabel}>Confidence</span></div>
        </div>
        {!thesis.pass && <span className={styles.thesisFail}>Outside current thesis</span>}
      </div>
    </header>

    <CompanyWorkspace
      companyId={company.id}
      decisionContext={{
        risks: scores.risks.slice(0, 3),
        redTeam: memo.redTeam.headline ? { headline: memo.redTeam.headline, mitigation: memo.redTeam.mitigation } : null,
        advanceSignals,
      }}
    />
  </div>;
}
