import json
import os
import urllib.request
from typing import Any

from .models import ClaimKind, ExtractedClaim, ParsedFounderQuery, VoiceCommand, VoiceIntent
from .prompts import CLAIM_EXTRACTION_SYSTEM_PROMPT, FOUNDER_SEARCH_SYSTEM_PROMPT, VOICE_COMMAND_SYSTEM_PROMPT


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


def parse_voice_command(transcript: str) -> VoiceCommand:
    if os.getenv("OPENAI_API_KEY"):
        parsed = _parse_voice_with_openai(transcript)
        if parsed:
            return parsed
    return _fallback_voice_command(transcript)


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
        "model": os.getenv("OPENAI_MODEL", "gpt-5"),
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
            claims.append(ExtractedClaim(kind=kind, text=chunk[:320], confidence=0.62))
    if not claims and text.strip():
        claims.append(ExtractedClaim(kind=default_kind, text=text.strip()[:320], confidence=0.45))
    return claims[:8]


def _looks_like_claim(text: str) -> bool:
    lowered = text.lower()
    signal_terms = [
        "sector:",
        "stage:",
        "geography:",
        "traction:",
        "funding:",
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
    if any(term in lowered for term in ["mrr", "arr", "revenue", "funding", "raising", "$"]):
        return ClaimKind.financial
    if any(term in lowered for term in ["customer", "pilot", "growth", "traction", "waitlist"]):
        return ClaimKind.traction
    if any(term in lowered for term in ["founder", "github", "operator"]):
        return ClaimKind.founder
    if any(term in lowered for term in ["market", "sector", "geography"]):
        return ClaimKind.market
    if any(term in lowered for term in ["product", "platform", "workflow", "routes"]):
        return ClaimKind.product
    return default_kind
