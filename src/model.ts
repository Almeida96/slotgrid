export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export type Day = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Step = 15 | 30 | 60;
export interface Slot { day: Day; start: string; end: string }
export interface Schedule { version: 1; timeZone: string; step: Step; slots: Slot[] }

export function parseTime(value: unknown): number {
  if (typeof value !== 'string' || value.length !== 5 || !/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(value)) {
    throw new TypeError('Times must use HH:MM, from 00:00 to 24:00.');
  }
  const [hours, minutes] = value.split(':').map(Number);
  return hours! * 60 + minutes!;
}

export function formatTime(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) throw new RangeError('Minutes must be between 0 and 1440.');
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateSlot(value: unknown, step: Step): Slot {
  if (!record(value) || !Number.isInteger(value.day) || Number(value.day) < 1 || Number(value.day) > 7) {
    throw new TypeError('Each slot needs a day from 1 (Monday) to 7 (Sunday).');
  }
  const start = parseTime(value.start);
  const end = parseTime(value.end);
  if (start >= end) throw new RangeError('A slot must end after it starts. Split overnight ranges across two days.');
  if (start % step || end % step) throw new RangeError(`Slot boundaries must align to ${step}-minute intervals.`);
  return { day: value.day as Day, start: formatTime(start), end: formatTime(end) };
}

/** Return a sorted copy with overlapping and adjacent ranges merged. */
export function normalizeSchedule(input: unknown): Schedule {
  if (!record(input) || input.version !== 1) throw new TypeError('Expected a schedule with version 1.');
  if (![15, 30, 60].includes(Number(input.step)) || typeof input.step !== 'number') throw new TypeError('Step must be 15, 30, or 60 minutes.');
  if (typeof input.timeZone !== 'string' || !input.timeZone || input.timeZone.length > 100) throw new TypeError('Provide a valid time zone.');
  try { new Intl.DateTimeFormat('en', { timeZone: input.timeZone }); }
  catch { throw new TypeError('Provide a valid time zone, such as America/Sao_Paulo or UTC.'); }
  if (!Array.isArray(input.slots) || input.slots.length > 10000) throw new TypeError('Slots must be an array with at most 10,000 entries.');
  const step = input.step as Step;
  const sorted = Array.from(input.slots, slot => validateSlot(slot, step))
    .sort((a, b) => a.day - b.day || parseTime(a.start) - parseTime(b.start));
  const slots: Slot[] = [];
  for (const slot of sorted) {
    const previous = slots.at(-1);
    if (previous?.day === slot.day && parseTime(slot.start) <= parseTime(previous.end)) {
      previous.end = formatTime(Math.max(parseTime(previous.end), parseTime(slot.end)));
    } else slots.push({ ...slot });
  }
  return { version: 1, timeZone: input.timeZone, step, slots };
}

export function emptySchedule(timeZone = 'UTC', step: Step = 30): Schedule {
  return normalizeSchedule({ version: 1, timeZone, step, slots: [] });
}

export function setRange(input: Schedule, day: Day, start: string, end: string, available: boolean): Schedule {
  const schedule = normalizeSchedule(input);
  const range = validateSlot({ day, start, end }, schedule.step);
  if (typeof available !== 'boolean') throw new TypeError('Available must be a boolean.');
  if (available) return normalizeSchedule({ ...schedule, slots: [...schedule.slots, range] });
  const from = parseTime(start);
  const to = parseTime(end);
  const slots = schedule.slots.flatMap(slot => {
    if (slot.day !== day || parseTime(slot.end) <= from || parseTime(slot.start) >= to) return [slot];
    const remaining: Slot[] = [];
    if (parseTime(slot.start) < from) remaining.push({ ...slot, end: start });
    if (parseTime(slot.end) > to) remaining.push({ ...slot, start: end });
    return remaining;
  });
  return { ...schedule, slots };
}

export function totalMinutes(input: Schedule): number {
  return normalizeSchedule(input).slots.reduce((total, slot) => total + parseTime(slot.end) - parseTime(slot.start), 0);
}
