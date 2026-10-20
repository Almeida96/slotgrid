import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

const window = new Window();
for (const name of ['HTMLElement', 'HTMLButtonElement', 'customElements', 'CustomEvent', 'document']) globalThis[name] = window[name];
await import('../dist/slot-grid.js');
after(() => window.happyDOM.close());
const fixture = () => { const grid = document.createElement('slot-grid'); document.body.replaceChildren(grid); return grid; };
const cell = (grid, day, minute) => grid.shadowRoot.querySelector(`[data-day="${day}"][data-minute="${minute}"]`);
const key = (element, value, extra = {}) => element.dispatchEvent(new window.KeyboardEvent('keydown', { key: value, bubbles: true, composed: true, cancelable: true, ...extra }));

test('has one tab stop, named cells, and selection state', () => {
  const grid = fixture();
  assert.equal(grid.shadowRoot.querySelectorAll('[tabindex="0"]').length, 1);
  assert.equal(cell(grid, 1, 480).getAttribute('aria-label'), 'Monday 08:00 to 08:30');
  assert.equal(cell(grid, 1, 480).getAttribute('aria-selected'), 'false');
});

test('click toggles availability and emits an isolated event value', () => {
  const grid = fixture();
  let calls = 0;
  grid.addEventListener('slotgrid-change', event => { calls++; event.detail.slots.length = 0; });
  cell(grid, 1, 540).click();
  assert.deepEqual(grid.value.slots, [{ day: 1, start: '09:00', end: '09:30' }]);
  cell(grid, 1, 540).click();
  assert.deepEqual(grid.value.slots, []);
  assert.equal(calls, 2);
});

test('keyboard navigation, toggling, and boundary keys retain one tab stop', () => {
  const grid = fixture();
  key(cell(grid, 1, 480), 'ArrowRight');
  assert.equal(grid.shadowRoot.activeElement, cell(grid, 2, 480));
  key(cell(grid, 2, 480), 'ArrowDown');
  key(cell(grid, 2, 510), ' ');
  assert.deepEqual(grid.value.slots, [{ day: 2, start: '08:30', end: '09:00' }]);
  key(cell(grid, 2, 510), 'End', { ctrlKey: true });
  assert.equal(grid.shadowRoot.activeElement, cell(grid, 7, 1050));
  key(cell(grid, 7, 1050), 'Home', { ctrlKey: true });
  assert.equal(grid.shadowRoot.activeElement, cell(grid, 1, 480));
  assert.equal(grid.shadowRoot.querySelectorAll('[tabindex="0"]').length, 1);
});

test('disabled cells cannot change the schedule', () => {
  const grid = fixture(); grid.disabled = true;
  cell(grid, 1, 480).click(); key(cell(grid, 1, 480), ' ');
  assert.deepEqual(grid.value.slots, []);
  assert.equal(cell(grid, 1, 480).disabled, true);
  grid.disabled = false;
  cell(grid, 1, 480).click();
  assert.equal(grid.value.slots.length, 1);
});

test('programmatic value updates are validated, copied, and do not emit change', () => {
  const grid = fixture(); let calls = 0;
  grid.addEventListener('slotgrid-change', () => calls++);
  const value = { version: 1, timeZone: 'UTC', step: 15, slots: [{ day: 1, start: '09:15', end: '10:00' }] };
  grid.value = value; value.slots.length = 0;
  grid.value.slots.length = 0;
  assert.equal(grid.value.slots.length, 1);
  assert.equal(calls, 0);
  assert.throws(() => { grid.value = { ...grid.value, step: 60 }; });
  assert.equal(grid.value.step, 15);
});

test('the visible range expands to include early and late availability', () => {
  const grid = fixture();
  grid.value = { version: 1, timeZone: 'UTC', step: 30, slots: [{ day: 3, start: '00:00', end: '01:00' }, { day: 4, start: '23:00', end: '24:00' }] };
  assert.equal(cell(grid, 3, 0).getAttribute('aria-selected'), 'true');
  assert.equal(cell(grid, 4, 1410).getAttribute('aria-selected'), 'true');
});

test('setting a value before insertion is preserved on connection', () => {
  const grid = document.createElement('slot-grid');
  grid.value = { version: 1, timeZone: 'UTC', step: 60, slots: [{ day: 1, start: '10:00', end: '11:00' }] };
  document.body.replaceChildren(grid);
  assert.equal(cell(grid, 1, 600).getAttribute('aria-selected'), 'true');
});

function pointerFixture() {
  const grid = fixture();
  let captured = false;
  grid.setPointerCapture = () => { captured = true; };
  grid.hasPointerCapture = () => captured;
  grid.releasePointerCapture = () => { captured = false; };
  const pointer = (target, type) => target.dispatchEvent(new window.PointerEvent(type, { pointerId: 1, pointerType: 'mouse', button: 0, bubbles: true, composed: true, cancelable: true }));
  const move = minute => { grid.shadowRoot.elementFromPoint = () => cell(grid, 1, minute); pointer(grid, 'pointermove'); };
  return { grid, pointer, move };
}

test('drag commits once and shrinking its range restores the original cells', () => {
  const { grid, pointer, move } = pointerFixture();
  let calls = 0; grid.addEventListener('slotgrid-change', () => calls++);
  pointer(cell(grid, 1, 540), 'pointerdown'); move(660); move(570);
  assert.deepEqual(grid.value.slots, [{ day: 1, start: '09:00', end: '10:00' }]);
  assert.equal(calls, 0);
  pointer(grid, 'pointerup');
  assert.equal(calls, 1);
});

test('Escape and pointer cancellation restore the snapshot without emitting', () => {
  for (const cancel of ['escape', 'pointercancel']) {
    const { grid, pointer, move } = pointerFixture();
    let calls = 0; grid.addEventListener('slotgrid-change', () => calls++);
    pointer(cell(grid, 1, 540), 'pointerdown'); move(660);
    if (cancel === 'escape') key(cell(grid, 1, 540), 'Escape'); else pointer(grid, cancel);
    assert.deepEqual(grid.value.slots, []);
    assert.equal(calls, 0);
  }
});
