# Founder Passport

A Founder Passport is the sourced career and operating history behind a
founder. It is persistent memory, not an investment recommendation.

It can contain:

- employment roles and dates
- education and credentials
- previously founded companies and outcomes
- skills and public profiles
- confidence for each fact
- supporting source IDs
- explicit unverified-history gaps

Corroborating sources merge into one fact instead of creating duplicates.
Missing history is labeled unverified; Iskra does not infer that the history
does not exist.

## Routes

```text
GET  /companies/{company_id}/founder-passports
GET  /founders/{founder_id}/passport
POST /companies/{company_id}/founder-passports/enrich
```

Enrichment is an explicit Tavily or Exa action with a configurable result cap,
so ordinary ingestion does not silently spend search credits. Structured
metadata is preferred; unstructured biographies use a dedicated OpenAI prompt
when configured.

The Founder investment axis may consume Passport evidence, coverage, and the
persistent Founder Score while still producing its own reasoning.
