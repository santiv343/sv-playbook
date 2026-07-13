import { test } from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { createNodeSignalSubscription } from './node-signal-subscription.js';

const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGBREAK'] as const;

function listenerCount(): number {
  return SIGNALS.reduce((sum, sig) => sum + process.listenerCount(sig), 0);
}

test('onShutdown subscribes once for first handler; multiple handlers do not re-subscribe', () => {
  const sig = createNodeSignalSubscription();
  const before = listenerCount();

  const h1 = () => {};
  sig.onShutdown(h1);
  assert.ok(listenerCount() > before, 'must add listeners after first handler');
  const afterFirst = listenerCount();

  const h2 = () => {};
  sig.onShutdown(h2);
  assert.equal(listenerCount(), afterFirst, 'must NOT re-subscribe for second handler');
});

test('removeShutdownHandler unsubscribes when last handler is removed', () => {
  const sig = createNodeSignalSubscription();
  const before = listenerCount();

  const h1 = () => {};
  sig.onShutdown(h1);
  sig.removeShutdownHandler(h1);
  assert.equal(listenerCount(), before, 'must remove all signal listeners when last handler is gone');
});

test('removeShutdownHandler of middle handler keeps subscription alive', () => {
  const sig = createNodeSignalSubscription();
  const before = listenerCount();

  const h1 = () => {};
  const h2 = () => {};
  sig.onShutdown(h1);
  sig.onShutdown(h2);
  sig.removeShutdownHandler(h1);
  assert.ok(listenerCount() > before, 'must keep signal listeners while at least one handler remains');

  sig.removeShutdownHandler(h2);
  assert.equal(listenerCount(), before, 'must fully unsubscribe when all handlers removed');
});

test('subscription handlers are invoked when signal fires (production binding)', () => {
  const sig = createNodeSignalSubscription();
  const called: string[] = [];

  const h1 = () => { called.push('h1'); };
  const h2 = () => { called.push('h2'); };
  sig.onShutdown(h1);
  sig.onShutdown(h2);

  // Fire SIGINT programmatically
  process.emit('SIGINT', 'SIGINT');

  assert.deepEqual(called, ['h1', 'h2'], 'both handlers must be invoked');
  called.length = 0;

  process.emit('SIGTERM', 'SIGTERM');
  assert.deepEqual(called, ['h1', 'h2'], 'both handlers must be invoked on SIGTERM');

  sig.removeShutdownHandler(h1);
  sig.removeShutdownHandler(h2);
});
