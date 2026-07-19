"use client";

import { useState } from "react";
import styles from "./page.module.css";
import type { ThesisConfig } from "../../lib/thesis";
import { DEFAULT_THESIS } from "../../lib/thesis";

type TagKey = "sectors" | "stages" | "geographies" | "preferredModels" | "exclusions";

const GROUPS: { key: TagKey; label: string; hint: string }[] = [
  { key: "sectors", label: "Sectors", hint: "Hard filter. Out-of-sector companies are rejected." },
  { key: "stages", label: "Stages", hint: "Hard filter. Company stage must match one of these." },
  { key: "geographies", label: "Geographies", hint: "Hard filter. Matched by region or city." },
  { key: "preferredModels", label: "Preferred models", hint: "Soft signal. Lifts fit score, never rejects." },
  { key: "exclusions", label: "Exclusions", hint: "Hard filter. Any match is an instant reject." },
];

function TagEditor({
  values,
  onChange,
}: {
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft("");
  }

  return (
    <div className={styles.tags}>
      {values.map((v) => (
        <span key={v} className={styles.tag}>
          {v}
          <button
            type="button"
            className={styles.tagRemove}
            onClick={() => onChange(values.filter((x) => x !== v))}
            aria-label={`Remove ${v}`}
          >
            &#215;
          </button>
        </span>
      ))}
      <input
        className={styles.tagInput}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        placeholder="Add..."
      />
    </div>
  );
}

export default function ThesisPage() {
  const [thesis, setThesis] = useState<ThesisConfig>(DEFAULT_THESIS);

  function setTags(key: TagKey, next: string[]) {
    setThesis((prev) => ({ ...prev, [key]: next }));
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Thesis Config</h1>
        <p className={styles.subtitle}>
          The fund thesis every company is scored against. Hard filters reject;
          soft signals only move the fit score.
        </p>
      </header>

      <div className={styles.groups}>
        {GROUPS.map((g) => (
          <div key={g.key} className={styles.group}>
            <div className={styles.groupHead}>
              <span className={styles.groupLabel}>{g.label}</span>
              <span className={styles.groupHint}>{g.hint}</span>
            </div>
            <TagEditor values={thesis[g.key]} onChange={(next) => setTags(g.key, next)} />
          </div>
        ))}

        <div className={styles.numberRow}>
          <div className={styles.numberField}>
            <span className={styles.groupLabel}>Check size min</span>
            <div className={styles.numberInputWrap}>
              <span className={styles.currency}>&#8364;</span>
              <input
                className={styles.numberInput}
                type="number"
                value={thesis.checkSize.min}
                onChange={(e) =>
                  setThesis((p) => ({
                    ...p,
                    checkSize: { ...p.checkSize, min: Number(e.target.value) },
                  }))
                }
              />
            </div>
          </div>
          <div className={styles.numberField}>
            <span className={styles.groupLabel}>Check size max</span>
            <div className={styles.numberInputWrap}>
              <span className={styles.currency}>&#8364;</span>
              <input
                className={styles.numberInput}
                type="number"
                value={thesis.checkSize.max}
                onChange={(e) =>
                  setThesis((p) => ({
                    ...p,
                    checkSize: { ...p.checkSize, max: Number(e.target.value) },
                  }))
                }
              />
            </div>
          </div>
          <div className={styles.numberField}>
            <span className={styles.groupLabel}>Ownership target</span>
            <div className={styles.numberInputWrap}>
              <input
                className={styles.numberInput}
                type="number"
                value={thesis.ownershipTarget}
                onChange={(e) =>
                  setThesis((p) => ({ ...p, ownershipTarget: Number(e.target.value) }))
                }
              />
              <span className={styles.currency}>%</span>
            </div>
          </div>
        </div>

        <div className={styles.group}>
          <span className={styles.groupLabel}>Risk appetite</span>
          <div className={styles.segment}>
            {(["conservative", "moderate", "aggressive"] as const).map((r) => (
              <button
                key={r}
                type="button"
                className={styles.segmentBtn}
                data-active={thesis.riskAppetite === r}
                onClick={() => setThesis((p) => ({ ...p, riskAppetite: r }))}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.save} disabled>
          Save thesis
        </button>
        <span className={styles.footerNote}>
          Editing is live for this session. Persisting the thesis is wired to a
          backend endpoint that is not built yet.
        </span>
      </div>
    </div>
  );
}
