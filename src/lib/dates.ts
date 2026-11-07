import { addDays, endOfDay, format, startOfDay, startOfWeek } from 'date-fns';

export const ymd = (d: Date) => format(d, 'yyyy-MM-dd');
export const hm = (d: Date | string) => format(typeof d === 'string' ? new Date(d) : d, 'h:mm a');
export const dayRange = (d = new Date()) => ({ from: startOfDay(d).toISOString(), to: endOfDay(d).toISOString() });
export const weekDays = (d: Date, weekStart: number) => {
  const s = startOfWeek(d, { weekStartsOn: weekStart as 0 | 1 | 2 | 3 | 4 | 5 | 6 });
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
};
export function greeting(name?: string | null, now = new Date()) {
  const h = now.getHours();
  const part = h < 5 ? 'Hi' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return name ? `${part}, ${name}` : part;
}
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
