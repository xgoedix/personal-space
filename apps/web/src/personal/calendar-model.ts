import { getZonedParts, isValidCalendarDate, zonedTimeToUtc } from '@talorys/shared';
export type CalendarView = 'day' | 'week' | 'month';
export const pad = (n: number) => String(n).padStart(2,'0');
export const dateKey = (date: Date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth()+1)}-${pad(date.getUTCDate())}`;
export function localMinute(instant: string, timezone: string) {
  const p=getZonedParts(new Date(instant),timezone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}
export const addDays = (day: string, amount: number) => dateKey(new Date(Date.parse(day+'T12:00:00Z')+amount*86400000));
export function monthStart(day: string) { return day.slice(0,7)+'-01'; }
export function weekStart(day: string) { return addDays(day,-((new Date(day+'T12:00:00Z').getUTCDay()+6)%7)); }
export function shiftPeriod(day: string, view: CalendarView, amount: number) {
  if(view !== 'month') return addDays(day,amount*(view==='week'?7:1));
  const date = new Date(monthStart(day)+'T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+amount);
  const last = new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
  date.setUTCDate(Math.min(Number(day.slice(-2)),last));return dateKey(date);
}
export function calendarRange(day: string, view: CalendarView) {
  if(view==='day')return {from:day,to:day};
  if(view==='week') {const from=weekStart(day);return {from,to:addDays(from,6)};}
  const from=weekStart(monthStart(day));
  const next=shiftPeriod(monthStart(day),'month',1);
  const last=addDays(next,-1);
  return {from,to:addDays(weekStart(last),6)};
}
export function rangeDays(from: string,to: string) {
  const out:string[]=[];for(let d=from;d<=to && out.length<42;d=addDays(d,1))out.push(d);return out;
}
export function dateLabel(day:string, options:Intl.DateTimeFormatOptions = {weekday:'long',day:'numeric',month:'long'}) {
  return new Intl.DateTimeFormat('es-ES',{...options,timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'));
}
export function taskInstant(value: string, timezone:string):string|null {
  if(!value)return null;
  const m=value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if(!m || !isValidCalendarDate(+m[1]!,+m[2]!,+m[3]!) || +m[4]!>23 || +m[5]!>59)throw Error('Indica una fecha y hora válidas.');
  return zonedTimeToUtc(+m[1]!,+m[2]!,+m[3]!,+m[4]!,+m[5]!,timezone).toISOString();
}
