import { describe, expect, it, vi } from 'vitest';
import type { Note, Task } from '@talorys/shared';
import { dayKey, isDue, isSaved, noteBody, safeLink, SAVED_MARKER } from '../src/personal/model';
import { previewApi } from '../src/personal/preview';
import { api, streamChat } from '../src/lib/api';
import { es } from '../src/lib/i18n/es';
import { en } from '../src/lib/i18n/en';

const task = (due_at: string | null, status = 'todo') => ({ due_at, status }) as Task;
describe('Personal Space data boundaries', () => {
  it('classifies dates using the owner timezone, including overdue tasks', () => {
    const now = new Date('2026-11-06T23:30:00Z');
    expect(dayKey(now, 'Europe/Madrid')).toBe('2026-11-07');
    expect(isDue(task('2026-11-07T15:00:00Z'), now, 'Europe/Madrid')).toBe(true);
    expect(isDue(task('2026-11-07T15:00:00Z'), now, 'America/New_York')).toBe(false);
    expect(isDue(task('2026-11-01T10:00:00Z'), now, 'Europe/Madrid')).toBe(true);
    expect(isDue(task(null), now, 'Europe/Madrid')).toBe(false);
    expect(isDue(task('2026-11-01T10:00:00Z','done'), now, 'Europe/Madrid')).toBe(false);
  });
  it('does not reclassify existing notes containing incidental links or markers', () => {
    const note = { content: `Idea\n${SAVED_MARKER}\nhttps://example.com` } as Note;
    expect(isSaved(note)).toBe(false);
    expect(noteBody(note)).toBe(note.content);
    const saved = { content: `${SAVED_MARKER}\n\nMi enlace` } as Note;
    expect(isSaved(saved)).toBe(true);
    expect(noteBody(saved)).toBe('Mi enlace');
  });
  it('only exposes HTTP(S) links', () => {
    expect(safeLink('javascript:alert(1)')).toBeNull();
    expect(safeLink('file:///etc/passwd')).toBeNull();
    expect(safeLink('Visitar https://example.com/path')).toBe('https://example.com/path');
  });
  it('covers every shared interface translation in Spanish', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });
  it('preview reads and writes stay in memory and never fetch', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    try {
      const response = await previewApi('/notes',{method:'POST',body:{title:'Test aislado',content:'Ejemplo'}}) as { note: Note };
      const result = await previewApi('/notes') as { notes: Note[] };
      expect(result.notes.some(n => n.id === response.note.id)).toBe(true);
      await previewApi(`/notes/${response.note.id}`,{method:'DELETE'});
      expect(fetchMock).not.toHaveBeenCalled();
      await expect(previewApi('/unsupported')).rejects.toThrow('No se ha enviado ni guardado');
    } finally { fetchMock.mockRestore(); }
  });
  it('a backend save failure rejects instead of confirming success', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({error:{code:'INTERNAL_ERROR',message:'No se pudo guardar'}}),{status:500}));
    try { await expect(api('/notes',{method:'POST',body:{title:'No guardar'}})).rejects.toThrow('No se pudo guardar'); } finally { fetchMock.mockRestore(); }
  });
  it('keeps same-origin auth and CSRF headers for real requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({notes:[]})));
    try {
      await api('/notes');
      expect(fetchMock).toHaveBeenCalledWith('/api/notes',expect.objectContaining({credentials:'same-origin',headers:expect.objectContaining({'x-talorys-request':'1'})}));
    } finally { fetchMock.mockRestore(); }
  });
  it('retains streamed backend tool errors without converting them to success', async () => {
    const frame = {type:'error',message:'No se pudo crear la nota'};
    const fetchMock = vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(`data: ${JSON.stringify(frame)}\n\n`,{headers:{'content-type':'text/event-stream'}}));
    try {
      const events: unknown[] = [];
      await streamChat({message:'Guarda mi nota'},event => events.push(event),new AbortController().signal);
      expect(events).toEqual([frame]);
    } finally { fetchMock.mockRestore(); }
  });
});

import { buildSystemPrompt } from '../../agent/src/agent/prompt';
it('instructs the real assistant to ask for essential missing information and use existing storage', () => {
  const prompt = buildSystemPrompt({agentName:'Talorys',timezone:'Europe/Madrid',now:new Date(),autoMemory:false,memories:[]});
  expect(prompt).toContain('ask before saving');
  expect(prompt).toContain('unless the corresponding tool succeeded');
  expect(prompt).toContain('#personal-space/guardado');
  expect(prompt).toContain('category person');
});
