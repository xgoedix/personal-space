import type { Task, Automation } from './schemas';
import type { Birthday } from './bicho';

/** Calendar projections reference their source record; they never create scheduled jobs. */
interface Occurrence { key: string; date: string; start: string; title: string }
export type TodayEntry = Occurrence & (
  | { kind: 'task'; item: Task }
  | { kind: 'reminder'; item: Automation }
  | { kind: 'birthday'; item: Birthday }
);
export interface TodayCalendarData {
  from: string;
  to: string;
  timezone: string;
  entries: TodayEntry[];
  undated: Task[];
  truncated: boolean;
}
