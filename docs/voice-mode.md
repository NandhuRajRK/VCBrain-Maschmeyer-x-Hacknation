# Iskra Voice Modes

Voice is another input surface for the investor workspace. It uses the same
portfolio context and actions as text chat.

## Dictation

Dictation records one utterance, sends it to OpenAI transcription, and places
the transcript in the normal composer. The user can review or edit the text
before sending it. The rest of the screen remains unchanged.

```text
microphone -> browser PCM capture -> OpenAI transcription -> chat composer
```

## Dialogue

Dialogue records until silence, transcribes and submits automatically, reasons
over the active portfolio or tagged analyses, speaks the answer, and resumes
listening. A run identifier prevents stale callbacks when the user cancels or
switches modes.

```text
listen -> transcribe -> assistant/tool action -> optional narration -> listen
```

The interface exposes `Listening`, `Thinking`, and `Speaking` states and always
provides a cancel action. The send control is hidden while a dialogue turn is
actively streaming.

## API Surface

```text
POST /voice/transcribe
POST /voice/query
POST /voice/query/text
POST /voice/narrate
```

`/voice/transcribe` handles speech-to-text. `/voice/query` combines audio
transcription and intent routing. `/voice/query/text` accepts an existing
transcript. `/voice/narrate` returns an ElevenLabs MP3.

Supported intents include founder search, company dossier, memo review,
decision review, activation, and unknown. The assistant can also prepare a new
analysis by parsing explicit intake requests through its dedicated opportunity
prompt.

## Configuration

```dotenv
OPENAI_API_KEY=...
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
```

ElevenLabs is optional; text and transcription still work without it. API keys
remain on the server. Browser microphone permission is requested only when the
user activates a voice mode.

## Reliability and Privacy

- Capture resources are released on cancel, mode switch, and page unmount.
- Audio uploads are capped at 25 MB.
- Empty or unintelligible transcripts return a useful error.
- Attached files and tagged analyses are included only in the active request
  context.
- The hackathon implementation does not claim long-term audio retention.
