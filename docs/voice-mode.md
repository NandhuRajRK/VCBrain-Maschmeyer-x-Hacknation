# Voice Mode

ElevenLabs can be used as a differentiating layer for investor-friendly audio.

## Current Backend Surface

`POST /voice/narrate`

Input:

```json
{
  "text": "Read this memo or outreach draft.",
  "voice_id": "optional ElevenLabs voice id"
}
```

Output:

```text
audio/mpeg
```

## Configuration

Copy `.env.example` to `.env` and set:

```bash
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
```

## Product Uses

- Read an investment memo aloud.
- Read the red-team section aloud before the decision.
- Generate founder-outreach audio snippets.
- Later: mobile app playback synced with the web dashboard.

The backend exposes the audio primitive. Julia's UI can decide where voice mode
appears in the experience.
