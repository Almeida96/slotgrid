import { DAYS, emptySchedule, normalizeSchedule, parseTime, formatTime, setRange, totalMinutes, type Schedule, type Day } from './model.js';

const styles = `
  :host { display:block; color:var(--slotgrid-text,#253e35); font:13px/1.4 system-ui,sans-serif; }
  * { box-sizing:border-box; }
  .scroll { overflow:auto; border:1px solid var(--slotgrid-border,#e1e6e1); border-radius:12px; background:var(--slotgrid-background,#fff); }
  .grid { min-width:570px; user-select:none; }
  .row { display:grid; grid-template-columns:56px repeat(7,minmax(0,1fr)); }
  .head { position:sticky; top:0; z-index:2; background:var(--slotgrid-background,#fff); }
  .day { padding:15px 0; text-align:center; font-weight:600; border-bottom:1px solid var(--slotgrid-border,#e1e6e1); }
  .time { font-size:10px; text-align:right; padding:5px 9px 0 0; color:var(--slotgrid-muted,#6a7e73); }
  .cell { position:relative; min-height:25px; border:0; border-right:1px solid var(--slotgrid-border,#e1e6e1); border-bottom:1px dashed var(--slotgrid-border,#e1e6e1); background:transparent; color:var(--slotgrid-selected-text,#fff); padding:0; cursor:pointer; border-radius:0; font:inherit; }
  .cell:last-child { border-right:0; }
  .row.hour .cell { border-bottom-style:solid; }
  .cell:hover { background:var(--slotgrid-hover,#eef3e9); }
  .cell[aria-selected=true] { background:var(--slotgrid-accent,#2e6654); border-bottom-color:#ffffff22; }
  .cell[aria-selected=true]::after { content:''; width:4px; height:4px; border-radius:50%; background:currentColor; position:absolute; top:calc(50% - 2px); left:calc(50% - 2px); opacity:.65; }
  .cell:focus-visible { z-index:1; outline:3px solid var(--slotgrid-focus,#b66d23); outline-offset:-3px; }
  :host([disabled]) .cell { cursor:default; opacity:.65; }
  .instructions { margin:12px 0 0; color:var(--slotgrid-muted,#6a7e73); font-size:12px; }
  .sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
  @media (forced-colors:active) { .cell[aria-selected=true] { background:Highlight; color:HighlightText; forced-color-adjust:none; } }
`;

interface Drag { day: Day; start: number; available: boolean; before: Schedule; pointerId: number }

export class SlotGridElement extends HTMLElement {
  static observedAttributes = ['disabled'];
  private schedule = emptySchedule();
  private drag?: Drag;
  private ignoreClick = false;
  private focusDay: Day = 1;
  private focusMinute = 480;
  private firstMinute = 480;
  private lastMinute = 1080;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot!.addEventListener('click', event => this.onClick(event));
    this.shadowRoot!.addEventListener('keydown', event => this.onKey(event as KeyboardEvent));
    this.addEventListener('pointerdown', event => this.onPointerDown(event));
    this.addEventListener('pointermove', event => this.onPointerMove(event));
    this.addEventListener('pointerup', () => this.finishDrag());
    this.addEventListener('pointercancel', () => this.cancelDrag());
    this.addEventListener('lostpointercapture', () => this.cancelDrag());
  }

  connectedCallback(): void {
    // Apply properties assigned before the custom element was registered.
    if (Object.prototype.hasOwnProperty.call(this, 'value')) {
      const value = this.value;
      delete (this as Partial<SlotGridElement>).value;
      this.value = value;
    }
    this.render();
  }

  disconnectedCallback(): void { this.cancelDrag(); }

  attributeChangedCallback(): void {
    this.cancelDrag();
    if (this.isConnected) this.paint();
  }

  get value(): Schedule { return structuredClone(this.schedule); }
  set value(input: Schedule) {
    const value = normalizeSchedule(input);
    this.cancelDrag();
    this.schedule = value;
    if (this.isConnected) this.render();
  }

  get disabled(): boolean { return this.hasAttribute('disabled'); }
  set disabled(value: boolean) { this.toggleAttribute('disabled', Boolean(value)); }

  private cellFromEvent(event: Event): HTMLButtonElement | undefined {
    return event.composedPath().find(node => node instanceof HTMLButtonElement && node.hasAttribute('data-minute')) as HTMLButtonElement | undefined;
  }

  private selected(day: number, minute: number): boolean {
    return this.schedule.slots.some(slot => slot.day === day && parseTime(slot.start) <= minute && parseTime(slot.end) > minute);
  }

  private render(): void {
    const hadFocus = this.shadowRoot!.activeElement !== null;
    this.firstMinute = Math.min(480, ...this.schedule.slots.map(slot => Math.floor(parseTime(slot.start) / 60) * 60));
    this.lastMinute = Math.max(1080, ...this.schedule.slots.map(slot => Math.ceil(parseTime(slot.end) / 60) * 60));
    this.focusMinute = Math.max(this.firstMinute, Math.min(this.lastMinute - this.schedule.step, Math.floor(this.focusMinute / this.schedule.step) * this.schedule.step));
    const rows: string[] = [];
    for (let minute = this.firstMinute; minute < this.lastMinute; minute += this.schedule.step) {
      const cells = DAYS.map((day, index) => `<button type="button" class="cell" role="gridcell" data-day="${index + 1}" data-minute="${minute}" aria-label="${day} ${formatTime(minute)} to ${formatTime(minute + this.schedule.step)}" aria-selected="false" tabindex="-1"></button>`).join('');
      rows.push(`<div class="row ${(minute + this.schedule.step) % 60 === 0 ? 'hour' : ''}" role="row"><span class="time" role="rowheader">${formatTime(minute)}</span>${cells}</div>`);
    }
    this.shadowRoot!.innerHTML = `<style>${styles}</style><div class="scroll" part="container"><div class="grid" role="grid" aria-label="Weekly availability" aria-multiselectable="true" aria-describedby="instructions"><div class="row head" role="row"><span class="day" role="columnheader">Time</span>${DAYS.map(day => `<span class="day" role="columnheader" aria-label="${day}">${day.slice(0, 3)}</span>`).join('')}</div>${rows.join('')}</div></div><p class="instructions" id="instructions">Click or tap to toggle. Drag within a day to select a range.<br>Keyboard: arrow keys to move, Space to toggle, Escape to cancel a drag.</p><span class="sr-only" role="status" aria-live="polite"></span>`;
    this.paint();
    if (hadFocus) this.focusCell();
  }

  private paint(): void {
    for (const cell of this.shadowRoot!.querySelectorAll<HTMLButtonElement>('.cell')) {
      const day = Number(cell.dataset.day);
      const minute = Number(cell.dataset.minute);
      cell.setAttribute('aria-selected', String(this.selected(day, minute)));
      cell.disabled = this.disabled;
      cell.tabIndex = day === this.focusDay && minute === this.focusMinute ? 0 : -1;
    }
    this.shadowRoot!.querySelector('[role=grid]')?.setAttribute('aria-disabled', String(this.disabled));
  }

  private focusCell(): void {
    this.paint();
    this.shadowRoot!.querySelector<HTMLButtonElement>(`[data-day="${this.focusDay}"][data-minute="${this.focusMinute}"]`)?.focus({ preventScroll: true });
  }

  private announce(): void {
    const status = this.shadowRoot!.querySelector('[role=status]');
    if (status) status.textContent = `${totalMinutes(this.schedule) / 60} hours available this week.`;
    this.dispatchEvent(new CustomEvent<Schedule>('slotgrid-change', { detail: this.value, bubbles: true, composed: true }));
  }

  private toggle(cell: HTMLButtonElement): void {
    this.focusDay = Number(cell.dataset.day) as Day;
    this.focusMinute = Number(cell.dataset.minute);
    this.schedule = setRange(this.schedule, this.focusDay, formatTime(this.focusMinute), formatTime(this.focusMinute + this.schedule.step), !this.selected(this.focusDay, this.focusMinute));
    this.paint();
    this.announce();
  }

  private onClick(event: Event): void {
    if (this.disabled) return;
    if ((event as MouseEvent).detail > 0 && this.ignoreClick) { this.ignoreClick = false; return; }
    const cell = this.cellFromEvent(event);
    if (cell) this.toggle(cell);
  }

  private onKey(event: KeyboardEvent): void {
    if (this.disabled) return;
    if (event.key === 'Escape' && this.drag) { event.preventDefault(); this.cancelDrag(); return; }
    const cell = this.cellFromEvent(event);
    if (!cell) return;
    const day = Number(cell.dataset.day) as Day;
    const minute = Number(cell.dataset.minute);
    const moves: Record<string, [Day, number]> = {
      ArrowLeft: [Math.max(1, day - 1) as Day, minute],
      ArrowRight: [Math.min(7, day + 1) as Day, minute],
      ArrowUp: [day, Math.max(this.firstMinute, minute - this.schedule.step)],
      ArrowDown: [day, Math.min(this.lastMinute - this.schedule.step, minute + this.schedule.step)],
      Home: [1, event.ctrlKey ? this.firstMinute : minute],
      End: [7, event.ctrlKey ? this.lastMinute - this.schedule.step : minute],
    };
    const move = moves[event.key];
    if (move) { event.preventDefault(); [this.focusDay, this.focusMinute] = move; this.focusCell(); }
    else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (!event.repeat) this.toggle(cell);
    }
  }

  private onPointerDown(event: PointerEvent): void {
    this.ignoreClick = false;
    if (this.disabled || event.button !== 0 || event.pointerType === 'touch') return;
    const cell = this.cellFromEvent(event);
    if (!cell) return;
    event.preventDefault();
    this.focusDay = Number(cell.dataset.day) as Day;
    this.focusMinute = Number(cell.dataset.minute);
    this.drag = { day: this.focusDay, start: this.focusMinute, available: !this.selected(this.focusDay, this.focusMinute), before: this.value, pointerId: event.pointerId };
    this.ignoreClick = true;
    this.setPointerCapture(event.pointerId);
    this.updateDrag(this.focusMinute);
    this.focusCell();
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    const hit = this.shadowRoot!.elementFromPoint(event.clientX, event.clientY);
    const cell = hit?.closest<HTMLButtonElement>('[data-minute]');
    if (cell && Number(cell.dataset.day) === this.drag.day) this.updateDrag(Number(cell.dataset.minute));
  }

  private updateDrag(minute: number): void {
    const drag = this.drag!;
    this.schedule = setRange(drag.before, drag.day, formatTime(Math.min(minute, drag.start)), formatTime(Math.max(minute, drag.start) + this.schedule.step), drag.available);
    this.paint();
  }

  private releaseDrag(): Drag | undefined {
    const drag = this.drag;
    this.drag = undefined;
    if (drag && this.hasPointerCapture(drag.pointerId)) this.releasePointerCapture(drag.pointerId);
    return drag;
  }

  private finishDrag(): void { if (this.releaseDrag()) this.announce(); }
  private cancelDrag(): void {
    const drag = this.releaseDrag();
    if (drag) { this.schedule = drag.before; this.paint(); }
  }
}

if (!customElements.get('slot-grid')) customElements.define('slot-grid', SlotGridElement);

declare global {
  interface HTMLElementTagNameMap { 'slot-grid': SlotGridElement }
  interface HTMLElementEventMap { 'slotgrid-change': CustomEvent<Schedule> }
}
