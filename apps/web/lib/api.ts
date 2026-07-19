/**
 * API Client
 *
 * Typed fetch wrappers for every endpoint in Nandhu's FastAPI backend.
 * Each function matches the exact request/response shapes from his
 * Pydantic models, so there is zero mismatch at the boundary.
 *
 * The main export is `analyzePipeline()`, which chains:
 *   1. Fetch dossier from GET /companies/{id}/dossier
 *   2. Run evaluateThesis() to check fund fit
 *   3. Run scoreDossier() to produce 3-axis scores
 *   4. Run generateMemo() to produce the investment memo
 *
 * All other endpoints are exported individually for the UI to call.
 */

import { evaluateThesis, DEFAULT_THESIS } from "./thesis";
import type { ThesisConfig, ThesisResult } from "./thesis";
import { scoreDossier } from "./scoring";
import type { DossierInput, ScoringResult, Claim, Evidence, Source, FounderData, FounderScoreData } from "./scoring";
import { generateMemo } from "./memo";
import type { InvestmentMemo } from "./memo";

// ── Configuration ─────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── API-specific types (match Nandhu's models.py exactly) ─────

/** Mirrors models.py Company (extends CompanyCreate) */
export interface ApiCompany {
  id: string;
  name: string;
  website: string | null;
  sector: string | null;
  stage: string | null;
  geography: string | null;
  description: string | null;
  created_at: string;
}

/** Mirrors models.py CompanyCreate */
export interface ApiCompanyCreate {
  name: string;
  website?: string | null;
  sector?: string | null;
  stage?: string | null;
  geography?: string | null;
  description?: string | null;
}

/** Mirrors models.py Founder */
export interface ApiFounder {
  id: string;
  company_id: string;
  name: string;
  role: string | null;
  linkedin: string | null;
  github: string | null;
  cold_start: boolean;
  updated_at: string;
}

/** Mirrors models.py Source (extends SourceCreate) */
export interface ApiSource {
  id: string;
  company_id: string;
  source_type: string;
  title: string;
  url: string | null;
  text: string | null;
  location: string | null;
  metadata: Record<string, unknown>;
  status: "queued" | "processing" | "parsed" | "failed";
  submitted_at: string;
  source_category: string;
}

/** Mirrors models.py SourceCreate */
export interface ApiSourceCreate {
  company_id: string;
  source_type: string;
  title: string;
  url?: string | null;
  text?: string | null;
  location?: string | null;
  metadata?: Record<string, unknown>;
}

/** Mirrors models.py Segment */
export interface ApiSegment {
  id: string;
  source_id: string;
  heading: string | null;
  page: number | null;
  text: string;
}

/** Mirrors models.py Claim */
export interface ApiClaim {
  id: string;
  company_id: string;
  founder_id: string | null;
  kind: "company" | "founder" | "traction" | "market" | "product" | "financial";
  text: string;
  status: "extracted" | "supported" | "disputed" | "missing_evidence";
  evidence_ids: string[];
  confidence: number;
}

/** Mirrors models.py Evidence */
export interface ApiEvidence {
  id: string;
  source_id: string;
  segment_id: string;
  quote: string;
  confidence: number;
  source_reliability: number;
  source_independence: "third_party" | "company_owned" | "founder_provided" | "unknown";
  freshness_days: number | null;
  directness: "direct" | "inferred" | "indirect";
  confidence_reason: string | null;
}

/** Mirrors models.py FounderScore */
export interface ApiFounderScore {
  founder_id: string;
  score: number;
  confidence: number;
  cold_start: boolean;
  evidence_count: number;
  evidence_coverage: number;
  contradiction_count: number;
  updated_at: string;
  notes: string[];
}

/** Mirrors models.py TriggerEvent */
export interface ApiTriggerEvent {
  id: string;
  company_id: string;
  kind: "new_application" | "signal_threshold_crossed";
  message: string;
  created_at: string;
  metadata: Record<string, unknown>;
}

/** Mirrors models.py Dossier (full response from GET /companies/{id}/dossier) */
export interface ApiDossier {
  company: ApiCompany;
  founders: ApiFounder[];
  sources: ApiSource[];
  segments: ApiSegment[];
  claims: ApiClaim[];
  evidence: ApiEvidence[];
  founder_scores: ApiFounderScore[];
  trigger_events: ApiTriggerEvent[];
}

/** Mirrors models.py IngestionRun */
export interface ApiIngestionRun {
  company_id: string;
  accepted_sources: number;
  parsed_segments: number;
  extracted_claims: number;
  status: "queued" | "processing" | "parsed" | "failed";
}

/** Mirrors models.py DocumentUploadResult */
export interface ApiDocumentUploadResult {
  source: ApiSource;
  segments: ApiSegment[];
  warnings: string[];
  llm_tasks: string[];
}

/** Mirrors models.py SourcePullRequest */
export interface ApiSourcePullRequest {
  company_id: string;
  connectors?: string[];
  query?: string | null;
  github_user?: string | null;
  arxiv_query?: string | null;
  website_url?: string | null;
}

/** Mirrors models.py SourcePullResult */
export interface ApiSourcePullResult {
  company_id: string;
  created_sources: ApiSource[];
  deduped_sources: number;
}

/** Mirrors models.py SearchMatch */
export interface ApiSearchMatch {
  company: ApiCompany;
  founder: ApiFounder;
  founder_score: ApiFounderScore | null;
  match_score: number;
  reasons: string[];
}

/** Mirrors models.py ActivateRequest */
export interface ApiActivateRequest {
  founder_id: string;
  context?: string | null;
}

/** Mirrors models.py ActivationDraft */
export interface ApiActivationDraft {
  founder_id: string;
  company_id: string;
  subject: string;
  message: string;
  evidence_ids: string[];
}

/** Mirrors models.py VoiceTextQueryRequest */
export interface ApiVoiceTextQueryRequest {
  transcript: string;
  speak_response?: boolean;
  voice_id?: string | null;
  limit?: number;
}

/** Mirrors models.py VoiceCommand */
export interface ApiVoiceCommand {
  intent: "founder_search" | "company_dossier" | "memo_review" | "decision_review" | "activation" | "unknown";
  query: string;
  confidence: number;
}

/** Mirrors models.py ParsedFounderQuery */
export interface ApiParsedFounderQuery {
  sectors: string[];
  geographies: string[];
  stages: string[];
  founder_traits: string[];
  keywords: string[];
  exclude_prior_vc: boolean;
  confidence: number;
}

/** Mirrors models.py VoiceQueryResponse */
export interface ApiVoiceQueryResponse {
  transcript: string;
  command: ApiVoiceCommand;
  parsed_query: ApiParsedFounderQuery | null;
  results: ApiSearchMatch[];
  response_text: string;
  audio_available: boolean;
  audio_base64: string | null;
}

/** Mirrors models.py DemoSeedResult */
export interface ApiDemoSeedResult {
  companies: number;
  founders: number;
  claims: number;
  evidence: number;
}

// ── Error handling ────────────────────────────────────────────

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(`API ${status}: ${detail}`);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  // Only set Content-Type for JSON bodies (not FormData/file uploads)
  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = body.detail ?? JSON.stringify(body);
    } catch {
      // If body isn't JSON, use statusText
    }
    throw new ApiError(response.status, detail);
  }

  return response.json() as Promise<T>;
}

// ── Endpoint wrappers ─────────────────────────────────────────

// Health

export async function checkHealth(): Promise<{ status: string }> {
  return request("/health");
}

// Companies

export async function createCompany(payload: ApiCompanyCreate): Promise<ApiCompany> {
  return request("/companies", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listCompanies(): Promise<ApiCompany[]> {
  return request("/companies");
}

// Sources

export async function createSource(payload: ApiSourceCreate): Promise<ApiSource> {
  return request("/sources", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function pullSources(payload: ApiSourcePullRequest): Promise<ApiSourcePullResult> {
  return request("/sources/pull", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// Documents

export async function uploadDocument(
  companyId: string,
  file: File
): Promise<ApiDocumentUploadResult> {
  const form = new FormData();
  form.append("file", file);
  return request(`/companies/${companyId}/documents`, {
    method: "POST",
    body: form,
  });
}

// Ingestion

export async function ingestCompany(companyId: string): Promise<ApiIngestionRun> {
  return request(`/companies/${companyId}/ingest`, { method: "POST" });
}

// Dossier

export async function fetchDossier(companyId: string): Promise<ApiDossier> {
  return request(`/companies/${companyId}/dossier`);
}

// Claims and Evidence (individual endpoints)

export async function fetchClaims(companyId: string): Promise<ApiClaim[]> {
  return request(`/companies/${companyId}/claims`);
}

export async function fetchEvidence(companyId: string): Promise<ApiEvidence[]> {
  return request(`/companies/${companyId}/evidence`);
}

// Founders

export async function fetchFounders(companyId: string): Promise<ApiFounder[]> {
  return request(`/companies/${companyId}/founders`);
}

export async function listAllFounders(): Promise<ApiFounder[]> {
  return request("/founders");
}

// Events

export async function fetchEvents(companyId: string): Promise<ApiTriggerEvent[]> {
  return request(`/companies/${companyId}/events`);
}

// Founder Search

export async function searchFounders(
  query: string,
  limit: number = 10
): Promise<ApiSearchMatch[]> {
  return request("/founders/search", {
    method: "POST",
    body: JSON.stringify({ query, limit }),
  });
}

// Activation

export async function activateFounder(payload: ApiActivateRequest): Promise<ApiActivationDraft> {
  return request("/founders/activate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// Voice

export async function voiceQueryText(payload: ApiVoiceTextQueryRequest): Promise<ApiVoiceQueryResponse> {
  return request("/voice/query/text", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function voiceQueryAudio(
  audioFile: File,
  speakResponse: boolean = false,
  voiceId?: string,
  limit: number = 10
): Promise<ApiVoiceQueryResponse> {
  const form = new FormData();
  form.append("audio", audioFile);
  form.append("speak_response", String(speakResponse));
  if (voiceId) form.append("voice_id", voiceId);
  form.append("limit", String(limit));
  return request("/voice/query", {
    method: "POST",
    body: form,
  });
}

export async function narrateText(
  text: string,
  voiceId?: string
): Promise<Blob> {
  const url = `${API_BASE}/voice/narrate`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice_id: voiceId ?? null }),
  });
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }
  return response.blob();
}

// Demo

export async function seedDemo(reset: boolean = true): Promise<ApiDemoSeedResult> {
  return request(`/demo/seed?reset=${reset}`, { method: "POST" });
}

// ── Conversion: API types → scoring engine types ──────────────

/**
 * Converts the raw API dossier into the DossierInput shape that
 * scoring.ts and memo.ts expect. This is a straightforward mapping:
 * the API returns more fields than scoring needs, so we just pass
 * through what matters.
 */
function toDossierInput(dossier: ApiDossier): DossierInput {
  return {
    company: {
      id: dossier.company.id,
      name: dossier.company.name,
      sector: dossier.company.sector,
      stage: dossier.company.stage,
      geography: dossier.company.geography,
      description: dossier.company.description,
    },
    founders: dossier.founders.map((f) => ({
      id: f.id,
      company_id: f.company_id,
      name: f.name,
      role: f.role,
      linkedin: f.linkedin,
      github: f.github,
      cold_start: f.cold_start,
    })),
    sources: dossier.sources.map((s) => ({
      id: s.id,
      company_id: s.company_id,
      source_type: s.source_type,
      title: s.title,
      url: s.url,
      text: s.text,
      metadata: s.metadata,
      status: s.status,
      submitted_at: s.submitted_at,
    })),
    claims: dossier.claims.map((c) => ({
      id: c.id,
      company_id: c.company_id,
      kind: c.kind,
      text: c.text,
      status: c.status,
      evidence_ids: c.evidence_ids,
      confidence: c.confidence,
    })),
    evidence: dossier.evidence.map((e) => ({
      id: e.id,
      source_id: e.source_id,
      segment_id: e.segment_id,
      quote: e.quote,
      confidence: e.confidence,
      source_reliability: e.source_reliability,
      source_independence: e.source_independence,
      freshness_days: e.freshness_days,
      directness: e.directness,
      confidence_reason: e.confidence_reason ?? "",
    })),
    founder_scores: dossier.founder_scores.map((fs) => ({
      founder_id: fs.founder_id,
      score: fs.score,
      confidence: fs.confidence,
      cold_start: fs.cold_start,
      evidence_count: fs.evidence_count,
      evidence_coverage: fs.evidence_coverage,
      contradiction_count: fs.contradiction_count,
      notes: fs.notes,
    })),
  };
}

// ── Pipeline ──────────────────────────────────────────────────

/** Everything the UI needs after analysis: raw dossier, scores, memo, thesis fit */
export interface PipelineResult {
  /** Raw dossier from the API (includes segments and trigger_events for the UI) */
  dossier: ApiDossier;

  /** Thesis evaluation result */
  thesis: ThesisResult;

  /** 3-axis scoring result */
  scores: ScoringResult;

  /** Full investment memo with decision and decision-flip logic */
  memo: InvestmentMemo;
}

/**
 * The main pipeline: fetches a company's dossier and runs the full
 * analysis chain. This is the single call the UI makes to go from
 * "company ID" to "investment memo with decision."
 *
 * Steps:
 *   1. GET /companies/{id}/dossier (all data from Nandhu's backend)
 *   2. evaluateThesis() (hard gates + soft fit scoring)
 *   3. scoreDossier() (3-axis evidence-adjusted scores)
 *   4. generateMemo() (structured memo with red-team and decision-flip)
 */
export async function analyzePipeline(
  companyId: string,
  thesis: ThesisConfig = DEFAULT_THESIS
): Promise<PipelineResult> {
  const dossier = await fetchDossier(companyId);
  const input = toDossierInput(dossier);

  const thesisResult = evaluateThesis(input.company, thesis);
  const scores = scoreDossier(input);
  const memo = generateMemo(input, scores, thesisResult);

  return { dossier, thesis: thesisResult, scores, memo };
}

/**
 * Full onboarding pipeline for a new company:
 *   1. Create the company
 *   2. Pull sources from all connectors
 *   3. Run ingestion (parse sources, extract claims)
 *   4. Run the analysis pipeline (thesis + scoring + memo)
 *
 * Use this for the inbound application form: user submits a company
 * name and optional details, and gets back a complete investment memo.
 */
export async function onboardAndAnalyze(
  payload: ApiCompanyCreate,
  thesis: ThesisConfig = DEFAULT_THESIS,
  pullOptions?: Partial<ApiSourcePullRequest>
): Promise<{ company: ApiCompany; pipeline: PipelineResult }> {
  const company = await createCompany(payload);

  await pullSources({
    company_id: company.id,
    ...pullOptions,
  });

  await ingestCompany(company.id);

  const pipeline = await analyzePipeline(company.id, thesis);
  return { company, pipeline };
}

/**
 * Upload a document (e.g. pitch deck), then re-run the analysis pipeline
 * so the memo reflects the new data. Use this when a founder submits
 * a deck after the initial application.
 */
export async function uploadAndReanalyze(
  companyId: string,
  file: File,
  thesis: ThesisConfig = DEFAULT_THESIS
): Promise<{ upload: ApiDocumentUploadResult; pipeline: PipelineResult }> {
  const upload = await uploadDocument(companyId, file);
  const pipeline = await analyzePipeline(companyId, thesis);
  return { upload, pipeline };
}

// ── Assistant ─────────────────────────────────────────────────

export interface AssistantMessagePayload {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantAnswer {
  answer: string;
  grounded: boolean;
}

/**
 * Ask the portfolio assistant a natural language question. The caller
 * assembles the portfolio context on the client (from the analysed
 * pipeline data) and passes it in, so the answer is grounded in exactly
 * what the analyst can see. The API keeps the model key server side.
 */
export async function askAssistant(
  question: string,
  context: string,
  history: AssistantMessagePayload[] = []
): Promise<AssistantAnswer> {
  return request("/assistant/query", {
    method: "POST",
    body: JSON.stringify({ question, context, history }),
  });
}
