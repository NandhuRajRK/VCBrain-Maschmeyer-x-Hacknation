import json
import os
import urllib.parse
import urllib.request

from fastapi import HTTPException


DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"
DEFAULT_MODEL_ID = "eleven_multilingual_v2"
DEFAULT_OUTPUT_FORMAT = "mp3_44100_128"


def narrate_text(text: str, voice_id: str | None = None) -> bytes:
    api_key = os.getenv("ELEVENLABS_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="ELEVENLABS_API_KEY is not configured")

    selected_voice = voice_id or os.getenv("ELEVENLABS_VOICE_ID") or DEFAULT_VOICE_ID
    model_id = os.getenv("ELEVENLABS_MODEL_ID", DEFAULT_MODEL_ID)
    output_format = os.getenv("ELEVENLABS_OUTPUT_FORMAT", DEFAULT_OUTPUT_FORMAT)
    url = (
        "https://api.elevenlabs.io/v1/text-to-speech/"
        f"{urllib.parse.quote(selected_voice)}?output_format={urllib.parse.quote(output_format)}"
    )
    request = urllib.request.Request(
        url,
        data=json.dumps({"text": text, "model_id": model_id}).encode("utf-8"),
        headers={"xi-api-key": api_key, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.read()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"ElevenLabs narration failed: {type(exc).__name__}") from exc
