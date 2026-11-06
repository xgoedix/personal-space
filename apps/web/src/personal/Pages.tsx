import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowUpRight, ArrowRight, Plus, Check, Search, ExternalLink, Trash2, Clock3, LockKeyhole, Smartphone, ArrowLeft } from 'lucide-react';
import type { Memory, Note, Task } from '@talorys/shared';
import { api } from '../lib/api';
import { keys, useApiMutation, useTasks, useNotes, useMemories, useTimezone, useAutomations } from '../hooks/queries';
import { useSession } from '../hooks/session';
import { Dialog, Button } from '../components/ui';
import { PushNotificationsCard } from '../components/PushNotificationsCard';
import { PREVIEW, isSaved, noteBody, isDue, dateLabel, safeLink, SAVED_MARKER } from './model';
import { SpaceMark } from './Shell';

type Section = 'today' | 'people' | 'saved' | 'ideas';
const sections = {
  today: { title: 'Hoy', label: 'HOY', action: 'Añadir tarea', color: 'coral' },
  people: { title: 'Personas', label: 'PERSONAS', action: 'Añadir recuerdo', color: 'yellow' },
  saved: { title: 'Guardado', label: 'GUARDADO', action: 'Guardar algo', color: 'blue' },
  ideas: { title: 'Ideas', label: 'IDEAS', action: 'Nueva idea', color: 'lavender' },
};
function QueryNotice({ error, loading, retry }: { error: unknown; loading: boolean; retry: () => void }) {
  if (loading) return <p role="status" className="query-notice">Preparando tu espacio...</p>;
  return error ? <div role="alert" className="query-notice error">No hemos podido cargar tus datos. <button onClick={retry}>Volver a intentar</button></div> : null;
}
export function HomePage() {
  const tasks = useTasks();
  const notes = useNotes();
  const people = useMemories(undefined, 'active');
  const automations = useAutomations();
  const timezone = useTimezone();
  const now = new Date();
  const due = (tasks.data ?? []).filter(t => isDue(t, now, timezone)).sort((a, b) => (a.due_at ?? '').localeCompare(b.due_at ?? ''));
  const nextReminder = (automations.data?.automations ?? []).filter(a => a.enabled && a.next_run).sort((a, b) => a.next_run!.localeCompare(b.next_run!))[0];
  const loading = tasks.isPending || automations.isPending;
  const error = tasks.error || automations.error;
  const counts = [tasks.isSuccess ? due.length : undefined, people.data?.memories.filter(p => p.category === 'person').length, notes.data?.filter(isSaved).length, notes.data?.filter(n => !isSaved(n)).length];
  const countText = (n: number | undefined, noun: string) => n === undefined ? '—' : n === 0 ? `0 ${noun}s` : `${n.toString().padStart(2, '0')} ${noun}${n !== 1 ? 's' : ''}`;
  return <div className="home-layout">
    <section className="home-intro"><div className="eyebrow date-line"><span className="tiny-sun"/>{new Intl.DateTimeFormat('es-ES', { timeZone: timezone, weekday: 'long', day: 'numeric', month: 'long' }).format(now)}</div><h1>Hola, Diego<span className="coral-dot">.</span></h1><p className="home-summary">{loading ? 'Cargando tus pendientes…' : error ? 'Tu día estará aquí cuando recuperemos la conexión.' : due.length ? <>Tienes {due.length} {due.length === 1 ? 'tarea pendiente' : 'tareas pendientes'} para hoy.</> : 'No tienes tareas pendientes para hoy.'}</p></section>
    <nav className="universe" aria-label="Tu universo personal"><div className="pigments" aria-hidden="true"><i className="pigment coral"/><i className="pigment yellow"/><i className="pigment blue"/><i className="pigment lavender"/></div>{(['today', 'people', 'saved', 'ideas'] as Section[]).map((section, i) => <Link to={`/${section}`} key={section} className={`orbit orbit-${section}`}><span className="orbit-label">{sections[section].label}<ArrowUpRight size={15}/></span><span className="orbit-count">{countText(counts[i], i === 0 ? 'pendiente' : i === 1 ? 'recuerdo' : i === 2 ? 'hallazgo' : 'idea')}</span></Link>)}</nav>
    <section className="today-glance"><div className="glance-heading"><span className="eyebrow">A MANO</span><Link to="/today" aria-label="Ver tareas y recordatorios"><ArrowUpRight size={18}/></Link></div><QueryNotice error={error} loading={loading} retry={() => { void tasks.refetch(); void automations.refetch(); }}/>{!loading && !error && <Link to="/today" className="glance-item"><span className="glance-dot"/><span><strong>{due[0]?.title ?? nextReminder?.name ?? 'No hay tareas ni recordatorios próximos.'}</strong><small>{due[0] ? dateLabel(due[0].due_at, timezone) : nextReminder ? dateLabel(nextReminder.next_run, timezone) : ''}</small></span><ArrowRight size={18}/></Link>}</section>
  </div>;
}

export function CollectionPage({ section }: { section: Section }) {
  const meta = sections[section];
  const tasks = useTasks();
  const notes = useNotes();
  const memories = useMemories(undefined, 'active');
  const automations = useAutomations();
  const timezone = useTimezone();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('today');
  const [editing, setEditing] = useState<Task | Note | Memory | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Task | Note | Memory | null>(null);
  const query = section === 'today' ? tasks : section === 'people' ? memories : notes;
  const today = new Date();
  const all = section === 'today' ? (tasks.data ?? []).filter(t => tab === 'done' ? t.status === 'done' : tab === 'upcoming' ? t.status !== 'done' && !isDue(t, today, timezone) : isDue(t, today, timezone)) : section === 'people' ? (memories.data?.memories ?? []).filter(m => m.category === 'person') : (notes.data ?? []).filter(n => section === 'saved' ? isSaved(n) : !isSaved(n));
  const items = all.filter(item => ('title' in item ? item.title + ('content' in item ? item.content : item.description) : item.content).toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')));
  const invalidate = [keys.tasks, ['notes'], ['memories'], keys.automations];
  const complete = useApiMutation((task: Task) => api(`/tasks/${task.id}`, { method: 'PATCH', body: { status: task.status === 'done' ? 'todo' : 'done' } }), { invalidate, success: PREVIEW ? 'Tarea de ejemplo actualizada. Solo en esta preview.' : 'Tarea actualizada.' });
  const endpoint = section === 'today' ? 'tasks' : section === 'people' ? 'memories' : 'notes';
  const remove = useApiMutation((id: string) => api(`/${endpoint}/${id}`, { method: 'DELETE' }), { invalidate, onSuccess: () => setDeleting(null), success: PREVIEW ? 'Ejemplo eliminado de esta preview.' : 'Elemento eliminado.' });
  return <div className={`collection-page tone-${meta.color}`}><div className="section-pigment" aria-hidden="true"/><Link to="/" className="back-link"><ArrowLeft size={16}/> Mi espacio</Link><header className="page-heading"><h1>{meta.title}</h1></header><div className="collection-tools"><label className="space-search"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Encontrar algo..." aria-label={`Buscar en ${meta.label.toLowerCase()}`}/></label><button className="dark-button" onClick={() => setEditing('new')}><Plus size={18}/><span>{meta.action}</span></button></div>
    {section === 'today' && <div className="space-tabs" aria-label="Filtrar tareas">{[['today', 'Hoy'], ['upcoming', 'Después'], ['done', 'Hecho']].map(([value, label]) => <button key={value} aria-pressed={tab === value} onClick={() => setTab(value!)}>{label}</button>)}</div>}
    <QueryNotice error={query.error} loading={query.isPending} retry={() => void query.refetch()}/>
    {!query.isPending && !query.error && <><div className={`editorial-grid ${section === 'today' ? 'task-list' : ''}`}>{items.map((item, index) => <article className={`editorial-card card-${index % 4} ${'status' in item && item.status === 'done' ? 'is-done' : ''}`} key={item.id}>
      {'due_at' in item && <button className="task-check" disabled={complete.isPending} aria-label={`${item.status === 'done' ? 'Reabrir' : 'Completar'} ${item.title}`} onClick={() => complete.mutate(item)}>{item.status === 'done' && <Check size={16}/>}</button>}
      <button className="card-open" onClick={() => setEditing(item)}><span className="card-kicker eyebrow">{section === 'today' ? dateLabel((item as Task).due_at, timezone) : section === 'people' ? 'RECUERDO' : section === 'saved' ? 'GUARDADO' : 'NOTA'}</span><h2>{'title' in item ? item.title : item.content}</h2>{'content' in item && 'title' in item && <p>{noteBody(item)}</p>}{'description' in item && item.description && <p>{item.description}</p>}<span className="card-arrow"><ArrowUpRight size={20}/></span></button>
      <button className="card-delete" aria-label={`Eliminar ${'title' in item ? item.title : 'recuerdo'}`} onClick={() => setDeleting(item)}><Trash2 size={15}/></button>
    </article>)}</div>{!items.length && <div className="space-empty"><SpaceMark/><h2>{search ? 'Sin resultados.' : 'No hay elementos.'}</h2><p>{search ? 'Prueba con otra palabra.' : section === 'today' ? 'Añade una tarea o pide un recordatorio al asistente.' : 'Puedes añadir el primero aquí o pedirlo al asistente.'}</p></div>}</>}
    {section === 'today' && <section className="reminder-section"><h2><Clock3 size={18}/> Próximos recordatorios</h2><QueryNotice error={automations.error} loading={automations.isPending} retry={() => void automations.refetch()}/>{automations.data?.automations.filter(a => a.enabled).map(a => <div className="reminder-row" key={a.id}><span>{a.name}</span><time>{dateLabel(a.next_run, timezone)}</time></div>)}{automations.data && !automations.data.automations.some(a => a.enabled) && <p>Aún no hay recordatorios activos.</p>}<Link className="text-link" to="/chat">Pedir un recordatorio al asistente <ArrowUpRight size={15}/></Link><p className="section-hint">Las tareas y los recordatorios son independientes. Para recibir un aviso, pídeselo al asistente.</p></section>}
    {section === 'people' && <p className="section-hint">Estos detalles se conservan como recuerdos. Guardar un cumpleaños no activa un aviso: pide también el recordatorio al asistente.</p>}
    {editing && <EntryEditor section={section} item={editing} onClose={() => setEditing(null)}/>}
    <Dialog open={!!deleting} onClose={() => setDeleting(null)} title="¿Eliminar este elemento?" footer={<><Button variant="ghost" onClick={() => setDeleting(null)}>Conservar</Button><Button onClick={() => deleting && remove.mutate(deleting.id)} loading={remove.isPending}>Eliminar</Button></>}><p>Esta acción elimina el elemento{PREVIEW ? ' de los datos ficticios de esta preview' : ' de Talorys'}. No se puede deshacer.</p></Dialog>
  </div>;
}
function EntryEditor({ section, item, onClose }: { section: Section; item: Task | Note | Memory | 'new'; onClose: () => void }) {
  const existing = item !== 'new' ? item : null;
  const [title, setTitle] = useState(existing && 'title' in existing ? existing.title : '');
  const [content, setContent] = useState(existing ? 'content' in existing ? 'title' in existing ? noteBody(existing) : existing.content : existing.description : '');
  const [due, setDue] = useState('');
  const [changeDate, setChangeDate] = useState(!existing);
  const endpoint = section === 'today' ? 'tasks' : section === 'people' ? 'memories' : 'notes';
  const save = useApiMutation(async () => {
    const body = section === 'people' ? { content: content.trim(), category: 'person' } : section === 'today' ? { title: title.trim(), description: content, ...(changeDate ? { due_at: due ? new Date(due).toISOString() : null } : {}) } : { title: title.trim(), content: section === 'saved' ? `${SAVED_MARKER}\n${content}` : content };
    return api(`/${endpoint}${existing ? `/${existing.id}` : ''}`, { method: existing ? 'PATCH' : 'POST', body });
  }, { invalidate: [keys.tasks, ['notes'], ['memories']], onSuccess: onClose, quiet: true, success: PREVIEW ? 'Ejemplo actualizado. No se guarda en Talorys y se reinicia al recargar.' : 'Guardado en Talorys.' });
  const link = safeLink(content);
  function submit(e: FormEvent) { e.preventDefault(); if ((section === 'people' ? content : title).trim()) save.mutate(undefined); }
  return <Dialog open onClose={onClose} title={existing ? 'Editar' : sections[section].action}><form onSubmit={submit} className="space-form">{section !== 'people' && <label>Título<input autoFocus required value={title} maxLength={300} onChange={e => setTitle(e.target.value)} placeholder={section === 'today' ? '¿Qué quieres hacer?' : 'Dale un nombre'}/></label>}<label>{section === 'people' ? '¿Qué quieres recordar de esta persona?' : section === 'saved' ? 'Detalles o enlace' : 'Tus palabras'}<textarea required={section === 'people'} maxLength={section === 'people' ? 2000 : section === 'today' ? 10000 : 200000} autoFocus={section === 'people'} value={content} onChange={e => setContent(e.target.value)} rows={6} placeholder={section === 'people' ? 'El cumpleaños de… es el…' : 'Escribe aquí…'}/></label>{section === 'today' && <><label>Fecha de la tarea{existing && 'due_at' in existing && existing.due_at && !changeDate && <span className="section-hint">Actual: {new Date(existing.due_at).toLocaleString('es-ES')}</span>}<input type="datetime-local" value={due} onChange={e => { setDue(e.target.value); setChangeDate(true); }}/></label><p className="section-hint">Hora de este dispositivo. Una fecha de tarea no crea una notificación.</p></>}{link && <a className="text-link" href={link} target="_blank" rel="noopener noreferrer">Abrir enlace <ExternalLink size={16}/></a>}{save.error && <p role="alert" className="form-error">{save.error instanceof Error ? save.error.message : 'No se ha podido guardar. Inténtalo de nuevo.'}</p>}<Button type="submit" loading={save.isPending} disabled={!(section === 'people' ? content : title).trim()}>{PREVIEW ? 'Guardar en esta preview' : 'Guardar'}</Button></form></Dialog>;
}
export function SpaceSettings() {
  const { logout } = useSession();
  const navigate = useNavigate();
  return <div className="collection-page settings-page"><Link to="/" className="back-link"><ArrowLeft size={16}/> Mi espacio</Link><header className="page-heading"><h1>Ajustes</h1></header><section className="settings-block"><Smartphone size={22}/><h2>Instalar en el iPhone</h2><p>En Safari, toca Compartir y después «Añadir a la pantalla de inicio». Abre Personal Space desde su icono para usarlo como una aplicación.</p><small>Necesitas conexión para consultar y guardar tus datos.</small></section>{PREVIEW ? <section className="settings-block"><LockKeyhole size={22}/><h2>Estás en una preview.</h2><p>Todos los ejemplos son ficticios. Puedes explorar, añadir y editar; los cambios desaparecen al recargar. La IA y las notificaciones reales no están conectadas.</p></section> : <PushNotificationsCard/>}<section className="settings-block"><SpaceMark/><h2>Privacidad y almacenamiento</h2><p>Personal Space utiliza el motor de Talorys. Tus notas, tareas y recuerdos permanecen en tu propia instalación de Cloudflare.</p><small>Talorys, licencia MIT</small></section>{!PREVIEW && <button className="dark-button" onClick={() => void logout().then(() => navigate('/'))}><LockKeyhole size={17}/> Bloquear mi espacio</button>}</div>;
}
