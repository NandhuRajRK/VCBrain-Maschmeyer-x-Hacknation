"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { addDealNote, fetchDealWorkspace, updateDealNote } from "../../../lib/api";
import type { ApiCollaborationNote, ApiDealWorkspace } from "../../../lib/api";
import { userError } from "../../../lib/errors";
import styles from "./CompanyComments.module.css";

type CommentTarget = { label: string; x: number; y: number };
type CommentMarker = CommentTarget & { id: string };

function targetFrom(event: MouseEvent<HTMLElement>): CommentTarget {
  const element = event.target instanceof Element ? event.target : null;
  const section = element?.closest("section, article, [role=tabpanel], header");
  const heading = section?.querySelector("h1, h2, h3")?.textContent?.trim();
  const text = element?.textContent?.trim().replace(/\s+/g, " ").slice(0, 72);
  return { label: heading || text || "Company analysis", x: event.clientX, y: event.clientY };
}

export default function CompanyComments({ companyId, children }: { companyId: string; children: ReactNode }) {
  const [workspace, setWorkspace] = useState<ApiDealWorkspace | null>(null);
  const [menu, setMenu] = useState<CommentTarget | null>(null);
  const [composer, setComposer] = useState<CommentTarget | null>(null);
  const [threadNote, setThreadNote] = useState<ApiCollaborationNote | null>(null);
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState<string[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionEnd, setMentionEnd] = useState<number | null>(null);
  const [markers, setMarkers] = useState<CommentMarker[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const refresh = useCallback(() => fetchDealWorkspace(companyId).then((next) => {
    setWorkspace(next);
    setMarkers((current) => {
      const persisted = next.notes.filter((note) => note.position_x !== null && note.position_y !== null).map((note) => ({ id: note.parent_id ?? note.id, label: note.anchor || "Company analysis", x: note.position_x as number, y: note.position_y as number }));
      return [...current, ...persisted.filter((marker) => !current.some((item) => item.id === marker.id))];
    });
  }).catch(() => setWorkspace(null)), [companyId]);
  useEffect(() => { void refresh(); }, [refresh]);

  const openComposer = (target: CommentTarget, note: ApiCollaborationNote | null = null) => {
    setMenu(null); setComposer(target); setThreadNote(note); setBody(""); setMentions([]); setMentionQuery(null); setError("");
  };

  const handleContext = (event: MouseEvent<HTMLElement>) => {
    if ((event.target instanceof Element && event.target.closest("[data-comments-ui]"))) return;
    event.preventDefault(); setMenu(targetFrom(event));
  };

  const handleDoubleClick = (event: MouseEvent<HTMLElement>) => {
    if ((event.target instanceof Element && event.target.closest("[data-comments-ui]"))) return;
    openComposer(targetFrom(event));
  };

  const updateBody = (value: string, cursor: number) => {
    setBody(value);
    const match = value.slice(0, cursor).match(/(?:^|\s)@([^\s@]*)$/);
    if (!match) { setMentionQuery(null); setMentionStart(null); setMentionEnd(null); return; }
    setMentionQuery(match[1].toLowerCase());
    setMentionStart(cursor - match[1].length - 1);
    setMentionEnd(cursor);
  };

  const selectMention = (userId: string, displayName: string) => {
    if (mentionStart === null || mentionEnd === null) return;
    const next = `${body.slice(0, mentionStart)}@${displayName} ${body.slice(mentionEnd)}`;
    setBody(next); setMentions((current) => current.includes(userId) ? current : [...current, userId]);
    setMentionQuery(null); setMentionStart(null); setMentionEnd(null);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!composer || !body.trim()) return;
    setBusy(true); setError("");
    try {
      const saved = await addDealNote(companyId, body.trim(), { anchor: composer.label, mentions, parent_id: threadNote?.id ?? null, position_x: composer.x, position_y: composer.y });
      setMarkers((current) => current.some((marker) => marker.id === (threadNote?.id ?? saved.id)) ? current : [...current, { id: threadNote?.id ?? saved.id, label: composer.label, x: composer.x, y: composer.y }]);
      await refresh(); setComposer(null); setBody("");
    } catch (caught) { setError(userError(caught, "company")); }
    finally { setBusy(false); }
  }

  return <div className={styles.commentsRoot} onContextMenu={handleContext} onDoubleClick={handleDoubleClick}>
    {children}
    <button type="button" className={styles.launcher} data-comments-ui onClick={() => openComposer({ label: "Company analysis", x: Math.max(16, window.innerWidth - 390), y: Math.max(16, window.innerHeight - 310) })} title="Open team comments"><MessageCircle size={15} />{workspace?.notes.length ? <b>{workspace.notes.length}</b> : null}</button>
    {menu && <div className={styles.contextMenu} data-comments-ui style={{ left: Math.min(menu.x, window.innerWidth - 190), top: Math.min(menu.y, window.innerHeight - 72) }}><strong>{menu.label}</strong><button type="button" onClick={() => openComposer(menu)}>Add comment</button></div>}
    {markers.map((marker) => <button key={marker.id} type="button" className={styles.marker} data-comments-ui style={{ left: marker.x + 8, top: marker.y - 10 }} onClick={() => openComposer(marker, workspace?.notes.find((note) => note.id === marker.id) ?? null)} title={`Comment on ${marker.label}`} aria-label={`Comment on ${marker.label}`}><MessageCircle size={16} /></button>)}
    {composer && <div className={styles.composer} data-comments-ui style={{ left: Math.min(Math.max(composer.x, 16), Math.max(16, window.innerWidth - 386)), top: Math.min(Math.max(composer.y, 16), Math.max(16, window.innerHeight - 360)) }}>
      <header><div><strong>{threadNote ? "Comment thread" : "Add comment"}</strong><small>On {composer.label}</small></div><button type="button" onClick={() => setComposer(null)} aria-label="Close comments"><X size={15} /></button></header>
      {threadNote && <div className={styles.thread}><div className={styles.threadComment}><p>{threadNote.body}</p><small>{threadNote.author_id} · {threadNote.status}</small></div>{workspace?.notes.filter((note) => note.parent_id === threadNote.id).map((note) => <div className={styles.threadReply} key={note.id}><p>{note.body}</p><small>{note.author_id} · {note.status}</small></div>)}<button type="button" className={styles.resolve} onClick={async () => { setBusy(true); try { await updateDealNote(companyId, threadNote, threadNote.status === "resolved" ? "open" : "resolved"); await refresh(); setThreadNote((current) => current ? { ...current, status: current.status === "resolved" ? "open" : "resolved", version: current.version + 1 } : current); } catch (caught) { setError(userError(caught, "company")); } finally { setBusy(false); } }}>{threadNote.status === "resolved" ? "Reopen comment" : "Mark resolved"}</button></div>}
      <form onSubmit={submit}><div className={styles.textareaWrap}><textarea ref={textareaRef} autoFocus value={body} onChange={(event) => updateBody(event.target.value, event.target.selectionStart)} placeholder="Share an observation with the deal team... Type @ to tag someone" rows={4} />{mentionQuery !== null && <div className={styles.mentionMenu}>{(workspace?.members ?? []).filter((member) => (member.display_name || member.user_id).toLowerCase().includes(mentionQuery)).map((member) => <button key={member.user_id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => selectMention(member.user_id, member.display_name || member.user_id)}>{member.display_name || member.user_id}<small>{member.role}</small></button>)}</div>}</div>
        <div className={styles.mentions}>{mentions.length > 0 && <span>Tagged teammates</span>}{(workspace?.members ?? []).filter((member) => mentions.includes(member.user_id)).map((member) => <button key={member.user_id} type="button" data-active="true" onClick={() => setMentions((current) => current.filter((id) => id !== member.user_id))}>@{member.display_name || member.user_id}</button>)}</div>
        {error && <p className={styles.error}>{error}</p>}<button className={styles.submit} type="submit" disabled={busy || !body.trim()}><Send size={14} />{busy ? "Saving" : "Comment"}</button>
      </form>
    </div>}
  </div>;
}
