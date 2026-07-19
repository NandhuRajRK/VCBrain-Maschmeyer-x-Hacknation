"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, BarChart3, BriefcaseBusiness, Check, FlaskConical, RefreshCw, Send, Users } from "lucide-react";
import {
  activateFounder,
  addDealNote,
  addDealTask,
  enrichFounderPassports,
  fetchDealWorkspace,
  fetchFounderPassports,
  fetchReadiness,
  inviteDealMember,
  simulateCompanyOutcome,
  updateDealTask,
} from "../../../lib/api";
import type {
  ApiActivationDraft,
  ApiDealWorkspace,
  ApiDecisionReadiness,
  ApiFounderPassport,
  ApiOutcomeInput,
  ApiOutcomeResult,
} from "../../../lib/api";
import { userError } from "../../../lib/errors";
import { useUnsavedChanges } from "../../../lib/use-dismissable-layer";
import styles from "./CompanyWorkspace.module.css";

export type WorkspaceTab = "readiness" | "analysis" | "founders" | "timeline" | "outcomes" | "team";

const DEFAULT_OUTCOME: ApiOutcomeInput = {
  initial_investment_usd: 100_000,
  entry_valuation_usd: 5_000_000,
  starting_mrr_usd: 25_000,
  monthly_growth_pct: 10,
  monthly_churn_pct: 2,
  gross_margin_pct: 70,
  monthly_burn_usd: 100_000,
  cash_on_hand_usd: 1_000_000,
  months_to_next_round: 12,
  next_round_raise_usd: 2_000_000,
  target_next_round_dilution_pct: 20,
  exit_months: 60,
  exit_revenue_multiple: 8,
  exit_probability: 0.15,
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
const tabs: { id: WorkspaceTab; label: string; icon: typeof Activity }[] = [
  { id: "readiness", label: "Readiness", icon: Check },
  { id: "analysis", label: "Analysis", icon: BarChart3 },
  { id: "founders", label: "Founder passports", icon: BriefcaseBusiness },
  { id: "timeline", label: "Evidence", icon: Activity },
  { id: "outcomes", label: "Outcomes", icon: FlaskConical },
  { id: "team", label: "Comments", icon: Users },
];

export default function CompanyWorkspace({ companyId, onTabChange }: { companyId: string; onTabChange?: (tab: WorkspaceTab) => void }) {
  const [tab, setTab] = useState<WorkspaceTab>("readiness");
  const [readiness, setReadiness] = useState<ApiDecisionReadiness | null>(null);
  const [passports, setPassports] = useState<ApiFounderPassport[]>([]);
  const [workspace, setWorkspace] = useState<ApiDealWorkspace | null>(null);
  const [outcomeInput, setOutcomeInput] = useState(DEFAULT_OUTCOME);
  const [outcome, setOutcome] = useState<ApiOutcomeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [task, setTask] = useState("");
  const [invite, setInvite] = useState("");
  const [draft, setDraft] = useState<ApiActivationDraft | null>(null);
  useUnsavedChanges(Boolean(note.trim() || task.trim() || invite.trim()), "Leave without saving your deal-room draft?");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [ready, founders, room] = await Promise.allSettled([
      fetchReadiness(companyId), fetchFounderPassports(companyId), fetchDealWorkspace(companyId),
    ]);
    if (ready.status === "fulfilled") setReadiness(ready.value);
    if (founders.status === "fulfilled") setPassports(founders.value);
    if (room.status === "fulfilled") setWorkspace(room.value);
    if ([ready, founders].every((item) => item.status === "rejected")) setError("The diligence workspace could not be loaded.");
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    if (tab !== "outcomes") return;
    const timer = window.setTimeout(() => {
      simulateCompanyOutcome(companyId, outcomeInput).then(setOutcome).catch((err) => setError(userError(err, "company")));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [companyId, outcomeInput, tab]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try { await action(); await refresh(); }
    catch (err) { setError(userError(err, "company")); }
    finally { setBusy(false); }
  }

  return (
    <section className={styles.workspace}>
      <div className={styles.tabs} role="tablist" aria-label="Company intelligence views">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} role="tab" aria-selected={tab === id} className={styles.tab} onClick={() => { setTab(id); onTabChange?.(id); setError(null); }}>
            <Icon size={15} /> <span>{label}</span>
          </button>
        ))}
      </div>

      <div className={styles.panel} role="tabpanel">
        {loading && <div className={styles.state}><span className={styles.spinner} /> Loading intelligence</div>}
        {error && <div className={styles.error}>{error}</div>}

        {!loading && tab === "readiness" && readiness && (
          <div className={styles.readiness}>
            <div className={styles.scoreRing} style={{ "--score": `${readiness.score * 3.6}deg` } as React.CSSProperties}>
              <strong>{readiness.score}</strong><span>ready</span>
            </div>
            <div className={styles.readinessBody}>
              <div className={styles.panelHead}><div><h2>Readiness · {readiness.score}/100</h2><p>{readiness.status.replaceAll("_", " ")} · Updated {new Date(readiness.updated_at).toLocaleString()}</p></div></div>
              <div className={styles.componentGrid}>{Object.entries(readiness.components).map(([key, value]) => <div key={key}><span>{key.replaceAll("_", " ")}</span><strong>{Math.round(value)}</strong></div>)}</div>
              {readiness.blockers.length > 0 && <div className={styles.blockers}>{readiness.blockers.map((item) => <span key={item}>{item}</span>)}</div>}
              <div className={styles.actionList}>{readiness.next_actions.map((item) => <div key={`${item.category}-${item.title}`}><span>{item.priority}</span><div><strong>{item.title}</strong><p>{item.reason}</p></div><b>+{item.expected_readiness_gain}</b></div>)}</div>
            </div>
          </div>
        )}

        {!loading && tab === "founders" && (
          <div>
            <div className={styles.panelHead}><div><h2>Verified founder history</h2><p>Facts retain confidence and supporting source IDs.</p></div><button className={styles.secondary} disabled={busy} onClick={() => void run(() => enrichFounderPassports(companyId))}><RefreshCw size={14} /> Enrich with Tavily</button></div>
            {passports.length === 0 ? <div className={styles.empty}>No founder passport is available yet.</div> : <div className={styles.passports}>{passports.map((founder) => (
              <article key={founder.founder_id} className={styles.passport}>
                <header><div><h3>{founder.name}</h3><p>{founder.headline || founder.current_role || "Role unverified"}</p></div><span>{Math.round(founder.confidence * 100)}% confidence</span></header>
                <div className={styles.history}>
                  <div><b>Career</b>{founder.work_history.length > 0 ? founder.work_history.map((item) => <p key={`${item.organization}-${item.role}`}>{item.role} · {item.organization}</p>) : <span className={styles.missing}>No verified career history</span>}</div>
                  <div><b>Education</b>{founder.education_history.length > 0 ? founder.education_history.map((item) => <p key={item.institution}>{item.degree || "Credential"} · {item.institution}</p>) : <span className={styles.missing}>No verified education</span>}</div>
                  <div><b>Previous ventures</b>{founder.previous_ventures.length > 0 ? founder.previous_ventures.map((item) => <p key={item.company_name}>{item.company_name}{item.outcome ? ` · ${item.outcome}` : ""}</p>) : <span className={styles.missing}>No verified ventures</span>}</div>
                </div>
                {founder.skills.length > 0 && <div className={styles.skills}>{founder.skills.map((skill) => <span key={skill}>{skill}</span>)}</div>}
                {founder.gaps.length > 0 && <div className={styles.gaps}>{founder.gaps.map((gap) => <span key={gap}>{gap}</span>)}</div>}
                <button className={styles.secondary} onClick={() => void activateFounder({ founder_id: founder.founder_id, context: "Evidence-backed introduction from the active deal review" }).then(setDraft).catch((err) => setError(userError(err, "company")))}><Send size={14} /> Draft outreach</button>
              </article>
            ))}</div>}
            {draft && <div className={styles.draft}><strong>{draft.subject}</strong><p>{draft.message}</p></div>}
          </div>
        )}

        {!loading && tab === "outcomes" && (
          <div><div className={styles.panelHead}><div><h2>Outcome simulator</h2><p>Adjust operating assumptions to update ownership and expected return.</p></div></div>
            <div className={styles.simulator}>
              <div className={styles.sliders}>{([
                ["monthly_growth_pct", "Monthly growth", -10, 60, 1, "%"], ["monthly_churn_pct", "Monthly churn", 0, 25, 0.5, "%"], ["gross_margin_pct", "Gross margin", 0, 100, 1, "%"], ["monthly_burn_usd", "Monthly burn", 10000, 500000, 10000, "$"], ["cash_on_hand_usd", "Cash on hand", 0, 5000000, 50000, "$"], ["entry_valuation_usd", "Entry valuation", 1000000, 30000000, 250000, "$"],
              ] as const).map(([key, label, min, max, step, suffix]) => <label key={key}><span>{label}<b>{suffix === "$" ? money.format(outcomeInput[key]) : `${outcomeInput[key]}${suffix}`}</b></span><input type="range" min={min} max={max} step={step} value={outcomeInput[key]} onChange={(event) => setOutcomeInput((current) => ({ ...current, [key]: Number(event.target.value) }))} /></label>)}</div>
              <div className={styles.outputs}>{outcome ? <><div><span>Expected MOIC</span><strong>{outcome.expected_moic.toFixed(2)}x</strong></div><div><span>Expected return</span><strong>{money.format(outcome.expected_return_usd)}</strong></div><div><span>Runway</span><strong>{outcome.runway_months?.toFixed(1) ?? "∞"} mo</strong></div><div><span>Required next valuation</span><strong>{money.format(outcome.required_next_round_pre_money_usd)}</strong></div><div><span>Post-round ownership</span><strong>{outcome.post_round_ownership_pct.toFixed(1)}%</strong></div></> : <div className={styles.state}><span className={styles.spinner} /> Simulating</div>}</div>
            </div>
          </div>
        )}

        {!loading && tab === "team" && (
          <div><div className={styles.panelHead}><div><h2>Team comments</h2><p>Review every anchored comment and keep the deal team aligned.</p></div></div>
            {!workspace ? <div className={styles.empty}>This deal room is unavailable in the current organization.</div> : <div className={styles.dealGrid}>
              <div><h3>Tasks</h3><form className={styles.inlineForm} onSubmit={(event) => { event.preventDefault(); if (task.trim()) void run(async () => { await addDealTask(companyId, task.trim()); setTask(""); }); }}><input value={task} onChange={(event) => setTask(event.target.value)} placeholder="Add diligence task" /><button disabled={busy || !task.trim()}>Add</button></form>{workspace.tasks.map((item) => <button key={item.id} className={styles.task} onClick={() => void run(() => updateDealTask(companyId, item, item.status === "done" ? "open" : "done"))}><span data-done={item.status === "done"}>{item.status === "done" ? "✓" : "○"}</span>{item.title}</button>)}</div>
              <div><h3>Comments</h3><form className={styles.inlineForm} onSubmit={(event) => { event.preventDefault(); if (note.trim()) void run(async () => { await addDealNote(companyId, note.trim()); setNote(""); }); }}><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a team comment" /><button disabled={busy || !note.trim()}>Add</button></form>{workspace.notes.length === 0 && <div className={styles.empty}>No comments yet. Right-click any part of the company page to start one.</div>}{workspace.notes.map((item) => <div className={styles.note} key={item.id}><p>{item.body}</p><span>{item.anchor ? `On ${item.anchor} · ` : ""}{item.author_id} · {new Date(item.updated_at).toLocaleDateString()}</span>{(item.mentions ?? []).length > 0 && <small>Tagged: {(item.mentions ?? []).join(", ")}</small>}</div>)}</div>
              <div><h3>Invite</h3><form className={styles.inlineForm} onSubmit={(event) => { event.preventDefault(); if (invite.trim()) void run(async () => { await inviteDealMember(companyId, invite.trim(), "", "analyst"); setInvite(""); }); }}><input value={invite} onChange={(event) => setInvite(event.target.value)} placeholder="Clerk user ID" /><button disabled={busy || !invite.trim()}>Invite</button></form>{workspace.invitations.map((item) => <div className={styles.member} key={item.id}><span>{item.display_name || item.invited_user_id}</span><b>{item.status}</b></div>)}{workspace.members.map((item) => <div className={styles.member} key={item.id}><span>{item.display_name || item.user_id}</span><b>{item.role}</b></div>)}</div>
            </div>}
          </div>
        )}

      </div>
    </section>
  );
}
