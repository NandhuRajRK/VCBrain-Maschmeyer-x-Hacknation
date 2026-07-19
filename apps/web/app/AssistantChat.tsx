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
import { ArrowUp, Mic, Paperclip, X } from "lucide-react";
import styles from "./AssistantChat.module.css";
import IskraOrb from "./IskraOrb";
import { listCompanies, analyzePipeline, askAssistant, voiceQueryAudio } from "../lib/api";
import type { AssistantMessagePayload } from "../lib/api";
import { DEFAULT_THESIS } from "../lib/thesis";
import { userError } from "../lib/errors";
import {
  buildPortfolioContext,
  SUGGESTED_QUESTIONS,
  type ChatMessage,
  type PortfolioItem,
} from "../lib/assistant";
import { useUnsavedChanges } from "../lib/use-dismissable-layer";
import { useWorkspaceAuth } from "./AuthProvider";

/* The current width is the ceiling; the panel can only be made narrower. */
const MAX_PANEL = 380;
const MIN_PANEL = 300;

export default function AssistantChat() {
  const auth = useWorkspaceAuth();
  const pathname = usePathname();
  const hidden = pathname === "/search";
  const [open, setOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(MAX_PANEL);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [items, setItems] = useState<PortfolioItem[] | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [sending, setSending] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<"idle" | "listening" | "processing">("idle");
  const [attachment, setAttachment] = useState<File | null>(null);
  const userName = auth.name;
  useUnsavedChanges(Boolean(input.trim() || attachment), "Leave without sending this Iskra draft?");

  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const loadedRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);

  const context = useMemo(
    () => (items ? buildPortfolioContext(items) : ""),
    [items]
  );

  /* Load and analyse the whole portfolio once, on first open. A ref
   * gates it so state updates inside the load cannot re-trigger and
   * cancel the effect. */
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
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
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

  const toggleVoice = useCallback(async () => {
    if (voiceStatus === "processing") return;
    if (voiceMode) {
      setVoiceStatus("processing");
      recorderRef.current?.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      voiceChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) voiceChunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        try {
          const blob = new Blob(voiceChunksRef.current, { type: recorder.mimeType || "audio/webm" });
          const response = await voiceQueryAudio(new File([blob], "iskra-voice.webm", { type: blob.type }), true);
          setMessages((current) => [
            ...current,
            { role: "user", content: response.transcript },
            { role: "assistant", content: response.response_text },
          ]);
          if (response.audio_base64) {
            void new Audio(`data:audio/mpeg;base64,${response.audio_base64}`).play();
          }
        } catch (error) {
          setMessages((current) => [...current, { role: "assistant", content: userError(error, "voice") }]);
        } finally {
          stream.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
          recorderRef.current = null;
          setVoiceMode(false);
          setVoiceStatus("idle");
        }
      };
      recorder.start();
      setVoiceMode(true);
      setVoiceStatus("listening");
    } catch (error) {
      setMessages((current) => [...current, { role: "assistant", content: userError(error, "voice") }]);
      setVoiceMode(false);
      setVoiceStatus("idle");
    }
  }, [voiceMode, voiceStatus]);

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
              <p className={styles.greeting}>{voiceStatus === "processing" ? "Iskra is thinking" : "Iskra is listening"}</p>
              <p className={styles.hint}>{voiceStatus === "processing" ? "Transcribing and routing your request..." : "Speak naturally, then press Voice again to send."}</p>
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
            <input ref={fileRef} className={styles.fileInput} type="file" accept=".txt,.md,.csv,.json,text/*" onChange={(event) => setAttachment(event.target.files?.[0] ?? null)} />
            <button type="button" className={styles.toolButton} onClick={() => fileRef.current?.click()} title="Attach a file">
              <Paperclip size={14} aria-hidden="true" /><span>Attach</span>
            </button>
            {attachment && (
              <span className={styles.attachment} title={attachment.name}>
                <span>{attachment.name}</span>
                <button type="button" onClick={() => setAttachment(null)} aria-label={`Remove ${attachment.name}`}><X size={12} /></button>
              </span>
            )}
            <button type="button" className={styles.toolButton} data-active={voiceMode} onClick={toggleVoice} aria-pressed={voiceMode} disabled={voiceStatus === "processing"} title="Toggle voice mode">
              <Mic size={14} aria-hidden="true" /><span>{voiceStatus === "processing" ? "Processing" : voiceMode ? "Send voice" : "Voice"}</span>
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}
