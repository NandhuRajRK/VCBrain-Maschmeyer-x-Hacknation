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

  /* ── Chart data ── */

  const avgFounder = analyzed.length > 0
    ? Math.round(analyzed.reduce((s, r) => s + (r.pipeline?.scores.founder.adjustedScore ?? 0), 0) / analyzed.length)
    : 0;
  const avgMarket = analyzed.length > 0
    ? Math.round(analyzed.reduce((s, r) => s + (r.pipeline?.scores.market.adjustedScore ?? 0), 0) / analyzed.length)
    : 0;
  const avgIdea = analyzed.length > 0
    ? Math.round(analyzed.reduce((s, r) => s + (r.pipeline?.scores.ideaVsMarket.adjustedScore ?? 0), 0) / analyzed.length)
    : 0;

  const handleFilter = useCallback((d: DecisionFilter) => {
    setFilter((prev) => (prev === d ? "all" : d));
    setPage(1);
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Pipeline</h1>
          <p className={styles.subtitle}>
            {rows.length} {rows.length === 1 ? "company" : "companies"} in review
            {filter !== "all" && (
              <span className={styles.filterTag}>
                {" "}filtered: {decisionLabel(filter)}
                <button type="button" className={styles.filterClear} onClick={() => setFilter("all")}>&times;</button>
              </span>
            )}
          </p>
        </div>
      </header>

      {/* ── Summary cards (clickable as filters) ── */}
      <div className={styles.stats}>
        <button
          type="button"
          className={styles.stat}
          data-active={filter === "all"}
          onClick={() => handleFilter("all")}
        >
          <span className={styles.statValue}>{rows.length}</span>
          <span className={styles.statLabel}>Total</span>
        </button>
        <button
          type="button"
          className={styles.stat}
          data-active={filter === "invest"}
          onClick={() => handleFilter("invest")}
        >
          <span className={styles.statValue}>{investCount}</span>
          <span className={styles.statLabel}>Invest</span>
        </button>
        <button
          type="button"
          className={styles.stat}
          data-active={filter === "conditional_invest"}
          onClick={() => handleFilter("conditional_invest")}
        >
          <span className={styles.statValue}>{conditionalCount}</span>
          <span className={styles.statLabel}>Conditional</span>
        </button>
        <button
          type="button"
          className={styles.stat}
          data-active={filter === "hold"}
          onClick={() => handleFilter("hold")}
        >
          <span className={styles.statValue}>{holdCount}</span>
          <span className={styles.statLabel}>Hold</span>
        </button>
        <button
          type="button"
          className={styles.stat}
          data-active={filter === "reject"}
          onClick={() => handleFilter("reject")}
        >
          <span className={styles.statValue}>{rejectCount}</span>
          <span className={styles.statLabel}>Reject</span>
        </button>
      </div>

      {/* ── Charts row ── */}
      {analyzed.length > 0 && (
        <div className={styles.charts}>
          {/* Decision breakdown strip */}
          <div className={styles.chartCard}>
            <span className={styles.chartTitle}>Decision Breakdown</span>
            <div className={styles.breakdownBar}>
              {investCount > 0 && (
                <div
                  className={styles.breakdownSeg}
                  data-decision="invest"
                  style={{ flex: investCount }}
                  title={`Invest: ${investCount}`}
                >
                  {investCount}
                </div>
              )}
              {conditionalCount > 0 && (
                <div
                  className={styles.breakdownSeg}
                  data-decision="conditional_invest"
                  style={{ flex: conditionalCount }}
                  title={`Conditional: ${conditionalCount}`}
                >
                  {conditionalCount}
                </div>
              )}
              {holdCount > 0 && (
                <div
                  className={styles.breakdownSeg}
                  data-decision="hold"
                  style={{ flex: holdCount }}
                  title={`Hold: ${holdCount}`}
                >
                  {holdCount}
                </div>
              )}
              {rejectCount > 0 && (
                <div
                  className={styles.breakdownSeg}
                  data-decision="reject"
                  style={{ flex: rejectCount }}
                  title={`Reject: ${rejectCount}`}
                >
                  {rejectCount}
                </div>
              )}
            </div>
            <div className={styles.breakdownLegend}>
              <span data-decision="invest">Invest</span>
              <span data-decision="conditional_invest">Conditional</span>
              <span data-decision="hold">Hold</span>
              <span data-decision="reject">Reject</span>
            </div>
          </div>

          {/* Average scores */}
          <div className={styles.chartCard}>
            <span className={styles.chartTitle}>Avg Scores ({analyzed.length} analyzed)</span>
            <div className={styles.scoreBars}>
              <div className={styles.scoreBarRow}>
                <span className={styles.scoreBarLabel}>Founder</span>
                <div className={styles.scoreBarTrack}>
                  <div className={styles.scoreBarFill} style={{ width: `${Math.min(100, avgFounder)}%` }} />
                </div>
                <span className={styles.scoreBarValue}>{avgFounder}</span>
              </div>
              <div className={styles.scoreBarRow}>
                <span className={styles.scoreBarLabel}>Market</span>
                <div className={styles.scoreBarTrack}>
                  <div className={styles.scoreBarFill} style={{ width: `${Math.min(100, avgMarket)}%` }} />
                </div>
                <span className={styles.scoreBarValue}>{avgMarket}</span>
              </div>
              <div className={styles.scoreBarRow}>
                <span className={styles.scoreBarLabel}>Idea/Mkt</span>
                <div className={styles.scoreBarTrack}>
                  <div className={styles.scoreBarFill} style={{ width: `${Math.min(100, avgIdea)}%` }} />
                </div>
                <span className={styles.scoreBarValue}>{avgIdea}</span>
              </div>
            </div>
          </div>

          {/* Pipeline quality */}
          <div className={styles.chartCard}>
            <span className={styles.chartTitle}>Pipeline Quality</span>
            <div className={styles.qualityStats}>
              <div className={styles.qualityStat}>
                <span className={styles.qualityValue}>
                  {analyzed.length > 0
                    ? Math.round(analyzed.reduce((s, r) => s + (r.pipeline?.thesis.fitScore ?? 0), 0) / analyzed.length * 100)
                    : 0}%
                </span>
                <span className={styles.qualityLabel}>Avg thesis fit</span>
              </div>
              <div className={styles.qualityStat}>
                <span className={styles.qualityValue}>
                  {analyzed.filter((r) => r.pipeline?.scores.coldStart).length}
                </span>
                <span className={styles.qualityLabel}>Cold starts</span>
              </div>
              <div className={styles.qualityStat}>
                <span className={styles.qualityValue}>
                  {analyzed.filter((r) => (r.pipeline?.scores.risks.length ?? 0) > 0).length}
                </span>
                <span className={styles.qualityLabel}>With risks</span>
              </div>
            </div>
          </div>
        </div>
      )}

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
