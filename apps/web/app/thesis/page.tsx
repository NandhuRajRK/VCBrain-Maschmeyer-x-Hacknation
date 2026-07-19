"use client";

import { useEffect, useState } from "react";
import { CircleHelp, Search, X } from "lucide-react";
import styles from "./page.module.css";
import type { ThesisConfig } from "../../lib/thesis";
import { DEFAULT_THESIS } from "../../lib/thesis";
import { fetchThesis, saveThesis } from "../../lib/api";
import { userError } from "../../lib/errors";
import { useDismissableLayer, useUnsavedChanges } from "../../lib/use-dismissable-layer";

type TagKey = "sectors" | "stages" | "geographies" | "preferredModels" | "exclusions";

const GROUPS: { key: TagKey; label: string; hint: string; options: string[] }[] = [
  { key: "sectors", label: "Sectors", hint: "Hard filter. Out-of-sector companies are rejected.", options: ["ai", "ai_infra", "cybersecurity", "fintech", "developer_tools", "healthtech", "climate"] },
  { key: "stages", label: "Stages", hint: "Hard filter. Company stage must match one of these.", options: ["pre_seed", "seed", "series_a", "series_b"] },
  { key: "geographies", label: "Geographies", hint: "Hard filter. Matched by region or city.", options: ["US", "EU", "UK", "DACH", "Berlin", "London", "Paris", "Amsterdam", "Zurich", "Munich"] },
  { key: "preferredModels", label: "Preferred models", hint: "Soft signal. Lifts fit score, never rejects.", options: ["b2b_saas", "api", "platform", "marketplace", "developer_tools"] },
  { key: "exclusions", label: "Exclusions", hint: "Hard filter. Any match is an instant reject.", options: ["gambling", "tobacco", "weapons", "adult", "crypto"] },
];

function Help({ text }: { text: string }) {
  return <button type="button" className={styles.help} data-tooltip={text} aria-label={text}><CircleHelp size={14} /></button>;
}

function MultiSelect({ values, options, onChange }: { values: string[]; options: string[]; onChange: (next: string[]) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selectRef = useDismissableLayer<HTMLDivElement>(open, () => setOpen(false));
  const filtered = options.filter((option) => option.toLowerCase().includes(query.toLowerCase().trim()));

  function toggle(value: string) {
    onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  }

  function addCustom() {
    const value = query.trim();
    if (value && !values.includes(value)) onChange([...values, value]);
    setQuery("");
  }

  return (
    <div ref={selectRef} className={styles.multiSelect}>
      <label className={styles.searchField}>
        <Search size={14} className={styles.selectIcon} aria-hidden="true" />
        <input
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustom(); } }}
          placeholder="Search filters or enter a custom value"
          aria-label="Search thesis filters"
        />
      </label>
      <div className={styles.selectedList}>
        {values.length > 0 ? values.map((value) => (
          <span key={value} className={styles.tag}>
            {value}
            <button type="button" className={styles.tagRemove} onClick={() => toggle(value)} aria-label={`Remove ${value}`}>
              <X size={13} />
            </button>
          </span>
        )) : <span className={styles.selectedEmpty}>No filters selected</span>}
      </div>
      {open && (
        <div className={styles.options}>
          {filtered.map((option) => (
            <button key={option} type="button" data-selected={values.includes(option)} onClick={() => toggle(option)}>
              <span>{option}</span>
              {values.includes(option) && <span aria-hidden="true">✓</span>}
            </button>
          ))}
          {query.trim() && !options.some((option) => option.toLowerCase() === query.trim().toLowerCase()) && (
            <button type="button" className={styles.customOption} onClick={addCustom}>Use “{query.trim()}”</button>
          )}
          {!filtered.length && !query.trim() && <span className={styles.noOptions}>No options</span>}
        </div>
      )}
    </div>
  );
}

export default function ThesisPage() {
  const [thesis, setThesis] = useState<ThesisConfig>(DEFAULT_THESIS);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [savedThesis, setSavedThesis] = useState<string | null>(null);
  const dirty = savedThesis !== null && JSON.stringify(thesis) !== savedThesis;
  useUnsavedChanges(dirty && !saving, "Leave without saving your thesis changes?");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchThesis().then((value) => {
        const loaded: ThesisConfig = {
          sectors: value.sectors,
          stages: value.stages,
          geographies: value.geographies,
          preferredModels: value.preferred_models,
          exclusions: value.exclusions,
          checkSize: { min: value.check_size_min_usd, max: value.check_size_max_usd },
          ownershipTarget: value.ownership_target_pct,
          riskAppetite: value.risk_appetite,
        };
        setThesis(loaded);
        setSavedThesis(JSON.stringify(loaded));
      }).catch((error) => { setSavedThesis(JSON.stringify(DEFAULT_THESIS)); setStatus(userError(error, "application")); });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function setTags(key: TagKey, next: string[]) {
    setThesis((prev) => ({ ...prev, [key]: next }));
    setStatus(null);
  }

  async function persist() {
    setSaving(true);
    setStatus(null);
    try {
      await saveThesis({
        organization_id: "demo-org",
        sectors: thesis.sectors,
        stages: thesis.stages,
        geographies: thesis.geographies,
        preferred_models: thesis.preferredModels,
        exclusions: thesis.exclusions,
        check_size_min_usd: thesis.checkSize.min,
        check_size_max_usd: thesis.checkSize.max,
        ownership_target_pct: thesis.ownershipTarget,
        risk_appetite: thesis.riskAppetite,
        updated_at: new Date().toISOString(),
      });
      setSavedThesis(JSON.stringify(thesis));
      setStatus("Thesis saved for this organization.");
    } catch (error) {
      setStatus(userError(error, "application"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Thesis Config</h1>
          <Help text="Set the fund's filters and preferences. Hard filters reject; soft signals only change fit." />
        </div>
      </header>

      <div className={styles.groups}>
        {GROUPS.map((group) => (
          <div key={group.key} className={styles.group}>
            <div className={styles.groupHead}>
              <span className={styles.groupLabel}>{group.label}</span>
              <Help text={group.hint} />
            </div>
            <MultiSelect values={thesis[group.key]} options={group.options} onChange={(next) => setTags(group.key, next)} />
          </div>
        ))}

        <div className={styles.numberRow}>
          <div className={styles.numberField}><span className={styles.groupLabel}>Check size min</span><div className={styles.numberInputWrap}><span className={styles.currency}>$</span><input className={styles.numberInput} type="number" value={thesis.checkSize.min} onChange={(e) => setThesis((p) => ({ ...p, checkSize: { ...p.checkSize, min: Number(e.target.value) } }))} /></div></div>
          <div className={styles.numberField}><span className={styles.groupLabel}>Check size max</span><div className={styles.numberInputWrap}><span className={styles.currency}>$</span><input className={styles.numberInput} type="number" value={thesis.checkSize.max} onChange={(e) => setThesis((p) => ({ ...p, checkSize: { ...p.checkSize, max: Number(e.target.value) } }))} /></div></div>
          <div className={styles.numberField}><span className={styles.groupLabel}>Ownership target</span><div className={styles.numberInputWrap}><input className={styles.numberInput} type="number" value={thesis.ownershipTarget} onChange={(e) => setThesis((p) => ({ ...p, ownershipTarget: Number(e.target.value) }))} /><span className={styles.currency}>%</span></div></div>
        </div>

        <div className={styles.group}>
          <div className={styles.groupHead}><span className={styles.groupLabel}>Risk appetite</span><Help text="Controls how much uncertainty the scoring model tolerates." /></div>
          <div className={styles.segment}>
            {(["conservative", "moderate", "aggressive"] as const).map((risk) => <button key={risk} type="button" className={styles.segmentBtn} data-active={thesis.riskAppetite === risk} onClick={() => setThesis((p) => ({ ...p, riskAppetite: risk }))}>{risk}</button>)}
          </div>
        </div>
      </div>

      <div className={styles.footer}><button type="button" className={styles.save} disabled={saving} onClick={() => void persist()}>{saving ? "Saving..." : "Save thesis"}</button>{status && <span className={styles.footerNote}>{status}</span>}</div>
    </div>
  );
}
