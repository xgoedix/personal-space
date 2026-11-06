/** Isolated visual preview: in-memory fixtures, no network, no credentials, no AI claims. */
import type { Memory, Note, Task } from '@talorys/shared';
import { SAVED_MARKER } from './model';
const stamp = new Date().toISOString();
const at = (hour: number) => { const d = new Date(); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
const base = { created_at: stamp, updated_at: stamp };
const tasks: Task[] = [
  { ...base, id: 'demo-task-1', title: 'Un paseo sin prisa', description: 'Salir un rato. Dejar el móvil en el bolsillo.', due_at: at(19), status: 'todo', priority: 'medium', project_id: null, completed_at: null },
  { ...base, id: 'demo-task-2', title: 'Comprar detergente', description: 'Para la próxima colada.', due_at: at(20), status: 'todo', priority: 'low', project_id: null, completed_at: null },
];
const notes: Note[] = [
  { ...base, id: 'demo-note-1', title: 'Una escapada al norte', content: 'Una casa cerca del mar. Un libro que no mire el reloj.\n\nBuscar un fin de semana para perderse un poco.', project_id: null },
  { ...base, id: 'demo-note-2', title: 'Menos, pero mejor.', content: 'Hacer espacio para las cosas que de verdad importan.\n\nUna idea para volver a ella.', project_id: null },
  { ...base, id: 'demo-note-3', title: 'Ese bolso de verano', content: `${SAVED_MARKER}\nLino natural, forma sencilla y espacio para lo esencial.\nUna referencia para más adelante.`, project_id: null },
  { ...base, id: 'demo-note-4', title: 'Un lugar al que volver', content: `${SAVED_MARKER}\nLa pequeña librería de la esquina. Volver una tarde con tiempo.`, project_id: null },
];
const memories: Memory[] = [{ ...base, id: 'demo-person-1', content: 'El cumpleaños de Gabo es el 14 de febrero.', category: 'person', source: 'manual', status: 'active', superseded_by: null, valid_from: null, valid_until: null }];
export async function previewApi(path: string, init: { method?: string; body?: unknown } = {}): Promise<unknown> {
  const url = new URL(path, 'https://preview.invalid');
  const method = init.method ?? 'GET';
  const p = url.pathname;
  if (p === '/auth/session') return { authenticated: true, configured: true, agent_name: 'Personal Space', theme: 'light', language: 'es' };
  if (p === '/settings' && method === 'GET') return { settings: { agentName: 'Talorys', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, theme: 'light', language: 'es', demoMode: true } };
  if (p === '/notifications') return { notifications: [], unread: 0 };
  if (p === '/conversations' && method === 'GET') return { conversations: [] };
  if (p === '/automations' && method === 'GET') return { automations: [], runs: [], failed_runs: [], timezone: 'Europe/Madrid' };
  if (p === '/projects') return { projects: [] };
  if (p === '/push') return { available: false, devices: [], public_key: null, max_devices: 0 };
  const [kind, id] = p.slice(1).split('/');
  const collection = kind === 'tasks' ? tasks : kind === 'notes' ? notes : kind === 'memories' ? memories : null;
  const singular = kind === 'memories' ? 'memory' : kind === 'notes' ? 'note' : 'task';
  if (collection) {
    if (method === 'GET') {
      const list = collection.filter(item => {
        if (kind === 'tasks') return url.searchParams.get('view') === 'completed' ? (item as Task).status === 'done' : (item as Task).status !== 'done';
        return true;
      });
      return structuredClone({ [kind!]: list, total: list.length });
    }
    if (method === 'POST' && !id) {
      const body = init.body as Record<string, unknown>;
      const item = { ...base, id: crypto.randomUUID(), description: '', due_at: null, status: kind === 'memories' ? 'active' : 'todo', priority: 'medium', project_id: null, completed_at: null, source: 'manual', superseded_by: null, valid_from: null, valid_until: null, ...body };
      (collection as unknown[]).unshift(item);
      return { [singular]: structuredClone(item) };
    }
    const index = collection.findIndex(item => item.id === id);
    if (index < 0) throw new Error('No encontramos este elemento de ejemplo. Recarga la preview.');
    if (method === 'PATCH') { Object.assign(collection[index]!, init.body, { updated_at: new Date().toISOString() }); return { [singular]: structuredClone(collection[index]) }; }
    if (method === 'DELETE') { collection.splice(index, 1); return { deleted: true }; }
  }
  throw new Error('Esta función necesita una instalación de Talorys. No se ha enviado ni guardado nada en el servidor.');
}
