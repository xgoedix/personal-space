import type { Note, Task } from '@talorys/shared';

export const PREVIEW = import.meta.env.VITE_PERSONAL_PREVIEW === 'true';
export const SAVED_MARKER = '#personal-space/guardado';
export function isSaved(note: Note): boolean { return note.content.split('\n')[0]?.trim() === SAVED_MARKER; }
export function noteBody(note: Note): string { return isSaved(note) ? note.content.split('\n').slice(1).join('\n').trimStart() : note.content; }
export function dayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function isDue(task: Task, now: Date, timeZone: string): boolean {
  return task.status !== 'done' && !!task.due_at && dayKey(new Date(task.due_at), timeZone) <= dayKey(now, timeZone);
}
export function safeLink(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>]+/i);
  if (!match) return null;
  try { const url = new URL(match[0]); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
export function dateLabel(date: string | null, timeZone: string): string {
  return date ? new Intl.DateTimeFormat('es-ES', { timeZone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(date)) : 'Sin fecha';
}
