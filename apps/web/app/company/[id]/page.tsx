"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { CircleHelp } from "lucide-react";
import styles from "./page.module.css";
import type { ApiCompanyTimeline, PipelineResult } from "../../../lib/api";
import { analyzePipeline, fetchTimeline } from "../../../lib/api";
import { DEFAULT_THESIS } from "../../../lib/thesis";
import { userError } from "../../../lib/errors";
import CompanyWorkspace, { type WorkspaceTab } from "./CompanyWorkspace";
import CompanyComments from "./CompanyComments";

const DECISION_LABELS: Record<string, string> = {
  invest: "Invest",
  conditional_invest: "Conditional Invest",
  hold: "Hold",
  reject: "Reject",
};

const DECISION_SUMMARIES: Record<string, string> = {
  invest: "Strong enough across all three axes to proceed.",
  conditional_invest: "Promising but needs additional data before committing.",
  hold: "Interesting thesis fit but scores fall short on one or more axes.",
  reject: "Does not meet the bar on scoring or thesis fit.",
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

function trendLabel(trend: string): string {
  if (trend === "improving") return "Improving";
  if (trend === "declining") return "Declining";
  return "Stable";
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function freshnessLabel(days: number | null): string {
  if (days === null || days === undefined) return "Age unknown";
  if (days === 0) return "Today";
  if (days <= 30) return `${days} days ago`;
  if (days <= 365) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 365)} years ago`;
}

function confidenceLevel(c: number): string {
  if (c >= 0.8) return "High";
  if (c >= 0.5) return "Medium";
  return "Low";
}

export default function CompanyDetail() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const [result, setResult] = useState<PipelineResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<ApiCompanyTimeline | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("readiness");

  useEffect(() => {
    let cancelled = false;
    if (!id) return;

    (async () => {
      try {
        const [r, history] = await Promise.all([analyzePipeline(id, DEFAULT_THESIS), fetchTimeline(id)]);
        if (!cancelled) {
          setResult(r);
          setTimeline(history);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(userError(err, "company"));
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return <div className={styles.state}>Analyzing company...</div>;
  }
  if (error) {
    return (
      <div className={styles.page}>
        <Link href="/" className={styles.back}>&#8592; Pipeline</Link>
        <div className={styles.stateError}>{error}</div>
      </div>
    );
  }
  if (!result) {
    return <div className={styles.state}>No data available.</div>;
  }

  const { dossier, thesis, scores, memo } = result;
  const company = dossier.company;
  const evidenceById = new Map(dossier.evidence.map((e) => [e.id, e] as const));
  const sourceById = new Map(dossier.sources.map((source) => [source.id, source] as const));

  const axes = [
    { key: "founder", label: "Founder", axis: scores.founder },
    { key: "market", label: "Market", axis: scores.market },
    { key: "idea", label: "Idea vs Market", axis: scores.ideaVsMarket },
  ];

  const axisHelp: Record<string, string> = {
    founder: "Founder score uses founder claims, career and public work signals, founder-score evidence, contradictions, freshness, and a cold-start cap.",
    market: "Market score uses market and traction claims, external signals, source independence, evidence freshness, and contradiction checks.",
    idea: "Idea-vs-market score uses product, market, and traction claims to test whether the product solves a real market problem.",
  };

  /* Evidence quality: proportion of claims that are "supported" */
  const supportedClaims = dossier.claims.filter((c) => c.status === "supported").length;
  const thirdPartyEvidence = dossier.evidence.filter((e) => e.source_independence === "third_party").length;

  const sections = [
    memo.sections.investmentHypotheses,
    memo.sections.swot,
    memo.sections.problemAndProduct,
    memo.sections.tractionAndKpis,
  ];

  return (
    <CompanyComments companyId={id!}>
    <div className={styles.page}>
      <Link href="/" className={styles.back}>&#8592; Pipeline</Link>

      {/* ── Verdict card (the first thing a VC reads) ── */}
      <div className={styles.verdict}>
        <div className={styles.verdictMain}>
          <h1 className={styles.title}>{company.name}</h1>
          <p className={styles.meta}>
            {[company.sector, company.stage, company.geography]
              .filter(Boolean)
              .join(" · ") || "No details"}
          </p>
          <p className={styles.verdictSummary}>
            {DECISION_SUMMARIES[memo.decision] ?? ""}
          </p>
        </div>
        <div className={styles.verdictSide}>
          <span className={styles.decision} data-decision={memo.decision}>
            {DECISION_LABELS[memo.decision] ?? memo.decision}
          </span>
          <div className={styles.verdictStats}>
            <div className={styles.verdictStat}>
              <span className={styles.verdictStatValue}>{pct(thesis.fitScore)}</span>
              <span className={styles.verdictStatLabel}>Thesis fit</span>
            </div>
            <div className={styles.verdictStat}>
              <span className={styles.verdictStatValue}>{pct(scores.overallConfidence)}</span>
              <span className={styles.verdictStatLabel}>Confidence</span>
            </div>
          </div>
          {!thesis.pass && (
            <span className={styles.thesisFail}>Fails thesis filter</span>
          )}
        </div>
      </div>

      <CompanyWorkspace companyId={company.id} onTabChange={setActiveTab} />

      {/* ── Thesis hard failures ── */}
      {activeTab === "readiness" && !thesis.pass && (
        <div className={styles.banner}>
          <span className={styles.bannerTitle}>Outside thesis</span>
          <span className={styles.bannerBody}>{thesis.hardFailures.join(" · ")}</span>
        </div>
      )}

      {activeTab === "analysis" && <>
      {/* ── Key risks (VCs need to see red flags immediately) ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Key Risks</h2>
        {scores.risks.length > 0 ? (
          <div className={styles.riskList}>
            {scores.risks.map((risk, i) => (
              <div key={i} className={styles.riskItem}>{risk}</div>
            ))}
          </div>
        ) : !memo.redTeam.headline ? (
          <p className={styles.emptyState}>No quantified risks have been flagged.</p>
        ) : null}
        {memo.redTeam.headline ? (
          <div className={styles.redTeam}>
            <p className={styles.redHead}>{memo.redTeam.headline}</p>
            <p className={styles.redBody}>{memo.redTeam.detail}</p>
            <p className={styles.redMit}>
              <span className={styles.redMitLabel}>Mitigation</span>
              {memo.redTeam.mitigation}
            </p>
          </div>
        ) : (
          <p className={styles.emptyState}>Red-team analysis is not available for this dossier.</p>
        )}
      </section>

      </>}

      {/* ── Founders (VCs bet on people) ── */}
      {activeTab === "founders" && <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          Founders ({dossier.founders.length})
        </h2>
        {dossier.founders.length > 0 ? (
          <div className={styles.founders}>
            {dossier.founders.map((f) => {
              const fScore = dossier.founder_scores.find((fs) => fs.founder_id === f.id);
              return (
                <div key={f.id} className={styles.founderCard}>
                  <div className={styles.founderInfo}>
                    <span className={styles.founderName}>{f.name}</span>
                    {f.role && <span className={styles.founderRole}>{f.role}</span>}
                  </div>
                  <div className={styles.founderMeta}>
                    {f.linkedin && (
                      <a href={f.linkedin} target="_blank" rel="noopener noreferrer" className={styles.founderLink}>LinkedIn</a>
                    )}
                    {f.github && (
                      <a href={`https://github.com/${f.github}`} target="_blank" rel="noopener noreferrer" className={styles.founderLink}>GitHub</a>
                    )}
                    {f.cold_start && <span className={styles.founderColdStart}>Cold start</span>}
                  </div>
                  {fScore && (
                    <div className={styles.founderScore}>
                      <span className={styles.founderScoreValue}>{fScore.score}</span>
                      <span className={styles.founderScoreConf}>conf {pct(fScore.confidence)}</span>
                      <span className={styles.founderScoreEv}>{fScore.evidence_count} evidence</span>
                      {fScore.contradiction_count > 0 && (
                        <span className={styles.founderContra}>{fScore.contradiction_count} contradiction{fScore.contradiction_count !== 1 ? "s" : ""}</span>
                      )}
                    </div>
                  )}
                  {fScore && fScore.notes.length > 0 && (
                    <div className={styles.founderNotes}>
                      {fScore.notes.map((n, i) => (
                        <span key={i} className={styles.founderNote}>{n}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className={styles.emptyState}>No founder profiles are linked to this company yet.</p>
        )}
      </section>}

      {/* ── Three-axis score ── */}
      {activeTab === "analysis" && <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Three-Axis Score <span className={styles.infoTip} title="Each axis is scored independently. The final decision does not average them into one hidden number." aria-label="How three-axis scoring works"><CircleHelp size={14} /></span></h2>
        <p className={styles.sectionNote}>
          Never averaged. Each axis stands on its own.
        </p>
        <div className={styles.axes}>
          {axes.map((a) => (
            <div key={a.key} className={styles.axisCard}>
              <div className={styles.axisHead}>
                <span className={styles.axisLabel}>{a.label} <span className={styles.infoTip} title={axisHelp[a.key]} aria-label={`${a.label} score explanation`}><CircleHelp size={13} /></span></span>
                <span className={styles.axisTrend}>
                  {trendArrow(a.axis.trend)} {trendLabel(a.axis.trend)}
                </span>
              </div>
              <div className={styles.axisScore}>{a.axis.adjustedScore}</div>
              <div className={styles.axisRaw} title="Raw is the signal score before evidence quality adjustment. The displayed score is adjusted using source independence, freshness, directness, and confidence. Confidence measures how strongly the available claims support the axis.">
                raw {a.axis.rawScore} · conf {pct(a.axis.confidence)} · {confidenceLevel(a.axis.confidence)} <span className={styles.infoTip} aria-hidden="true"><CircleHelp size={12} /></span>
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
              {a.axis.notes.length === 0 && <p className={styles.axisEmpty}>No supporting notes.</p>}
            </div>
          ))}
        </div>
      </section>}

      {/* ── Evidence quality gauge ── */}
      {activeTab === "timeline" && <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Evidence Quality</h2>
        <p className={styles.sectionNote}>
          How much should you trust these scores? Based on {dossier.claims.length} claims
          and {dossier.evidence.length} evidence items.
        </p>
        <div className={styles.evidenceQuality}>
          <div className={styles.eqStat}>
            <span className={styles.eqValue}>{supportedClaims}/{dossier.claims.length}</span>
            <span className={styles.eqLabel}>Claims supported</span>
          </div>
          <div className={styles.eqStat}>
            <span className={styles.eqValue}>{thirdPartyEvidence}</span>
            <span className={styles.eqLabel}>Third-party sources</span>
          </div>
          <div className={styles.eqStat}>
            <span className={styles.eqValue}>{dossier.sources.length}</span>
            <span className={styles.eqLabel}>Total sources</span>
          </div>
          <div className={styles.eqStat}>
            <span className={styles.eqValue}>{confidenceLevel(scores.overallConfidence)}</span>
            <span className={styles.eqLabel}>Overall confidence</span>
          </div>
        </div>
      </section>}

      {/* ── Decision flip ── */}
      {activeTab === "analysis" && <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Decision Flip <span className={styles.infoTip} title="These are threshold changes that would alter the decision: axis scores, evidence confidence, thesis fit, contradictions, and founder cold-start risk." aria-label="What drives decision flip conditions"><CircleHelp size={14} /></span></h2>
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
            {memo.decisionFlip.becomesInvestIf.length === 0 && <p className={styles.axisEmpty}>No positive trigger recorded.</p>}
          </div>
          <div className={styles.flipCol}>
            <span className={styles.flipHead}>Becomes reject if</span>
            <ul className={styles.flipList}>
              {memo.decisionFlip.becomesRejectIf.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
            {memo.decisionFlip.becomesRejectIf.length === 0 && <p className={styles.axisEmpty}>No downside trigger recorded.</p>}
          </div>
        </div>
      </section>}

      {/* ── Memo ── */}
      {activeTab === "analysis" && <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Investment Memo <span className={styles.infoTip} title="The memo is generated from the dossier claims, evidence quality, founder scores, three-axis analysis, thesis fit, contradictions, and identified gaps." aria-label="What drives the investment memo"><CircleHelp size={14} /></span></h2>
        {sections.map((sec, i) => (
          <div key={i} className={styles.memoBlock}>
            <h3 className={styles.memoTitle}>{sec.title}</h3>
            {sec.content ? sec.content.split("\n\n").map((para, j) => (
              <p key={j} className={styles.memoPara}>{para}</p>
            )) : <p className={styles.emptyState}>No memo content is available for this section.</p>}
            {sec.gaps.length > 0 && (
              <div className={styles.gaps}>
                <span className={styles.gapsLabel}>Gaps</span>
                <span className={styles.gapsBody}>{sec.gaps.join(" · ")}</span>
              </div>
            )}
          </div>
        ))}
      </section>}

      {/* ── Claims and evidence trail ── */}
      {activeTab === "timeline" && <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Claims &amp; Evidence</h2>
        <p className={styles.sectionNote}>
          {dossier.claims.length} claim{dossier.claims.length === 1 ? "" : "s"} linked to {dossier.sources.length} source{dossier.sources.length === 1 ? "" : "s"}.
        </p>
        <div className={styles.claims}>
          {dossier.claims.length === 0 && <p className={styles.emptyState}>No claims have been extracted from the available sources.</p>}
          {dossier.claims.map((claim) => (
            <div key={claim.id} className={styles.claim}>
              <div className={styles.claimHead}>
                <span className={styles.claimKind}>{claim.kind}</span>
                <span className={styles.claimStatus} data-status={claim.status}>
                  {STATUS_LABELS[claim.status] ?? claim.status}
                </span>
                <span className={styles.claimTrust}>trust {pct(claim.confidence)}</span>
              </div>
              <div className={styles.claimLabel}>Claim</div>
              <p className={styles.claimText}>{claim.text}</p>
              <div className={styles.evidenceList}>
                <div className={styles.evidenceHeading}>Supporting evidence <span>{claim.evidence_ids.filter((eid) => evidenceById.has(eid)).length}</span></div>
                {claim.evidence_ids.map((eid) => {
                  const ev = evidenceById.get(eid);
                  if (!ev) return null;
                  const source = sourceById.get(ev.source_id);
                  return (
                    <div key={eid} className={styles.evidence}>
                      <div className={styles.sourceLine}><strong>{source?.title || "Unknown source"}</strong><span>{source?.source_type?.replaceAll("_", " ") || "source"}</span></div>
                      <p className={styles.evQuote}>&ldquo;{ev.quote}&rdquo;</p>
                      <div className={styles.evMeta}>
                        <span><b>Independence</b>{INDEPENDENCE_LABELS[ev.source_independence] ?? ev.source_independence}</span>
                        <span><b>Freshness</b>{freshnessLabel(ev.freshness_days)}</span>
                        <span><b>Reliability</b>{pct(ev.source_reliability)}</span>
                        <span><b>Directness</b>{ev.directness}</span>
                      </div>
                      {ev.confidence_reason && (
                        <p className={styles.evReason}>{ev.confidence_reason}</p>
                      )}
                    </div>
                  );
                })}
                {(claim.evidence_ids.length === 0 || claim.evidence_ids.every((eid) => !evidenceById.has(eid))) && (
                  <p className={styles.evNone}>No evidence attached to this claim.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>}

      {activeTab === "timeline" && timeline && <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Evidence history</h2>
        <p className={styles.sectionNote}>Score changes, claim changes, and trigger events after the evidence review above.</p>
        {[...timeline.trigger_events.map((item) => ({ at: item.created_at, title: item.kind.replaceAll("_", " "), body: item.message })), ...timeline.claim_changes.map((item) => ({ at: item.created_at, title: `${item.previous_status} → ${item.current_status}`, body: item.reason })), ...timeline.score_snapshots.map((item) => ({ at: item.created_at, title: `Founder score ${item.score}`, body: item.reason }))].sort((a, b) => b.at.localeCompare(a.at)).map((item, index) => <div className={styles.timelineItem} key={`${item.at}-${index}`}><time>{new Date(item.at).toLocaleString()}</time><div><strong>{item.title}</strong><p>{item.body}</p></div></div>)}
        {timeline.trigger_events.length + timeline.claim_changes.length + timeline.score_snapshots.length === 0 && <p className={styles.emptyState}>No evidence history has been recorded yet.</p>}
      </section>}

      <footer className={styles.footer}>
        Generated {new Date(memo.generatedAt).toLocaleString()} · {scores.coldStart ? "Cold-start founder" : "Standard scoring"} · overall confidence {pct(scores.overallConfidence)}
      </footer>
    </div>
    </CompanyComments>
  );
}
