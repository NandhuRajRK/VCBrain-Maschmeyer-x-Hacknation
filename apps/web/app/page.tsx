"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, CircleAlert, Gauge, Minus, ShieldCheck, Target } from "lucide-react";
import type { ApiCompany, ApiRankedFounder, PipelineResult } from "../lib/api";
import { analyzePipeline, listCompanies, listRankedFounders } from "../lib/api";
import { userError } from "../lib/errors";
import { DEFAULT_THESIS } from "../lib/thesis";
import { timeGreeting, workspaceUserName } from "../lib/user";
import IskraOrb from "./IskraOrb";
import GlobalIntelligenceMap from "./GlobalIntelligenceMap";
import styles from "./page.module.css";

type Row = { company: ApiCompany; pipeline: PipelineResult | null };
const ORDER: Record<string, number> = { invest: 0, conditional_invest: 1, hold: 2, reject: 3 };
const LABELS: Record<string, string> = { invest: "Invest", conditional_invest: "Conditional", hold: "Hold", reject: "Reject" };

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function PipelineTrend({ rows }: { rows: Row[] }) {
  const weeks = useMemo(() => {
    const now = new Date();
    const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - start.getDay() - 35);
    return Array.from({ length: 6 }, (_, index) => {
      const from = new Date(start); from.setDate(start.getDate() + index * 7);
      const to = new Date(from); to.setDate(from.getDate() + 7);
      return { label: from.toLocaleDateString(undefined, { month: "short", day: "numeric" }), count: rows.filter(({ company }) => { const created = new Date(company.created_at); return created >= from && created < to; }).length };
    });
  }, [rows]);
  const width = 720; const height = 150; const pad = 14;
  const max = Math.max(1, ...weeks.map((week) => week.count));
  const points = weeks.map((week, index) => `${pad + index * ((width - pad * 2) / 5)},${height - pad - (week.count / max) * (height - pad * 2)}`).join(" ");
  const area = `${pad},${height - pad} ${points} ${width - pad},${height - pad}`;
  return <section className={styles.trend}>
    <div className={styles.sectionHeading}><div><p>Pipeline velocity</p><h2>New analyses</h2></div><strong>{weeks.at(-1)?.count ?? 0}<small> this week</small></strong></div>
    <div className={styles.chart}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="New analyses over six weeks" preserveAspectRatio="none">
        <defs><linearGradient id="pipeline-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--chart-accent)" stopOpacity=".34"/><stop offset="1" stopColor="var(--chart-accent)" stopOpacity="0"/></linearGradient></defs>
        {[0.25, 0.5, 0.75].map((value) => <line key={value} x1={pad} x2={width - pad} y1={height * value} y2={height * value} className={styles.gridLine} />)}
        <polygon points={area} fill="url(#pipeline-fill)" />
        <polyline points={points} className={styles.trendLine} />
        {weeks.map((week, index) => { const x = pad + index * ((width - pad * 2) / 5); const y = height - pad - (week.count / max) * (height - pad * 2); return <circle key={week.label} cx={x} cy={y} r="4" className={styles.trendPoint}><title>{week.label}: {week.count} analyses</title></circle>; })}
      </svg>
      <div className={styles.axis}>{weeks.map((week) => <span key={week.label}>{week.label}</span>)}</div>
    </div>
  </section>;
}

function FounderRanking({ founders }: { founders: ApiRankedFounder[] }) {
  return <section className={styles.founderRanking}>
    <div className={styles.sectionHeading}><div><p>Founder intelligence</p><h2>Ranked founders</h2></div><Link href="/iskra" title="Search founders"><ArrowRight size={15} /></Link></div>
    {founders.length === 0 ? <div className={styles.inlineEmpty}>No scored founders yet.</div> : <div className={styles.founderTable}>
      <div className={styles.founderHeader}><span>Founder</span><span>Score</span><span>Confidence</span><span>Trend</span></div>
      {founders.slice(0, 8).map((row) => {
        const Trend = row.trend === "up" ? ArrowUpRight : row.trend === "down" ? ArrowDownRight : Minus;
        return <Link href={`/company/${row.company.id}`} className={styles.founderRow} key={row.founder.id}>
          <div><strong>{row.founder.name}</strong><small>{row.company.name} · {row.founder.role || "Role unverified"}</small></div>
          <b>{row.score ? Math.round(row.score.score) : "--"}</b>
          <span>{row.score ? `${Math.round(row.score.confidence * 100)}%` : "--"}</span>
          <i data-trend={row.trend}><Trend size={14} />{row.score_delta ? `${row.score_delta > 0 ? "+" : ""}${Math.round(row.score_delta)}` : "--"}</i>
        </Link>;
      })}
    </div>}
  </section>;
}

export default function Dashboard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [rankedFounders, setRankedFounders] = useState<ApiRankedFounder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [welcome, setWelcome] = useState("Welcome back");
  const [showLoading, setShowLoading] = useState(false);

  useEffect(() => {
    const identityTimer = window.setTimeout(() => setWelcome(`${timeGreeting()}, ${workspaceUserName()}`), 0);
    const loadingTimer = window.setTimeout(() => setShowLoading(true), 280);
    let cancelled = false;
    (async () => {
      try {
        const [companies, founders] = await Promise.all([
          listCompanies(),
          listRankedFounders().catch(() => []),
        ]);
        if (!cancelled) setRankedFounders(founders);
        const results = await Promise.all(companies.map(async (company) => {
          try { return { company, pipeline: await analyzePipeline(company.id, DEFAULT_THESIS) }; }
          catch { return { company, pipeline: null }; }
        }));
        if (!cancelled) setRows(results);
      } catch (caught) {
        if (!cancelled) setError(userError(caught, "dashboard"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; window.clearTimeout(identityTimer); window.clearTimeout(loadingTimer); };
  }, []);

  const analyzed = rows.filter((row): row is Row & { pipeline: PipelineResult } => Boolean(row.pipeline));
  const priority = useMemo(() => [...analyzed].sort((a, b) => {
    const decision = (ORDER[a.pipeline.memo.decision] ?? 9) - (ORDER[b.pipeline.memo.decision] ?? 9);
    return decision || b.pipeline.thesis.fitScore - a.pipeline.thesis.fitScore;
  }).slice(0, 4), [analyzed]);
  const candidates = analyzed.filter((row) => ["invest", "conditional_invest"].includes(row.pipeline.memo.decision)).length;
  const thesisFit = Math.round(median(analyzed.map((row) => row.pipeline.thesis.fitScore)));
  const confidence = Math.round(median(analyzed.map((row) => row.pipeline.scores.overallConfidence * 100)));
  const risks = analyzed.reduce((total, row) => total + row.pipeline.scores.risks.length, 0);

  return <div className={styles.page}>
    <header className={styles.header}><div><p className={styles.eyebrow}>Investment desk</p><h1>{welcome}</h1></div><Link href="/opportunities" className={styles.dashboardLink}>Deal flow <ArrowRight size={15} /></Link></header>
    {loading && showLoading && <div className={styles.empty}><IskraOrb size={34} /><p>Preparing the portfolio view...</p></div>}
    {error && <div className={styles.empty}><p className={styles.emptyError}>{error}</p></div>}
    {!loading && !error && rows.length === 0 && <div className={styles.empty}><p>No analyses yet.</p><Link href="/opportunities?new=1">Run the first analysis <ArrowRight size={14} /></Link></div>}
    {!loading && analyzed.length > 0 && <>
      <section className={styles.metrics} aria-label="Portfolio metrics">
        <article><Target size={16} /><p>Deployment candidates</p><strong>{candidates}</strong><small>Invest or conditional</small></article>
        <article><Gauge size={16} /><p>Median thesis fit</p><strong>{thesisFit}<span>/100</span></strong><small>Across analyzed deals</small></article>
        <article><ShieldCheck size={16} /><p>Evidence confidence</p><strong>{confidence}<span>%</span></strong><small>Median confidence</small></article>
        <article><CircleAlert size={16} /><p>Open diligence risks</p><strong>{risks}</strong><small>Across the portfolio</small></article>
      </section>
      <section className={styles.intelligenceRow}>
        <PipelineTrend rows={rows} />
        <section className={styles.queue}>
          <div className={styles.sectionHeading}><div><p>Priority queue</p><h2>Recommendations</h2></div><Link href="/opportunities" title="Open deal flow"><ArrowRight size={15} /></Link></div>
          <div className={styles.queueList}>{priority.map((row) => <Link href={`/company/${row.company.id}`} key={row.company.id} className={styles.queueRow}>
            <div><strong>{row.company.name}</strong><small>{[row.company.sector, row.company.stage].filter(Boolean).join(" · ")}</small></div>
            <span data-decision={row.pipeline.memo.decision}>{LABELS[row.pipeline.memo.decision]}</span>
            <b>{Math.round(row.pipeline.scores.overallConfidence * 100)}%<small>trust</small></b>
          </Link>)}</div>
        </section>
      </section>
      <FounderRanking founders={rankedFounders} />
      <GlobalIntelligenceMap companies={rows.map((row) => row.company)} />
    </>}
  </div>;
}
