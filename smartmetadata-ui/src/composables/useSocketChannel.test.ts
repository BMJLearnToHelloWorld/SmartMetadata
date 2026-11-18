/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { AUTH_STORAGE_KEY, persistSession } from '@/auth/token';

const { createdSockets, ioMock } = vi.hoisted(() => {
  type HandlerFn = (...args: unknown[]) => void;

  class FakeSocketImpl {
    listeners = new Map<string, Set<HandlerFn>>();
    connectCalls = 0;
    disconnectCalls = 0;
    io: { opts: { query?: Record<string, unknown> } };

    constructor(
      public url: string | undefined,
      public options: Record<string, unknown>,
    ) {
      this.io = { opts: { query: { ...(options.query as Record<string, unknown>) } } };
    }

    on(event: string, handler: HandlerFn): this {
      let set = this.listeners.get(event);
      if (!set) {
        set = new Set();
        this.listeners.set(event, set);
      }
      set.add(handler);
      return this;
    }

    off(event: string, handler?: HandlerFn): this {
      if (!handler) {
        this.listeners.delete(event);
      } else {
        this.listeners.get(event)?.delete(handler);
      }
      return this;
    }

    emit(event: string, ...args: unknown[]): void {
      for (const handler of [...(this.listeners.get(event) ?? [])]) {
        handler(...args);
      }
    }

    connect(): this {
      this.connectCalls += 1;
      return this;
    }

    disconnect(): this {
      this.disconnectCalls += 1;
      return this;
    }
  }

  const created: FakeSocketImpl[] = [];
  const mock = vi.fn((urlOrOptions: unknown, maybeOptions?: unknown) => {
    const socket = new FakeSocketImpl(
      typeof urlOrOptions === 'string' ? urlOrOptions : undefined,
      (typeof urlOrOptions === 'string' ? maybeOptions : urlOrOptions) as Record<string, unknown>,
    );
    created.push(socket);
    return socket;
  });
  return { FakeSocket: FakeSocketImpl, createdSockets: created, ioMock: mock };
});

vi.mock('socket.io-client', () => ({ io: ioMock }));

import { useSocketStore } from '@/stores/socket';
import {
  createCompletionConsumedGuard,
  isMatchingExportJob,
  mergeAppRunRecord,
  parseSocketPayload,
  SOCKET_CHANNELS,
  useSocketChannel,
  type SocketChannel,
} from './useSocketChannel';

beforeEach(() => {
  setActivePinia(createPinia());
  createdSockets.length = 0;
  ioMock.mockClear();
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  persistSession(window.localStorage, { accessToken: 'token-1', tokenType: 'Bearer' });
});

afterEach(() => {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  vi.restoreAllMocks();
});

function mountConsumer(
  channel: SocketChannel,
  handler: (payload: Record<string, unknown>) => void,
) {
  const harness = defineComponent({
    setup() {
      useSocketChannel(channel, handler);
      return () => h('div', 'consumer');
    },
  });
  return mount(harness, { attachTo: document.body });
}

describe('useSocketChannel lifecycle', () => {
  it('subscribes when the socket appears and delivers parsed payloads', async () => {
    const handler = vi.fn();
    const wrapper = mountConsumer(SOCKET_CHANNELS.CSV_EXPORT, handler);
    const store = useSocketStore();
    store.ensureConnection('user-1');
    await nextTick();
    const socket = createdSockets[0];
    socket.emit(SOCKET_CHANNELS.CSV_EXPORT, '{"jobId":"j1","status":"COMPLETED"}');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ jobId: 'j1', status: 'COMPLETED' });
    wrapper.unmount();
  });

  it('unsubscribes per-handler on unmount without touching other listeners', async () => {
    const handler = vi.fn();
    const other = vi.fn();
    const wrapper = mountConsumer(SOCKET_CHANNELS.CSV_EXPORT, handler);
    const store = useSocketStore();
    store.ensureConnection('user-1');
    await nextTick();
    const socket = createdSockets[0];
    socket.on(SOCKET_CHANNELS.CSV_EXPORT, other as never);
    expect(socket.listeners.get(SOCKET_CHANNELS.CSV_EXPORT)?.size).toBe(2);
    wrapper.unmount();
    // Only this consumer's handler was removed (B6).
    expect(socket.listeners.get(SOCKET_CHANNELS.CSV_EXPORT)?.size).toBe(1);
    socket.emit(SOCKET_CHANNELS.CSV_EXPORT, '{"jobId":"j1"}');
    expect(handler).not.toHaveBeenCalled();
    expect(other).toHaveBeenCalledTimes(1);
  });

  it('resubscribes on socket replacement and cleans the old instance', async () => {
    const handler = vi.fn();
    const wrapper = mountConsumer(SOCKET_CHANNELS.SEARCH_INDEX_JOB, handler);
    const store = useSocketStore();
    store.ensureConnection('user-1');
    await nextTick();
    const first = createdSockets[0];
    store.ensureConnection('user-2');
    await nextTick();
    const second = createdSockets[1];
    expect(first.listeners.get(SOCKET_CHANNELS.SEARCH_INDEX_JOB)?.size ?? 0).toBe(0);
    expect(second.listeners.get(SOCKET_CHANNELS.SEARCH_INDEX_JOB)?.size).toBe(1);
    first.emit(SOCKET_CHANNELS.SEARCH_INDEX_JOB, '{"appId":"a"}');
    expect(handler).not.toHaveBeenCalled();
    second.emit(SOCKET_CHANNELS.SEARCH_INDEX_JOB, '{"appId":"a"}');
    expect(handler).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('does not resubscribe on reconnect (same instance keeps its listeners)', async () => {
    const handler = vi.fn();
    const wrapper = mountConsumer(SOCKET_CHANNELS.CSV_EXPORT, handler);
    const store = useSocketStore();
    store.ensureConnection('user-1');
    await nextTick();
    const socket = createdSockets[0];
    socket.emit('disconnect', 'transport close');
    socket.emit('connect');
    await nextTick();
    expect(socket.listeners.get(SOCKET_CHANNELS.CSV_EXPORT)?.size).toBe(1);
    socket.emit(SOCKET_CHANNELS.CSV_EXPORT, '{"jobId":"j1"}');
    expect(handler).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});

describe('parseSocketPayload', () => {
  it('parses valid JSON objects', () => {
    expect(parseSocketPayload('{"a":1}', 'ch')).toEqual({ a: 1 });
  });

  it('drops empty payloads silently', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseSocketPayload('', 'ch')).toBeNull();
    expect(parseSocketPayload(null, 'ch')).toBeNull();
    expect(parseSocketPayload(undefined, 'ch')).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('drops unparseable JSON with a non-sensitive diagnostic', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseSocketPayload('{bad json', 'csvExportChannel')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain('csvExportChannel');
    expect(message).not.toContain('bad json');
  });

  it('drops non-string and non-object payloads', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseSocketPayload({ already: 'object' }, 'ch')).toBeNull();
    expect(parseSocketPayload('42', 'ch')).toBeNull();
    expect(parseSocketPayload('[1,2]', 'ch')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(3);
  });
});

describe('isMatchingExportJob', () => {
  it('matches only strict jobId equality with a current job', () => {
    expect(isMatchingExportJob({ jobId: 'j1' }, 'j1')).toBe(true);
    expect(isMatchingExportJob({ jobId: 'j2' }, 'j1')).toBe(false);
    expect(isMatchingExportJob({}, 'j1')).toBe(false);
    expect(isMatchingExportJob({ jobId: 'j1' }, null)).toBe(false);
    expect(isMatchingExportJob({ jobId: 'j1' }, undefined)).toBe(false);
    expect(isMatchingExportJob({ jobId: 'j1' }, '')).toBe(false);
    expect(isMatchingExportJob({ jobId: '' }, '')).toBe(false);
  });
});

describe('createCompletionConsumedGuard', () => {
  it('consumes once per jobId until reset', () => {
    const guard = createCompletionConsumedGuard();
    expect(guard.consume('j1')).toBe(true);
    expect(guard.consume('j1')).toBe(false);
    expect(guard.consume('j1')).toBe(false);
    guard.reset();
    expect(guard.consume('j1')).toBe(true);
  });

  it('a new jobId consumes independently', () => {
    const guard = createCompletionConsumedGuard();
    expect(guard.consume('j1')).toBe(true);
    expect(guard.consume('j2')).toBe(true);
    expect(guard.consume('j2')).toBe(false);
  });
});

describe('mergeAppRunRecord', () => {
  const row = (appId: string, startTime: number, extra: Record<string, unknown> = {}) => ({
    id: `${appId}-run-${startTime}`,
    appId,
    startTime,
    status: 'RUNNING',
    ...extra,
  });

  it('overlays matching fields and keeps the existing row id (V-C1)', () => {
    const list = [row('app-1', 100, { status: 'RUNNING', progress: 10 })];
    const merged = mergeAppRunRecord(list, {
      appId: 'app-1',
      startTime: 100,
      status: 'COMPLETED',
      id: 'different-id',
    });
    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual({
      id: 'app-1-run-100',
      appId: 'app-1',
      startTime: 100,
      status: 'COMPLETED',
      progress: 10,
    });
  });

  it('does not merge the same app with a different startTime (V-C5)', () => {
    const list = [row('app-1', 100)];
    const merged = mergeAppRunRecord(list, { appId: 'app-1', startTime: 200, status: 'FAILED' });
    expect(merged[0].status).toBe('RUNNING');
  });

  it('never appends unknown runs (V-C6)', () => {
    const list = [row('app-1', 100)];
    const merged = mergeAppRunRecord(list, { appId: 'app-9', startTime: 100, status: 'FAILED' });
    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual(list[0]);
  });

  it('drops records missing a key field', () => {
    const list = [row('app-1', 100)];
    expect(mergeAppRunRecord(list, { startTime: 100 })).toBe(list);
    expect(mergeAppRunRecord(list, { appId: 'app-1' })).toBe(list);
    expect(mergeAppRunRecord(list, { appId: null, startTime: 100 })).toBe(list);
  });

  it('is idempotent for repeated events (V-C7)', () => {
    const list = [row('app-1', 100)];
    const update = { appId: 'app-1', startTime: 100, status: 'COMPLETED' };
    const once = mergeAppRunRecord(list, update);
    const twice = mergeAppRunRecord(once, update);
    expect(twice).toEqual(once);
  });

  it('lets later events overwrite earlier ones (no timestamp guard)', () => {
    const list = [row('app-1', 100)];
    const newer = mergeAppRunRecord(list, {
      appId: 'app-1',
      startTime: 100,
      status: 'COMPLETED',
      timestamp: 500,
    });
    const older = mergeAppRunRecord(newer, {
      appId: 'app-1',
      startTime: 100,
      status: 'RUNNING',
      timestamp: 300,
    });
    expect(older[0].status).toBe('RUNNING');
  });

  it('uses strict equality for the match key', () => {
    const list = [row('app-1', 100)];
    // String '100' must not match numeric 100.
    const merged = mergeAppRunRecord(list, { appId: 'app-1', startTime: '100', status: 'FAILED' });
    expect(merged[0].status).toBe('RUNNING');
  });
});
