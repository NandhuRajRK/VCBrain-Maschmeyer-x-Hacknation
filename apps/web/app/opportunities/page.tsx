"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Search, SlidersHorizontal } from "lucide-react";
import type { ApiCompany, PipelineResult } from "../../lib/api";
import { analyzePipeline, listAnalysisJobs, listCompanies } from "../../lib/api";
import { userError } from "../../lib/errors";
import { DEFAULT_THESIS } from "../../lib/thesis";
import IskraOrb from "../IskraOrb";
import OpportunityModal, { type OpportunityProgress } from "../OpportunityModal";
import styles from "./page.module.css";
import { useDismissableLayer } from "../../lib/use-dismissable-layer";

const PAGE_SIZE = 8;
type SortKey = "name" | "decision" | "founder" | "market" | "idea" | "fit" | "status";
type Row = { company: ApiCompany; pipeline: PipelineResult | null; loading: boolean; error: string | null; progress?: number; stage?: string };

const LABELS: Record<string, string> = { invest: "Invest", conditional_invest: "Conditional", hold: "Hold", reject: "Reject", cold_start: "Cold start", has_risks: "Has risks", clear: "Clear" };
const ORDER: Record<string, number> = { invest: 0, conditional_invest: 1, hold: 2, reject: 3 };
const HEADERS: [SortKey, string][] = [["name", "Company"], ["decision", "Decision"], ["founder", "Founder"], ["market", "Market"], ["idea", "Idea / Mkt"], ["fit", "Thesis fit"], ["status", "Status"]];

function scoreBand(value: number): string { return value < 40 ? "0–39" : value < 60 ? "40–59" : value < 80 ? "60–79" : "80+"; }

export default function OpportunitiesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLoading, setShowLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [columnFilters, setColumnFilters] = useState<Partial<Record<SortKey, string[]>>>({});
  const [columnFilterOpen, setColumnFilterOpen] = useState<SortKey | null>(null);
  const [columnFilterQuery, setColumnFilterQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const delay = window.setTimeout(() => setShowLoading(true), 280);
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") setModalOpen(true);
    let cancelled = false;
    (async () => {
      try {
        const [companies, jobs] = await Promise.all([listCompanies(), listAnalysisJobs()]);
        if (cancelled) return;
        const latestJobs = new Map<string, (typeof jobs)[number]>();
        jobs.forEach((job) => { if (!latestJobs.has(job.company_id)) latestJobs.set(job.company_id, job); });
        setRows(companies.map((company) => {
          const job = latestJobs.get(company.id);
          return { company, pipeline: null, loading: job?.status !== "failed", error: job?.status === "failed" ? job.error || "Analysis failed" : null, progress: job?.progress, stage: job?.stage };
        }));
        setLoading(false);
        await Promise.all(companies.map(async (company) => {
          if (latestJobs.get(company.id)?.status === "running") return;
          try {
            const pipeline = await analyzePipeline(company.id, DEFAULT_THESIS);
            if (!cancelled) setRows((current) => current.map((row) => row.company.id === company.id ? { ...row, pipeline, loading: false } : row));
          } catch (caught) {
            if (!cancelled) setRows((current) => current.map((row) => row.company.id === company.id ? { ...row, loading: false, error: userError(caught, "company") } : row));
          }
        }));
      } catch (caught) {
        if (!cancelled) { setError(userError(caught, "dashboard")); setLoading(false); }
      }
    })();
    return () => { cancelled = true; window.clearTimeout(delay); };
  }, []);

  const columnFilterRef = useDismissableLayer<HTMLDivElement>(Boolean(columnFilterOpen), () => setColumnFilterOpen(null));
  const columnOptions = useMemo<Partial<Record<SortKey, string[]>>>(() => {
    const options: Partial<Record<SortKey, Set<string>>> = {};
    HEADERS.forEach(([key]) => { options[key] = new Set(); });
    rows.forEach((row) => {
      options.name?.add(row.company.name);
      if (row.pipeline) {
        options.decision?.add(LABELS[row.pipeline.memo.decision]);
        options.founder?.add(scoreBand(row.pipeline.scores.founder.adjustedScore));
        options.market?.add(scoreBand(row.pipeline.scores.market.adjustedScore));
        options.idea?.add(scoreBand(row.pipeline.scores.ideaVsMarket.adjustedScore));
        options.fit?.add(scoreBand(Math.round(row.pipeline.thesis.fitScore * 100)));
        if (row.pipeline.scores.coldStart) options.status?.add("Cold start");
        if (row.pipeline.scores.risks.length) options.status?.add("Has risks");
        if (!row.pipeline.scores.coldStart && !row.pipeline.scores.risks.length) options.status?.add("Clear");
      }
    });
    return Object.fromEntries(Object.entries(options).map(([key, values]) => [key, [...(values ?? new Set())].sort()])) as Partial<Record<SortKey, string[]>>;
  }, [rows]);

  const valuesForColumn = (key: SortKey, row: Row): string[] => {
    if (key === "name") return [row.company.name];
    if (!row.pipeline) return [];
    if (key === "decision") return [LABELS[row.pipeline.memo.decision]];
    if (key === "founder") return [scoreBand(row.pipeline.scores.founder.adjustedScore)];
    if (key === "market") return [scoreBand(row.pipeline.scores.market.adjustedScore)];
    if (key === "idea") return [scoreBand(row.pipeline.scores.ideaVsMarket.adjustedScore)];
    if (key === "fit") return [scoreBand(Math.round(row.pipeline.thesis.fitScore * 100))];
    return [row.pipeline.scores.coldStart ? "Cold start" : "", row.pipeline.scores.risks.length ? "Has risks" : "Clear"].filter(Boolean);
  };

  const filtered = useMemo(() => rows.filter((row) => {
    const text = [row.company.name, row.company.sector, row.company.stage, row.company.geography].filter(Boolean).join(" ").toLowerCase();
    const columnsMatch = Object.entries(columnFilters).every(([key, selected]) => !selected?.length || valuesForColumn(key as SortKey, row).some((value) => selected.includes(value)));
    return text.includes(query.trim().toLowerCase()) && columnsMatch;
  }), [columnFilters, query, rows]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const ap = a.pipeline; const bp = b.pipeline;
    let value = 0;
    if (sortKey === "name") value = a.company.name.localeCompare(b.company.name);
    else if (!ap || !bp) value = ap ? -1 : bp ? 1 : 0;
    else if (sortKey === "decision") value = (ORDER[ap.memo.decision] ?? 9) - (ORDER[bp.memo.decision] ?? 9);
    else if (sortKey === "founder") value = ap.scores.founder.adjustedScore - bp.scores.founder.adjustedScore;
    else if (sortKey === "market") value = ap.scores.market.adjustedScore - bp.scores.market.adjustedScore;
    else if (sortKey === "idea") value = ap.scores.ideaVsMarket.adjustedScore - bp.scores.ideaVsMarket.adjustedScore;
    else if (sortKey === "fit") value = ap.thesis.fitScore - bp.thesis.fitScore;
    else value = (ap.scores.risks.length + Number(ap.scores.coldStart)) - (bp.scores.risks.length + Number(bp.scores.coldStart));
    return sortAsc ? value : -value;
  }), [filtered, sortAsc, sortKey]);

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const sort = (key: SortKey) => { if (sortKey === key) setSortAsc((value) => !value); else { setSortKey(key); setSortAsc(true); } };
  const trackProgress = useCallback((progress: OpportunityProgress) => setRows((current) => {
    const next: Row = { company: progress.company, pipeline: null, loading: true, error: null, progress: progress.percent, stage: progress.stage };
    return current.some((row) => row.company.id === progress.company.id) ? current.map((row) => row.company.id === progress.company.id ? next : row) : [next, ...current];
  }), []);

  return <div className={styles.page}>
    <header className={styles.header}><div><p className={styles.eyebrow}>Pipeline</p><h1 className={styles.title}>Deal Flow</h1></div><button type="button" className={styles.addOpportunity} onClick={() => setModalOpen(true)}><Plus size={16} /> New analysis</button></header>
    <div className={styles.tableToolbar}>
      <label className={styles.tableSearch}><Search size={15} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search deal flow" /></label>
    </div>
    {loading && showLoading && <div className={styles.empty}><IskraOrb size={34} /><p className={styles.emptyText}>Loading deal flow...</p></div>}
    {error && <div className={styles.empty}><p className={styles.emptyError}>{error}</p></div>}
    {!loading && !error && <div className={styles.list}>
      <div className={styles.listHeader}>{HEADERS.map(([key, label], index) => <div key={key} className={styles.colHeaderWrap} ref={columnFilterOpen === key ? columnFilterRef : undefined}><button type="button" className={index ? styles.colHeaderCenter : styles.colHeaderCompany} onClick={() => sort(key)}>{label} <span>{sortKey === key ? sortAsc ? "▴" : "▾" : "↕"}</span></button><button type="button" className={styles.columnFilterButton} data-active={Boolean(columnFilters[key]?.length)} onClick={(event) => { event.stopPropagation(); setColumnFilterOpen((current) => current === key ? null : key); setColumnFilterQuery(""); }} aria-label={`Filter ${label}`}><SlidersHorizontal size={11} /></button>{columnFilterOpen === key && <div className={styles.columnFilterMenu}><label className={styles.filterSearch}><Search size={13} /><input autoFocus value={columnFilterQuery} onChange={(event) => setColumnFilterQuery(event.target.value)} placeholder={`Search ${label.toLowerCase()}`} /></label>{(columnOptions[key] ?? []).filter((value) => value.toLowerCase().includes(columnFilterQuery.toLowerCase())).map((value) => <button key={value} type="button" data-active={columnFilters[key]?.includes(value)} onClick={() => setColumnFilters((current) => { const selected = current[key] ?? []; const next = selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]; return { ...current, [key]: next }; })}><span>{value}</span>{columnFilters[key]?.includes(value) && <Check size={13} />}</button>)}</div>}</div>)}</div>
      {visible.map((row) => <a key={row.company.id} href={`/company/${row.company.id}`} className={styles.row}>
        <div className={styles.colCompany}><span className={styles.companyName}>{row.company.name}</span><span className={styles.companyMeta}>{[row.company.sector, row.company.stage, row.company.geography].filter(Boolean).join(" · ") || "Profile pending"}</span></div>
        {row.loading ? <><span className={styles.colCenter}><span className={styles.analysisPulse}><IskraOrb size={20} /><span>{row.progress ?? 24}%<i className={styles.miniTrack}><b style={{ width: `${row.progress ?? 24}%` }} /></i></span></span></span>{[0,1,2,3].map((item) => <span className={styles.colCenter} key={item}><span className={styles.skeleton} /></span>)}<span className={styles.colCenter}><span className={styles.analyzing}>{row.stage?.replaceAll("_", " ") || "Analyzing"}</span></span></> : row.error ? <span className={styles.rowError}>{row.error}</span> : row.pipeline && <><span className={styles.colCenter}><span className={styles.decision} data-decision={row.pipeline.memo.decision}>{LABELS[row.pipeline.memo.decision]}</span></span><span className={styles.colCenter}>{row.pipeline.scores.founder.adjustedScore}</span><span className={styles.colCenter}>{row.pipeline.scores.market.adjustedScore}</span><span className={styles.colCenter}>{row.pipeline.scores.ideaVsMarket.adjustedScore}</span><span className={styles.colCenter}>{Math.round(row.pipeline.thesis.fitScore * 100)}%</span><span className={styles.colCenter}>{row.pipeline.scores.coldStart && <span className={styles.flag}>Cold start</span>}{row.pipeline.scores.risks.length > 0 && <span className={styles.flag}>{row.pipeline.scores.risks.length} risks</span>}</span></>}
      </a>)}
      {!visible.length && <div className={styles.tableEmpty}><p className={styles.emptyText}>No analyses match this view.</p><p className={styles.emptyHint}>{rows.length ? "Adjust the search or active filters." : "Start an analysis to begin diligence."}</p></div>}
    </div>}
    {pages > 1 && <div className={styles.pager}><button type="button" className={styles.pagerBtn} disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Prev</button><div className={styles.pagerPages}>{Array.from({ length: pages }, (_, index) => index + 1).map((value) => <button key={value} type="button" className={styles.pagerPage} data-active={value === currentPage} onClick={() => setPage(value)}>{value}</button>)}</div><button type="button" className={styles.pagerBtn} disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</button></div>}
    <OpportunityModal open={modalOpen} initialPrompt={typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("prompt") ?? "" : ""} onClose={() => setModalOpen(false)} onProgress={trackProgress} onComplete={(company, pipeline) => { setRows((current) => current.map((row) => row.company.id === company.id ? { ...row, company, pipeline, loading: false, progress: 100, stage: "complete" } : row)); router.push(`/company/${company.id}`); }} />
  </div>;
}
