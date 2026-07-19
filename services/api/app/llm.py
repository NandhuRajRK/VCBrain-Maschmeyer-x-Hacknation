import json
import os
import re
import urllib.request
from typing import Any

from .models import (
    ClaimKind,
    CompanyUpdate,
    ContradictionAssessment,
    ExtractedClaim,
    FounderBackgroundExtraction,
    ParsedFounderQuery,
    OpportunityDraft,
    VoiceCommand,
    VoiceIntent,
)
from .prompts import (
    CLAIM_EXTRACTION_SYSTEM_PROMPT,
    COMPANY_PROFILE_SYSTEM_PROMPT,
    CONTRADICTION_SYSTEM_PROMPT,
    FOUNDER_PASSPORT_SYSTEM_PROMPT,
    FOUNDER_SEARCH_SYSTEM_PROMPT,
    VOICE_COMMAND_SYSTEM_PROMPT,
    OPPORTUNITY_INTENT_SYSTEM_PROMPT,
)


_CONTRADICTION_CALLS = 0
_FOUNDER_PASSPORT_CALLS = 0


SEARCH_QUERY_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": [
        "sectors",
        "geographies",
        "stages",
        "founder_traits",
        "keywords",
        "exclude_prior_vc",
        "confidence",
    ],
    "properties": {
        "sectors": {"type": "array", "items": {"type": "string"}},
        "geographies": {"type": "array", "items": {"type": "string"}},
        "stages": {"type": "array", "items": {"type": "string"}},
        "founder_traits": {"type": "array", "items": {"type": "string"}},
        "keywords": {"type": "array", "items": {"type": "string"}},
        "exclude_prior_vc": {"type": "boolean"},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
    },
}

CLAIM_EXTRACTION_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["claims"],
    "properties": {
        "claims": {
            "type": "array",
            "maxItems": 8,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["kind", "text", "confidence"],
                "properties": {
                    "kind": {
                        "type": "string",
                        "enum": ["company", "founder", "traction", "market", "product", "financial"],
                    },
                    "text": {"type": "string"},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                },
            },
        }
    },
}

COMPANY_PROFILE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["sector", "stage", "geography", "description"],
    "properties": {
        "sector": {"anyOf": [{"type": "string"}, {"type": "null"}]},
        "stage": {"anyOf": [{"type": "string"}, {"type": "null"}]},
        "geography": {"anyOf": [{"type": "string"}, {"type": "null"}]},
        "description": {"anyOf": [{"type": "string"}, {"type": "null"}]},
    },
}

CONTRADICTION_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["contradicts", "temporal_difference", "confidence", "reason"],
    "properties": {
        "contradicts": {"type": "boolean"},
        "temporal_difference": {"type": "boolean"},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "reason": {"type": "string"},
    },
}

FOUNDER_PASSPORT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["headline", "work_history", "education_history", "previous_ventures", "skills"],
    "properties": {
        "headline": {"anyOf": [{"type": "string"}, {"type": "null"}]},
        "work_history": {
            "type": "array",
            "maxItems": 8,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["organization", "role", "start_year", "end_year", "confidence"],
                "properties": {
                    "organization": {"type": "string"},
                    "role": {"type": "string"},
                    "start_year": {"anyOf": [{"type": "integer"}, {"type": "null"}]},
                    "end_year": {"anyOf": [{"type": "integer"}, {"type": "null"}]},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                },
            },
        },
        "education_history": {
            "type": "array",
            "maxItems": 6,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["institution", "degree", "field_of_study", "graduation_year", "confidence"],
                "properties": {
                    "institution": {"type": "string"},
                    "degree": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                    "field_of_study": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                    "graduation_year": {"anyOf": [{"type": "integer"}, {"type": "null"}]},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                },
            },
        },
        "previous_ventures": {
            "type": "array",
            "maxItems": 6,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["company_name", "role", "founded_year", "ended_year", "outcome", "confidence"],
                "properties": {
                    "company_name": {"type": "string"},
                    "role": {"type": "string"},
                    "founded_year": {"anyOf": [{"type": "integer"}, {"type": "null"}]},
                    "ended_year": {"anyOf": [{"type": "integer"}, {"type": "null"}]},
                    "outcome": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                },
            },
        },
        "skills": {"type": "array", "maxItems": 12, "items": {"type": "string"}},
    },
}

VOICE_COMMAND_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["intent", "query", "confidence"],
    "properties": {
        "intent": {"type": "string", "enum": [item.value for item in VoiceIntent]},
        "query": {"type": "string"},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
    },
}

OPPORTUNITY_INTENT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["should_create", "name", "website", "sector", "stage", "geography", "description", "confidence"],
    "properties": {
        "should_create": {"type": "boolean"},
        "name": {"anyOf": [{"type": "string"}, {"type": "null"}]},
        "website": {"anyOf": [{"type": "string"}, {"type": "null"}]},
        "sector": {"anyOf": [{"type": "string"}, {"type": "null"}]},
        "stage": {"anyOf": [{"type": "string"}, {"type": "null"}]},
        "geography": {"anyOf": [{"type": "string"}, {"type": "null"}]},
        "description": {"anyOf": [{"type": "string"}, {"type": "null"}]},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
    },
}


def parse_founder_query(query: str) -> ParsedFounderQuery:
    if os.getenv("OPENAI_API_KEY"):
        parsed = _parse_with_openai(query)
        if parsed:
            return parsed
    return _fallback_parse(query)


def extract_claims_from_text(text: str, default_kind: ClaimKind) -> list[ExtractedClaim]:
    if os.getenv("OPENAI_API_KEY"):
        extracted = _extract_claims_with_openai(text)
        if extracted:
            return extracted
    return _fallback_extract_claims(text, default_kind)


def extract_company_profile(text: str) -> CompanyUpdate | None:
    if not os.getenv("OPENAI_API_KEY"):
        return None
    return _extract_company_profile_with_openai(text)


def assess_contradiction(left: str, right: str) -> ContradictionAssessment | None:
    global _CONTRADICTION_CALLS
    if not os.getenv("OPENAI_API_KEY"):
        return None
    limit = int(os.getenv("OPENAI_CONTRADICTION_MAX_CALLS", "8"))
    if _CONTRADICTION_CALLS >= limit:
        return None
    _CONTRADICTION_CALLS += 1
    body = _responses_body(
        [
            {"role": "system", "content": CONTRADICTION_SYSTEM_PROMPT},
            {"role": "user", "content": f"Claim A: {left[:1000]}\nClaim B: {right[:1000]}"},
        ],
        "claim_contradiction",
        CONTRADICTION_SCHEMA,
    )
    try:
        response_text = _call_openai(body)
        return ContradictionAssessment.model_validate_json(response_text) if response_text else None
    except Exception:
        return None


def extract_founder_background(text: str, founder_name: str) -> FounderBackgroundExtraction | None:
    global _FOUNDER_PASSPORT_CALLS
    if not os.getenv("OPENAI_API_KEY") or founder_name.lower() not in text.lower():
        return None
    limit = int(os.getenv("OPENAI_FOUNDER_PASSPORT_MAX_CALLS", "10"))
    if _FOUNDER_PASSPORT_CALLS >= limit:
        return None
    _FOUNDER_PASSPORT_CALLS += 1
    body = _responses_body(
        [
            {"role": "system", "content": FOUNDER_PASSPORT_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"Named founder: {founder_name}\nSource:\n{text[:6000]}",
            },
        ],
        "founder_passport_extraction",
        FOUNDER_PASSPORT_SCHEMA,
    )
    try:
        response_text = _call_openai(body)
        return FounderBackgroundExtraction.model_validate_json(response_text) if response_text else None
    except Exception:
        return None


def parse_voice_command(transcript: str) -> VoiceCommand:
    if os.getenv("OPENAI_API_KEY"):
        parsed = _parse_voice_with_openai(transcript)
        if parsed:
            return parsed
    return _fallback_voice_command(transcript)


def parse_opportunity_intent(request: str) -> OpportunityDraft:
    if os.getenv("OPENAI_API_KEY"):
        body = _responses_body(
            [{"role": "system", "content": OPPORTUNITY_INTENT_SYSTEM_PROMPT}, {"role": "user", "content": request[:3000]}],
            "opportunity_intake",
            OPPORTUNITY_INTENT_SCHEMA,
        )
        try:
            response_text = _call_openai(body)
            if response_text:
                return OpportunityDraft.model_validate_json(response_text)
        except Exception:
            pass
    return _fallback_opportunity_intent(request)


def _fallback_opportunity_intent(request: str) -> OpportunityDraft:
    lowered = request.lower()
    should_create = bool(re.search(r"\b(add|create|start|submit|diligence|analy[sz]e)\b", lowered)) and bool(re.search(r"\b(company|startup|opportunity|deal|analysis)\b", lowered))
    name_match = re.search(r"\b(?:company|startup|opportunity|deal)\s+(?:(?:called|named)\s+)?([A-Z][\w.-]*(?:\s+[A-Z][\w.-]*){0,2})", request)
    website_match = re.search(r"https?://[^\s,]+", request)
    stage = next((value for value in ["pre-seed", "seed", "series a", "series b", "growth"] if value in lowered), None)
    sector = next((value for value in ["AI infrastructure", "developer tools", "fintech", "cybersecurity", "climate", "healthtech", "enterprise SaaS", "marketplace"] if value.lower() in lowered), None)
    geography = next((value for value in ["Berlin", "London", "Paris", "Munich", "DACH", "European Union", "United States"] if value.lower() in lowered), None)
    return OpportunityDraft(should_create=should_create, name=name_match.group(1).strip() if name_match else None, website=website_match.group(0) if website_match else None, sector=sector, stage=stage, geography=geography, description=request if should_create else None, confidence=0.58 if should_create else 0.35)


def _parse_with_openai(query: str) -> ParsedFounderQuery | None:
    body = _responses_body(
        [
            {
                "role": "system",
                "content": FOUNDER_SEARCH_SYSTEM_PROMPT,
            },
            {"role": "user", "content": query},
        ],
        "founder_search_query",
        SEARCH_QUERY_SCHEMA,
    )
    try:
        text = _call_openai(body)
        return ParsedFounderQuery.model_validate_json(text) if text else None
    except Exception:
        return None


def _extract_claims_with_openai(text: str) -> list[ExtractedClaim]:
    body = _responses_body(
        [
            {
                "role": "system",
                "content": CLAIM_EXTRACTION_SYSTEM_PROMPT,
            },
            {"role": "user", "content": text[:6000]},
        ],
        "source_claims",
        CLAIM_EXTRACTION_SCHEMA,
    )
    try:
        response_text = _call_openai(body)
        rows = json.loads(response_text or "{}").get("claims", [])
        return [ExtractedClaim.model_validate(row) for row in rows]
    except Exception:
        return []


def _extract_company_profile_with_openai(text: str) -> CompanyUpdate | None:
    body = _responses_body(
        [
            {"role": "system", "content": COMPANY_PROFILE_SYSTEM_PROMPT},
            {"role": "user", "content": text[:6000]},
        ],
        "company_profile_extraction",
        COMPANY_PROFILE_SCHEMA,
    )
    try:
        response_text = _call_openai(body)
        return CompanyUpdate.model_validate_json(response_text) if response_text else None
    except Exception:
        return None


def _parse_voice_with_openai(transcript: str) -> VoiceCommand | None:
    body = _responses_body(
        [
            {"role": "system", "content": VOICE_COMMAND_SYSTEM_PROMPT},
            {"role": "user", "content": transcript[:2000]},
        ],
        "voice_command",
        VOICE_COMMAND_SCHEMA,
    )
    try:
        response_text = _call_openai(body)
        return VoiceCommand.model_validate_json(response_text) if response_text else None
    except Exception:
        return None


def _responses_body(messages: list[dict[str, str]], name: str, schema: dict[str, Any]) -> dict[str, Any]:
    return {
        "model": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        "input": messages,
        "text": {
            "format": {
                "type": "json_schema",
                "name": name,
                "schema": schema,
                "strict": True,
            }
        },
    }


def _call_openai(body: dict[str, Any]) -> str | None:
    request = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=8) as response:
        return _response_text(json.loads(response.read().decode("utf-8")))


def _response_text(data: dict[str, Any]) -> str | None:
    if isinstance(data.get("output_text"), str):
        return data["output_text"]
    for item in data.get("output", []):
        for content in item.get("content", []):
            if content.get("type") in {"output_text", "text"} and content.get("text"):
                return content["text"]
    return None


def _fallback_parse(query: str) -> ParsedFounderQuery:
    lowered = query.lower()
    return ParsedFounderQuery(
        sectors=_find_phrases(lowered, ["ai infra", "ai infrastructure", "fintech", "healthcare", "climate"]),
        geographies=_find_phrases(lowered, ["berlin", "munich", "london", "paris", "dublin", "zurich"]),
        stages=_find_phrases(lowered, ["idea", "pre-seed", "preseed", "seed", "series a"]),
        founder_traits=_find_phrases(lowered, ["technical", "repeat", "domain expert", "operator"]),
        keywords=[word.strip(".,:;()[]") for word in lowered.split() if len(word.strip(".,:;()[]")) > 3],
        exclude_prior_vc="no prior vc" in lowered or "no vc" in lowered or "bootstrapped" in lowered,
        confidence=0.55,
    )


def _fallback_voice_command(transcript: str) -> VoiceCommand:
    lowered = transcript.lower()
    intent = VoiceIntent.unknown
    if any(term in lowered for term in ["memo", "red team", "swot"]):
        intent = VoiceIntent.memo_review
    elif any(term in lowered for term in ["decision", "invest", "hold", "reject", "conditional"]):
        intent = VoiceIntent.decision_review
    elif any(term in lowered for term in ["outreach", "contact", "activate", "message founder"]):
        intent = VoiceIntent.activation
    elif any(term in lowered for term in ["dossier", "deep dive", "company details", "startup details"]):
        intent = VoiceIntent.company_dossier
    elif any(term in lowered for term in ["find", "search", "show", "list", "technical founder", "founders"]):
        intent = VoiceIntent.founder_search
    confidence = 0.55 if intent != VoiceIntent.unknown else 0.35
    return VoiceCommand(intent=intent, query=transcript.strip(), confidence=confidence)


def _find_phrases(text: str, phrases: list[str]) -> list[str]:
    return [phrase for phrase in phrases if phrase in text]


def _fallback_extract_claims(text: str, default_kind: ClaimKind) -> list[ExtractedClaim]:
    chunks = [part.strip() for part in text.replace("\n", ". ").split(".") if part.strip()]
    claims: list[ExtractedClaim] = []
    for chunk in chunks:
        kind = _claim_kind_for_text(chunk, default_kind)
        if _looks_like_claim(chunk):
            claims.append(
                ExtractedClaim(
                    kind=kind,
                    text=chunk[:320],
                    confidence=_fallback_extraction_confidence(chunk, kind),
                )
            )
    if not claims and text.strip():
        value = text.strip()[:320]
        claims.append(
            ExtractedClaim(
                kind=_claim_kind_for_text(value, default_kind),
                text=value,
                confidence=_fallback_extraction_confidence(value, default_kind),
            )
        )
    return claims[:8]


def _looks_like_claim(text: str) -> bool:
    lowered = text.lower()
    signal_terms = [
        "sector:",
        "stage:",
        "geography:",
        "traction:",
        "funding:",
        "founder:",
        "market:",
        "product:",
        "customer",
        "pilot",
        "mrr",
        "arr",
        "raising",
        "github",
        "revenue",
        "growth",
    ]
    return any(term in lowered for term in signal_terms) or any(char.isdigit() for char in text)


def _claim_kind_for_text(text: str, default_kind: ClaimKind) -> ClaimKind:
    lowered = text.lower()
    if _contains_any(lowered, ["mrr", "arr", "revenue", "funding", "raising", "runway", "valuation"]) or "$" in lowered or "%" in lowered:
        return ClaimKind.financial
    if _contains_any(lowered, ["customer", "pilot", "growth", "traction", "waitlist", "users", "usage", "retention", "loi"]):
        return ClaimKind.traction
    if _contains_any(lowered, ["founder", "co-founder", "ceo", "cto", "operator", "github", "linkedin"]):
        return ClaimKind.founder
    if _contains_any(lowered, ["market", "tam", "sam", "som", "market size", "competitor", "buyer", "category", "segment"]):
        return ClaimKind.market
    if _contains_any(lowered, ["product", "platform", "workflow", "routes", "solution", "technology"]):
        return ClaimKind.product
    if _contains_any(lowered, ["company", "sector", "stage", "geography", "headquartered", "business model"]):
        return ClaimKind.company
    return default_kind


def _contains_any(text: str, terms: list[str]) -> bool:
    patterns = []
    for term in terms:
        suffix = "" if term.endswith("s") else "s?"
        patterns.append(rf"(?<![a-z0-9]){re.escape(term)}{suffix}(?![a-z0-9])")
    return any(re.search(pattern, text) for pattern in patterns)


def _fallback_extraction_confidence(text: str, kind: ClaimKind) -> float:
    lowered = text.lower()
    words = [word for word in lowered.split() if word.strip(".,:;()[]")]
    quality = 0.25
    quality += min(0.2, len(words) / 80)
    quality += 0.15 if any(char.isdigit() for char in text) else 0
    quality += 0.15 if any(marker in lowered for marker in ["sector:", "stage:", "traction:", "product:", "funding:", "founder:", "market:"]) else 0
    quality += 0.1 if _contains_any(lowered, _KIND_TERMS[kind]) else 0
    quality += 0.1 if _contains_any(lowered, ["is", "has", "builds", "serves", "raises", "grew"]) else 0
    return round(min(0.95, quality), 3)


_KIND_TERMS = {
    ClaimKind.company: ["company", "sector", "stage", "geography"],
    ClaimKind.founder: ["founder", "ceo", "cto", "operator", "github", "linkedin"],
    ClaimKind.traction: ["customer", "pilot", "growth", "waitlist", "users", "usage"],
    ClaimKind.market: ["market", "tam", "sam", "som", "competitor", "buyer", "segment"],
    ClaimKind.product: ["product", "platform", "workflow", "solution", "technology"],
    ClaimKind.financial: ["mrr", "arr", "revenue", "funding", "raising", "runway", "valuation", "$"],
}


def answer_portfolio_question(
    question: str,
    context: str,
    history: list[dict[str, str]] | None = None,
) -> str | None:
    """Free text answer grounded in the portfolio context. None when no key is set."""
    if not os.getenv("OPENAI_API_KEY"):
        return None
    from .prompts import ASSISTANT_SYSTEM_PROMPT

    messages: list[dict[str, str]] = [
        {"role": "system", "content": ASSISTANT_SYSTEM_PROMPT},
        {"role": "system", "content": "Portfolio data the analyst can currently see:\n\n" + context[:12000]},
    ]
    for turn in (history or [])[-8:]:
        role = turn.get("role")
        content = turn.get("content")
        if role in {"user", "assistant"} and content:
            messages.append({"role": role, "content": content[:2000]})
    messages.append({"role": "user", "content": question[:2000]})

    body = {"model": os.getenv("OPENAI_MODEL", "gpt-4o-mini"), "input": messages}
    try:
        return _call_openai_text(body)
    except Exception:
        return None


def _call_openai_text(body: dict[str, Any]) -> str | None:
    request = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return _response_text(json.loads(response.read().decode("utf-8")))
