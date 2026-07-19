"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, ExternalLink, Radar, Sparkles, X } from "lucide-react";
import type { ApiDiscoveryCandidate } from "../lib/api";
import { listDiscoveryCandidates, promoteDiscoveryCandidate, runDiscoveryScan } from "../lib/api";
import { userError } from "../lib/errors";
import { timeGreeting } from "../lib/user";
import IskraOrb from "./IskraOrb";
import SourcingMap from "./SourcingMap";
import { useWorkspaceAuth } from "./AuthProvider";
import styles from "./page.module.css";

const SOURCE_LABELS: Record<string, string> = { github: "GitHub", hacker_news: "Hacker News", product_hunt: "Product Hunt", arxiv: "arXiv" };
const PAGE_SIZE = 3;

function sourceDetail(candidate: ApiDiscoveryCandidate) {
  const points = Number(candidate.source_metadata.points ?? candidate.source_metadata.votes ?? 0);
  const comments = Number(candidate.source_metadata.comments ?? 0);
  if (points) return `${points} point${points === 1 ? "" : "s"}${comments ? ` · ${comments} comments` : ""}`;
  return new Date(candidate.observed_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function candidateContext(candidate: ApiDiscoveryCandidate) {
  const stripped = candidate.headline.replace(/^show\s+hn\s*:\s*/i, "").trim();
  const withoutName = stripped.replace(new RegExp(`^${candidate.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"), "").trim();
  return withoutName ? `Observed launch: ${withoutName}` : "Observed public launch";
}

export default function SourcingInbox() {
  const auth = useWorkspaceAuth();
  const [candidates, setCandidates] = useState<ApiDiscoveryCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastQueries, setLastQueries] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [howOpen, setHowOpen] = useState(true);

  useEffect(() => {
    if (!auth.ready) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void listDiscoveryCandidates().then((items) => { if (!cancelled) { setError(null); setCandidates(items); } }).catch((caught) => { if (!cancelled) setError(userError(caught, "dashboard")); }).finally(() => { if (!cancelled) setLoading(false); });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [auth.ready, auth.organizationId]);

  const scan = async () => { setScanning(true); setError(null); try { const result = await runDiscoveryScan(); setLastQueries(result.queries); setCandidates((current) => [...result.candidates, ...current]); } catch (caught) { setError(userError(caught, "dashboard")); } finally { setScanning(false); } };
  const promote = async (candidate: ApiDiscoveryCandidate) => { setPromoting(candidate.id); try { const result = await promoteDiscoveryCandidate(candidate.id); setCandidates((current) => current.map((item) => item.id === candidate.id ? result.candidate : item)); window.location.assign(`/company/${result.company.id}`); } catch (caught) { setError(userError(caught, "dashboard")); setPromoting(null); } };
  const active = candidates.filter((candidate) => candidate.status === "new");
  const promoted = candidates.filter((candidate) => candidate.status === "promoted");
  const pageCount = Math.max(1, Math.ceil(active.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = active.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  return <div className={`${styles.page} ${styles.discoveryPage}`}>
    <header className={styles.discoveryHeader}><div><p className={styles.eyebrow}>{auth.organizationName} · Sourcing inbox</p><h1>{timeGreeting()}, {auth.name}</h1></div><button type="button" className={styles.scanButton} onClick={() => void scan()} disabled={scanning || !auth.ready}><Radar size={16} />{scanning ? "Scanning public signals…" : "Run sourcing scan"}</button></header>
    {lastQueries.length > 0 && <div className={styles.scanReceipt}><Sparkles size={14} /><span>Scanned {lastQueries.join(" · ")}</span></div>}
    {error && <div className={styles.discoveryError}>{error}</div>}
    <section className={styles.discoveryLayout}><div className={styles.inbox}>
      <div className={styles.discoverySectionHead}><div><p className={styles.eyebrow}>Discovery queue</p><h2>Leads to qualify</h2></div><div className={styles.queueControls}><span>{active.length} lead{active.length === 1 ? "" : "s"}</span>{pageCount > 1 && <><button type="button" aria-label="Previous leads" disabled={currentPage === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}><ChevronLeft size={15} /></button><span>{currentPage + 1}/{pageCount}</span><button type="button" aria-label="Next leads" disabled={currentPage === pageCount - 1} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}><ChevronRight size={15} /></button></>}</div></div>
      {loading ? <div className={styles.discoveryEmpty}><IskraOrb size={30} /><p>Loading your sourcing inbox…</p></div> : active.length ? <div className={styles.candidateList}>{visible.map((candidate) => <article key={candidate.id} className={styles.candidateCard}><div className={styles.candidateTopline}><span>{SOURCE_LABELS[candidate.source_type] ?? candidate.source_type}</span><span>{sourceDetail(candidate)}</span></div><h3>{candidate.name}</h3><p className={styles.candidateHeadline}>{candidateContext(candidate)}</p><div className={styles.whyNow}><strong>Why Iskra noticed this</strong><p>{candidate.why_now}</p></div><p className={styles.identityNote}><span>{candidate.identity_status === "corroborated" ? "Founder identity corroborated" : "Founder identity not yet verified"}</span>{candidate.identity_reason}</p><div className={styles.candidateFooter}><span><b>{candidate.score}</b> signal strength · {Math.round(candidate.confidence * 100)}% confidence</span><div>{candidate.source_url && <a href={candidate.source_url} target="_blank" rel="noreferrer">Source <ExternalLink size={13} /></a>}<button type="button" onClick={() => void promote(candidate)} disabled={promoting === candidate.id}>{promoting === candidate.id ? "Adding…" : "Add to pipeline"} <ArrowRight size={14} /></button></div></div></article>)}</div> : <div className={styles.discoveryEmpty}><IskraOrb size={34} /><h2>No named leads surfaced yet</h2><p>Only named companies or people with a concrete source enter this queue. Broad commentary, papers, and raw repositories stay out of it.</p><button type="button" onClick={() => void scan()} disabled={scanning}>{scanning ? "Scanning…" : "Run first scan"}</button></div>}
    </div><aside className={styles.discoveryAside}><SourcingMap candidates={active} onOpenHow={() => setHowOpen(true)} /><div className={styles.discoveryPanel}><p className={styles.eyebrow}>Active pipeline</p><h2>{promoted.length} added</h2><p>Manually sourced, inbound, and investor-approved discoveries meet in one pipeline.</p><Link href="/opportunities">Open active pipeline <ArrowRight size={14} /></Link></div></aside></section>
    {howOpen && <div className={styles.howBackdrop} role="presentation"><section className={styles.howModal} role="dialog" aria-modal="true" aria-labelledby="sourcing-how-title"><button type="button" className={styles.howClose} onClick={() => setHowOpen(false)} aria-label="Close"><X size={16} /></button><p className={styles.eyebrow}>How this works</p><h2 id="sourcing-how-title">Signal first. Pipeline next.</h2><ol><li>Iskra scans public launch sources through your thesis.</li><li>Only named people or companies with a concrete source enter the discovery queue.</li><li>Add a lead to the pipeline when you want to pursue it.</li></ol></section></div>}
  </div>;
}
