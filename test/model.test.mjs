import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSchedule, emptySchedule, setRange, totalMinutes, parseTime, formatTime } from '../dist/model.js';

const schedule = (slots = [], step = 30) => ({ version: 1, timeZone: 'America/Sao_Paulo', step, slots });
const slot = (start, end, day = 1) => ({ day, start, end });

test('sorts by day and time, merging overlap, adjacency, and duplicates', () => {
  const input = schedule([slot('13:00', '14:00', 3), slot('11:00', '13:00'), slot('09:00', '12:00'), slot('09:00', '12:00'), slot('13:00', '14:00')]);
  const before = structuredClone(input);
  assert.deepEqual(normalizeSchedule(input).slots, [slot('09:00', '14:00'), slot('13:00', '14:00', 3)]);
  assert.deepEqual(input, before);
});

test('different days and separated ranges stay separate', () => {
  const input = schedule([slot('09:00', '10:00'), slot('11:00', '12:00'), slot('09:00', '10:00', 2)]);
  assert.deepEqual(normalizeSchedule(input).slots, input.slots);
});

test('adding a range is idempotent and never double counts time', () => {
  const added = setRange(emptySchedule(), 1, '09:00', '12:00', true);
  const again = setRange(added, 1, '10:00', '12:00', true);
  assert.deepEqual(added, again);
  assert.equal(totalMinutes(again), 180);
});

test('removing from the middle splits a range and leaves other days alone', () => {
  const result = setRange(schedule([slot('09:00', '17:00'), slot('09:00', '17:00', 2)]), 1, '12:00', '13:00', false);
  assert.deepEqual(result.slots, [slot('09:00', '12:00'), slot('13:00', '17:00'), slot('09:00', '17:00', 2)]);
});

test('removal can trim edges, remove several ranges, or do nothing', () => {
  const input = schedule([slot('09:00', '12:00'), slot('13:00', '17:00')]);
  assert.deepEqual(setRange(input, 1, '08:00', '10:00', false).slots, [slot('10:00', '12:00'), slot('13:00', '17:00')]);
  assert.deepEqual(setRange(input, 1, '16:00', '18:00', false).slots, [slot('09:00', '12:00'), slot('13:00', '16:00')]);
  assert.deepEqual(setRange(input, 1, '08:00', '18:00', false).slots, []);
  assert.deepEqual(setRange(input, 1, '18:00', '19:00', false).slots, input.slots);
});

test('supports midnight boundaries and full-day availability', () => {
  const result = normalizeSchedule(schedule([slot('00:00', '24:00', 7)]));
  assert.equal(totalMinutes(result), 1440);
  assert.equal(parseTime('24:00'), 1440);
  assert.equal(formatTime(1440), '24:00');
});

test('15-minute schedules preserve quarter hours', () => {
  const result = setRange(emptySchedule('UTC', 15), 7, '09:15', '09:45', true);
  assert.deepEqual(result.slots, [slot('09:15', '09:45', 7)]);
});

for (const time of ['9:00', '24:30', '25:00', '12:60', '-1:00', '09:00\n', ' 09:00', '09:00 ', null, 900]) {
  test(`rejects invalid time ${JSON.stringify(time)}`, () => assert.throws(() => parseTime(time)));
}

for (const value of [-1, 1441, NaN, Infinity, 1.5]) {
  test(`rejects invalid minutes ${value}`, () => assert.throws(() => formatTime(value)));
}

test('rejects overnight, zero-length, misaligned, and invalid-day ranges', () => {
  for (const invalid of [slot('23:00', '01:00'), slot('09:00', '09:00'), slot('09:15', '10:00'), slot('09:00', '10:00', 0), slot('09:00', '10:00', 8), slot('09:00', '10:00', 1.5)]) {
    assert.throws(() => normalizeSchedule(schedule([invalid])));
  }
});

test('rejects invalid schemas, zones, and interval settings', () => {
  for (const invalid of [null, [], {}, { ...schedule(), version: 2 }, { ...schedule(), step: '30' }, { ...schedule(), step: 10 }, { ...schedule(), timeZone: 'not/a-zone' }, { ...schedule(), slots: {} }, { ...schedule(), slots: [null] }, { ...schedule(), slots: Array(10001).fill(slot('09:00', '10:00')) }, { ...schedule(), slots: Array(1) }]) {
    assert.throws(() => normalizeSchedule(invalid));
  }
});

test('does not silently round a schedule when its step changes', () => {
  assert.throws(() => normalizeSchedule(schedule([slot('09:30', '10:30')], 60)), /align/);
});

test('returned data is detached and JSON round trips preserve availability', () => {
  const input = schedule([slot('09:00', '12:00')]);
  const result = normalizeSchedule(input);
  result.slots[0].start = '08:00';
  assert.equal(input.slots[0].start, '09:00');
  assert.deepEqual(normalizeSchedule(JSON.parse(JSON.stringify(input))), input);
});

test('random add/remove operations agree with a minute-cell reference model', () => {
  let value = emptySchedule('UTC', 15);
  const expected = new Set();
  let seed = 1234567;
  const random = n => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % n; };
  for (let i = 0; i < 250; i++) {
    const day = random(7) + 1;
    const start = random(96);
    const end = start + 1 + random(96 - start);
    const available = random(2) === 0;
    value = setRange(value, day, formatTime(start * 15), formatTime(end * 15), available);
    for (let cell = start; cell < end; cell++) {
      const key = `${day}:${cell}`;
      if (available) expected.add(key); else expected.delete(key);
    }
    assert.equal(totalMinutes(value), expected.size * 15);
    const actual = new Set(value.slots.flatMap(slot => Array.from({ length: (parseTime(slot.end) - parseTime(slot.start)) / 15 }, (_, n) => `${slot.day}:${parseTime(slot.start) / 15 + n}`)));
    assert.deepEqual(actual, expected);
  }
});
