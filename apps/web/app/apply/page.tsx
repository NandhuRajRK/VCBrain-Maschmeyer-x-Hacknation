"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";
import type { ApiCompany, PipelineResult } from "../../lib/api";
import { onboardAndAnalyze } from "../../lib/api";

const DECISION_LABELS: Record<string, string> = {
  invest: "Invest",
  conditional_invest: "Conditional Invest",
  hold: "Hold",
  reject: "Reject",
};

interface FormState {
  name: string;
  website: string;
  sector: string;
  stage: string;
  geography: string;
  description: string;
}

const EMPTY: FormState = {
  name: "",
  website: "",
  sector: "",
  stage: "",
  geography: "",
  description: "",
};

export default function ApplyPage() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ company: ApiCompany; pipeline: PipelineResult } | null>(null);

  function update(key: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const r = await onboardAndAnalyze({
        name: form.name.trim(),
        website: form.website.trim() || null,
        sector: form.sector.trim() || null,
        stage: form.stage.trim() || null,
        geography: form.geography.trim() || null,
        description: form.description.trim() || null,
      });
      setResult(r);
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>New Application</h1>
        <p className={styles.subtitle}>
          Submit a company. It gets sourced, ingested, and run through the full
          thesis, scoring, and memo pipeline.
        </p>
      </header>

      {result ? (
        <div className={styles.result}>
          <span
            className={styles.decision}
            data-decision={result.pipeline.memo.decision}
          >
            {DECISION_LABELS[result.pipeline.memo.decision] ??
              result.pipeline.memo.decision}
          </span>
          <h2 className={styles.resultName}>{result.company.name}</h2>
          <div className={styles.resultScores}>
            <span>Founder {result.pipeline.scores.founder.adjustedScore}</span>
            <span>Market {result.pipeline.scores.market.adjustedScore}</span>
            <span>Idea/Market {result.pipeline.scores.ideaVsMarket.adjustedScore}</span>
            <span>Thesis fit {Math.round(result.pipeline.thesis.fitScore * 100)}%</span>
          </div>
          <div className={styles.resultActions}>
            <Link href={`/company/${result.company.id}`} className={styles.primaryLink}>
              Open full memo
            </Link>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => {
                setForm(EMPTY);
                setResult(null);
              }}
            >
              Submit another
            </button>
          </div>
        </div>
      ) : (
        <form className={styles.form} onSubmit={onSubmit}>
          <div className={styles.field}>
            <label className={styles.label}>Company name *</label>
            <input
              className={styles.input}
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="AetherGrid"
              autoFocus
            />
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Sector</label>
              <input
                className={styles.input}
                value={form.sector}
                onChange={(e) => update("sector", e.target.value)}
                placeholder="AI infrastructure"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Stage</label>
              <input
                className={styles.input}
                value={form.stage}
                onChange={(e) => update("stage", e.target.value)}
                placeholder="seed"
              />
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Geography</label>
              <input
                className={styles.input}
                value={form.geography}
                onChange={(e) => update("geography", e.target.value)}
                placeholder="Berlin"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Website</label>
              <input
                className={styles.input}
                value={form.website}
                onChange={(e) => update("website", e.target.value)}
                placeholder="https://"
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Description</label>
            <textarea
              className={styles.textarea}
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="One or two lines on what they do."
              rows={3}
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.actions}>
            <button
              type="submit"
              className={styles.submit}
              disabled={submitting || !form.name.trim()}
            >
              {submitting ? "Analyzing pipeline..." : "Submit and analyze"}
            </button>
            <Link href="/" className={styles.cancel}>
              Cancel
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
