"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { ArrowUp, AudioLines, Building2, Check, ChevronDown, Copy, LoaderCircle, MessageSquarePlus, Mic, Paperclip, Pencil, Plus, RotateCcw, Search, Square, StopCircle, X } from "lucide-react";
import type { ApiCompany, ApiOpportunityDraft, ApiSearchMatch, AssistantMessagePayload } from "../../lib/api";
import { analyzePipeline, askAssistant, listCompanies, narrateText, parseOpportunityIntent, searchFounders, transcribeAudio } from "../../lib/api";
import { buildPortfolioContext, type PortfolioItem } from "../../lib/assistant";
import { userError } from "../../lib/errors";
import { DEFAULT_THESIS } from "../../lib/thesis";
import { timeGreeting, workspaceUserName } from "../../lib/user";
import { useDismissableLayer, useUnsavedChanges } from "../../lib/use-dismissable-layer";
import IskraOrb from "../IskraOrb";
import OpportunityModal from "../OpportunityModal";
import styles from "./page.module.css";

type Message = { id: string; role: "user" | "assistant"; content: string; matches?: ApiSearchMatch[]; createdAt: string };
type VoiceState = "idle" | "listening" | "processing" | "speaking";
type VoiceInteraction = "dictation" | "dialogue";
const STORAGE_KEY = "iskra.chat.v1";
const EXAMPLES = ["Which deal is closest to invest?", "Find technical AI founders in Berlin", "Compare the biggest evidence gaps"];
const newMessage = (role: Message["role"], content: string, matches?: ApiSearchMatch[]): Message => ({ id: crypto.randomUUID(), role, content, matches, createdAt: new Date().toISOString() });

export default function IskraPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [companies, setCompanies] = useState<ApiCompany[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tagOpen, setTagOpen] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const [generating, setGenerating] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceInteraction, setVoiceInteraction] = useState<VoiceInteraction>("dictation");
  const [greeting, setGreeting] = useState("Good afternoon");
  const [userName, setUserName] = useState("there");
  const [showJump, setShowJump] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalPrompt, setModalPrompt] = useState("");
  const [modalDraft, setModalDraft] = useState<ApiOpportunityDraft | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const revealResolveRef = useRef<(() => void) | null>(null);
  const followBottomRef = useRef(true);
  const hydratedRef = useRef(false);
  const voiceCancelledRef = useRef(false);
  const voiceActionRef = useRef<() => Promise<void>>(async () => {});
  const tagRef = useDismissableLayer<HTMLDivElement>(tagOpen, () => setTagOpen(false));
  useUnsavedChanges(Boolean(query.trim() || attachment), "Leave without sending this Iskra draft?");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) { try { setMessages(JSON.parse(saved) as Message[]); } catch { localStorage.removeItem(STORAGE_KEY); } }
    setGreeting(timeGreeting()); setUserName(workspaceUserName()); hydratedRef.current = true;
    listCompanies().then(setCompanies).catch(() => setCompanies([]));
    return () => { streamRef.current?.getTracks().forEach((track) => track.stop()); audioRef.current?.pause(); abortRef.current?.abort(); if (revealTimerRef.current) window.clearInterval(revealTimerRef.current); };
  }, []);

  useEffect(() => { if (!hydratedRef.current) return; const timer = window.setTimeout(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(messages)), 180); return () => window.clearTimeout(timer); }, [messages]);
  useEffect(() => {
    const area = textareaRef.current; if (!area) return;
    area.style.height = "0px"; area.style.height = `${Math.min(area.scrollHeight, 168)}px`;
  }, [query]);
  useEffect(() => {
    if (!followBottomRef.current) return;
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: generating ? "smooth" : "auto", block: "end" }));
  }, [generating, messages]);

  const selectedCompanies = useMemo(() => companies.filter((company) => selectedIds.includes(company.id)), [companies, selectedIds]);
  const nearBottom = (element: HTMLDivElement) => element.scrollHeight - element.scrollTop - element.clientHeight <= 96;
  const onScroll = () => { const element = threadRef.current; if (!element) return; followBottomRef.current = nearBottom(element); setShowJump(!followBottomRef.current); };
  const jumpToBottom = () => {
    followBottomRef.current = true; setShowJump(false); bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    let checks = 0; const settle = () => { const element = threadRef.current; if (!element) return; checks += 1; if (!nearBottom(element) && checks < 12) { bottomRef.current?.scrollIntoView({ block: "end" }); requestAnimationFrame(settle); } }; requestAnimationFrame(settle);
  };

  const portfolioContext = useCallback(async () => {
    const scope = selectedCompanies.length ? selectedCompanies : companies;
    const items = (await Promise.all(scope.map(async (company) => { try { return { company, pipeline: await analyzePipeline(company.id, DEFAULT_THESIS) } as PortfolioItem; } catch { return null; } }))).filter((item): item is PortfolioItem => item !== null);
    const prefix = selectedCompanies.length ? `ANALYST-SELECTED SCOPE: ${selectedCompanies.map((company) => company.name).join(", ")}.` : "PORTFOLIO-WIDE SCOPE.";
    return `${prefix}\n\n${buildPortfolioContext(items)}`;
  }, [companies, selectedCompanies]);

  const finishReveal = () => { if (revealTimerRef.current) window.clearInterval(revealTimerRef.current); revealTimerRef.current = null; revealResolveRef.current?.(); revealResolveRef.current = null; };
  const revealAnswer = (answer: string, matches?: ApiSearchMatch[]) => new Promise<void>((resolve) => {
    const id = crypto.randomUUID(); const parts = answer.split(/(\s+)/); let index = 0;
    setMessages((current) => [...current, { id, role: "assistant", content: "", matches, createdAt: new Date().toISOString() }]);
    revealResolveRef.current = resolve;
    revealTimerRef.current = window.setInterval(() => {
      index = Math.min(parts.length, index + 3);
      setMessages((current) => current.map((message) => message.id === id ? { ...message, content: parts.slice(0, index).join("") } : message));
      if (index >= parts.length) finishReveal();
    }, 24);
  });

  const stop = useCallback(() => {
    voiceCancelledRef.current = true;
    abortRef.current?.abort(); abortRef.current = null; finishReveal(); audioRef.current?.pause(); audioRef.current = null;
    if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop(); streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null;
    setGenerating(false); setVoiceState("idle");
  }, []);

  async function send(text: string, options: { speak?: boolean; appendUser?: boolean; base?: Message[] } = {}) {
    const question = text.trim(); if (!question || generating) return;
    if (/\b(add|create|start|submit|diligence|analy[sz]e)\b.*\b(company|startup|opportunity|deal|analysis)\b/i.test(question)) {
      if (options.appendUser !== false) setMessages((current) => [...current, newMessage("user", question)]);
      setQuery(""); setGenerating(true);
      const controller = new AbortController(); abortRef.current = controller;
      try {
        const draft = await parseOpportunityIntent(question, controller.signal);
        setModalPrompt(question); setModalDraft(draft); setModalOpen(true);
        setMessages((current) => [...current, newMessage("assistant", draft.name ? `I prepared a new analysis for ${draft.name}. Review the extracted inputs, then start diligence.` : "I prepared a new analysis. Add the company name and review the extracted inputs before starting diligence.")]);
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setMessages((current) => [...current, newMessage("assistant", userError(caught, "assistant"))]);
      } finally { abortRef.current = null; setGenerating(false); setVoiceState("idle"); }
      return;
    }
    const base = options.base ?? messages;
    const history: AssistantMessagePayload[] = base.slice(-8).map(({ role, content }) => ({ role, content }));
    if (options.appendUser !== false) setMessages((current) => [...current, newMessage("user", question)]);
    setQuery(""); setGenerating(true); followBottomRef.current = true;
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const fileContext = attachment ? `\n\nAttached ${attachment.name}:\n${(await attachment.text()).slice(0, 6000)}` : "";
      let answer = ""; let matches: ApiSearchMatch[] | undefined;
      if (/\b(find|source|rank|founder|founders)\b/i.test(question)) {
        matches = await searchFounders(`${question}${fileContext}`, 12, controller.signal);
        answer = matches.length ? `I found ${matches.length} founders matching that request.` : "I could not find a founder matching that request in the current evidence set.";
      } else {
        const response = await askAssistant(question, `${await portfolioContext()}${fileContext}`, history, controller.signal); answer = response.answer;
      }
      setAttachment(null); await revealAnswer(answer, matches);
      if (options.speak && answer) {
        setVoiceState("processing"); const blob = await narrateText(answer, undefined, controller.signal); const audio = new Audio(URL.createObjectURL(blob)); audioRef.current = audio; setVoiceState("speaking");
        audio.onended = () => {
          URL.revokeObjectURL(audio.src); audioRef.current = null; setVoiceState("idle");
          if (voiceInteraction === "dialogue" && !voiceCancelledRef.current) window.setTimeout(() => void voiceActionRef.current(), 320);
        }; await audio.play();
      }
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === "AbortError")) setMessages((current) => [...current, newMessage("assistant", userError(caught, "assistant"))]);
    } finally { abortRef.current = null; setGenerating(false); if (!options.speak) setVoiceState("idle"); }
  }

  const regenerate = (assistantIndex: number) => {
    const userIndex = messages.slice(0, assistantIndex).findLastIndex((message) => message.role === "user"); if (userIndex < 0) return;
    const base = messages.slice(0, userIndex); const question = messages[userIndex].content; setMessages(base); window.setTimeout(() => void send(question, { base }), 0);
  };
  const editLatest = (index: number) => { setQuery(messages[index].content); setMessages(messages.slice(0, index)); textareaRef.current?.focus(); };
  const copy = async (message: Message) => { await navigator.clipboard.writeText(message.content); setCopiedId(message.id); window.setTimeout(() => setCopiedId((id) => id === message.id ? null : id), 900); };
  const newChat = () => { stop(); setMessages([]); setQuery(""); setAttachment(null); setSelectedIds([]); localStorage.removeItem(STORAGE_KEY); };

  const voice = async () => {
    if (voiceState === "speaking" || voiceState === "processing" || generating) { stop(); return; }
    if (voiceState === "listening") { setVoiceState("processing"); recorderRef.current?.stop(); return; }
    try {
      voiceCancelledRef.current = false;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const recorder = new MediaRecorder(stream);
      streamRef.current = stream; recorderRef.current = recorder; chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        if (voiceCancelledRef.current) { stream.getTracks().forEach((track) => track.stop()); streamRef.current = null; setVoiceState("idle"); return; }
        const controller = new AbortController(); abortRef.current = controller;
        try {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
          const transcript = await transcribeAudio(new File([blob], "iskra.webm", { type: blob.type }), controller.signal);
          stream.getTracks().forEach((track) => track.stop()); streamRef.current = null; abortRef.current = null;
          if (voiceInteraction === "dictation") { setQuery(transcript); setVoiceState("idle"); textareaRef.current?.focus(); }
          else await send(transcript, { speak: true });
        }
        catch (caught) { if (!(caught instanceof DOMException && caught.name === "AbortError")) setMessages((current) => [...current, newMessage("assistant", userError(caught, "voice"))]); setVoiceState("idle"); }
      };
      recorder.start(); setVoiceState("listening");
    } catch (caught) { setMessages((current) => [...current, newMessage("assistant", userError(caught, "voice"))]); setVoiceState("idle"); }
  };
  voiceActionRef.current = voice;

  const lastUserIndex = messages.findLastIndex((message) => message.role === "user");
  return <div className={styles.page} data-voice={voiceState !== "idle"}>
    <header className={styles.hero}><IskraOrb size={voiceState !== "idle" ? 142 : 76} voiceActive={voiceState !== "idle"} />{voiceState === "idle" ? <div className={styles.greeting}><p>{greeting}, {userName}</p><h1>What&apos;s on your mind?</h1></div> : <div className={styles.voiceCopy}><p>{voiceState === "listening" ? "Iskra is listening" : voiceState === "speaking" ? "Iskra is speaking" : "Iskra is thinking"}</p><button type="button" className={styles.voiceCancel} onClick={stop}><X size={14} /> Cancel voice</button></div>}</header>
    {messages.length > 0 && <div className={styles.threadShell}>{showJump && <button type="button" className={styles.jumpButton} onClick={jumpToBottom} aria-label="Jump to latest message"><ChevronDown size={16} /></button>}<div className={styles.chatThread} ref={threadRef} onScroll={onScroll}>{messages.map((message, index) => <article key={message.id} className={message.role === "user" ? styles.userMessage : styles.assistantTurn}>
      {message.role === "assistant" && <IskraOrb size={22} />}<div className={styles.messageBody}><ReactMarkdown>{message.content}</ReactMarkdown>{message.matches?.map((match) => <Link key={match.founder.id} href={`/company/${match.company.id}`} className={styles.match}><span><strong>{match.founder.name}</strong><small>{match.company.name}{match.company.sector ? ` · ${match.company.sector}` : ""}</small></span><b>{Math.round(match.match_score * 100)}%</b></Link>)}<div className={styles.messageActions}>{message.role === "assistant" ? <><button type="button" onClick={() => void copy(message)} title="Copy">{copiedId === message.id ? <Check size={13} /> : <Copy size={13} />}</button><button type="button" onClick={() => regenerate(index)} title="Regenerate" disabled={generating}><RotateCcw size={13} /></button></> : index === lastUserIndex && <button type="button" onClick={() => editLatest(index)} title="Edit"><Pencil size={13} /></button>}</div></div>
    </article>)}{generating && !messages.some((message) => message.role === "assistant" && !message.content) && <div className={styles.thinking}><IskraOrb size={24} /><span>Working through the evidence</span></div>}<div ref={bottomRef} className={styles.bottomAnchor} /></div></div>}
    <form className={styles.searchBar} onSubmit={(event) => { event.preventDefault(); void send(query); }}>
      <div className={styles.promptInputRow}><IskraOrb size={18} /><textarea ref={textareaRef} className={styles.searchInput} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(query); } }} placeholder="Ask Iskra..." rows={1} /></div>
      {selectedCompanies.length > 0 && <div className={styles.contextTags}>{selectedCompanies.map((company) => <span key={company.id}><Building2 size={12} />{company.name}<button type="button" onClick={() => setSelectedIds((ids) => ids.filter((id) => id !== company.id))}><X size={11} /></button></span>)}</div>}
      <div className={styles.composerFooter}><button type="button" className={styles.iconTool} onClick={() => { setModalPrompt(""); setModalDraft(null); setModalOpen(true); }} title="New analysis"><Plus size={15} /></button><input ref={fileRef} type="file" hidden accept=".txt,.md,.csv,.json,text/*" onChange={(event) => setAttachment(event.target.files?.[0] ?? null)} /><button type="button" className={styles.iconTool} onClick={() => fileRef.current?.click()} title="Attach file"><Paperclip size={14} /></button>
        <div ref={tagRef} className={styles.tagWrap}><button type="button" className={styles.iconTool} data-active={selectedIds.length > 0} onClick={() => setTagOpen((open) => !open)} title="Tag analyses"><Building2 size={14} />{selectedIds.length > 0 && <b>{selectedIds.length}</b>}</button>{tagOpen && <div className={styles.tagMenu}><label><Search size={13} /><input value={tagQuery} onChange={(event) => setTagQuery(event.target.value)} placeholder="Search analyses" autoFocus /></label><div>{companies.filter((company) => company.name.toLowerCase().includes(tagQuery.toLowerCase())).map((company) => <button key={company.id} type="button" data-active={selectedIds.includes(company.id)} onClick={() => setSelectedIds((ids) => ids.includes(company.id) ? ids.filter((id) => id !== company.id) : [...ids, company.id])}><span>{company.name}<small>{[company.sector, company.stage].filter(Boolean).join(" · ")}</small></span>{selectedIds.includes(company.id) && <Check size={13} />}</button>)}</div></div>}</div>
        {attachment && <span className={styles.attachment}>{attachment.name}<button type="button" onClick={() => setAttachment(null)}><X size={11} /></button></span>}<span className={styles.composerSpacer} /><div className={styles.voiceModes} role="group" aria-label="Voice behavior"><button type="button" data-active={voiceInteraction === "dictation"} onClick={() => setVoiceInteraction("dictation")} disabled={voiceState !== "idle"} title="Transcribe into the composer"><Mic size={13} /><span>Dictate</span></button><button type="button" data-active={voiceInteraction === "dialogue"} onClick={() => setVoiceInteraction("dialogue")} disabled={voiceState !== "idle"} title="Continuous spoken conversation"><AudioLines size={13} /><span>Dialogue</span></button></div>{messages.length > 0 && <button type="button" className={styles.iconTool} onClick={newChat} title="New chat"><MessageSquarePlus size={15} /></button>}<button type="button" className={styles.iconTool} data-active={voiceState !== "idle"} onClick={() => void voice()} title={voiceState === "idle" ? `Start ${voiceInteraction}` : "Stop voice"}>{voiceState === "listening" ? <Square size={13} /> : voiceState === "processing" ? <LoaderCircle size={15} className={styles.spinner} /> : voiceState === "speaking" ? <StopCircle size={15} /> : voiceInteraction === "dialogue" ? <AudioLines size={15} /> : <Mic size={15} />}</button>{generating ? <button type="button" className={styles.stopButton} onClick={stop} title="Stop generation"><Square size={13} /></button> : voiceState === "idle" && <button type="submit" className={styles.searchBtn} disabled={!query.trim()} title="Send"><ArrowUp size={16} /></button>}</div>
    </form>
    {messages.length === 0 && voiceState === "idle" && <div className={styles.examples}>{EXAMPLES.map((example) => <button key={example} type="button" className={styles.exampleCard} onClick={() => void send(example)}>{example}</button>)}</div>}
    <OpportunityModal key={modalOpen ? `${modalPrompt}-${modalDraft?.confidence ?? "manual"}` : "closed"} open={modalOpen} initialPrompt={modalPrompt} initialDraft={modalDraft} onClose={() => setModalOpen(false)} onComplete={(company) => { setCompanies((current) => [company, ...current.filter((item) => item.id !== company.id)]); setMessages((current) => [...current, newMessage("assistant", `${company.name}'s initial analysis is ready.`)]); router.push(`/company/${company.id}`); }} />
  </div>;
}
