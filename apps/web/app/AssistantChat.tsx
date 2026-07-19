"use client";

/* ── Portfolio assistant ────────────────────────────────────────
 * A right side panel, collapsed by default, that lets an analyst ask
 * natural language questions across every company in the pipeline.
 * On first open it loads and analyses the whole portfolio once, builds
 * a compact context, and sends that with each question. Text only for
 * now. Monochrome.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./AssistantChat.module.css";
import { listCompanies, analyzePipeline, askAssistant } from "../lib/api";
import type { AssistantMessagePayload } from "../lib/api";
import { DEFAULT_THESIS } from "../lib/thesis";
import {
  buildPortfolioContext,
  SUGGESTED_QUESTIONS,
  VC_NAME,
  type ChatMessage,
  type PortfolioItem,
} from "../lib/assistant";

export default function AssistantChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [items, setItems] = useState<PortfolioItem[] | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [sending, setSending] = useState(false);

  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const loadedRef = useRef(false);

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
        const res = await askAssistant(question, context, history);
        setMessages((prev) => [...prev, { role: "assistant", content: res.answer }]);
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Something went wrong reaching the assistant. Please try again." },
        ]);
      } finally {
        setSending(false);
      }
    },
    [context, messages, sending]
  );

  return (
    <>
      {!open && (
        <button
          type="button"
          className={styles.fab}
          onClick={() => setOpen(true)}
          aria-label="Open assistant"
        >
          <span className={styles.fabIcon}>&#x2726;</span>
          Ask AI
        </button>
      )}

      <aside className={styles.panel} data-open={open} aria-hidden={!open}>
        <header className={styles.header}>
          <div className={styles.headerTitle}>
            <span className={styles.headerIcon}>&#x2726;</span>
            Assistant
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
          {messages.length === 0 ? (
            <div className={styles.intro}>
              <div className={styles.orb} aria-hidden="true" />
              <p className={styles.greeting}>Hello {VC_NAME}, how may I help you?</p>
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
          className={styles.inputRow}
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            ref={inputRef}
            className={styles.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message"
            aria-label="Message the assistant"
          />
          <button
            type="submit"
            className={styles.send}
            disabled={sending || !input.trim()}
            aria-label="Send"
          >
            &#x2191;
          </button>
        </form>
      </aside>
    </>
  );
}
