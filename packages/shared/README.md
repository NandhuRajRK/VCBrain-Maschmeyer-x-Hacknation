# Shared Schemas

Contract layer shared by the data API and the intelligence/UI work.

The source of truth is `schemas.json`. Keep these names aligned with API
responses so Julia's scoring and memo layer can depend on stable fields.

Nandhu owns the data-side implementations. Julia owns behavior for
`ThesisConfig`, `AxisScore`, `InvestmentMemo`, and `Decision`; those schemas are
included here so both sides can wire against the same contract. The reusable
voice input contract is `VoiceQueryResponse`: Julia can route its typed command
to the appropriate view without depending on OpenAI or ElevenLabs details.

`DecisionReadiness` and `CompanyTimeline` power the decision flight recorder.
Readiness measures whether the dossier is complete enough to decide; it must
not be presented as a fourth investment score.

`FounderPassport` is the evidence-backed founder-history contract. The API wire
format is snake_case. TypeScript may use camelCase internally, but its API
adapter must map to the names in `schemas.json`.
