import { test } from 'node:test';
import assert from 'node:assert/strict';
import { intersectSchedules, subtractSchedules, appointmentSlots } from '../dist/model.js';
const schedule = (ranges, step = 30, timeZone = 'UTC') => ({ version: 1, step, timeZone, slots: ranges.map(([day, start, end]) => ({ day, start, end })) });

test('finds shared hours across split days and different step sizes without mutating inputs', () => {
  const a = schedule([[1, '09:00', '12:00'], [2, '14:00', '18:00']]);
  const b = schedule([[1, '10:15', '13:00'], [2, '16:00', '17:00']], 15);
  const before = structuredClone([a, b]);
  assert.deepEqual(intersectSchedules(a, b), schedule([[1, '10:15', '12:00'], [2, '16:00', '17:00']], 15));
  assert.deepEqual([a, b], before);
});
test('subtracts overlapping bookings, splits ranges and ignores disjoint days', () => {
  assert.deepEqual(subtractSchedules(schedule([[1, '09:00', '17:00']]), schedule([[1, '10:00', '11:00'], [1, '10:30', '12:00'], [2, '09:00', '17:00']])), schedule([[1, '09:00', '10:00'], [1, '12:00', '17:00']]));
});
test('touching boundaries do not overlap and midnight is supported', () => {
  const a = schedule([[7, '23:00', '24:00']]);
  assert.deepEqual(intersectSchedules(a, schedule([[7, '22:00', '23:00']])).slots, []);
  assert.deepEqual(appointmentSlots(a, 60), a.slots);
});
test('rejects timezone conversion without a date and invalid appointment durations', () => {
  for (const operation of [intersectSchedules, subtractSchedules]) assert.throws(() => operation(schedule([]), schedule([], 30, 'America/Sao_Paulo')), /same time zone/);
  for (const duration of [0, -30, 45, NaN, 1500]) assert.throws(() => appointmentSlots(schedule([]), duration));
});
test('appointments never cross a break or overrun availability', () => {
  const input = schedule([[1, '09:00', '10:30'], [1, '11:00', '12:00']]);
  assert.deepEqual(appointmentSlots(input, 60).map(s => `${s.start}-${s.end}`), ['09:00-10:00', '09:30-10:30', '11:00-12:00']);
  assert.equal(appointmentSlots(input, 60, 60).length, 2);
  assert.throws(() => appointmentSlots(input, 60, 15));
});
