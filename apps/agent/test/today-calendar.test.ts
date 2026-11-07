import { describe, it, expect } from 'vitest';
import { inAgent, loggedIn, client, bearer } from './helpers';
import type { TodayCalendarData } from '@talorys/shared';
const unique=()=>`PRUEBA calendario ${crypto.randomUUID()}`;
const calendar=(c:Awaited<ReturnType<typeof loggedIn>>,from:string,to=from)=>c.json<TodayCalendarData>(`/api/today/calendar?from=${from}&to=${to}`);

describe('calendario privado de Hoy',()=>{
  it('requiere sesión, rechaza tokens de Siri y valida fechas y límites de rango',async()=>{
    expect((await client().call('/api/today/calendar?from=2030-11-07&to=2030-11-07')).status).toBe(401);
    const c=await loggedIn();
    for(const range of ['from=2030-02-30&to=2030-03-01','from=2030-11-08&to=2030-11-07','from=2030-01-01&to=2030-12-31','from=no&to=no'])expect((await c.call('/api/today/calendar?'+range)).status).toBe(400);
    await inAgent(async a=>{
      a.services.remote.setEnabled(true);
      const token=await a.services.remote.create({name:unique(),scope:'write',capability:'capture'});
      expect((await bearer(token.token).call('/api/today/calendar?from=2030-11-07&to=2030-11-07')).status).toBe(403);
    });
  });
  it('asigna tareas en la zona del propietario, incluye completadas y separa las que no tienen fecha',async()=>{
    const c=await loggedIn();
    let id='',undated='';
    await inAgent(a=>{
      a.services.settings.update({timezone:'Europe/Madrid'});
      id=a.services.tasks.create({title:unique(),due_at:'2030-11-08T00:30:00+01:00',status:'done'}).id;
      undated=a.services.tasks.create({title:unique()}).id;
    });
    expect((await calendar(c,'2030-11-07')).entries.some(e=>e.item.id===id)).toBe(false);
    const result=await calendar(c,'2030-11-08');
    expect(result.entries.find(e=>e.item.id===id)).toMatchObject({kind:'task',date:'2030-11-08',start:'2030-11-07T23:30:00.000Z',item:{status:'done'}});
    expect(result.undated.some(t=>t.id===undated)).toBe(true);
  });
  it('proyecta los cumpleaños anuales sin duplicar sus avisos ni cambiar el scheduler',async()=>{
    const c=await loggedIn();
    const {birthday:b}=await c.json<any>('/api/birthdays',{method:'POST',body:{name:unique(),day:29,month:2}});
    const before=await inAgent(a=>a.services.automations.get(b.automation_id));
    for(const [year,day] of [[2031,'28'],[2032,'29']] as const){
      const result=await calendar(c,`${year}-02-01`,`${year}-03-07`);
      const entries=result.entries.filter(e=>e.item.id===b.id||e.item.id===b.automation_id);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({kind:'birthday',date:`${year}-02-${day}`,start:`${year}-02-${day}T10:00:00.000Z`});
    }
    expect(await inAgent(a=>a.services.automations.get(b.automation_id))).toEqual(before);
  });
  it('mantiene el horario local al cruzar DST y ancla los intervalos al aviso real',async()=>{
    const c=await loggedIn();
    const ids=await inAgent(async a=>{
      const daily=await a.services.automations.create({name:unique(),kind:'reminder',message:'PRUEBA',schedule:{type:'daily',time:'11:00'},enabled:true});
      const interval=await a.services.automations.create({name:unique(),kind:'reminder',message:'PRUEBA',schedule:{type:'interval',minutes:60},enabled:true});
      a.services.automationsRepo.update(interval.id,{next_run:'2030-03-31T08:17:00.000Z'});
      return {daily:daily.id,interval:interval.id};
    });
    const month=await calendar(c,'2030-03-30','2030-04-02');
    const daily=month.entries.filter(e=>e.item.id===ids.daily);
    expect(daily.map(e=>e.start)).toEqual(['2030-03-30T10:00:00.000Z','2030-03-31T09:00:00.000Z','2030-04-01T09:00:00.000Z','2030-04-02T09:00:00.000Z']);
    const day=await calendar(c,'2030-03-31');
    const intervals=day.entries.filter(e=>e.item.id===ids.interval);
    expect(intervals[0]?.start).toBe('2030-03-31T08:17:00.000Z');
    expect(intervals.map(e=>e.key)).toEqual(month.entries.filter(e=>e.item.id===ids.interval&&e.date==='2030-03-31').map(e=>e.key));
  });
  it('editar, reprogramar y completar persiste sin crear otros registros',async()=>{
    const c=await loggedIn();
    const {task}=await c.json<any>('/api/tasks',{method:'POST',body:{title:unique(),due_at:'2032-05-18T12:00:00Z'}});
    const {automation:r}=await c.json<any>('/api/automations',{method:'POST',body:{name:unique(),kind:'reminder',message:'PRUEBA',schedule:{type:'once',at:'2032-05-18T15:00'},enabled:true}});
    const {birthday:b}=await c.json<any>('/api/birthdays',{method:'POST',body:{name:unique(),day:18,month:5}});
    await c.json('/api/tasks/'+task.id,{method:'PATCH',body:{status:'done',due_at:'2032-05-19T12:00:00Z'}});
    const {automation:changed}=await c.json<any>('/api/automations/'+r.id,{method:'PATCH',body:{schedule:{type:'once',at:'2032-05-19T16:00'}}});
    expect(changed.id).toBe(r.id);expect(changed.next_run).toBe('2032-05-19T14:00:00.000Z');expect(changed.schedule_id).not.toBe(r.schedule_id);
    const {birthday:changedBirthday}=await c.json<any>('/api/birthdays/'+b.id,{method:'PATCH',body:{name:b.name,day:19,month:5,notes:'PRUEBA'}});
    expect(changedBirthday.automation_id).toBe(b.automation_id);
    const second=await loggedIn();
    const old=await calendar(second,'2032-05-18');expect(old.entries.some(e=>[task.id,r.id,b.id,b.automation_id].includes(e.item.id))).toBe(false);
    const entries=(await calendar(second,'2032-05-19')).entries.filter(e=>[task.id,r.id,b.id,b.automation_id].includes(e.item.id));
    expect(entries).toHaveLength(3);expect(entries.find(e=>e.kind==='task')?.item).toMatchObject({status:'done'});
    const nextYear=(await calendar(second,'2033-05-19')).entries.filter(e=>e.item.id===b.id);expect(nextYear).toHaveLength(1);
    expect((await c.call('/api/automations/'+r.id,{method:'PATCH',body:{schedule:{type:'once',at:'2001-01-01T10:00'}}})).status).toBe(400);
    expect((await c.json<any>('/api/automations/'+r.id)).automation.next_run).toBe(changed.next_run);
    expect((await c.call('/api/birthdays/'+b.id,{method:'PATCH',body:{name:b.name,day:31,month:2}})).status).toBe(400);
    expect((await calendar(second,'2033-05-19')).entries.some(e=>e.item.id===b.id)).toBe(true);
  });
  it('no expone eventos pendientes de Apple Calendar y no inventa tareas',async()=>{
    const c=await loggedIn();
    const {event:pending}=await c.json<any>('/api/calendar/events',{method:'POST',body:{title:unique(),start:'2035-05-18T12:00',end:'2035-05-18T13:00'}});
    expect(pending.apple_status).toBe('pending');
    const before=await inAgent(a=>({tasks:a.services.tasks.list(),automations:a.services.automations.list(),birthdays:a.services.bicho.birthdays()}));
    const result=await calendar(c,'2035-05-01','2035-05-31');
    expect(result.entries.every(e=>['task','reminder','birthday'].includes(e.kind))).toBe(true);
    expect(result.entries.some(e=>e.item.id===pending.id||e.title===pending.title)).toBe(false);
    expect(new Set(result.entries.map(e=>e.key)).size).toBe(result.entries.length);
    expect(await inAgent(a=>({tasks:a.services.tasks.list(),automations:a.services.automations.list(),birthdays:a.services.bicho.birthdays()}))).toEqual(before);
  });
});
