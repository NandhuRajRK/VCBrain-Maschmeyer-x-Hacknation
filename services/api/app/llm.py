import json
import os
import urllib.request
from typing import Any

from .models import ParsedFounderQuery


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


def parse_founder_query(query: str) -> ParsedFounderQuery:
    if os.getenv("OPENAI_API_KEY"):
        parsed = _parse_with_openai(query)
        if parsed:
            return parsed
    return _fallback_parse(query)


def _parse_with_openai(query: str) -> ParsedFounderQuery | None:
    body = {
        "model": os.getenv("OPENAI_MODEL", "gpt-5"),
        "input": [
            {
                "role": "system",
                "content": (
                    "Parse VC founder search text into database filters. "
                    "Return only facts requested by the user. Do not score candidates."
                ),
            },
            {"role": "user", "content": query},
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "founder_search_query",
                "schema": SEARCH_QUERY_SCHEMA,
                "strict": True,
            }
        },
    }
    try:
        request = urllib.request.Request(
            "https://api.openai.com/v1/responses",
            data=json.dumps(body).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}",
                "Content-Type": "application/json",
            },
        )
        with urllib.request.urlopen(request, timeout=8) as response:
            text = _response_text(json.loads(response.read().decode("utf-8")))
        return ParsedFounderQuery.model_validate_json(text) if text else None
    except Exception:
        return None


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


def _find_phrases(text: str, phrases: list[str]) -> list[str]:
    return [phrase for phrase in phrases if phrase in text]
