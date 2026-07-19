"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import styles from "./page.module.css";
import type { PipelineResult } from "../lib/api";
import { listCompanies, analyzePipeline } from "../lib/api";
import { DEFAULT_THESIS } from "../lib/thesis";

const PAGE_SIZE = 8;

interface CompanyRow {
  company: { id: string; name: string; sector: string | null; stage: string | null; geography: string | null; description: string | null; website: string | null; created_at: string };
  pipeline: PipelineResult | null;
  loading: boolean;
  error: string | null;
}

type SortKey = "name" | "decision" | "founder" | "market" | "idea" | "fit" | "none";
type SortDir = "asc" | "desc";
type DecisionFilter = "all" | "invest" | "conditional_invest" | "hold" | "reject";

const DECISION_ORDER: Record<string, number> = {
  invest: 0,
  conditional_invest: 1,
  hold: 2,
  reject: 3,
};

function decisionLabel(decision: string): string {
  const labels: Record<string, string> = {
    invest: "Invest",
    conditional_invest: "Conditional",
    hold: "Hold",
    reject: "Reject",
  };
  return labels[decision] ?? decision;
}

function trendArrow(trend: string): string {
  if (trend === "improving") return "↗";
  if (trend === "declining") return "↘";
  return "→";
}

function sortIndicator(active: boolean, dir: SortDir): string {
  if (!active) return "";
  return dir === "asc" ? " ▴" : " ▾";
}

export default function Dashboard() {
  const [rows, setRows] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("none");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filter, setFilter] = useState<DecisionFilter>("all");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const companies = await listCompanies();
        if (cancelled) return;

        const initial: CompanyRow[] = companies.map((c) => ({
          company: c,
          pipeline: null,
          loading: true,
          error: null,
        }));
        setRows(initial);
        setLoading(false);

        const queue = [...companies];
        const running = new Set<Promise<void>>();

        for (const company of queue) {
          const task = (async () => {
            try {
              const result = await analyzePipeline(company.id, DEFAULT_THESIS);
              if (cancelled) return;
              setRows((prev) =>
                prev.map((r) =>
                  r.company.id === company.id
                    ? { ...r, pipeline: result, loading: false }
                    : r
                )
              );
            } catch (err) {
              if (cancelled) return;
              setRows((prev) =>
                prev.map((r) =>
                  r.company.id === company.id
                    ? { ...r, loading: false, error: String(err) }
                    : r
                )
              );
            }
          })().then(() => {
            running.delete(task);
          });
          running.add(task);
          if (running.size >= 4) {
            await Promise.race(running);
          }
        }
        await Promise.all(running);
      } catch (err) {
        if (cancelled) return;
        setError(String(err));
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  /* ── Sorting ── */

  const handleSort = useCallback((key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPage(1);
  }, [sortKey]);

  /* ── Filter + sort pipeline ── */

  const analyzed = rows.filter((r) => r.pipeline !== null);
  const investCount = analyzed.filter((r) => r.pipeline?.memo.decision === "invest").length;
  const conditionalCount = analyzed.filter((r) => r.pipeline?.memo.decision === "conditional_invest").length;
  const holdCount = analyzed.filter((r) => r.pipeline?.memo.decision === "hold").length;
  const rejectCount = analyzed.filter((r) => r.pipeline?.memo.decision === "reject").length;

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((r) => r.pipeline?.memo.decision === filter);
  }, [rows, filter]);

  const sorted = useMemo(() => {
    if (sortKey === "none") return filtered;

    return [...filtered].sort((a, b) => {
      const ap = a.pipeline;
      const bp = b.pipeline;

      if (!ap && !bp) return 0;
      if (!ap) return 1;
      if (!bp) return -1;

      let cmp = 0;

      switch (sortKey) {
        case "name":
          cmp = a.company.name.localeCompare(b.company.name);
          break;
        case "decision":
          cmp = (DECISION_ORDER[ap.memo.decision] ?? 99) - (DECISION_ORDER[bp.memo.decision] ?? 99);
          break;
        case "founder":
          cmp = ap.scores.founder.adjustedScore - bp.scores.founder.adjustedScore;
          break;
        case "market":
          cmp = ap.scores.market.adjustedScore - bp.scores.market.adjustedScore;
          break;
        case "idea":
          cmp = ap.scores.ideaVsMarket.adjustedScore - bp.scores.ideaVsMarket.adjustedScore;
          break;
        case "fit":
          cmp = ap.thesis.fitScore - bp.thesis.fitScore;
          break;
      }

      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  /* ── Pagination ── */

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pageRows = sorted.slice(startIndex, startIndex + PAGE_SIZE);

  /* ── Weekly investment desk ── */

  const priorityRows = useMemo(() => [...analyzed]
    .sort((a, b) => {
      const aPipeline = a.pipeline!;
      const bPipeline = b.pipeline!;
      const decisionDelta = (DECISION_ORDER[aPipeline.memo.decision] ?? 99) - (DECISION_ORDER[bPipeline.memo.decision] ?? 99);
      if (decisionDelta !== 0) return decisionDelta;
      return (bPipeline.thesis.fitScore * 100 + bPipeline.scores.overallConfidence * 20)
        - (aPipeline.thesis.fitScore * 100 + aPipeline.scores.overallConfidence * 20);
    })
    .slice(0, 3), [analyzed]);

  const actionRows = priorityRows
    .filter((row) => row.pipeline!.memo.decision !== "reject")
    .slice(0, 3);

  const sourceSummary = useMemo(() => {
    const sources = analyzed.flatMap((row) => row.pipeline!.dossier.sources);
    const counts = new Map<string, number>();
    sources.forEach((source) => {
      const label = source.source_type.replace(/[_-]/g, " ");
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [analyzed]);

  const handleFilter = useCallback((d: DecisionFilter) => {
    setFilter((prev) => (prev === d ? "all" : d));
    setPage(1);
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Welcome back, Julia</h1>
        </div>
      </header>

      {analyzed.length > 0 && (
        <section className={styles.cockpit} aria-label="This week">
          <div className={styles.cockpitLead}>
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.sectionKicker}>Move now</p>
                <h2>Priority introductions</h2>
              </div>
              <span className={styles.sectionMeta}>{priorityRows.length} recommendations</span>
            </div>

            <div className={styles.priorityList}>
              {priorityRows.map((row, index) => {
                const pipeline = row.pipeline!;
                const evidence = pipeline.memo.sections.investmentHypotheses.supportingClaims[0]
                  ?? pipeline.memo.sections.companySnapshot.supportingClaims[0];
                const reason = evidence?.text ?? row.company.description ?? "Evidence is still being assembled for this opportunity.";

                return (
                  <a key={row.company.id} href={`/company/${row.company.id}`} className={styles.priorityCard}>
                    <span className={styles.priorityNumber}>0{index + 1}</span>
                    <div className={styles.priorityBody}>
                      <div className={styles.priorityTopline}>
                        <div>
                          <h3>{row.company.name}</h3>
                          <p>{[row.company.sector, row.company.stage, row.company.geography].filter(Boolean).join(" · ") || "Opportunity profile"}</p>
                        </div>
                        <span className={styles.decision} data-decision={pipeline.memo.decision}>{decisionLabel(pipeline.memo.decision)}</span>
                      </div>
                      <p className={styles.priorityReason}>{reason}</p>
                      <div className={styles.priorityFooter}>
                        <span>Trust {Math.round(pipeline.scores.overallConfidence * 100)}%</span>
                        <span>F {pipeline.scores.founder.adjustedScore}</span>
                        <span>M {pipeline.scores.market.adjustedScore}</span>
                        <span>I/M {pipeline.scores.ideaVsMarket.adjustedScore}</span>
                        <span className={styles.priorityAction}>Review memo →</span>
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>

          <aside className={styles.cockpitSide}>
            <div className={styles.sidePanel}>
              <div className={styles.sectionHeading}>
                <div>
                  <p className={styles.sectionKicker}>Human actions</p>
                  <h2>Make progress today</h2>
                </div>
              </div>
              <div className={styles.actionList}>
                {actionRows.map((row) => {
                  const pipeline = row.pipeline!;
                  const hasGaps = pipeline.scores.risks.length > 0 || pipeline.scores.coldStart;
                  return (
                    <a key={row.company.id} href={`/company/${row.company.id}`} className={styles.actionItem}>
                      <span className={styles.actionMark} data-decision={pipeline.memo.decision} />
                      <span><strong>{hasGaps ? "Resolve evidence" : "Book an introduction"}</strong><small>{row.company.name} · {hasGaps ? `${pipeline.scores.risks.length || 1} item to verify` : "decision-ready"}</small></span>
                      <span aria-hidden="true">→</span>
                    </a>
                  );
                })}
              </div>
            </div>

            <div className={styles.sidePanel}>
              <div className={styles.sectionHeading}>
                <div>
                  <p className={styles.sectionKicker}>Sourcing intelligence</p>
                  <h2>Where conviction is coming from</h2>
                </div>
              </div>
              <div className={styles.sourceList}>
                {sourceSummary.length > 0 ? sourceSummary.map(([source, count]) => (
                  <div key={source} className={styles.sourceRow}><span>{source}</span><span>{count}</span></div>
                )) : <p className={styles.noSources}>Source signals will appear as dossiers are enriched.</p>}
              </div>
            </div>
          </aside>
        </section>
      )}

      {/* ── Summary cards (clickable as filters) ── */}
      <div className={styles.stats}>
        <button
          type="button"
          className={styles.stat}
          data-active={filter === "all"}
          data-decision="all"
          onClick={() => handleFilter("all")}
        >
          <span className={styles.statValue}>{rows.length}</span>
          <span className={styles.statLabel}>Total</span>
        </button>
        <button
          type="button"
          className={styles.stat}
          data-active={filter === "invest"}
          data-decision="invest"
          onClick={() => handleFilter("invest")}
        >
          <span className={styles.statValue}>{investCount}</span>
          <span className={styles.statLabel}>Invest</span>
        </button>
        <button
          type="button"
          className={styles.stat}
          data-active={filter === "hold"}
          data-decision="hold"
          onClick={() => handleFilter("hold")}
        >
          <span className={styles.statValue}>{holdCount}</span>
          <span className={styles.statLabel}>Hold</span>
        </button>
        <button
          type="button"
          className={styles.stat}
          data-active={filter === "conditional_invest"}
          data-decision="conditional_invest"
          onClick={() => handleFilter("conditional_invest")}
        >
          <span className={styles.statValue}>{conditionalCount}</span>
          <span className={styles.statLabel}>Conditional</span>
        </button>
        <button
          type="button"
          className={styles.stat}
          data-active={filter === "reject"}
          data-decision="reject"
          onClick={() => handleFilter("reject")}
        >
          <span className={styles.statValue}>{rejectCount}</span>
          <span className={styles.statLabel}>Reject</span>
        </button>
      </div>

      {/* ── Loading / error states ── */}
      {loading && (
        <div className={styles.empty}>
          <p className={styles.emptyText}>Loading pipeline...</p>
        </div>
      )}

      {error && (
        <div className={styles.empty}>
          <p className={styles.emptyError}>{error}</p>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className={styles.empty}>
          <p className={styles.emptyText}>No companies in pipeline yet.</p>
          <p className={styles.emptyHint}>
            Submit a new application or seed demo data to get started.
          </p>
        </div>
      )}

      {/* ── Company list ── */}
      {sorted.length > 0 && (
        <div className={styles.list}>
          <div className={styles.listHeader}>
            <button type="button" className={styles.colHeaderCompany} onClick={() => handleSort("name")}>
              Company{sortIndicator(sortKey === "name", sortDir)}
            </button>
            <button type="button" className={styles.colHeaderCenter} onClick={() => handleSort("decision")}>
              Decision{sortIndicator(sortKey === "decision", sortDir)}
            </button>
            <button type="button" className={styles.colHeaderCenter} onClick={() => handleSort("founder")}>
              Founder{sortIndicator(sortKey === "founder", sortDir)}
            </button>
            <button type="button" className={styles.colHeaderCenter} onClick={() => handleSort("market")}>
              Market{sortIndicator(sortKey === "market", sortDir)}
            </button>
            <button type="button" className={styles.colHeaderCenter} onClick={() => handleSort("idea")}>
              Idea / Mkt{sortIndicator(sortKey === "idea", sortDir)}
            </button>
            <button type="button" className={styles.colHeaderCenter} onClick={() => handleSort("fit")}>
              Thesis Fit{sortIndicator(sortKey === "fit", sortDir)}
            </button>
            <span className={styles.colHeaderCenter}>Status</span>
          </div>

          {pageRows.map((row) => (
            <a
              key={row.company.id}
              href={`/company/${row.company.id}`}
              className={styles.row}
            >
              <div className={styles.colCompany}>
                <span className={styles.companyName}>{row.company.name}</span>
                <span className={styles.companyMeta}>
                  {[row.company.sector, row.company.stage, row.company.geography]
                    .filter(Boolean)
                    .join(" · ") || "No details"}
                </span>
              </div>

              {row.loading ? (
                <>
                  <span className={styles.colCenter}><span className={styles.skeleton} /></span>
                  <span className={styles.colCenter}><span className={styles.skeleton} /></span>
                  <span className={styles.colCenter}><span className={styles.skeleton} /></span>
                  <span className={styles.colCenter}><span className={styles.skeleton} /></span>
                  <span className={styles.colCenter}><span className={styles.skeleton} /></span>
                  <span className={styles.colCenter}><span className={styles.analyzing}>Analyzing</span></span>
                </>
              ) : row.error ? (
                <span className={styles.rowError}>Failed to analyze</span>
              ) : row.pipeline ? (
                <>
                  <span className={styles.colCenter}>
                    <span className={styles.decision} data-decision={row.pipeline.memo.decision}>
                      {decisionLabel(row.pipeline.memo.decision)}
                    </span>
                  </span>

                  <span className={styles.colCenter}>
                    <span className={styles.scoreValue}>
                      {row.pipeline.scores.founder.adjustedScore}
                    </span>
                    <span className={styles.scoreTrend}>
                      {trendArrow(row.pipeline.scores.founder.trend)}
                    </span>
                  </span>

                  <span className={styles.colCenter}>
                    <span className={styles.scoreValue}>
                      {row.pipeline.scores.market.adjustedScore}
                    </span>
                    <span className={styles.scoreTrend}>
                      {trendArrow(row.pipeline.scores.market.trend)}
                    </span>
                  </span>

                  <span className={styles.colCenter}>
                    <span className={styles.scoreValue}>
                      {row.pipeline.scores.ideaVsMarket.adjustedScore}
                    </span>
                    <span className={styles.scoreTrend}>
                      {trendArrow(row.pipeline.scores.ideaVsMarket.trend)}
                    </span>
                  </span>

                  <span className={styles.colCenter}>
                    <span className={styles.fitValue}>
                      {Math.round(row.pipeline.thesis.fitScore * 100)}%
                    </span>
                    {!row.pipeline.thesis.pass && (
                      <span className={styles.fitFail}>Fail</span>
                    )}
                  </span>

                  <span className={styles.colCenter}>
                    {row.pipeline.scores.coldStart && (
                      <span className={styles.flag}>Cold start</span>
                    )}
                    {row.pipeline.scores.risks.length > 0 && (
                      <span className={styles.flag}>
                        {row.pipeline.scores.risks.length} risk{row.pipeline.scores.risks.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </span>
                </>
              ) : null}
            </a>
          ))}
        </div>
      )}

      {/* ── Pager ── */}
      {totalPages > 1 && (
        <div className={styles.pager}>
          <button
            type="button"
            className={styles.pagerBtn}
            onClick={() => setPage(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            Prev
          </button>

          <div className={styles.pagerPages}>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                type="button"
                className={styles.pagerPage}
                data-active={p === currentPage}
                onClick={() => setPage(p)}
              >
                {p}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={styles.pagerBtn}
            onClick={() => setPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            Next
          </button>

          <span className={styles.pagerMeta}>
            {startIndex + 1}–{Math.min(startIndex + PAGE_SIZE, sorted.length)} of {sorted.length}
          </span>
        </div>
      )}
    </div>
  );
}
