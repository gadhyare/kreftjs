// @tap, @longpress and @swipe on top of pointer events (a fake element: no browser needed)
const test = require('node:test');
const assert = require('node:assert');
const Kreftjs = require('../kreftjs.js');
const { bindEvent } = Kreftjs.__internal;

function setup(raw) {
  const listeners = {};
  const el = { style: {}, addEventListener: (t, fn) => { listeners[t] = fn; } };
  const calls = [];
  bindEvent(el, raw, 'hit($event)', { hit: (e) => calls.push(e) });
  const ev = (x, y) => ({ clientX: x, clientY: y, button: 0, pointerType: 'touch', target: el, preventDefault() { this.prevented = true; }, stopPropagation() {} });
  return { el, calls, listeners, ev };
}

test('a short press without movement is a tap', () => {
  const { calls, listeners, ev } = setup('tap');
  listeners.pointerdown(ev(10, 10)); listeners.pointerup(ev(12, 11));
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].type, 'tap');
});

test('moving more than 10px is not a tap', () => {
  const { calls, listeners, ev } = setup('tap');
  listeners.pointerdown(ev(0, 0)); listeners.pointermove(ev(30, 0)); listeners.pointerup(ev(30, 0));
  assert.strictEqual(calls.length, 0);
});

test('swipeleft fires only for a leftward swipe, swipe for any direction', () => {
  const left = setup('swipeleft');
  left.listeners.pointerdown(left.ev(200, 100)); left.listeners.pointerup(left.ev(100, 105));
  assert.strictEqual(left.calls.length, 1);
  assert.strictEqual(left.calls[0].direction, 'left');
  const wrong = setup('swipeleft');
  wrong.listeners.pointerdown(wrong.ev(100, 100)); wrong.listeners.pointerup(wrong.ev(200, 100));
  assert.strictEqual(wrong.calls.length, 0);
  const any = setup('swipe');
  any.listeners.pointerdown(any.ev(100, 200)); any.listeners.pointerup(any.ev(100, 100));
  assert.strictEqual(any.calls[0].direction, 'up');
});

test('a swipe under 40px is ignored, and a horizontal swipe keeps vertical scrolling', () => {
  const s = setup('swiperight');
  s.listeners.pointerdown(s.ev(0, 0)); s.listeners.pointerup(s.ev(30, 0));
  assert.strictEqual(s.calls.length, 0);
  assert.strictEqual(s.el.style.touchAction, 'pan-y');
});

test('.once fires one time only', () => {
  const { calls, listeners, ev } = setup('tap.once');
  for (let i = 0; i < 3; i++) { listeners.pointerdown(ev(1, 1)); listeners.pointerup(ev(1, 1)); }
  assert.strictEqual(calls.length, 1);
});

test('longpress fires after 500ms of holding still', async () => {
  const { calls, listeners, ev } = setup('longpress');
  listeners.pointerdown(ev(5, 5));
  await new Promise((r) => setTimeout(r, 560));
  assert.strictEqual(calls.length, 1);
  listeners.pointerup(ev(5, 5));
  assert.strictEqual(calls.length, 1);
});

test('a longpress is cancelled by moving', async () => {
  const { calls, listeners, ev } = setup('longpress');
  listeners.pointerdown(ev(5, 5)); listeners.pointermove(ev(40, 5));
  await new Promise((r) => setTimeout(r, 560));
  assert.strictEqual(calls.length, 0);
});
