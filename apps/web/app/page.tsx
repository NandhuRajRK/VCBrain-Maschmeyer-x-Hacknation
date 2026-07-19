"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";
import type { ApiCompany } from "../lib/api";
import type { PipelineResult } from "../lib/api";
import { listCompanies, analyzePipeline } from "../lib/api";
import { DEFAULT_THESIS } from "../lib/thesis";

// Max companies shown per page. Above this, the table paginates.
const PAGE_SIZE = 8;

interface CompanyRow {
  company: ApiCompany;
  pipeline: PipelineResult | null;
  loading: boolean;
  error: string | null;
}

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

export default function Dashboard() {
  const [rows, setRows] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

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

        // Analyze each company, capped at 4 concurrent. Resolved tasks are
        // removed from the set so the cap actually holds.
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
    return () => {
      cancelled = true;
    };
  }, []);

  // Summary stats (across ALL companies, not just the current page)
  const analyzed = rows.filter((r) => r.pipeline !== null);
  const investCount = analyzed.filter(
    (r) => r.pipeline?.memo.decision === "invest"
  ).length;
  const conditionalCount = analyzed.filter(
    (r) => r.pipeline?.memo.decision === "conditional_invest"
  ).length;
  const holdCount = analyzed.filter(
    (r) => r.pipeline?.memo.decision === "hold"
  ).length;
  const rejectCount = analyzed.filter(
    (r) => r.pipeline?.memo.decision === "reject"
  ).length;

  // Pagination
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pageRows = rows.slice(startIndex, startIndex + PAGE_SIZE);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Pipeline</h1>
          <p className={styles.subtitle}>
            {rows.length} {rows.length === 1 ? "company" : "companies"} in
            review
          </p>
        </div>
      </header>

      {/* ── Summary cards ── */}
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{rows.length}</span>
          <span className={styles.statLabel}>Total</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{investCount}</span>
          <span className={styles.statLabel}>Invest</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{conditionalCount}</span>
          <span className={styles.statLabel}>Conditional</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{holdCount}</span>
          <span className={styles.statLabel}>Hold</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{rejectCount}</span>
          <span className={styles.statLabel}>Reject</span>
        </div>
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
      {rows.length > 0 && (
        <div className={styles.list}>
          {/* Table header */}
          <div className={styles.listHeader}>
            <span className={styles.colCompany}>Company</span>
            <span className={styles.colDecision}>Decision</span>
            <span className={styles.colScore}>Founder</span>
            <span className={styles.colScore}>Market</span>
            <span className={styles.colScore}>Idea / Market</span>
            <span className={styles.colFit}>Thesis Fit</span>
            <span className={styles.colStatus}>Status</span>
          </div>

          {pageRows.map((row) => (
            <a
              key={row.company.id}
              href={`/company/${row.company.id}`}
              className={styles.row}
            >
              {/* Company info */}
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
                  <span className={styles.colDecision}>
                    <span className={styles.skeleton} />
                  </span>
                  <span className={styles.colScore}>
                    <span className={styles.skeleton} />
                  </span>
                  <span className={styles.colScore}>
                    <span className={styles.skeleton} />
                  </span>
                  <span className={styles.colScore}>
                    <span className={styles.skeleton} />
                  </span>
                  <span className={styles.colFit}>
                    <span className={styles.skeleton} />
                  </span>
                  <span className={styles.colStatus}>
                    <span className={styles.analyzing}>Analyzing</span>
                  </span>
                </>
              ) : row.error ? (
                <span className={styles.rowError}>Failed to analyze</span>
              ) : row.pipeline ? (
                <>
                  {/* Decision */}
                  <span className={styles.colDecision}>
                    <span
                      className={styles.decision}
                      data-decision={row.pipeline.memo.decision}
                    >
                      {decisionLabel(row.pipeline.memo.decision)}
                    </span>
                  </span>

                  {/* Founder axis */}
                  <span className={styles.colScore}>
                    <span className={styles.scoreValue}>
                      {row.pipeline.scores.founder.adjustedScore}
                    </span>
                    <span className={styles.scoreTrend}>
                      {trendArrow(row.pipeline.scores.founder.trend)}
                    </span>
                  </span>

                  {/* Market axis */}
                  <span className={styles.colScore}>
                    <span className={styles.scoreValue}>
                      {row.pipeline.scores.market.adjustedScore}
                    </span>
                    <span className={styles.scoreTrend}>
                      {trendArrow(row.pipeline.scores.market.trend)}
                    </span>
                  </span>

                  {/* Idea-vs-market axis */}
                  <span className={styles.colScore}>
                    <span className={styles.scoreValue}>
                      {row.pipeline.scores.ideaVsMarket.adjustedScore}
                    </span>
                    <span className={styles.scoreTrend}>
                      {trendArrow(row.pipeline.scores.ideaVsMarket.trend)}
                    </span>
                  </span>

                  {/* Thesis fit */}
                  <span className={styles.colFit}>
                    <span className={styles.fitValue}>
                      {Math.round(row.pipeline.thesis.fitScore * 100)}%
                    </span>
                    {!row.pipeline.thesis.pass && (
                      <span className={styles.fitFail}>Fail</span>
                    )}
                  </span>

                  {/* Status flags */}
                  <span className={styles.colStatus}>
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
            {startIndex + 1}-{Math.min(startIndex + PAGE_SIZE, rows.length)} of {rows.length}
          </span>
        </div>
      )}
    </div>
  );
}
