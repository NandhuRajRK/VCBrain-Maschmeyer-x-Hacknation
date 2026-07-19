"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Search, SlidersHorizontal, X } from "lucide-react";
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
type Decision = "invest" | "conditional_invest" | "hold" | "reject";
type Status = "cold_start" | "has_risks" | "clear";
type Row = { company: ApiCompany; pipeline: PipelineResult | null; loading: boolean; error: string | null; progress?: number; stage?: string };

const DECISIONS: Decision[] = ["invest", "conditional_invest", "hold", "reject"];
const STATUSES: Status[] = ["cold_start", "has_risks", "clear"];
const LABELS: Record<string, string> = { invest: "Invest", conditional_invest: "Conditional", hold: "Hold", reject: "Reject", cold_start: "Cold start", has_risks: "Has risks", clear: "Clear" };
const ORDER: Record<string, number> = { invest: 0, conditional_invest: 1, hold: 2, reject: 3 };

export default function OpportunitiesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLoading, setShowLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const [decisionFilters, setDecisionFilters] = useState<Decision[]>([]);
  const [statusFilters, setStatusFilters] = useState<Status[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const filterRef = useDismissableLayer<HTMLDivElement>(filterOpen, () => setFilterOpen(false));

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

  const toggle = <T,>(value: T, setter: React.Dispatch<React.SetStateAction<T[]>>) => setter((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  const clearFilters = () => { setDecisionFilters([]); setStatusFilters([]); setPage(1); };
  const activeFilters = decisionFilters.length + statusFilters.length;

  const filtered = useMemo(() => rows.filter((row) => {
    const text = [row.company.name, row.company.sector, row.company.stage, row.company.geography].filter(Boolean).join(" ").toLowerCase();
    const decision = row.pipeline?.memo.decision as Decision | undefined;
    const risks = Boolean(row.pipeline?.scores.risks.length);
    const cold = Boolean(row.pipeline?.scores.coldStart);
    const decisionMatch = !decisionFilters.length || Boolean(decision && decisionFilters.includes(decision));
    const statusMatch = !statusFilters.length || statusFilters.some((status) => status === "cold_start" ? cold : status === "has_risks" ? risks : Boolean(row.pipeline && !cold && !risks));
    return text.includes(query.trim().toLowerCase()) && decisionMatch && statusMatch;
  }), [decisionFilters, query, rows, statusFilters]);

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
      <div ref={filterRef} className={styles.filterWrap}><button type="button" className={styles.filterButton} data-active={filterOpen || activeFilters > 0} onClick={() => setFilterOpen((open) => !open)} aria-label="Filter deal flow"><SlidersHorizontal size={16} />{activeFilters > 0 && <span className={styles.filterCount}>{activeFilters}</span>}</button>
        {filterOpen && <div className={styles.filterMenu}><div className={styles.filterMenuHead}><span>Filters</span>{activeFilters > 0 && <button type="button" onClick={clearFilters}>Clear</button>}</div><label className={styles.filterSearch}><Search size={13} /><input value={filterQuery} onChange={(event) => setFilterQuery(event.target.value)} placeholder="Search filters" /></label>
          <span className={styles.filterGroupTitle}>Decision</span>{DECISIONS.filter((value) => LABELS[value].toLowerCase().includes(filterQuery.toLowerCase())).map((value) => <button key={value} type="button" data-active={decisionFilters.includes(value)} onClick={() => toggle(value, setDecisionFilters)}><span>{LABELS[value]}</span>{decisionFilters.includes(value) && <Check size={14} />}</button>)}
          <span className={styles.filterGroupTitle}>Status</span>{STATUSES.filter((value) => LABELS[value].toLowerCase().includes(filterQuery.toLowerCase())).map((value) => <button key={value} type="button" data-active={statusFilters.includes(value)} onClick={() => toggle(value, setStatusFilters)}><span>{LABELS[value]}</span>{statusFilters.includes(value) && <Check size={14} />}</button>)}
        </div>}
      </div>
    </div>
    {activeFilters > 0 && <div className={styles.activeFilters}>{decisionFilters.map((value) => <button key={value} type="button" onClick={() => toggle(value, setDecisionFilters)}>{LABELS[value]} <X size={12} /></button>)}{statusFilters.map((value) => <button key={value} type="button" onClick={() => toggle(value, setStatusFilters)}>{LABELS[value]} <X size={12} /></button>)}<button type="button" className={styles.clearFilterChip} onClick={clearFilters}>Clear all</button></div>}
    {loading && showLoading && <div className={styles.empty}><IskraOrb size={34} /><p className={styles.emptyText}>Loading deal flow...</p></div>}
    {error && <div className={styles.empty}><p className={styles.emptyError}>{error}</p></div>}
    {!loading && !error && <div className={styles.list}>
      <div className={styles.listHeader}>{[["name", "Company"], ["decision", "Decision"], ["founder", "Founder"], ["market", "Market"], ["idea", "Idea / Mkt"], ["fit", "Thesis fit"], ["status", "Status"]].map(([key, label], index) => <button key={key} type="button" className={index ? styles.colHeaderCenter : styles.colHeaderCompany} onClick={() => sort(key as SortKey)}>{label} <span>{sortKey === key ? sortAsc ? "▴" : "▾" : "↕"}</span></button>)}</div>
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
