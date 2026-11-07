import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowUpRight, ChevronLeft, ChevronRight, Plus, Check, Cake, Bell, Circle } from 'lucide-react';
import type { TodayEntry, TodayCalendarData, Task, Automation, ScheduleSpec } from '@talorys/shared';
import { scheduleSpecSchema, computeNextRun } from '@talorys/shared';
import { api } from '../lib/api';
import { useSettings, useApiMutation, keys } from '../hooks/queries';
import { Button, Dialog } from '../components/ui';
import { BirthdayEditor } from './Bicho';
import { calendarRange, dateLabel, localMinute, rangeDays, shiftPeriod, taskInstant, type CalendarView } from './calendar-model';
import './today-calendar.css';

const invalidate = [['today-calendar'],keys.tasks,keys.automations,['birthdays']];
const labels = {task:'Tarea',reminder:'Recordatorio',birthday:'Cumpleaños'};
const icons = {task:Circle,reminder:Bell,birthday:Cake};
const views: [CalendarView,string][] = [['day','Día'],['week','Semana'],['month','Mes']];
function Failure({error}:{error:unknown}) {return error ? <p role="alert" className="form-error">{error instanceof Error ? error.message : 'No se ha podido guardar. Inténtalo de nuevo.'}</p> : null;}

export function TodayCalendar() {
  const settings=useSettings();
  const timezone=settings.data?.timezone ?? 'Europe/Madrid';
  const today=localMinute(new Date().toISOString(),timezone).slice(0,10);
  const [chosen,setChosen]=useState<string|null>(null);
  const selected=chosen ?? today;
  const [view,setView]=useState<CalendarView>('month');
  const [edit,setEdit]=useState<TodayEntry|'new'|null>(null);
  const [search,setSearch]=useState('');
  const range=calendarRange(selected,view);
  const qc=useQueryClient();
  const query=useQuery({queryKey:['today-calendar',range.from,range.to,timezone],enabled:!!settings.data,
    queryFn:()=>api<TodayCalendarData>(`/today/calendar?from=${range.from}&to=${range.to}`),refetchInterval:30_000,staleTime:0});
  const entries=(query.data?.entries ?? []).filter(e=>e.title.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')));
  const undated=(query.data?.undated ?? []).filter(t=>t.title.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')));
  const grouped=(day:string)=>entries.filter(e=>e.date===day);
  const complete=useApiMutation((task:Task)=>api(`/tasks/${task.id}`,{method:'PATCH',body:{status:task.status==='done'?'todo':'done'}}),{invalidate,success:'Tarea actualizada.'});
  const close=()=>{setEdit(null);void qc.invalidateQueries({queryKey:['today-calendar']});};
  const title=view==='month' ? dateLabel(selected,{month:'long',year:'numeric'}) : view==='week' ? `${dateLabel(range.from,{day:'numeric',month:'short'})} — ${dateLabel(range.to,{day:'numeric',month:'short',year:'numeric'})}` : dateLabel(selected,{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const move=(direction:number)=>setChosen(shiftPeriod(selected,view,direction));
  function eventRow(entry:TodayEntry) {
    const Icon=icons[entry.kind];
    const done=entry.kind==='task'&&entry.item.status==='done';
    const paused=entry.kind==='reminder'&&!entry.item.enabled&&entry.item.status!=='completed';
    const time=new Intl.DateTimeFormat('es-ES',{timeZone:timezone,hour:'2-digit',minute:'2-digit'}).format(new Date(entry.start));
    return <article className={`today-event today-${entry.kind}${done?' is-complete':''}`} key={entry.key}>
      {entry.kind==='task' ? <button type="button" className="today-check" aria-label={`${done?'Reabrir':'Completar'} ${entry.title}`} disabled={complete.isPending} onClick={()=>complete.mutate(entry.item)}>{done?<Check size={16}/>:<Circle size={16}/>}</button> : <Icon size={17} aria-hidden="true"/>}
      <button type="button" className="today-event-open" aria-label={`Editar ${labels[entry.kind].toLowerCase()}: ${entry.title}`} onClick={()=>setEdit(entry)}><span className="today-event-meta">{labels[entry.kind]}{entry.kind!=='birthday'&&` · ${time}`}{paused?' · Pausado':''}{done?' · Hecha':''}{entry.kind==='reminder'&&entry.item.status==='completed'?' · Finalizado':''}</span><strong>{entry.title}</strong></button><ArrowUpRight size={15} aria-hidden="true"/>
    </article>;
  }
  function agenda(day:string,heading=true) {
    const events=grouped(day);
    return <section className="today-agenda" key={day} aria-label={dateLabel(day)}>{heading&&<button type="button" className={`today-day-title${day===today?' is-today':''}`} onClick={()=>{setChosen(day);setView('day');}}>{dateLabel(day)}{day===today&&<span>Hoy</span>}</button>}{events.length ? events.map(eventRow) : <p className="today-empty">{search?'Sin coincidencias.':'Nada programado.'}</p>}</section>;
  }
  return <div className="collection-page tone-coral today-calendar"><div className="section-pigment" aria-hidden="true"/><Link to="/" className="back-link"><ArrowLeft size={16}/> Mi espacio</Link><header className="page-heading"><h1>Hoy</h1><button type="button" className="dark-button" onClick={()=>setEdit('new')}><Plus size={17}/><span>Añadir tarea</span></button></header>
    <div className="today-toolbar"><div className="space-tabs" role="group" aria-label="Vista del calendario">{views.map(([value,label])=><button type="button" key={value} aria-pressed={view===value} onClick={()=>setView(value)}>{label}</button>)}</div><button type="button" className="today-return" onClick={()=>setChosen(today)}>Ir a hoy</button></div>
    <div className="today-period"><button type="button" className="round-button" aria-label="Periodo anterior" onClick={()=>move(-1)}><ChevronLeft size={20}/></button><h2 aria-live="polite">{title}</h2><button type="button" className="round-button" aria-label="Periodo siguiente" onClick={()=>move(1)}><ChevronRight size={20}/></button></div>
    <div className="today-options"><label>Ir a fecha<input aria-label="Ir a fecha" type="date" min="1901-01-01" max="2198-12-31" value={selected} onChange={e=>e.target.value&&setChosen(e.target.value)}/></label><label className="today-search">Buscar<input aria-label="Buscar en calendario" type="search" placeholder="En estas fechas…" value={search} onChange={e=>setSearch(e.target.value)}/></label></div>
    <div className="today-legend" role="group" aria-label="Tipos de elemento">{Object.entries(labels).map(([kind,label])=><span key={kind}><i className={`today-dot today-${kind}`}/>{label}</span>)}<small>{timezone}</small></div>
    {(query.isPending||settings.isPending)&&<p role="status" className="query-notice">Cargando calendario…</p>}
    {(query.error||settings.error)&&<div role="alert" className="query-notice error">No se ha podido actualizar el calendario. <button type="button" onClick={()=>{void query.refetch();void settings.refetch();}}>Volver a intentar</button></div>}
    {query.data&&!query.error&&<><div className={`today-view today-view-${view}`} data-testid={`calendar-${view}`}>
      {view==='month'&&<><div className="today-weekdays" aria-hidden="true">{['L','M','X','J','V','S','D'].map(d=><span key={d}>{d}</span>)}</div><div className="today-month" role="group" aria-label="Días del mes">{rangeDays(range.from,range.to).map(day=>{const events=grouped(day);return <button type="button" key={day} aria-label={`${dateLabel(day,{weekday:'long',day:'numeric',month:'long',year:'numeric'})}, ${events.length} elementos`} aria-pressed={selected===day} aria-current={day===today?'date':undefined} className={`today-date${day.slice(0,7)!==selected.slice(0,7)?' is-outside':''}`} onClick={()=>setChosen(day)}><span>{Number(day.slice(-2))}</span><span className="today-date-marks" aria-hidden="true">{(['task','reminder','birthday'] as const).filter(kind=>events.some(e=>e.kind===kind)).map(kind=><i key={kind} className={`today-dot today-${kind}`}/>)}{events.length>0&&<small>{events.length}</small>}</span></button>;})}</div>{agenda(selected)}</>}
      {view==='week'&&<div className="today-week">{rangeDays(range.from,range.to).map(day=>agenda(day))}</div>}
      {view==='day'&&agenda(selected,false)}
    </div>{query.data.truncated&&<p role="status" className="query-notice">Hay más elementos de los que caben en esta consulta. Usa la vista Día o consulta todas las <Link to="/tasks">tareas</Link> y los <Link to="/automations">recordatorios</Link>.</p>}
    {undated.length>0&&<details className="today-undated"><summary>Sin fecha <span>{undated.length}</span></summary>{undated.map(item=><article key={item.id} className={`today-event today-task${item.status==='done'?' is-complete':''}`}><button type="button" className="today-check" disabled={complete.isPending} aria-label={`${item.status==='done'?'Reabrir':'Completar'} ${item.title}`} onClick={()=>complete.mutate(item)}>{item.status==='done'?<Check size={16}/>:<Circle size={16}/>}</button><button type="button" className="today-event-open" onClick={()=>setEdit({kind:'task',item,title:item.title,key:`task:${item.id}`,date:'',start:''})}><span className="today-event-meta">Tarea · Sin fecha</span><strong>{item.title}</strong></button><ArrowUpRight size={15}/></article>)}</details>}</>}
    <div className="today-links"><Link className="text-link" to="/automations">Ver todos y editar <ArrowUpRight size={15}/></Link><Link className="text-link" to="/chat">Pedir un recordatorio <ArrowUpRight size={15}/></Link></div>
    {edit==='new'&&<TaskEditor initialDate={selected} timezone={timezone} onClose={close}/>}
    {edit&&edit!=='new'&&edit.kind==='task'&&<TaskEditor task={edit.item} initialDate={selected} timezone={timezone} onClose={close}/>}
    {edit&&edit!=='new'&&edit.kind==='reminder'&&<ReminderEditor reminder={edit.item} timezone={timezone} onClose={close}/>}
    {edit&&edit!=='new'&&edit.kind==='birthday'&&<BirthdayEditor value={edit.item} onClose={close}/>}
  </div>;
}

function TaskEditor({task,initialDate,timezone,onClose}:{task?:Task;initialDate:string;timezone:string;onClose:()=>void}) {
  const [title,setTitle]=useState(task?.title??'');
  const [description,setDescription]=useState(task?.description??'');
  const initialDue=task ? task.due_at?localMinute(task.due_at,timezone):'' : `${initialDate}T09:00`;
  const [due,setDue]=useState(initialDue);
  const [status,setStatus]=useState<Task['status']>(task?.status??'todo');
  const save=useApiMutation(()=>api(`/tasks${task?`/${task.id}`:''}`,{method:task?'PATCH':'POST',body:{title:title.trim(),description,status,...(!task||due!==initialDue?{due_at:taskInstant(due,timezone)}:{})}}),{invalidate,quiet:true,onSuccess:onClose,success:'Tarea guardada.'});
  return <Dialog open onClose={()=>!save.isPending&&onClose()} title={task?'Editar tarea':'Añadir tarea'}><form className="space-form" onSubmit={e=>{e.preventDefault();save.mutate(undefined);}}><label>Título<input autoFocus required maxLength={300} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>Descripción<textarea maxLength={10000} value={description} onChange={e=>setDescription(e.target.value)}/></label><label>Fecha y hora<input type="datetime-local" value={due} onChange={e=>setDue(e.target.value)}/></label><p className="section-hint">{timezone}. Deja la fecha vacía si todavía no la sabes. Una tarea no genera una notificación.</p><label>Estado<select value={status} onChange={e=>setStatus(e.target.value as Task['status'])}><option value="todo">Pendiente</option><option value="in_progress">En curso</option><option value="done">Completada</option></select></label><Failure error={save.error}/><Button type="submit" loading={save.isPending}>Guardar tarea</Button></form></Dialog>;
}

function ReminderEditor({reminder:a,timezone,onClose}:{reminder:Automation;timezone:string;onClose:()=>void}) {
  const [name,setName]=useState(a.name),[message,setMessage]=useState(a.message),[enabled,setEnabled]=useState(a.enabled);
  const [schedule,setSchedule]=useState<ScheduleSpec>(a.schedule);
  const patch=(value:object)=>setSchedule({...schedule,...value} as ScheduleSpec);
  const save=useApiMutation(()=>{
    if(!name.trim()||!message.trim())throw Error('Escribe un título y un mensaje para el recordatorio.');
    const parsed=scheduleSpecSchema.safeParse(schedule);
    if(!parsed.success)throw Error('Revisa la fecha, la hora y los días de repetición.');
    if(enabled&&(!a.enabled||JSON.stringify(schedule)!==JSON.stringify(a.schedule))&&!computeNextRun(parsed.data,timezone,new Date()))throw Error('Esa fecha ya ha pasado. Elige una fecha futura para activar el aviso.');
    const body={...(name!==a.name?{name:name.trim()}:{}),...(message!==a.message?{message}:{}),...(enabled!==a.enabled?{enabled}:{}),...(JSON.stringify(schedule)!==JSON.stringify(a.schedule)?{schedule:parsed.data}:{})};
    return api(`/automations/${a.id}`,{method:'PATCH',body});
  },{invalidate,quiet:true,onSuccess:onClose,success:'Recordatorio guardado.'});
  const recurring=schedule.type!=='once';
  return <Dialog open onClose={()=>!save.isPending&&onClose()} title="Editar recordatorio"><form className="space-form" onSubmit={e=>{e.preventDefault();save.mutate(undefined);}}><label>Título<input autoFocus required maxLength={200} value={name} onChange={e=>setName(e.target.value)}/></label><label>Mensaje<textarea required maxLength={2000} value={message} onChange={e=>setMessage(e.target.value)}/></label>
    {recurring&&<p className="section-hint">Los cambios se aplican a toda la serie. Se conserva su repetición {({daily:'diaria',weekly:'semanal',monthly:'mensual',yearly:'anual',interval:'por intervalo'} as const)[schedule.type]}.</p>}
    {schedule.type==='once'&&<label>Fecha y hora<input required type="datetime-local" value={schedule.at} onChange={e=>patch({at:e.target.value})}/></label>}
    {'time'in schedule&&<label>Hora<input required type="time" value={schedule.time} onChange={e=>patch({time:e.target.value})}/></label>}
    {schedule.type==='weekly'&&<fieldset className="today-repeat"><legend>Días de la semana</legend>{['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'].map((label,i)=><label key={label}><input type="checkbox" checked={schedule.days.includes(i)} onChange={e=>patch({days:e.target.checked?[...schedule.days,i]:schedule.days.filter(d=>d!==i)})}/>{label}</label>)}</fieldset>}
    {(schedule.type==='monthly'||schedule.type==='yearly')&&<label>Día del mes<input required type="number" min={1} max={31} value={schedule.day} onChange={e=>patch({day:Number(e.target.value)})}/></label>}
    {schedule.type==='yearly'&&<label>Mes<input required type="number" min={1} max={12} value={schedule.month} onChange={e=>patch({month:Number(e.target.value)})}/></label>}
    {schedule.type==='interval'&&<label>Intervalo en minutos<input required type="number" min={15} max={44640} value={schedule.minutes} onChange={e=>patch({minutes:Number(e.target.value)})}/></label>}
    <p className="section-hint">{schedule.type==='yearly'?schedule.timezone??timezone:timezone}{schedule.type==='monthly'?' · Los días que no existen se trasladan al último día del mes.':''}{schedule.type==='yearly'?' · El 29 de febrero se avisa el 28 en años no bisiestos.':''}</p><label className="today-enabled"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> Aviso activo</label><Failure error={save.error}/><Button type="submit" loading={save.isPending}>Guardar recordatorio</Button></form></Dialog>;
}
