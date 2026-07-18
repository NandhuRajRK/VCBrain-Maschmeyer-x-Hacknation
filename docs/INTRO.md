# INTRO — VC Brain Game Plan

---

## A) Work Division

### Nandhu — Data & Sourcing (Memory pillar)

1. **Synthetic data pack** — 10 founder profiles at three signal levels. Rich (3-4): GitHub + LinkedIn + deck + traction metrics. Medium (3-4): deck + LinkedIn only. Cold-start (2-3): just a deck and a name. Seed 2-3 contradictions across sources (e.g., deck says "20 customers," LinkedIn says "5 pilots"). Create 2-3 minimal pitch decks.
2. **Ingestion pipeline** — FastAPI. `POST /companies` accepts deck + company name. Parse deck, extract text, segment by section.
3. **Entity extraction & resolution** — Pull company, founder, and financial entities from parsed content. Deduplicate across sources. Normalize names, dates, currencies.
4. **Claim-evidence ledger** — Every extracted fact becomes a Claim linked to Evidence (source, page number, quote, independence level, freshness). `GET /companies/{id}/claims` returns the full ledger. This is the data structure the entire intelligence layer depends on.
5. **Founder Score model** — Persistent score that follows a founder across startups and applications. Updates with new data but never resets. This is separate from the per-opportunity 3-axis scores — the Founder Score lives in Memory and feeds into the Founder axis as one input.
6. **Outbound sourcing scanner** — Wire up one real API (GitHub trending or HackerNews) for live signal detection. Score outbound-discovered founders the same way as inbound applicants. Build an "activate" mock that generates a personalized outreach message for top matches.
7. **NL search endpoint** — Accept a query like "technical founder, Berlin, AI infra, no prior VC backing" and return ranked matches. Use the LLM to parse natural language into structured filters against the founder database.

### Julia — Intelligence & Experience (Intelligence + Experience pillars)

1. **Thesis Engine** — Configurable fund parameters: sectors, stage, geography, check size, ownership targets, risk appetite. Stored as JSON, editable in the UI. Every scoring pass filters through this lens.
2. **3-axis scoring** — Score each opportunity on Founder / Market / Idea-vs-Market independently (the brief says explicitly: never averaged). Each axis gets a trend direction (improving / declining / stable). Formula: `adjusted = raw × evidence_confidence × source_independence × freshness`.
3. **Cold-start scoring method** — For founders with thin data: weight deck analysis and idea/market axes heavier, extract potential signals from whatever public footprint exists, and surface low confidence transparently instead of guessing. Document the method clearly — the brief treats a well-documented approach to this open problem as valuable on its own.
4. **Per-claim Trust Score** — Wire the claim-evidence ledger into per-claim confidence levels. Flag contradictions. The investor should see at a glance which claims are verified, unverified, or contradicted, and what evidence backs each one.
5. **Memo generator** — Required sections: Company snapshot, Investment hypotheses, SWOT, Problem & product, Traction & KPIs. Explicitly flag data gaps ("Cap table: not disclosed"). Include a red-team section: the strongest reason NOT to invest.
6. **Decision output** — Invest / Conditional Invest / Hold / Reject. Include conditions and decision-flip logic (e.g., "changes to INVEST if ARR is verified and one customer reference confirms deployment").
7. **Investor dashboard** — React + shadcn. Three views:
   - **Pipeline**: ranked founder list, 3-axis scores, trend arrows, thesis-fit indicators.
   - **Company deep-dive**: dossier + evidence ledger + claim-level Trust Scores + contradiction highlights.
   - **Decision room**: memo + recommendation + score breakdown + decision-flip factors.

### Shared

- Schemas and API contracts (defined together before splitting)
- Demo script and walkthrough narrative
- Deployment (local is fine)
- Final pitch

---

## B) Decisions to Make Right Now

1. **Tech stack.** README says React + shadcn frontend, FastAPI backend. Confirm or change now.

2. **LLM provider.** Needed for deck parsing, entity extraction, NL query resolution, scoring rationale, and memo generation. Pick one (OpenAI / Anthropic / Groq) and commit. Consider rate limits during dev.

3. **Database.** SQLite or flat JSON files — either works. Postgres adds setup time for no demo benefit. The claim-evidence ledger needs to be queryable; SQLite handles that.

4. **Real API or all mocked?** One real integration (GitHub trending or HN) lets you show live sourcing in the demo. Mock everything else with synthetic data.

5. **Demo narrative.** Script the walkthrough before building. Decide which synthetic founder gets discovered outbound, which applies inbound, which triggers a contradiction, and which is the cold-start case. Four scenarios, under 5 minutes.

---

## C) Step-by-Step Implementation

### Phase 0 — Foundation (Hours 0-2) · Together

1. Lock in the five decisions above. Write them down. 30 min.
2. Define shared schemas: `Company`, `Founder`, `FounderScore`, `Claim`, `Evidence`, `ThesisConfig`, `AxisScore`, `InvestmentMemo`, `Decision`. Put them in `packages/shared/`. 45 min.
3. Build 3-4 synthetic founder profiles together so you both understand the data shape. Nandhu finishes the rest solo. 30 min.
4. Scaffold projects. Nandhu: FastAPI in `services/api/`. Julia: React in `apps/web/`. 15 min.

### Phase 1 — Vertical Slice (Hours 2-8) · Parallel

Goal: one founder goes from deck submission to investment memo by hour 8.

**Nandhu:**
- Hours 2-3: FastAPI `/companies` endpoint. Deck upload + company name. Store in SQLite/JSON.
- Hours 3-5: Parsing + extraction pipeline. Synthetic deck in, claims + evidence out.
- Hours 5-6: Claim-evidence ledger API. `GET /companies/{id}/claims`.
- Hours 6-8: Entity resolution, Founder Score model, basic search endpoint.

**Julia:**
- Hours 2-3: Thesis Engine. JSON config, pass/fail filtering function.
- Hours 3-5: 3-axis scoring engine. Evidence-adjusted formula, trend directions.
- Hours 5-7: Memo generator. Required sections + red-team section.
- Hours 7-8: Decision generator. Invest / Conditional / Hold / Reject with conditions.

**Hour 8 checkpoint:** Wire Julia's scoring to Nandhu's data API. Run one synthetic founder through the full pipeline. Fix integration issues.

### Phase 2 — Sourcing & Differentiation (Hours 8-14) · Parallel

**Nandhu:**
- Hours 8-10: Outbound sourcing scanner. One real API + signal detection against thesis config.
- Hours 10-12: Harden the inbound flow end-to-end across all synthetic profiles.
- Hours 12-14: NL query endpoint.

**Julia:**
- Hours 8-10: Cold-start scoring method. Build and document the approach.
- Hours 10-12: Per-claim Trust Score visualization logic. Contradictions, flags, evidence links.
- Hours 12-14: Start UI. Pipeline view first (ranked list with scores).

### Phase 3 — UI & Polish (Hours 14-20) · Parallel

**Nandhu:**
- Close backend gaps. Support Julia on API integration.
- Build the outbound "activate" mock (outreach message generation).
- Finalize synthetic data for all demo scenarios.

**Julia:**
- Hours 14-17: Company deep-dive view.
- Hours 17-19: Decision room view.
- Hours 19-20: Visual cleanup. Clean and readable over flashy.

### Phase 4 — Demo & Pitch (Hours 20-24) · Together

- Hours 20-21: Run through the full demo 3 times. Fix bugs. Time it.
- Hours 21-22: Build the pitch. Problem → Solution → Demo → Architecture → Cold-start approach.
- Hours 22-23: Practice. Nandhu presents data/sourcing, Julia presents intelligence/UX.
- Hours 23-24: Buffer for last-minute fixes.

### Cut List (if behind — least important first)

1. NL query endpoint
2. Real API integration (mock it instead)
3. Outbound activation flow
4. Decision room as separate view (fold into deep-dive)
5. **Never cut:** claim-evidence ledger, 3-axis scoring, cold-start handling, demo narrative
