# Voice Mode

Voice is an input layer for the whole investor workspace, not a separate chatbot.
The same command response can drive Julia's search, dossier, memo, decision, and
outreach views in the web app or a later mobile client.

## Voice Query Flow

```text
microphone -> OpenAI transcription -> intent router -> existing VC Brain action
                                      -> Julia's target view
                                      -> optional ElevenLabs spoken response
```

The router uses a dedicated prompt and returns the original transcript, a typed
intent, confidence, parsed founder-search filters when relevant, and normalized
search results. This keeps the UI independent from audio providers.

## Backend Surface

`POST /voice/query` accepts a browser or mobile audio upload as multipart form data:

```bash
curl -X POST http://localhost:8000/voice/query \
  -F 'audio=@investor-command.webm' \
  -F 'speak_response=true'
```

`POST /voice/query/text` accepts a transcript for local development and UI tests:

```json
{
  "transcript": "Find technical founders in Berlin building AI infrastructure",
  "speak_response": false,
  "limit": 5
}
```

Both return the same `VoiceQueryResponse` contract. Founder-search commands
execute immediately. `company_dossier`, `memo_review`, `decision_review`, and
`activation` are returned as typed handoffs for Julia's corresponding views.

## Audio Output

`POST /voice/narrate`

Input:

```json
{
  "text": "Read this memo or outreach draft.",
  "voice_id": "optional ElevenLabs voice id"
}
```

Output: `audio/mpeg`.

## Configuration

Copy `.env.example` to `.env` and set:

```bash
OPENAI_API_KEY=...
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
```

## Product Uses

- Say a sourcing query while reviewing the ranked founder list.
- Ask to open a dossier or review a red-team memo and let the UI route it.
- Read an investment memo or decision summary aloud.
- Generate founder-outreach audio snippets.
- Reuse the exact same command contract in a mobile client later.

OpenAI's transcription endpoint supports common browser and mobile formats such
as WebM, MP3, MP4, M4A, OGG, WAV, and FLAC. Keep API keys server-side; the client
only uploads audio and consumes the response contract.
