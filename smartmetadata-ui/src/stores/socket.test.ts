/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_STORAGE_KEY, persistSession } from '@/auth/token';

const { FakeSocket, createdSockets, ioMock } = vi.hoisted(() => {
  type HandlerFn = (...args: unknown[]) => void;

  class FakeSocketImpl {
    listeners = new Map<string, Set<HandlerFn>>();
    connected = false;
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
      this.connected = false;
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

type FakeSocket = InstanceType<typeof FakeSocket>;

vi.mock('socket.io-client', () => ({ io: ioMock }));

import {
  deriveSocketTarget,
  useSocketStore,
} from '@/stores/socket';

function seedSession(token: string): void {
  persistSession(window.localStorage, { accessToken: token, tokenType: 'Bearer' });
}

beforeEach(() => {
  setActivePinia(createPinia());
  createdSockets.length = 0;
  ioMock.mockClear();
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  vi.unstubAllEnvs();
});

describe('deriveSocketTarget', () => {
  it('derives the same-origin path from the default /api base', () => {
    expect(deriveSocketTarget('/api')).toEqual({ path: '/api/v1/push/feed' });
  });

  it('keeps an absolute base origin and path prefix', () => {
    expect(deriveSocketTarget('https://api.example.com/prefix/api')).toEqual({
      url: 'https://api.example.com',
      path: '/prefix/api/v1/push/feed',
    });
  });

  it('handles an absolute base without a path prefix', () => {
    expect(deriveSocketTarget('https://api.example.com')).toEqual({
      url: 'https://api.example.com',
      path: '/v1/push/feed',
    });
  });

  it('strips a trailing slash before appending', () => {
    expect(deriveSocketTarget('/api/')).toEqual({ path: '/api/v1/push/feed' });
  });
});

describe('useSocketStore gate', () => {
  it('does not connect without a session token', () => {
    const store = useSocketStore();
    expect(store.ensureConnection('user-1')).toBeNull();
    expect(ioMock).not.toHaveBeenCalled();
    expect(store.socket).toBeNull();
  });

  it('does not connect without a user id', () => {
    seedSession('token-1');
    const store = useSocketStore();
    expect(store.ensureConnection(undefined)).toBeNull();
    expect(store.ensureConnection('')).toBeNull();
    expect(ioMock).not.toHaveBeenCalled();
  });

  it('connects once with the official-equivalent parameters', () => {
    seedSession('token-1');
    const store = useSocketStore();
    const socket = store.ensureConnection('user-1');
    expect(socket).not.toBeNull();
    expect(ioMock).toHaveBeenCalledTimes(1);
    expect(ioMock).toHaveBeenCalledWith({
      path: '/api/v1/push/feed',
      reconnection: false,
      query: { token: 'token-1', userId: 'user-1' },
      transports: ['websocket'],
    });
    expect(store.socket).toBe(socket);
  });

  it('is idempotent for the same user', () => {
    seedSession('token-1');
    const store = useSocketStore();
    const first = store.ensureConnection('user-1');
    const second = store.ensureConnection('user-1');
    expect(second).toBe(first);
    expect(ioMock).toHaveBeenCalledTimes(1);
  });

  it('passes an absolute API base origin through', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/custom/api');
    seedSession('token-1');
    const store = useSocketStore();
    store.ensureConnection('user-1');
    expect(ioMock).toHaveBeenCalledWith('https://api.example.com', {
      path: '/custom/api/v1/push/feed',
      reconnection: false,
      query: { token: 'token-1', userId: 'user-1' },
      transports: ['websocket'],
    });
  });

  it('disposes the old connection when the user changes', () => {
    seedSession('token-1');
    const store = useSocketStore();
    const first = store.ensureConnection('user-1') as unknown as FakeSocket;
    const second = store.ensureConnection('user-2');
    expect(second).not.toBe(first);
    expect(first.disconnectCalls).toBe(1);
    expect(ioMock).toHaveBeenCalledTimes(2);
  });

  it('disposes when the gate closes after connecting', () => {
    seedSession('token-1');
    const store = useSocketStore();
    const socket = store.ensureConnection('user-1') as unknown as FakeSocket;
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    expect(store.ensureConnection('user-1')).toBeNull();
    expect(socket.disconnectCalls).toBe(1);
    expect(store.socket).toBeNull();
  });
});

describe('useSocketStore reconnect driver', () => {
  function connectStore(): { store: ReturnType<typeof useSocketStore>; socket: FakeSocket } {
    seedSession('token-1');
    const store = useSocketStore();
    const socket = store.ensureConnection('user-1') as unknown as FakeSocket;
    return { store, socket };
  }

  it('reconnects on connect_error with 1s/2s/4s backoff and a 3-attempt budget', () => {
    const { socket } = connectStore();
    socket.emit('connect_error', new Error('refused'));
    expect(socket.connectCalls).toBe(0);
    vi.advanceTimersByTime(999);
    expect(socket.connectCalls).toBe(0);
    vi.advanceTimersByTime(1);
    expect(socket.connectCalls).toBe(1);

    socket.emit('connect_error', new Error('refused'));
    vi.advanceTimersByTime(2000);
    expect(socket.connectCalls).toBe(2);

    socket.emit('connect_error', new Error('refused'));
    vi.advanceTimersByTime(4000);
    expect(socket.connectCalls).toBe(3);

    // Budget exhausted: a fourth failure schedules nothing.
    socket.emit('connect_error', new Error('refused'));
    vi.advanceTimersByTime(30000);
    expect(socket.connectCalls).toBe(3);
  });

  it('resets the budget on connect', () => {
    const { socket } = connectStore();
    socket.emit('connect_error', new Error('refused'));
    vi.advanceTimersByTime(1000);
    expect(socket.connectCalls).toBe(1);
    socket.emit('connect');
    socket.emit('connect_error', new Error('refused'));
    vi.advanceTimersByTime(1000);
    expect(socket.connectCalls).toBe(2);
  });

  it('re-reads the token before reconnecting and updates the handshake query', () => {
    const { socket } = connectStore();
    socket.emit('connect_error', new Error('refused'));
    seedSession('token-2');
    vi.advanceTimersByTime(1000);
    expect(socket.io.opts.query).toEqual({ token: 'token-2', userId: 'user-1' });
    expect(socket.connectCalls).toBe(1);
  });

  it('stops and disposes when the session is gone at retry time', () => {
    const { store, socket } = connectStore();
    socket.emit('connect_error', new Error('refused'));
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    vi.advanceTimersByTime(1000);
    expect(socket.connectCalls).toBe(0);
    expect(socket.disconnectCalls).toBe(1);
    expect(store.socket).toBeNull();
  });

  it('does not retry non-retryable disconnect reasons', () => {
    const { socket } = connectStore();
    socket.emit('disconnect', 'io server disconnect');
    vi.advanceTimersByTime(30000);
    expect(socket.connectCalls).toBe(0);
    socket.emit('disconnect', 'io client disconnect');
    vi.advanceTimersByTime(30000);
    expect(socket.connectCalls).toBe(0);
  });

  it('retries retryable disconnect reasons', () => {
    const { socket } = connectStore();
    socket.emit('disconnect', 'transport close');
    vi.advanceTimersByTime(1000);
    expect(socket.connectCalls).toBe(1);
  });

  it('does not schedule two timers for overlapping failures', () => {
    const { socket } = connectStore();
    socket.emit('connect_error', new Error('a'));
    socket.emit('connect_error', new Error('b'));
    vi.advanceTimersByTime(1000);
    expect(socket.connectCalls).toBe(1);
  });

  it('dispose cancels the pending timer and disconnects', () => {
    const { store, socket } = connectStore();
    socket.emit('connect_error', new Error('refused'));
    store.disposeConnection();
    vi.advanceTimersByTime(30000);
    expect(socket.connectCalls).toBe(0);
    expect(socket.disconnectCalls).toBe(1);
    expect(store.socket).toBeNull();
  });

  it('a timer firing after dispose never reconnects', () => {
    const { store, socket } = connectStore();
    socket.emit('connect_error', new Error('refused'));
    store.disposeConnection();
    seedSession('token-2');
    store.ensureConnection('user-1');
    // The old timer was cleared; only the new socket exists.
    vi.advanceTimersByTime(30000);
    expect(socket.connectCalls).toBe(0);
    expect(createdSockets).toHaveLength(2);
  });
});
