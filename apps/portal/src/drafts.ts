/*
 * Questionnaire drafts (問卷草稿). Answers are saved to the account as the person goes (PUT …/draft), so a session
 * that lapses mid-questionnaire, or another phone, carries on where they stopped; 重新填寫 deletes the draft, and the
 * API deletes it when the questionnaire is sent. The API leaves the format to us: { v, step, answers }, read back
 * defensively since a draft may come from an older version of the portal.
 */
import type { TenantPaths } from '@yutis/api-client';

export type DraftKind = TenantPaths['/api/portal/tasks/{kind}/{id}/draft']['put']['parameters']['path']['kind'];

export interface Draft<A> { step: number; answers: A }

/** How one questionnaire's answers are read back, and where to carry on. */
export interface DraftFormat<A> {
  empty: () => A;
  /** The answers, or null when they are not this questionnaire's. Unreadable single answers are dropped. */
  read: (raw: unknown) => A | null;
  /** The first step still to answer (the last step when everything is answered). */
  openStep: (a: A) => number;
}

export const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

const VERSION = 1;

export const encodeDraft = <A>(d: Draft<A>): Record<string, unknown> => ({ v: VERSION, step: d.step, answers: d.answers });

export function decodeDraft<A>(raw: Record<string, unknown> | null | undefined, format: DraftFormat<A>): Draft<A> | null {
  if (!raw || raw.v !== VERSION) return null;
  const answers = format.read(raw.answers);
  if (!answers) return null;
  const saved = typeof raw.step === 'number' && Number.isInteger(raw.step) && raw.step >= 0 ? raw.step : 0;
  // Back where the person was, but never past a question they have not answered.
  return { step: Math.min(saved, format.openStep(answers)), answers };
}

/**
 * Answers not yet saved to the account, kept in memory only (never in browser storage: they are health data). When a
 * save is refused because the session lapsed, the person signs in again without the page reloading, and these are
 * newer than the saved draft. Each entry remembers whose answers they are.
 */
const unsaved = new Map<string, { owner: string; json: string }>();
const keyOf = (kind: DraftKind, id: string) => `${kind}:${id}`;

export function keepUnsaved(kind: DraftKind, id: string, owner: string, json: string) {
  unsaved.set(keyOf(kind, id), { owner, json });
}

/** A save went through: forget the copy, unless the person has changed something since. */
export function settleUnsaved(kind: DraftKind, id: string, json: string) {
  if (unsaved.get(keyOf(kind, id))?.json === json) unsaved.delete(keyOf(kind, id));
}

export function dropUnsaved(kind: DraftKind, id: string) {
  unsaved.delete(keyOf(kind, id));
}

export function unsavedFor(kind: DraftKind, id: string, owner: string): Record<string, unknown> | null {
  const entry = unsaved.get(keyOf(kind, id));
  if (!entry || entry.owner !== owner) return null;
  try {
    const raw: unknown = JSON.parse(entry.json);
    return isRecord(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Signed out, or someone else signed in: nobody else's answers stay in memory. */
export function forgetUnsaved(keepOwner?: string) {
  for (const [key, entry] of unsaved) if (entry.owner !== keepOwner) unsaved.delete(key);
}

/** Where a questionnaire starts: unsaved answers from this page's memory, else the saved draft, else nothing. */
export function restoreDraft<A>(saved: Record<string, unknown> | null | undefined, memory: Record<string, unknown> | null, format: DraftFormat<A>):
  { draft: Draft<A>; from: 'memory' | 'saved' } | null {
  const fromMemory = decodeDraft(memory, format);
  if (fromMemory) return { draft: fromMemory, from: 'memory' };
  const fromSaved = decodeDraft(saved, format);
  return fromSaved ? { draft: fromSaved, from: 'saved' } : null;
}
