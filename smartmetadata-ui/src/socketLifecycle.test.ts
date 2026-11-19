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
import { nextTick } from 'vue';
import { AUTH_STORAGE_KEY, persistSession } from '@/auth/token';
import { useAuthStore } from '@/stores/auth';

const { createdSockets, ioMock } = vi.hoisted(() => {
  type HandlerFn = (...args: unknown[]) => void;

  class FakeSocketImpl {
    listeners = new Map<string, Set<HandlerFn>>();
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

    connect(): this {
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
  return { createdSockets: created, ioMock: mock };
});

vi.mock('socket.io-client', () => ({ io: ioMock }));

import { installSocketLifecycle } from './socketLifecycle';
import { useSocketStore } from '@/stores/socket';

function seedSession(token: string): void {
  persistSession(window.localStorage, { accessToken: token, tokenType: 'Bearer' });
}

beforeEach(() => {
  setActivePinia(createPinia());
  createdSockets.length = 0;
  ioMock.mockClear();
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
});

afterEach(() => {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  vi.unstubAllGlobals();
});

describe('installSocketLifecycle', () => {
  it('connects once the authenticated user id appears', async () => {
    seedSession('token-1');
    installSocketLifecycle();
    expect(ioMock).not.toHaveBeenCalled();
    useAuthStore().user = { id: 'u-1', name: 'alice', displayName: 'Alice' };
    await nextTick();
    expect(ioMock).toHaveBeenCalledTimes(1);
    expect(createdSockets[0]?.options.query).toEqual({ token: 'token-1', userId: 'u-1' });
    expect(useSocketStore().socket).not.toBeNull();
  });

  it('builds no connection while the session token is missing', async () => {
    installSocketLifecycle();
    useAuthStore().user = { id: 'u-1', name: 'alice', displayName: 'Alice' };
    await nextTick();
    expect(ioMock).not.toHaveBeenCalled();
    expect(useSocketStore().socket).toBeNull();
  });

  it('replaces the connection when the user changes', async () => {
    seedSession('token-1');
    installSocketLifecycle();
    const auth = useAuthStore();
    auth.user = { id: 'u-1', name: 'alice', displayName: 'Alice' };
    await nextTick();
    auth.user = { id: 'u-2', name: 'bob', displayName: 'Bob' };
    await nextTick();
    expect(ioMock).toHaveBeenCalledTimes(2);
    expect(createdSockets[0]?.disconnectCalls).toBe(1);
    expect(createdSockets[1]?.options.query).toEqual({ token: 'token-1', userId: 'u-2' });
  });

  it('disposes the connection on logout', async () => {
    seedSession('token-1');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 200 })),
    );
    installSocketLifecycle();
    const auth = useAuthStore();
    auth.user = { id: 'u-1', name: 'alice', displayName: 'Alice' };
    auth.hydrate();
    await nextTick();
    expect(useSocketStore().socket).not.toBeNull();
    await auth.logout();
    await nextTick();
    expect(createdSockets[0]?.disconnectCalls).toBe(1);
    expect(useSocketStore().socket).toBeNull();
  });
});
