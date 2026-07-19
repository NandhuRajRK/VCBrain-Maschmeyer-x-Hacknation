"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";
import type { ApiSearchMatch } from "../../lib/api";
import { searchFounders } from "../../lib/api";

const EXAMPLES = [
  "technical AI founders in Berlin",
  "fintech founders with GitHub",
  "cold-start founders worth a call",
];

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ApiSearchMatch[] | null>(null);

  async function run(q: string) {
    if (!q.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const r = await searchFounders(q.trim(), 20);
      setResults(r);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    run(query);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Founder Search</h1>
        <p className={styles.subtitle}>
          Natural-language search across every founder in the pipeline.
        </p>
      </header>

      <form className={styles.searchBar} onSubmit={onSubmit}>
        <input
          className={styles.searchInput}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Describe the founder you are looking for..."
          autoFocus
        />
        <button
          type="submit"
          className={styles.searchBtn}
          disabled={loading || !query.trim()}
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </form>

      {!results && !error && (
        <div className={styles.examples}>
          <span className={styles.examplesLabel}>Try</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              className={styles.exampleChip}
              onClick={() => {
                setQuery(ex);
                run(ex);
              }}
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}

      {results && (
        <div className={styles.results}>
          <p className={styles.resultsCount}>
            {results.length} match{results.length === 1 ? "" : "es"}
          </p>
          {results.length === 0 && (
            <p className={styles.empty}>No founders matched that query.</p>
          )}
          {results.map((m) => (
            <Link
              key={m.founder.id}
              href={`/company/${m.company.id}`}
              className={styles.match}
            >
              <div className={styles.matchMain}>
                <div className={styles.matchHead}>
                  <span className={styles.founderName}>{m.founder.name}</span>
                  {m.founder.role && (
                    <span className={styles.founderRole}>{m.founder.role}</span>
                  )}
                  {m.founder.cold_start && (
                    <span className={styles.coldFlag}>Cold start</span>
                  )}
                </div>
                <span className={styles.companyName}>
                  {m.company.name}
                  {m.company.sector ? ` · ${m.company.sector}` : ""}
                  {m.company.geography ? ` · ${m.company.geography}` : ""}
                </span>
                {m.reasons.length > 0 && (
                  <ul className={styles.reasons}>
                    {m.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div className={styles.matchSide}>
                <span className={styles.matchScore}>
                  {Math.round(m.match_score * 100)}%
                </span>
                <span className={styles.matchScoreLabel}>match</span>
                {m.founder_score && (
                  <span className={styles.founderScore}>
                    founder {Math.round(m.founder_score.score)}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
