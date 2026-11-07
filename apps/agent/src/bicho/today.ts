import { Hono } from 'hono';
import { z } from 'zod';
import { computeNextRun, isValidCalendarDate, zonedTimeToUtc, type TodayCalendarData, type TodayEntry, type Task, type ScheduleSpec } from '@talorys/shared';
import type { AppEnv } from '../api/app';
import { query } from '../api/middleware';
import { toLocalMinute } from '../services/time';

const day = z.string().regex(/^(19|20|21)\d{2}-\d{2}-\d{2}$/).refine(value => {
  const [y,m,d] = value.split('-').map(Number);
  return isValidCalendarDate(y!,m!,d!);
});
const rangeSchema = z.object({ from: day, to: day }).refine(v => {
  const days = (Date.parse(v.to) - Date.parse(v.from)) / 86400000;
  return days >= 0 && days <= 41;
}, 'Elige un intervalo de hasta 42 días.');
const boundary = (day: string, zone: string, offset = 0) => {
  const [y,m,d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y!,m!-1,d!+offset));
  return zonedTimeToUtc(date.getUTCFullYear(),date.getUTCMonth()+1,date.getUTCDate(),0,0,zone);
};
const MAX_ENTRIES = 2000;
export const todayRoutes = new Hono<AppEnv>();

todayRoutes.get('/today/calendar', c => {
  const {from,to} = query(c, rangeSchema);
  const s = c.env.agent.services;
  const timezone = s.settings.get().timezone;
  const start = boundary(from,timezone), end = boundary(to,timezone,1);
  const entries: TodayEntry[] = [];
  let truncated = false;
  const add = (entry: TodayEntry) => {
    if(entries.length < MAX_ENTRIES) entries.push(entry);
    else truncated = true;
  };
  // Range reads include completed tasks and do not inherit the general task list's page limit.
  const tasks = s.db.all<Task>('SELECT * FROM tal_tasks WHERE julianday(due_at) >= julianday(?) AND julianday(due_at) < julianday(?) ORDER BY julianday(due_at),id LIMIT ?', start.toISOString(),end.toISOString(),MAX_ENTRIES+1);
  for(const item of tasks) add({kind:'task',item,key:`task:${item.id}`,date:toLocalMinute(new Date(item.due_at!),timezone).slice(0,10),start:new Date(item.due_at!).toISOString(),title:item.title});
  const undated = s.db.all<Task>('SELECT * FROM tal_tasks WHERE due_at IS NULL ORDER BY status = \'done\',created_at,id LIMIT 501');
  if(undated.length > 500) truncated = true;
  const birthdays = s.bicho.birthdays();
  const birthdayIds = new Set(birthdays.map(b => b.automation_id));
  const project = (spec: ScheduleSpec, zone: string, lower: Date, upper: Date, emit: (date: Date) => void) => {
    let cursor = new Date(lower.getTime()-1);
    for(let n=0;n<=MAX_ENTRIES;n++) {
      const next = computeNextRun(spec,zone,cursor);
      if(!next || next >= upper) return;
      if(entries.length >= MAX_ENTRIES) { truncated=true; return; }
      emit(next); cursor=next;
    }
    truncated=true;
  };
  for(const item of birthdays) {
    // Birthdays are calendar dates in Madrid, including Feb 29 -> Feb 28 in non-leap years.
    project({type:'yearly',month:item.month,day:item.day,time:s.bicho.birthdayTime(),timezone:'Europe/Madrid'},'Europe/Madrid',boundary(from,'Europe/Madrid'),boundary(to,'Europe/Madrid',1), date => {
      const local = toLocalMinute(date,'Europe/Madrid').slice(0,10);
      add({kind:'birthday',item,key:`birthday:${item.id}:${local}`,date:local,start:date.toISOString(),title:`Cumpleaños de ${item.name}`});
    });
  }
  for(const item of s.automations.list()) {
    if(item.kind !== 'reminder' || birthdayIds.has(item.id)) continue;
    const emit = (date: Date) => add({kind:'reminder',item,key:`reminder:${item.id}:${date.toISOString()}`,date:toLocalMinute(date,timezone).slice(0,10),start:date.toISOString(),title:item.name});
    if(item.schedule.type === 'interval') {
      // Interval schedules are anchored to the saved next run, never to the viewed date.
      const anchor = Date.parse(item.next_run ?? item.last_run ?? item.created_at);
      const step = item.schedule.minutes*60000;
      const lower = Math.max(start.getTime(),Date.parse(item.created_at));
      let instant = anchor + Math.max(0,Math.ceil((lower-anchor)/step))*step;
      while(instant < end.getTime()) {
        if(entries.length >= MAX_ENTRIES) {truncated=true;break;}
        emit(new Date(instant));instant+=step;
      }
    } else {
      const lower = item.schedule.type === 'once' ? start : new Date(Math.max(start.getTime(),Date.parse(item.created_at)));
      project(item.schedule,timezone,lower,end,emit);
    }
  }
  entries.sort((a,b)=>a.date.localeCompare(b.date) || Number(b.kind==='birthday')-Number(a.kind==='birthday') || a.start.localeCompare(b.start) || a.key.localeCompare(b.key));
  return c.json({from,to,timezone,entries,undated:undated.slice(0,500),truncated} satisfies TodayCalendarData);
});
