"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleAlert, ClipboardCheck, ShieldAlert } from "lucide-react";
import type { ApiCompany, ApiDecisionReadiness } from "../lib/api";
import { fetchReadiness, listCompanies } from "../lib/api";
import { userError } from "../lib/errors";
import { timeGreeting } from "../lib/user";
import IskraOrb from "./IskraOrb";
import GlobalIntelligenceMap from "./GlobalIntelligenceMap";
import { useWorkspaceAuth } from "./AuthProvider";
import styles from "./page.module.css";

type CompanyState = { company: ApiCompany; readiness: ApiDecisionReadiness | null };
type QueueItem = { company: ApiCompany; title: string; reason: string; gain: number; priority: string };

export default function Dashboard() {
  const auth = useWorkspaceAuth();
  const [companies, setCompanies] = useState<CompanyState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.ready) return;
    let cancelled = false;
    void listCompanies().then(async (items) => {
      const states = await Promise.all(items.map(async (company) => ({ company, readiness: await fetchReadiness(company.id).catch(() => null) })));
      if (!cancelled) setCompanies(states);
    }).catch((caught) => { if (!cancelled) setError(userError(caught, "dashboard")); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [auth.ready, auth.organizationId]);

  const queue = useMemo<QueueItem[]>(() => {
    const actions = companies.flatMap(({ company, readiness }) => (readiness?.next_actions ?? []).map((action) => ({
      company, title: action.title, reason: action.reason, gain: action.expected_readiness_gain, priority: action.priority,
    })));
    return actions.sort((left, right) => {
      const priority = Number(right.priority === "high") - Number(left.priority === "high");
      return priority || right.gain - left.gain;
    }).slice(0, 5);
  }, [companies]);
  const ready = companies.filter(({ readiness }) => readiness?.status === "decision_ready").length;
  const openActions = companies.reduce((total, item) => total + (item.readiness?.next_actions.length ?? 0), 0);
  const averageReadiness = companies.length ? Math.round(companies.reduce((total, item) => total + (item.readiness?.score ?? 0), 0) / companies.length) : 0;

  return <div className={`${styles.page} ${styles.dashboardPage}`}>
    <header className={styles.discoveryHeader}><div><h1>{timeGreeting()}, {auth.name}</h1></div><Link href="/sourcing" className={styles.dashboardLink}>Open sourcing <ArrowRight size={15} /></Link></header>
    {loading && <div className={styles.empty}><IskraOrb size={34} /><p>Preparing your action queue…</p></div>}
    {error && <div className={styles.empty}><p className={styles.emptyError}>{error}</p></div>}
    {!loading && !error && !companies.length && <div className={styles.empty}><p>Your active pipeline is empty.</p><Link href="/sourcing">Review discovery leads <ArrowRight size={14} /></Link></div>}
    {!loading && !error && companies.length > 0 && <>
      <section className={styles.metrics} aria-label="Pipeline metrics"><article><ClipboardCheck size={16} /><p>Active companies</p><strong>{companies.length}</strong><small>Investor-approved and inbound</small></article><article><CheckCircle2 size={16} /><p>Decision ready</p><strong>{ready}</strong><small>No material blockers</small></article><article><CircleAlert size={16} /><p>Open actions</p><strong>{openActions}</strong><small>Across active companies</small></article><article><ShieldAlert size={16} /><p>Readiness</p><strong>{averageReadiness}<span>/100</span></strong><small>Average evidence coverage</small></article></section>
      <section className={styles.dashboardLayout}><section className={styles.actionQueue}><div className={styles.sectionHeading}><div><p>Do next</p><h2>Highest-leverage actions</h2></div><span>{queue.length} actions</span></div>{queue.length ? <div className={styles.actionList}>{queue.map((item, index) => <Link href={`/company/${item.company.id}`} key={`${item.company.id}-${item.title}-${index}`} className={styles.actionItem}><span data-priority={item.priority}>{item.priority === "high" ? "Now" : "Next"}</span><div><strong>{item.title}</strong><p>{item.company.name} · {item.reason}</p></div><b>+{item.gain}</b><ArrowRight size={15} /></Link>)}</div> : <p className={styles.queueEmpty}>No diligence blockers are currently recorded.</p>}</section>
        <section className={styles.companyPulse}><div className={styles.sectionHeading}><div><p>Pipeline pulse</p><h2>Accepted companies</h2></div><Link href="/opportunities"><ArrowRight size={15} /></Link></div>{companies.slice().sort((left, right) => (right.readiness?.score ?? 0) - (left.readiness?.score ?? 0)).slice(0, 5).map(({ company, readiness }) => <Link href={`/company/${company.id}`} key={company.id} className={styles.pulseRow}><div><strong>{company.name}</strong><small>{[company.sector, company.stage, company.geography].filter(Boolean).join(" · ") || "Profile in progress"}</small></div><span>{readiness?.score ?? 0}<small>ready</small></span></Link>)}</section>
      </section>
      <GlobalIntelligenceMap companies={companies.map(({ company }) => company)} />
    </>}
  </div>;
}
