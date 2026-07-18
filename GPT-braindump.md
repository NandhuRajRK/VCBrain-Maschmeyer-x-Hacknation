
# Complete system architecture

```text
1. Data-source layer
2. Ingestion layer
3. Parsing and extraction layer
4. Entity-resolution layer
5. Normalized startup data layer
6. Claim and evidence layer
7. Research-enrichment layer
8. Fund-thesis layer
9. Investment-analysis layer
10. Scoring and confidence layer
11. Risk and contradiction layer
12. Decision-generation layer
13. Memo-generation layer
14. Human review layer
15. Application/API layer
16. UI layer
17. Persistence and observability layer
```

---

# Full pipeline

```text
Startup discovered or submitted
        ↓
Sources collected
        ↓
Documents and webpages parsed
        ↓
Companies, founders and metrics extracted
        ↓
Entities resolved and deduplicated
        ↓
Normalized company dossier created
        ↓
Claims linked to evidence
        ↓
Missing information and contradictions detected
        ↓
External research enrichment
        ↓
Fund thesis applied
        ↓
Founder, market, product and traction analysed
        ↓
Evidence-adjusted scores calculated
        ↓
Risks and decision blockers identified
        ↓
Invest / conditional invest / hold / reject generated
        ↓
Evidence-backed memo produced
        ↓
Human investor reviews and makes final decision
```

# 1. Data-source layer

This contains every source entering the system.

## Founder-provided sources

* Pitch deck
* Financial model
* Cap table
* Founder questionnaire
* Customer list
* Revenue records
* Product documentation
* Data-room files
* Hiring plan
* Use-of-funds plan
* Demo video
* Founder interview transcript

## Public sources

* Company website
* Founder LinkedIn profiles
* Company LinkedIn page
* GitHub
* Product Hunt
* Crunchbase or Dealroom
* Press articles
* Regulatory databases
* Company registers
* Patent databases
* App stores
* Review websites
* Job listings
* Social media
* Customer case studies
* Competitor websites
* Industry reports
* Search-engine results

## Internal VC sources

* Fund thesis
* Previous investment memos
* Portfolio-company data
* Rejected-deal history
* Partner notes
* Founder-introduction source
* Internal CRM
* Previous founder interactions

---

# 2. Ingestion layer

Responsible for accepting and collecting information.

## Inputs

* File upload
* URL submission
* Startup form
* API connection
* CSV import
* Manual entry
* Discovery feed
* Email or CRM import

## Tasks

* Validate file type
* Store original file
* Generate source ID
* Record upload timestamp
* Record source ownership
* Trigger processing job
* Track ingestion status
* Retry failed jobs

## Output

```json
{
  "source_id": "src_001",
  "source_type": "pitch_deck",
  "company_id": "company_001",
  "location": "storage/path/deck.pdf",
  "status": "queued",
  "submitted_at": "timestamp"
}
```

---

# 3. Parsing and extraction layer

Transforms files and pages into machine-readable content.

## Document processing

* PDF text extraction
* Slide segmentation
* Table extraction
* Image extraction
* OCR where required
* Spreadsheet parsing
* Document metadata extraction

## Web processing

* HTML extraction
* Main-content detection
* Navigation removal
* Structured metadata extraction
* Page-date extraction
* Link discovery
* Relevant subpage crawling

## Content segmentation

* Divide content into sections
* Detect headings
* Detect slide numbers
* Preserve page references
* Preserve table references
* Generate searchable chunks

## Output

```json
{
  "source_id": "src_001",
  "segments": [
    {
      "segment_id": "seg_001",
      "page": 4,
      "heading": "Traction",
      "text": "The company currently serves 20 enterprise customers."
    }
  ]
}
```

---

# 4. Entity extraction layer

Identifies structured data inside the parsed content.

## Company entities

* Company name
* Legal name
* Website
* Founding date
* Headquarters
* Geography
* Sector
* Product
* Business model
* Stage
* Round size
* Valuation
* Revenue
* Growth
* Customers
* Employees
* Partnerships
* Investors
* Competitors

## Founder entities

* Name
* Current role
* Education
* Employment
* Prior startups
* Exits
* Industry experience
* Technical experience
* Sales experience
* Public projects
* Publications
* Patents
* GitHub activity
* Geographic background

## Financial entities

* ARR
* MRR
* Revenue growth
* Gross margin
* Burn
* Runway
* CAC
* LTV
* Churn
* Pipeline
* Round size
* Valuation
* Ownership
* Use of funds

## Product entities

* Product category
* Target customer
* User
* Buyer
* Problem
* Product functionality
* Technology
* Integration requirements
* Pricing
* Deployment model
* Regulatory requirements

---

# 5. Entity-resolution layer

Ensures that extracted data refers to the correct real-world entity.

## Tasks

* Match duplicate company names
* Match founders across sources
* Distinguish people with similar names
* Resolve company aliases
* Resolve former company names
* Link company domains
* Merge duplicate evidence
* Resolve currencies
* Normalize dates
* Normalize job titles
* Normalize sectors
* Normalize geography

Example:

```text
“FleetShield”
“FleetShield AI”
“FleetShield GmbH”
fleetshield.ai
```

All become:

```json
{
  "company_id": "company_001",
  "canonical_name": "FleetShield AI GmbH"
}
```

---

# 6. Normalized startup data layer

This is the central factual company dossier.

## Company model

```json
{
  "company_id": "company_001",
  "name": "FleetShield AI",
  "legal_name": "FleetShield AI GmbH",
  "website": "https://fleetshield.ai",
  "founded_year": 2025,
  "headquarters": "Munich",
  "stage": "pre_seed",
  "business_model": "b2b_saas",
  "sectors": ["cybersecurity", "logistics"],
  "target_customers": ["logistics enterprises"],
  "product_summary": "AI security monitoring for logistics systems"
}
```

## Founder model

```json
{
  "founder_id": "founder_001",
  "name": "Anna Example",
  "role": "CEO",
  "education": [],
  "employment_history": [],
  "previous_startups": [],
  "domain_experience": [],
  "technical_experience": [],
  "commercial_experience": [],
  "public_projects": []
}
```

## Traction model

```json
{
  "claimed_arr": 150000,
  "verified_arr": null,
  "claimed_customers": 20,
  "verified_customers": 3,
  "monthly_growth": 0.12,
  "churn": null,
  "active_pilots": 4
}
```

This layer stores **facts and claims**, not investment judgement.

---

# 7. Claim and evidence layer

Every important statement becomes a claim.

## Claim model

```json
{
  "claim_id": "claim_001",
  "company_id": "company_001",
  "subject": "FleetShield AI",
  "predicate": "has_customer_count",
  "value": 20,
  "value_type": "number",
  "claim_category": "traction",
  "source_ids": ["src_001"],
  "status": "unverified"
}
```

## Evidence model

```json
{
  "evidence_id": "evidence_001",
  "claim_id": "claim_001",
  "source_id": "src_001",
  "page": 8,
  "quote": "Trusted by 20 enterprise customers",
  "source_type": "pitch_deck",
  "source_owner": "company",
  "independence": "founder_provided",
  "freshness": 0.9,
  "reliability": 0.6
}
```

## Evidence classifications

* Founder-provided
* Company-published
* Customer-provided
* Independent primary source
* Independent secondary source
* Anonymous source
* Derived inference

## Claim statuses

* Verified
* Partially verified
* Unverified
* Contradicted
* Outdated
* Missing
* Inferred

---

# 8. Research-enrichment layer

Finds additional information that was not provided directly.

## Founder research

* Work history
* Previous startup outcomes
* Publications
* Public projects
* GitHub activity
* Domain experience
* References
* Reputation signals

## Company research

* News coverage
* Funding history
* Customer announcements
* Product launches
* Hiring activity
* Legal entity status
* Regulatory status

## Market research

* Market size
* Growth rate
* Customer spending
* Regulatory trends
* Technology trends
* Market maturity
* Adoption barriers
* Buyer behaviour

## Competitive research

* Direct competitors
* Indirect competitors
* Internal customer alternatives
* Open-source alternatives
* Incumbents
* Recent funding rounds
* Pricing
* Product positioning

## Output

Additional sources, claims and evidence are added to the evidence ledger.

---

# 9. Contradiction and missing-data layer

Detects where information disagrees or remains unavailable.

## Contradictions

Example:

```text
Pitch deck:
€150,000 ARR

Founder interview:
€120,000 ARR

Company register:
No financial filing available
```

Output:

```json
{
  "contradiction_id": "contradiction_001",
  "claim_ids": ["claim_001", "claim_002"],
  "severity": "high",
  "category": "traction",
  "description": "Two different ARR values were provided."
}
```

## Missing information

* No churn data
* No customer references
* No ownership information
* No verified revenue
* No evidence of technical IP ownership
* No founder commitment information
* No sales-pipeline breakdown
* No use-of-funds plan

## Evidence debt

Evidence debt measures how much important information is still unsupported.

```json
{
  "item": "ARR verification",
  "importance": "critical",
  "current_status": "unverified",
  "required_evidence": "Billing export or bank statement"
}
```

---

# 10. Fund-thesis layer

Converts the VC’s investment strategy into machine-readable rules.

## Thesis components

* Investment stage
* Geography
* Sector
* Business model
* Ticket size
* Ownership target
* Valuation range
* Revenue range
* Customer type
* Capital intensity
* Regulatory tolerance
* Time horizon
* Exclusions
* Strategic preferences

## Hard filters

* Wrong geography
* Wrong sector
* Wrong stage
* Ticket too small or large
* Prohibited business
* Regulatory incompatibility

## Soft preferences

* Repeat founder
* Technical co-founder
* B2B recurring revenue
* Strong founder-market fit
* Low capital intensity
* Early customer evidence
* Large expansion market
* Proprietary workflow or data

## Output

```json
{
  "thesis_status": "pass",
  "hard_failures": [],
  "soft_matches": [
    "DACH",
    "pre_seed",
    "b2b_saas",
    "cybersecurity"
  ],
  "soft_mismatches": [
    "No repeat founder"
  ]
}
```

---

# 11. Investment-analysis layer

This is your core responsibility.

## Founder analysis

* Founder-market fit
* Founder-product fit
* Technical ability
* Commercial ability
* Execution history
* Team completeness
* Commitment
* Learning velocity
* Integrity and consistency

## Market analysis

* Market size
* Market growth
* Customer urgency
* Existing budgets
* Adoption readiness
* Sales-cycle difficulty
* Market concentration
* Regulatory tailwinds
* Timing

## Idea-market analysis

* Problem severity
* Product relevance
* Differentiation
* Wedge quality
* Adoption friction
* Business-model coherence
* Defensibility
* Expansion potential
* Why now

## Product analysis

* Product maturity
* Technical feasibility
* Architecture
* Integration complexity
* Product dependency
* Scalability
* Security
* Regulatory burden

## Traction analysis

* Revenue
* Growth
* Usage
* Retention
* Customers
* Pilots
* Pipeline
* Customer quality
* Customer concentration
* Evidence quality

## Competition analysis

* Competitive intensity
* Product differentiation
* Switching costs
* Incumbent response risk
* Substitute risk
* Distribution advantage
* Price advantage

## Investment-efficiency analysis

* What $100,000 achieves
* Runway created
* Milestone funded
* Follow-on dependency
* Capital intensity
* Expected de-risking
* Value-inflection milestone

---

# 12. Scoring layer

Produces structured scores for each dimension.

## Example score object

```json
{
  "dimension": "founder_market_fit",
  "raw_score": 8.0,
  "evidence_confidence": 0.75,
  "source_independence": 0.8,
  "freshness": 0.9,
  "adjusted_score": 4.32,
  "supporting_claim_ids": ["claim_010", "claim_014"],
  "contradicting_claim_ids": [],
  "missing_information": []
}
```

Calculation:

```text
Adjusted score
= raw score
× evidence confidence
× source independence
× freshness
```

## Main score groups

```text
Fund fit                 20%
Founder                  25%
Market                   15%
Idea-market fit          20%
Traction                 10%
Defensibility             5%
Investment efficiency     5%
```

## Penalties

* Critical contradiction
* Regulatory risk
* Founder-integrity risk
* Customer-concentration risk
* Evidence debt
* Thesis mismatch
* Excessive capital intensity
* Unclear IP ownership

---

# 13. Confidence layer

Score and confidence must remain separate.

Example:

```text
Startup quality score: 82/100
Evidence confidence: 47%
```

This means:

> The startup appears strong, but the conclusion is not sufficiently verified.

Confidence is based on:

* Evidence coverage
* Source independence
* Source reliability
* Data freshness
* Number of contradictions
* Amount of missing information
* Degree of model inference

---

# 14. Risk layer

## Risk categories

* Founder risk
* Team risk
* Market risk
* Product risk
* Technology risk
* Commercial risk
* Financial risk
* Legal risk
* Regulatory risk
* Security risk
* Data-privacy risk
* Reputation risk
* Competition risk
* Execution risk
* Financing risk
* Customer-concentration risk

## Risk object

```json
{
  "risk_id": "risk_001",
  "category": "customer_concentration",
  "severity": "high",
  "probability": "medium",
  "evidence_ids": ["evidence_020"],
  "mitigation": "Verify customer mix before investment",
  "decision_impact": -5
}
```

---

# 15. Red-team layer

Produces the strongest argument against investment.

## Tasks

* Challenge assumptions
* Identify unsupported claims
* Find alternative explanations
* Detect survivorship bias
* Test market-size assumptions
* Question founder claims
* Identify hidden dependencies
* Analyse why the startup might fail
* Compare against doing nothing
* Compare against incumbent products

## Output

```text
Strongest reason not to invest:

The product solves a real operational problem, but customer
implementation requires access to sensitive enterprise infrastructure.
The likely sales and security-review cycle may exceed the startup’s runway.
```

---

# 16. Decision-generation layer

Combines thesis, scores, risks and evidence.

## Possible decisions

* Invest
* Conditional invest
* Hold
* Reject
* Route to another fund
* Request more information

## Decision object

```json
{
  "decision": "conditional_invest",
  "score": 72,
  "confidence": 0.64,
  "proposed_cheque": 100000,
  "conditions": [
    "Verify ARR",
    "Confirm one customer reference",
    "Confirm IP ownership"
  ]
}
```

## Decision-flip logic

```text
Change to INVEST if:
- ARR is verified;
- one enterprise customer confirms deployment;
- founder commitment is confirmed.

Change to REJECT if:
- core technology is outsourced;
- major customer is only an unpaid pilot;
- valuation exceeds the fund limit.
```

---

# 17. Founder-question generation layer

Generates questions ranked by how much they could change the decision.

## Question categories

* Founder
* Product
* Market
* Traction
* Financial
* Customer
* Legal
* Fundraising
* Use of funds

Example:

```json
{
  "question": "Can you provide a redacted billing export supporting the stated ARR?",
  "target_claim_id": "claim_001",
  "decision_impact": "high",
  "possible_score_change": 8
}
```

---

# 18. Memo-generation layer

Generates the investment memo from structured data.

## Memo sections

1. Company summary
2. Recommendation
3. Proposed cheque
4. Fund-thesis fit
5. Founder assessment
6. Market assessment
7. Product and differentiation
8. Traction
9. Competition
10. Key evidence
11. Case for investment
12. Case against investment
13. Risks
14. Missing evidence
15. Investment conditions
16. Use of funds
17. Decision-flip conditions
18. Final recommendation

Every section should cite claim and evidence IDs.

---

# 19. Human-review layer

The investor remains the final decision-maker.

## Investor actions

* Inspect evidence
* Change assumptions
* Adjust fund weights
* Override scores
* Ask additional questions
* Add notes
* Approve
* Reject
* Place on hold
* Request evidence
* Export memo

## Audit trail

Record:

* Who changed the score
* Previous score
* New score
* Reason
* Time
* Final decision
* Conditions applied

---

# 20. API/application layer

Recommended services:

```text
POST /companies
POST /sources
POST /companies/{id}/ingest
GET  /companies/{id}/dossier
GET  /companies/{id}/claims
GET  /companies/{id}/evidence
POST /companies/{id}/research
POST /companies/{id}/assess
GET  /companies/{id}/assessment
GET  /companies/{id}/memo
POST /companies/{id}/decision
```

---

# 21. UI layer

## Screen 1: Fund configuration

* Thesis settings
* Stage
* Geography
* Sector
* Ticket
* Hard exclusions
* Score weights

## Screen 2: Startup discovery

* Candidate list
* Thesis fit
* Momentum
* Evidence coverage
* Red flags
* Start diligence

## Screen 3: Upload and ingestion

* Deck upload
* Website URL
* Founder links
* Processing status
* Sources discovered

## Screen 4: Company dossier

* Company profile
* Founders
* Product
* Traction
* Market
* Competitors
* Sources

## Screen 5: Evidence ledger

* Claim
* Source
* Quote
* Verification status
* Contradiction
* Confidence

## Screen 6: Decision room

* Recommendation
* Score
* Confidence
* Score breakdown
* Risks
* Evidence debt
* Conditions
* Decision-flip factors

## Screen 7: Investment memo

* Full memo
* Evidence links
* Export
* Investor notes

## Screen 8: Final decision

* Invest
* Conditional invest
* Hold
* Reject
* Record reasoning

---

# 22. Persistence layer

Recommended entities:

```text
Fund
FundThesis
Company
Founder
Source
Document
Segment
Claim
Evidence
Contradiction
MarketSignal
Competitor
Score
Risk
Question
Assessment
Memo
Decision
User
AuditEvent
```

---

# 23. Observability and reliability layer

* Processing logs
* Failed-source tracking
* Extraction confidence
* Model-call logs
* Prompt versions
* Cost tracking
* Latency tracking
* Retry queue
* Cached results
* Demo fallback data
* Source-access errors
* Scoring-version history

---

# Clean ownership split

##  nandhu

```text
Data sources
→ ingestion
→ parsing
→ extraction
→ entity resolution
→ company and founder models
→ claims and evidence
→ database
→ operational APIs
→ ingestion UI
→ company dossier UI
```

## julia

```text
Fund thesis
→ founder analysis
→ market analysis
→ idea-market analysis
→ traction judgement
→ scoring
→ evidence adjustment
→ risk analysis
→ red team
→ decision generation
→ founder questions
→ investment memo
→ decision-room UI
```

## Shared

```text
Schemas
API contracts
Deployment
End-to-end integration
Demo startup
Demo narrative
Final pitch
```


```
