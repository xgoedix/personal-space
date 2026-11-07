import {describe,it,expect} from 'vitest';
import {calendarRange,shiftPeriod,localMinute,taskInstant,rangeDays} from '../src/personal/calendar-model';
describe('calendario de Hoy',()=>{
 it('usa semanas de lunes a domingo y meses completos sin depender de la zona del navegador',()=>{
  expect(calendarRange('2032-05-18','day')).toEqual({from:'2032-05-18',to:'2032-05-18'});
  expect(calendarRange('2032-05-18','week')).toEqual({from:'2032-05-17',to:'2032-05-23'});
  expect(calendarRange('2032-05-18','month')).toEqual({from:'2032-04-26',to:'2032-06-06'});
  expect(rangeDays('2032-04-26','2032-06-06')).toHaveLength(42);
 });
 it('navega meses cortos, años y semanas sin saltarse el mes siguiente',()=>{
  expect(shiftPeriod('2031-01-31','month',1)).toBe('2031-02-28');
  expect(shiftPeriod('2032-01-31','month',1)).toBe('2032-02-29');
  expect(shiftPeriod('2031-12-31','day',1)).toBe('2032-01-01');
  expect(shiftPeriod('2032-01-01','week',-1)).toBe('2031-12-25');
 });
 it('convierte la edición en la zona del propietario y conserva las reglas DST del scheduler',()=>{
  expect(localMinute('2030-03-31T09:00:00Z','Europe/Madrid')).toBe('2030-03-31T11:00');
  expect(taskInstant('2030-03-31T11:00','Europe/Madrid')).toBe('2030-03-31T09:00:00.000Z');
  expect(taskInstant('2030-03-31T02:30','Europe/Madrid')).toBe('2030-03-31T01:30:00.000Z');
  expect(taskInstant('2030-10-27T02:30','Europe/Madrid')).toBe('2030-10-27T00:30:00.000Z');
  expect(taskInstant('','Europe/Madrid')).toBeNull();
  expect(()=>taskInstant('2030-02-30T12:00','Europe/Madrid')).toThrow();
 });
});
