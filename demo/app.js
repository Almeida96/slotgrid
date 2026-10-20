import { DAYS, normalizeSchedule, totalMinutes } from './dist/slot-grid.js';

const grid = document.querySelector('slot-grid');
const zone = document.querySelector('#timezone');
const step = document.querySelector('#step');
const feedback = document.querySelector('#feedback');
const dialog = document.querySelector('#json-dialog');
const input = document.querySelector('#json-input');
const history = [];
const storageKey = 'slotgrid-demo-v1';
const example = {
  version: 1, timeZone: 'America/Sao_Paulo', step: 30,
  slots: [
    { day: 1, start: '09:00', end: '12:00' }, { day: 1, start: '13:00', end: '16:00' },
    { day: 2, start: '09:00', end: '12:00' }, { day: 2, start: '14:00', end: '17:00' },
    { day: 3, start: '10:00', end: '13:00' },
    { day: 4, start: '09:00', end: '12:00' }, { day: 4, start: '13:00', end: '16:00' },
    { day: 5, start: '09:00', end: '12:00' },
  ],
};
let current = normalizeSchedule(example);
try {
  const saved = localStorage.getItem(storageKey);
  if (saved) current = normalizeSchedule(JSON.parse(saved));
} catch { feedback.textContent = 'The saved schedule could not be loaded. Showing the example week.'; }
grid.value = current;

function update() {
  if (![...zone.options].some(option => option.value === current.timeZone)) zone.add(new Option(current.timeZone, current.timeZone));
  zone.value = current.timeZone;
  step.value = String(current.step);
  document.querySelector('#total').textContent = String(totalMinutes(current) / 60);
  const dayCount = new Set(current.slots.map(slot => slot.day)).size;
  document.querySelector('#day-count').textContent = `Across ${dayCount} ${dayCount === 1 ? 'day' : 'days'}`;
  const summary = document.querySelector('#day-summary');
  summary.replaceChildren(...DAYS.map((name, index) => {
    const row = document.createElement('div'); row.className = 'day-line';
    const day = document.createElement('strong'); day.textContent = name.slice(0, 3);
    const times = document.createElement('span');
    const slots = current.slots.filter(slot => slot.day === index + 1);
    if (!slots.length) { times.textContent = 'Off'; times.className = 'off'; }
    slots.forEach((slot, index) => { if (index) times.append(document.createElement('br')); times.append(`${slot.start}–${slot.end}`); });
    row.append(day, times); return row;
  }));
  document.querySelector('#undo').disabled = !history.length;
  try { localStorage.setItem(storageKey, JSON.stringify(current)); document.querySelector('#storage-status').textContent = 'Saved in this browser'; }
  catch { document.querySelector('#storage-status').textContent = 'Storage unavailable — export to keep changes'; }
}

function commit(value, message = '', fromGrid = false) {
  const next = normalizeSchedule(value);
  history.push(current);
  if (history.length > 30) history.shift();
  current = next;
  if (!fromGrid) grid.value = current;
  update();
  feedback.textContent = message;
}

grid.addEventListener('slotgrid-change', event => commit(event.detail, '', true));
document.querySelector('#clear').addEventListener('click', () => commit({ ...current, slots: [] }, 'Week cleared. Use Undo to restore it.'));
document.querySelector('#undo').addEventListener('click', () => {
  if (!history.length) return;
  current = history.pop(); grid.value = current; update(); feedback.textContent = 'Previous schedule restored.';
});
zone.addEventListener('change', () => commit({ ...current, timeZone: zone.value }, 'Time zone updated. The selected hours stay the same.'));
step.addEventListener('change', () => {
  try { commit({ ...current, step: Number(step.value) }, 'Slot length updated.'); }
  catch (error) { step.value = String(current.step); feedback.textContent = error.message; }
});
for (const id of ['workweek', 'mornings']) {
  document.querySelector(`#${id}`).addEventListener('click', () => {
    const slots = Array.from({ length: 5 }, (_, i) => [
      { day: i + 1, start: '09:00', end: '12:00' },
      ...(id === 'workweek' ? [{ day: i + 1, start: '13:00', end: '17:00' }] : []),
    ]).flat();
    commit({ ...current, slots }, 'Pattern applied. Use Undo to restore your previous week.');
  });
}
document.querySelector('#download').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(current, null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = 'availability.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  feedback.textContent = 'Schedule exported as availability.json.';
});
document.querySelector('#edit-json').addEventListener('click', () => {
  input.value = JSON.stringify(current, null, 2);
  document.querySelector('#json-error').textContent = '';
  document.querySelector('#copy-json').textContent = 'Copy JSON';
  dialog.showModal();
});
document.querySelector('#close-dialog').addEventListener('click', () => dialog.close());
document.querySelector('#apply-json').addEventListener('click', () => {
  try {
    if (input.value.length > 250000) throw new Error('The pasted JSON exceeds the 250 KB text limit.');
    commit(JSON.parse(input.value), 'Schedule imported. Overlapping and adjacent ranges were merged.');
    dialog.close();
  } catch (error) { document.querySelector('#json-error').textContent = error.message; }
});
document.querySelector('#copy-json').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(input.value); document.querySelector('#json-error').textContent = ''; document.querySelector('#copy-json').textContent = 'Copied'; }
  catch { document.querySelector('#json-error').textContent = 'Clipboard unavailable. Select and copy the text directly.'; }
});
update();
