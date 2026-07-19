"use client";

/* ── Portfolio assistant ────────────────────────────────────────
 * A right side panel, collapsed by default, that lets an analyst ask
 * natural language questions across every company in the pipeline.
 * On first open it loads and analyses the whole portfolio once, builds
 * a compact context, and sends that with each question. Text only for
 * now. Monochrome.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { ArrowUp, AudioLines, Building2, Check, MessageSquarePlus, Mic, Paperclip, Plus, Search, X } from "lucide-react";
import styles from "./AssistantChat.module.css";
import IskraOrb from "./IskraOrb";
import { listCompanies, analyzePipeline, askAssistant, narrateText, transcribeAudio } from "../lib/api";
import type { AssistantMessagePayload } from "../lib/api";
import { DEFAULT_THESIS } from "../lib/thesis";
import { userError } from "../lib/errors";
import {
  buildPortfolioContext,
  SUGGESTED_QUESTIONS,
  type ChatMessage,
  type PortfolioItem,
} from "../lib/assistant";
import { workspaceUserName } from "../lib/user";
import { useDismissableLayer, useUnsavedChanges } from "../lib/use-dismissable-layer";
import { createVoiceCapture, type VoiceCapture } from "../lib/voice-recorder";

/* The current width is the ceiling; the panel can only be made narrower. */
const MAX_PANEL = 380;
const MIN_PANEL = 300;

export default function AssistantChat() {
  const pathname = usePathname();
  const router = useRouter();
  const hidden = pathname === "/search";
  const [open, setOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(MAX_PANEL);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [items, setItems] = useState<PortfolioItem[] | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [sending, setSending] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceInteraction, setVoiceInteraction] = useState<"dictation" | "dialogue">("dictation");
  const [voiceStatus, setVoiceStatus] = useState<"idle" | "listening" | "processing" | "speaking">("idle");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tagOpen, setTagOpen] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const [userName, setUserName] = useState("there");
  useUnsavedChanges(Boolean(input.trim() || attachment), "Leave without sending this Iskra draft?");

  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const loadedRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<VoiceCapture | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const voiceActionRef = useRef<() => Promise<void>>(async () => {});
  const dialogueLoopRef = useRef(false);
  const finishingRunRef = useRef<number | null>(null);
  const voiceCancelledRef = useRef(false);
  const voiceRunRef = useRef(0);
  const tagRef = useDismissableLayer<HTMLDivElement>(tagOpen, () => setTagOpen(false));

  const context = useMemo(
    () => {
      const scope = selectedIds.length ? items?.filter((item) => selectedIds.includes(item.company.id)) : items;
      return scope ? buildPortfolioContext(scope) : "";
    },
    [items, selectedIds]
  );

  /* Load and analyse the whole portfolio once, on first open. A ref
   * gates it so state updates inside the load cannot re-trigger and
   * cancel the effect. */
  useEffect(() => {
    const timer = window.setTimeout(() => setUserName(workspaceUserName()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!open || loadedRef.current) return;
    loadedRef.current = true;
    setLoadingData(true);

    /* Defer the heavy analysis a beat so the open animation paints first. */
    const timer = setTimeout(() => {
    (async () => {
      try {
        const companies = await listCompanies();
        const analysed = await Promise.all(
          companies.map(async (c) => {
            try {
              const pipeline = await analyzePipeline(c.id, DEFAULT_THESIS);
              return { company: c, pipeline } as PortfolioItem;
            } catch {
              return null;
            }
          })
        );
        setItems(analysed.filter((x): x is PortfolioItem => x !== null));
      } catch {
        setItems([]);
        loadedRef.current = false;
      } finally {
        setLoadingData(false);
      }
    })();
    }, 200);

    return () => clearTimeout(timer);
  }, [open]);

  /* Keep the thread pinned to the latest message. */
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, sending, open]);

  /* Focus the input when the panel opens. */
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => () => {
    void captureRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    audioRef.current?.pause();
  }, []);

  /* Push the content area aside so the dashboard narrows to fit rather
   * than being covered. Setting the margin directly on the content element
   * is what reliably fires its transition (a custom property or :has change
   * does not animate consistently in Chromium). The content rule owns the
   * transition timing. */
  useEffect(() => {
    const content = document.querySelector<HTMLElement>("main");
    if (!content) return;
    /* A plain pixel value transitions reliably; a min() expression does
     * not animate in Chromium and gets stuck. Cap to the viewport here. */
    const applyMargin = () => {
      const mobile = window.innerWidth <= 760;
      const capped = Math.min(panelWidth, Math.round(window.innerWidth * 0.92));
      content.style.marginRight = open && !hidden && !mobile ? `${capped}px` : "0px";
    };
    applyMargin();
    window.addEventListener("resize", applyMargin);
    return () => {
      window.removeEventListener("resize", applyMargin);
      content.style.marginRight = "0px";
    };
  }, [hidden, open, panelWidth]);

  /* Drag the left edge of the panel to make it narrower. */
  const startResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const root = document.documentElement;
      const startX = e.clientX;
      const startW = panelWidth;
      root.setAttribute("data-resizing", "");

      const onMove = (ev: PointerEvent) => {
        const next = Math.min(MAX_PANEL, Math.max(MIN_PANEL, startW + (startX - ev.clientX)));
        setPanelWidth(next);
      };
      const onUp = () => {
        root.removeAttribute("data-resizing");
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [panelWidth]
  );

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || sending) return;

      const history: AssistantMessagePayload[] = messages.slice(-8).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      setMessages((prev) => [...prev, { role: "user", content: question }]);
      setInput("");
      setSending(true);

      try {
        const attachmentContext = attachment
          ? `\n\nATTACHED FILE (${attachment.name}):\n${(await attachment.text()).slice(0, 12_000)}`
          : "";
        const res = await askAssistant(question, `${context}${attachmentContext}`, history);
        setMessages((prev) => [...prev, { role: "assistant", content: res.answer }]);
        setAttachment(null);
      } catch (error) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: userError(error, "assistant") },
        ]);
      } finally {
        setSending(false);
      }
    },
    [attachment, context, messages, sending]
  );

  const finishVoiceCapture = useCallback(async (capture: VoiceCapture) => {
    const runId = voiceRunRef.current;
    if (finishingRunRef.current === runId) return;
    finishingRunRef.current = runId;
    try {
      setVoiceStatus("processing");
      const transcript = await transcribeAudio(await capture.stop());
      if (!transcript.trim()) throw new Error("No audio captured");
      if (voiceCancelledRef.current || runId !== voiceRunRef.current) return;
      if (voiceInteraction === "dictation") {
        setInput(transcript);
        setAttachment(null);
        return;
      }
      const attachmentContext = attachment
        ? `\n\nATTACHED FILE (${attachment.name}):\n${(await attachment.text()).slice(0, 12_000)}`
        : "";
      const history: AssistantMessagePayload[] = messages.slice(-8).map((message) => ({ role: message.role, content: message.content }));
      const response = await askAssistant(transcript, `${context}${attachmentContext}`, history);
      if (voiceCancelledRef.current || runId !== voiceRunRef.current) return;
      setMessages((current) => [...current, { role: "user", content: transcript }, { role: "assistant", content: response.answer }]);
      try {
        const audio = new Audio(URL.createObjectURL(await narrateText(response.answer)));
        audioRef.current = audio;
        setVoiceStatus("speaking");
        audio.onended = () => {
          URL.revokeObjectURL(audio.src); audioRef.current = null;
          if (dialogueLoopRef.current && !voiceCancelledRef.current) void voiceActionRef.current();
          else { setVoiceMode(false); setVoiceStatus("idle"); }
        };
        audio.onerror = () => {
          URL.revokeObjectURL(audio.src); audioRef.current = null;
          if (dialogueLoopRef.current && !voiceCancelledRef.current) void voiceActionRef.current();
          else { setVoiceMode(false); setVoiceStatus("idle"); }
        };
        await audio.play();
      } catch {
        // The text response remains available when browser playback is blocked.
        if (dialogueLoopRef.current && !voiceCancelledRef.current) void voiceActionRef.current();
      }
      setAttachment(null);
    } catch (error) {
      setMessages((current) => [...current, { role: "assistant", content: userError(error, "voice") }]);
      if (dialogueLoopRef.current && !voiceCancelledRef.current) void voiceActionRef.current();
    } finally {
      captureRef.current = null;
      streamRef.current = null;
      if (finishingRunRef.current === runId) finishingRunRef.current = null;
      if (voiceInteraction !== "dialogue" || !dialogueLoopRef.current) {
        setVoiceMode(false);
        setVoiceStatus("idle");
      }
    }
  }, [attachment, context, messages, voiceInteraction]);

  const startListening = useCallback(async () => {
    if (voiceCancelledRef.current) return;
    const runId = voiceRunRef.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone is unavailable in this browser");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      let capture: VoiceCapture | null = null;
      capture = await createVoiceCapture(stream, dialogueLoopRef.current ? {
        onSilence: () => {
          if (capture && finishingRunRef.current !== runId && !voiceCancelledRef.current) void finishVoiceCapture(capture);
        },
      } : undefined);
      if (voiceCancelledRef.current || runId !== voiceRunRef.current) { await capture.stop(); return; }
      streamRef.current = stream;
      captureRef.current = capture;
      setVoiceMode(true);
      setVoiceStatus("listening");
    } catch (error) {
      if (!voiceCancelledRef.current) setMessages((current) => [...current, { role: "assistant", content: userError(error, "voice") }]);
      setVoiceMode(false);
      setVoiceStatus("idle");
    }
  }, [finishVoiceCapture]);
  voiceActionRef.current = startListening;

  const toggleVoice = useCallback(async () => {
    if (voiceStatus === "processing") return;
    if (voiceStatus === "speaking") {
      voiceCancelledRef.current = true;
      dialogueLoopRef.current = false;
      audioRef.current?.pause();
      audioRef.current = null;
      setVoiceMode(false);
      setVoiceStatus("idle");
      return;
    }
    if (voiceMode) {
      const capture = captureRef.current;
      if (!capture) { setVoiceMode(false); setVoiceStatus("idle"); return; }
      void finishVoiceCapture(capture);
      return;
    }
    voiceCancelledRef.current = false;
    dialogueLoopRef.current = voiceInteraction === "dialogue";
    voiceRunRef.current += 1;
    await startListening();
  }, [finishVoiceCapture, startListening, voiceInteraction, voiceMode, voiceStatus]);

  const changeVoiceInteraction = (next: "dictation" | "dialogue") => {
    if (next === voiceInteraction) return;
    voiceCancelledRef.current = true;
    dialogueLoopRef.current = false;
    voiceRunRef.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    void captureRef.current?.stop();
    captureRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setVoiceMode(false);
    setVoiceStatus("idle");
    setVoiceInteraction(next);
  };

  if (hidden) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          className={styles.fab}
          onClick={() => setOpen(true)}
          aria-label="Open assistant"
        >
          <span className={styles.fabIcon}><IskraOrb size={20} /></span>
          Ask Iskra
        </button>
      )}

      <aside
        className={styles.panel}
        data-open={open}
        aria-hidden={!open}
        style={{ width: `${panelWidth}px` }}
      >
        <div
          className={styles.resizeHandle}
          onPointerDown={startResize}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize assistant"
        />
        <header className={styles.header}>
          <div className={styles.headerTitle}>
            <span className={styles.headerIcon}><IskraOrb size={18} /></span>
            Iskra
          </div>
          <button
            type="button"
            className={styles.close}
            onClick={() => setOpen(false)}
            aria-label="Close assistant"
          >
            &times;
          </button>
        </header>

        <div className={styles.body} ref={bodyRef}>
          {voiceMode ? (
            <div className={styles.voiceStage}>
              <IskraOrb size={84} voiceActive />
              <p className={styles.greeting}>{voiceStatus === "processing" ? "Thinking" : voiceStatus === "speaking" ? "Speaking" : "Listening"}</p>
              <p className={styles.hint}>{voiceStatus === "processing" ? "Transcribing and routing your request..." : voiceStatus === "speaking" ? "Preparing the next turn..." : "Speak naturally; Iskra sends after a pause."}</p>
            </div>
          ) : messages.length === 0 ? (
            <div className={styles.intro}>
              <IskraOrb size={72} />
              <p className={styles.greeting}>Hello {userName}, how may I help you?</p>
              <p className={styles.hint}>
                {loadingData ? "Reading the portfolio..." : "Ask about any company, or pick a starting point."}
              </p>
              <div className={styles.chips}>
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    className={styles.chip}
                    onClick={() => send(q)}
                    disabled={sending}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className={styles.thread}>
              {messages.map((msg, idx) => (
                <div key={idx} className={styles.msg} data-role={msg.role}>
                  {msg.content}
                </div>
              ))}
              {sending && (
                <div className={styles.msg} data-role="assistant">
                  <span className={styles.typing}>Thinking</span>
                </div>
              )}
            </div>
          )}
        </div>

        <form
          className={styles.composer}
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <div className={styles.inputRow}>
            <input
              ref={inputRef}
              className={styles.input}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Iskra..."
              aria-label="Message Iskra"
            />
            <button type="submit" className={styles.send} disabled={sending || !input.trim()} aria-label="Send">
              <ArrowUp size={16} aria-hidden="true" />
            </button>
          </div>
          <div className={styles.composerTools}>
            <button type="button" className={styles.toolButton} onClick={() => router.push("/search")} title="Open full Iskra workspace" aria-label="Open full Iskra workspace">
              <Plus size={14} aria-hidden="true" />
            </button>
            <input ref={fileRef} className={styles.fileInput} type="file" accept=".txt,.md,.csv,.json,text/*" onChange={(event) => setAttachment(event.target.files?.[0] ?? null)} />
            <button type="button" className={styles.toolButton} onClick={() => fileRef.current?.click()} title="Attach a file">
              <Paperclip size={14} aria-hidden="true" /><span>Attach</span>
            </button>
            <div ref={tagRef} className={styles.tagWrap}>
              <button type="button" className={styles.toolButton} data-active={selectedIds.length > 0} onClick={() => setTagOpen((open) => !open)} title="Tag analyses" aria-label="Tag analyses">
                <Building2 size={14} aria-hidden="true" />{selectedIds.length > 0 && <b>{selectedIds.length}</b>}
              </button>
              {tagOpen && <div className={styles.tagMenu}>
                <label><Search size={13} /><input value={tagQuery} onChange={(event) => setTagQuery(event.target.value)} placeholder="Search analyses" autoFocus /></label>
                <div>{(items ?? []).filter((item) => item.company.name.toLowerCase().includes(tagQuery.toLowerCase())).map((item) => <button key={item.company.id} type="button" data-active={selectedIds.includes(item.company.id)} onClick={() => setSelectedIds((ids) => ids.includes(item.company.id) ? ids.filter((id) => id !== item.company.id) : [...ids, item.company.id])}><span>{item.company.name}<small>{[item.company.sector, item.company.stage].filter(Boolean).join(" · ")}</small></span>{selectedIds.includes(item.company.id) && <Check size={13} />}</button>)}</div>
              </div>}
            </div>
            {attachment && (
              <span className={styles.attachment} title={attachment.name}>
                <span>{attachment.name}</span>
                <button type="button" onClick={() => setAttachment(null)} aria-label={`Remove ${attachment.name}`}><X size={12} /></button>
              </span>
            )}
            <div className={styles.voiceModes} role="group" aria-label="Voice behavior">
              <button type="button" data-active={voiceInteraction === "dictation"} onClick={() => changeVoiceInteraction("dictation")} title="Transcribe into the composer"><Mic size={13} /><span>Dictate</span></button>
              <button type="button" data-active={voiceInteraction === "dialogue"} onClick={() => changeVoiceInteraction("dialogue")} title="Speak with Iskra"><AudioLines size={13} /><span>Dialogue</span></button>
            </div>
            <button type="button" className={styles.toolButton} data-active={voiceMode} onClick={toggleVoice} aria-pressed={voiceMode} disabled={voiceStatus === "processing"} title="Toggle voice mode">
              <Mic size={14} aria-hidden="true" /><span>{voiceStatus === "processing" ? "Processing" : voiceMode ? "Send voice" : "Voice"}</span>
            </button>
            {messages.length > 0 && <button type="button" className={styles.toolButton} onClick={() => { setMessages([]); setInput(""); setAttachment(null); setSelectedIds([]); }} title="New chat" aria-label="New chat"><MessageSquarePlus size={14} /></button>}
          </div>
        </form>
      </aside>
    </>
  );
}
