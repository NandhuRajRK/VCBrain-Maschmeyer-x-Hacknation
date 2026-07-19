"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import styles from "./page.module.css";
import type { PipelineResult } from "../../../lib/api";
import { analyzePipeline } from "../../../lib/api";
import { DEFAULT_THESIS } from "../../../lib/thesis";

const DECISION_LABELS: Record<string, string> = {
  invest: "Invest",
  conditional_invest: "Conditional Invest",
  hold: "Hold",
  reject: "Reject",
};

const STATUS_LABELS: Record<string, string> = {
  supported: "Supported",
  extracted: "Extracted",
  disputed: "Disputed",
  missing_evidence: "No evidence",
};

const INDEPENDENCE_LABELS: Record<string, string> = {
  third_party: "Third party",
  company_owned: "Company owned",
  founder_provided: "Founder provided",
  unknown: "Unknown source",
};

function trendArrow(trend: string): string {
  if (trend === "improving") return "↗";
  if (trend === "declining") return "↘";
  return "→";
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function freshnessLabel(days: number | null): string {
  if (days === null || days === undefined) return "age unknown";
  if (days <= 30) return `${days}d old`;
  if (days <= 365) return `${Math.round(days / 30)}mo old`;
  return `${Math.round(days / 365)}y old`;
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

    (async () => {
      try {
        const r = await analyzePipeline(id, DEFAULT_THESIS);
        if (!cancelled) {
          setResult(r);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(String(err));
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return <div className={styles.state}>Analyzing company...</div>;
  }
  if (error) {
    return (
      <div className={styles.page}>
        <Link href="/" className={styles.back}>
          &#8592; Pipeline
        </Link>
        <div className={styles.stateError}>{error}</div>
      </div>
    );
  }
  if (!result) {
    return <div className={styles.state}>No data available.</div>;
  }

  const { dossier, thesis, scores, memo } = result;
  const company = dossier.company;

  const evidenceById = new Map(dossier.evidence.map((e) => [e.id, e]));

  const axes = [
    { key: "founder", label: "Founder", axis: scores.founder },
    { key: "market", label: "Market", axis: scores.market },
    { key: "idea", label: "Idea vs Market", axis: scores.ideaVsMarket },
  ];

  const sections = [
    memo.sections.companySnapshot,
    memo.sections.investmentHypotheses,
    memo.sections.swot,
    memo.sections.problemAndProduct,
    memo.sections.tractionAndKpis,
  ];

  return (
    <div className={styles.page}>
      <Link href="/" className={styles.back}>
        &#8592; Pipeline
      </Link>

      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.headerMain}>
          <h1 className={styles.title}>{company.name}</h1>
          <p className={styles.meta}>
            {[company.sector, company.stage, company.geography]
              .filter(Boolean)
              .join(" · ") || "No details"}
          </p>
          {company.description && (
            <p className={styles.description}>{company.description}</p>
          )}
        </div>
        <div className={styles.headerSide}>
          <span className={styles.decision} data-decision={memo.decision}>
            {DECISION_LABELS[memo.decision] ?? memo.decision}
          </span>
          <div className={styles.thesisFit}>
            <span>Thesis fit {pct(thesis.fitScore)}</span>
            {!thesis.pass && <span className={styles.thesisFail}>Fails filter</span>}
          </div>
        </div>
      </header>

      {/* ── Thesis hard failures ── */}
      {!thesis.pass && (
        <div className={styles.banner}>
          <span className={styles.bannerTitle}>Outside thesis</span>
          <span className={styles.bannerBody}>{thesis.hardFailures.join(" · ")}</span>
        </div>
      )}

      {/* ── Three-axis score ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Three-Axis Score</h2>
        <p className={styles.sectionNote}>
          Never averaged. Each axis stands on its own.
        </p>
        <div className={styles.axes}>
          {axes.map((a) => (
            <div key={a.key} className={styles.axisCard}>
              <div className={styles.axisHead}>
                <span className={styles.axisLabel}>{a.label}</span>
                <span className={styles.axisTrend}>{trendArrow(a.axis.trend)}</span>
              </div>
              <div className={styles.axisScore}>{a.axis.adjustedScore}</div>
              <div className={styles.axisRaw}>
                raw {a.axis.rawScore} &#183; conf {pct(a.axis.confidence)}
              </div>
              <div className={styles.axisBar}>
                <div
                  className={styles.axisBarFill}
                  style={{ width: `${Math.max(0, Math.min(100, a.axis.adjustedScore))}%` }}
                />
              </div>
              {a.axis.notes.length > 0 && (
                <ul className={styles.axisNotes}>
                  {a.axis.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Decision flip ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Decision Flip</h2>
        <p className={styles.sectionNote}>
          What would move this decision in either direction.
        </p>
        <div className={styles.flipGrid}>
          <div className={styles.flipCol}>
            <span className={styles.flipHead}>Becomes invest if</span>
            <ul className={styles.flipList}>
              {memo.decisionFlip.becomesInvestIf.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </div>
          <div className={styles.flipCol}>
            <span className={styles.flipHead}>Becomes reject if</span>
            <ul className={styles.flipList}>
              {memo.decisionFlip.becomesRejectIf.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Red team ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Red Team</h2>
        <p className={styles.sectionNote}>The strongest case against investing.</p>
        <div className={styles.redTeam}>
          <p className={styles.redHead}>{memo.redTeam.headline}</p>
          <p className={styles.redBody}>{memo.redTeam.detail}</p>
          <p className={styles.redMit}>
            <span className={styles.redMitLabel}>Mitigation</span>
            {memo.redTeam.mitigation}
          </p>
        </div>
      </section>

      {/* ── Memo ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Investment Memo</h2>
        {sections.map((sec, i) => (
          <div key={i} className={styles.memoBlock}>
            <h3 className={styles.memoTitle}>{sec.title}</h3>
            {sec.content.split("\n\n").map((para, j) => (
              <p key={j} className={styles.memoPara}>
                {para}
              </p>
            ))}
            {sec.gaps.length > 0 && (
              <div className={styles.gaps}>
                <span className={styles.gapsLabel}>Gaps</span>
                <span className={styles.gapsBody}>{sec.gaps.join(" · ")}</span>
              </div>
            )}
          </div>
        ))}
      </section>

      {/* ── Claims and evidence trail ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Claims &amp; Evidence</h2>
        <p className={styles.sectionNote}>
          {dossier.claims.length} claim
          {dossier.claims.length === 1 ? "" : "s"}. Every score traces back here.
        </p>
        <div className={styles.claims}>
          {dossier.claims.map((claim) => (
            <div key={claim.id} className={styles.claim}>
              <div className={styles.claimHead}>
                <span className={styles.claimKind}>{claim.kind}</span>
                <span className={styles.claimStatus} data-status={claim.status}>
                  {STATUS_LABELS[claim.status] ?? claim.status}
                </span>
                <span className={styles.claimTrust}>trust {pct(claim.confidence)}</span>
              </div>
              <p className={styles.claimText}>{claim.text}</p>
              <div className={styles.evidenceList}>
                {claim.evidence_ids.map((eid) => {
                  const ev = evidenceById.get(eid);
                  if (!ev) return null;
                  return (
                    <div key={eid} className={styles.evidence}>
                      <p className={styles.evQuote}>&ldquo;{ev.quote}&rdquo;</p>
                      <div className={styles.evMeta}>
                        <span>
                          {INDEPENDENCE_LABELS[ev.source_independence] ??
                            ev.source_independence}
                        </span>
                        <span>{freshnessLabel(ev.freshness_days)}</span>
                        <span>reliability {pct(ev.source_reliability)}</span>
                        <span>{ev.directness}</span>
                      </div>
                      {ev.confidence_reason && (
                        <p className={styles.evReason}>{ev.confidence_reason}</p>
                      )}
                    </div>
                  );
                })}
                {claim.evidence_ids.length === 0 && (
                  <p className={styles.evNone}>No evidence attached to this claim.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className={styles.footer}>
        Generated {new Date(memo.generatedAt).toLocaleString()} &#183;{" "}
        {scores.coldStart ? "Cold-start founder" : "Standard scoring"} &#183;{" "}
        overall confidence {pct(scores.overallConfidence)}
      </footer>
    </div>
  );
}
