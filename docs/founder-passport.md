# Founder Passport

Founder Passport is the sourced history behind a founder, not another
investment score. It stores:

- employment roles and dates
- education and credentials
- prior founded companies and outcomes
- skills, public profiles, confidence, and unresolved gaps

Every history entry carries `source_ids`. Multiple sources merge into one fact
and increase its confidence instead of creating duplicates. Missing history is
reported as unverified; the system does not infer that the history does not
exist.

Use `GET /companies/{company_id}/founder-passports` for a company view or
`GET /founders/{founder_id}/passport` for one founder. Julia's Founder-axis
reasoning can consume the passport, but the data layer does not turn it into an
invest/hold/reject recommendation.
