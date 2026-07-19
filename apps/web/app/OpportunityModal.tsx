"use client";

import { useMemo, useRef, useState } from "react";
import { Check, FileText, Plus, Search, UploadCloud, X } from "lucide-react";
import type { AnalysisStage, ApiCompany, ApiCompanyCreate, ApiOpportunityDraft, PipelineResult } from "../lib/api";
import { createOpportunityAnalysis } from "../lib/api";
import { userError } from "../lib/errors";
import { useDismissableLayer, useUnsavedChanges } from "../lib/use-dismissable-layer";
import styles from "./OpportunityModal.module.css";

const OPTIONS = {
  sector: ["AI infrastructure", "Developer tools", "Fintech", "Cybersecurity", "Climate", "Healthtech", "Enterprise SaaS", "Marketplace"],
  stage: ["Pre-seed", "Seed", "Series A", "Series B", "Growth"],
  geography: ["Berlin, Germany", "DACH", "European Union", "London, UK", "Paris, France", "United States", "Remote"],
};

type FormState = { name: string; website: string; sector: string; stage: string; geography: string; description: string };
const EMPTY: FormState = { name: "", website: "", sector: "", stage: "", geography: "", description: "" };

function SearchableField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const fieldRef = useDismissableLayer<HTMLLabelElement>(open, () => setOpen(false));
  const filtered = options.filter((option) => option.toLowerCase().includes(value.toLowerCase().trim()));
  return <label ref={fieldRef} className={`${styles.field} ${styles.searchableField}`}>
    <span>{label}</span>
    <div className={styles.searchInput}><Search size={14} /><input value={value} onFocus={() => setOpen(true)} onChange={(event) => { onChange(event.target.value); setOpen(true); }} placeholder={`Search or enter ${label.toLowerCase()}`} /></div>
    {open && <div className={styles.optionMenu}>{filtered.length ? filtered.map((option) => <button key={option} type="button" data-active={option === value} onClick={() => { onChange(option); setOpen(false); }}><span>{option}</span>{option === value && <Check size={13} />}</button>) : <span className={styles.customValue}>Keep “{value}” as a custom value</span>}</div>}
  </label>;
}

export interface OpportunityProgress {
  company: ApiCompany;
  stage: AnalysisStage;
  percent: number;
}

export default function OpportunityModal({
  open,
  initialPrompt = "",
  initialDraft,
  onClose,
  onProgress,
  onComplete,
}: {
  open: boolean;
  initialPrompt?: string;
  initialDraft?: ApiOpportunityDraft | null;
  onClose: () => void;
  onProgress?: (progress: OpportunityProgress) => void;
  onComplete?: (company: ApiCompany, pipeline: PipelineResult) => void;
}) {
  const [form, setForm] = useState<FormState>(() => ({
    name: initialDraft?.name ?? "",
    website: initialDraft?.website ?? "",
    sector: initialDraft?.sector ?? "",
    stage: initialDraft?.stage ?? "",
    geography: initialDraft?.geography ?? "",
    description: initialDraft?.description ?? initialPrompt,
  }));
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState<AnalysisStage | null>(null);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const initialForm = useMemo<FormState>(() => ({
    name: initialDraft?.name ?? "",
    website: initialDraft?.website ?? "",
    sector: initialDraft?.sector ?? "",
    stage: initialDraft?.stage ?? "",
    geography: initialDraft?.geography ?? "",
    description: initialDraft?.description ?? initialPrompt,
  }), [initialDraft, initialPrompt]);

  const running = stage !== null && stage !== "complete";
  const dirty = files.length > 0 || JSON.stringify(form) !== JSON.stringify(initialForm);
  useUnsavedChanges(open && dirty && !running, "Discard this analysis draft? Your entered details and attachments will be lost.");

  if (!open) return null;

  function close() {
    if (running) return;
    if (dirty && !window.confirm("Discard this analysis draft? Your entered details and attachments will be lost.")) return;
    setForm(initialForm);
    setFiles([]);
    setError(null);
    onClose();
  }

  function update(key: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function addFiles(incoming: FileList | File[]) {
    setFiles((current) => {
      const next = [...current];
      for (const file of Array.from(incoming)) {
        if (!next.some((item) => item.name === file.name && item.size === file.size)) next.push(file);
      }
      return next.slice(0, 8);
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || running) return;
    setError(null);
    try {
      const payload: ApiCompanyCreate = {
        name: form.name.trim(),
        website: form.website.trim() || null,
        sector: form.sector.trim() || null,
        stage: form.stage.trim() || null,
        geography: form.geography.trim() || null,
        description: form.description.trim() || null,
      };
      const result = await createOpportunityAnalysis(payload, files, (nextStage, nextPercent, company) => {
        setStage(nextStage);
        setPercent(nextPercent);
        if (company) onProgress?.({ company, stage: nextStage, percent: nextPercent });
      });
      setForm(EMPTY);
      setFiles([]);
      onComplete?.(result.company, result.pipeline);
      onClose();
    } catch (caught) {
      setStage(null);
      setError(userError(caught, "application"));
    }
  }

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="opportunity-title">
        <header className={styles.header}>
          <h2 id="opportunity-title">New analysis</h2>
          <button type="button" className={styles.close} onClick={close} disabled={running} aria-label="Close"><X size={18} /></button>
        </header>

        <form className={styles.form} onSubmit={submit}>
          <label className={styles.field}><span>Company name</span><input value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Company name" required autoFocus /></label>
          <div className={styles.grid}>
            {(["sector", "stage", "geography"] as const).map((key) => <SearchableField key={key} label={key[0].toUpperCase() + key.slice(1)} value={form[key]} options={OPTIONS[key]} onChange={(value) => update(key, value)} />)}
            <label className={styles.field}><span>Website</span><input type="url" value={form.website} onChange={(event) => update("website", event.target.value)} placeholder="https://" /></label>
          </div>
          <label className={styles.field}><span>Company context</span><textarea value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="What is the company building, and why now?" rows={4} /></label>

          <div
            className={styles.dropzone}
            data-dragging={dragging}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}
          >
            <UploadCloud size={20} aria-hidden="true" />
            <div><strong>Drop diligence files here</strong><span>Pitch decks, PDFs, DOCX, PPTX, TXT, CSV, or Markdown</span></div>
            <input ref={fileRef} type="file" multiple hidden accept=".pdf,.pptx,.docx,.txt,.md,.csv,application/pdf" onChange={(event) => event.target.files && addFiles(event.target.files)} />
            <button type="button" onClick={() => fileRef.current?.click()} aria-label="Browse files" title="Browse files"><Plus size={15} /></button>
          </div>

          {files.length > 0 && <div className={styles.files}>{files.map((file) => <span key={`${file.name}-${file.size}`}><FileText size={13} /><span>{file.name}</span><button type="button" onClick={() => setFiles((current) => current.filter((item) => item !== file))} aria-label={`Remove ${file.name}`}><X size={12} /></button></span>)}</div>}
          {running && <div className={styles.progress}><div><span>{stage === "documents" ? "Reading documents" : stage === "sourcing" ? "Collecting signals" : stage === "ingesting" ? "Linking evidence" : stage === "scoring" ? "Building memo" : "Creating analysis"}</span><strong>{percent}%</strong></div><div className={styles.track}><span style={{ width: `${percent}%` }} /></div></div>}
          {error && <p className={styles.error}>{error}</p>}
          <footer className={styles.actions}><button type="button" onClick={close} disabled={running}>Cancel</button><button type="submit" className={styles.submit} disabled={!form.name.trim() || running}>{running ? "Analyzing" : "Run analysis"}</button></footer>
        </form>
      </section>
    </div>
  );
}
