import base64
import json
import os
import urllib.parse
import urllib.error
import urllib.request
from pathlib import PurePath

from fastapi import HTTPException


DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"
DEFAULT_MODEL_ID = "eleven_multilingual_v2"
DEFAULT_OUTPUT_FORMAT = "mp3_44100_128"
DEFAULT_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe"


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
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            raise HTTPException(status_code=502, detail="ElevenLabs narration is not authorized. Check the API key permissions.") from exc
        if exc.code == 429:
            raise HTTPException(status_code=502, detail="ElevenLabs narration is rate limited. Try again shortly.") from exc
        raise HTTPException(status_code=502, detail=f"ElevenLabs narration failed: HTTP {exc.code}") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"ElevenLabs narration failed: {type(exc).__name__}") from exc


def transcribe_audio(content: bytes, filename: str, content_type: str | None = None) -> str:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY is not configured")
    if not content:
        raise HTTPException(status_code=400, detail="Audio input is empty")

    boundary = f"----vcbrain-{os.urandom(12).hex()}"
    safe_name = _safe_filename(filename)
    media_type = content_type or "application/octet-stream"
    model = os.getenv("OPENAI_TRANSCRIPTION_MODEL", DEFAULT_TRANSCRIPTION_MODEL)
    body = b"".join(
        [
            _multipart_field(boundary, "model", model),
            _multipart_file(boundary, "file", safe_name, media_type, content),
            f"--{boundary}--\r\n".encode(),
        ]
    )
    request = urllib.request.Request(
        "https://api.openai.com/v1/audio/transcriptions",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            text = json.loads(response.read().decode("utf-8")).get("text", "").strip()
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            raise HTTPException(status_code=502, detail="OpenAI transcription is not authorized. Check OPENAI_API_KEY.") from exc
        if exc.code == 429:
            raise HTTPException(status_code=502, detail="OpenAI transcription is rate limited. Try again shortly.") from exc
        raise HTTPException(status_code=502, detail=f"OpenAI transcription failed: HTTP {exc.code}") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"OpenAI transcription failed: {type(exc).__name__}") from exc
    if not text:
        raise HTTPException(status_code=502, detail="OpenAI returned an empty transcription")
    return text


def encode_audio(audio: bytes) -> str:
    return base64.b64encode(audio).decode("ascii")


def _multipart_field(boundary: str, name: str, value: str) -> bytes:
    return f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode()


def _multipart_file(boundary: str, name: str, filename: str, content_type: str, content: bytes) -> bytes:
    header = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; filename=\"{filename}\"\r\n"
        f"Content-Type: {content_type}\r\n\r\n"
    ).encode()
    return header + content + b"\r\n"


def _safe_filename(filename: str) -> str:
    name = PurePath(filename or "voice.webm").name
    cleaned = "".join(char for char in name if char.isalnum() or char in ".-_ ").strip()
    return cleaned or "voice.webm"
