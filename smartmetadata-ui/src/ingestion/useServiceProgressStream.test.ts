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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, ref } from 'vue';
import { loadSession, persistSession } from '@/auth/token';
import type { Agent, ServiceProgressEvent } from '@/types/ingestion';
import { applyProgressToAgent } from './agentsProgress';
import {
  FatalStreamError,
  RetriableStreamError,
  abortableSleep,
  createStreamRetryState,
  getBackoffDelay,
  getServiceProgressStreamUrl,
  handleStreamOpen,
  nextRetryHealth,
  parseServiceProgressEvent,
  parseSseBuffer,
  subscribeToStream,
  useServiceProgressStream,
  type StreamHealth,
} from './useServiceProgressStream';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function sseResponse(payload: string): Response {
  return new Response(new TextEncoder().encode(payload), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function progressPayload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    pipelineFqn: 'pg.metadata',
    runId: 'run-1',
    event: {
      runId: 'run-1',
      timestamp: 1700000000000,
      updateType: 'PROCESSING',
      totalAssetsIngested: 12,
      ...overrides,
    },
  });
}

describe('stream retry policy (official SseStreamUtils)', () => {
  it('backs off exponentially, capped at 30s', () => {
    expect(getBackoffDelay(1)).toBe(1000);
    expect(getBackoffDelay(2)).toBe(2000);
    expect(getBackoffDelay(3)).toBe(4000);
    expect(getBackoffDelay(6)).toBe(30000);
    expect(getBackoffDelay(10)).toBe(30000);
  });

  it('stays connecting until the fifth attempt, then reports down', () => {
    const state = createStreamRetryState();
    expect(state).toEqual({ attempts: 0, unauthorizedCount: 0 });
    state.attempts = 4;
    expect(nextRetryHealth(state)).toBe('connecting');
    state.attempts = 5;
    expect(nextRetryHealth(state)).toBe('down');
  });

  it('resets the retry budget on a successful open', async () => {
    const state = createStreamRetryState();
    state.attempts = 3;
    state.unauthorizedCount = 1;
    await handleStreamOpen({ ok: true, status: 200 }, state);
    expect(state).toEqual({ attempts: 0, unauthorizedCount: 0 });
  });

  it('treats 503 as fatal unavailable and other errors as retriable', async () => {
    await expect(handleStreamOpen({ ok: false, status: 503 }, createStreamRetryState())).rejects.toBeInstanceOf(
      FatalStreamError,
    );
    try {
      await handleStreamOpen({ ok: false, status: 503 }, createStreamRetryState());
      expect.unreachable();
    } catch (error) {
      expect((error as FatalStreamError).reason).toBe('unavailable');
    }
    await expect(handleStreamOpen({ ok: false, status: 404 }, createStreamRetryState())).rejects.toBeInstanceOf(
      RetriableStreamError,
    );
    await expect(handleStreamOpen({ ok: false, status: 500 }, createStreamRetryState())).rejects.toBeInstanceOf(
      RetriableStreamError,
    );
  });

  it('retries the first 401 and fails fatally on the second consecutive one', async () => {
    localStorage.clear();
    const state = createStreamRetryState();
    await expect(handleStreamOpen({ ok: false, status: 401 }, state)).rejects.toBeInstanceOf(
      RetriableStreamError,
    );
    expect(state.unauthorizedCount).toBe(1);
    try {
      await handleStreamOpen({ ok: false, status: 401 }, state);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(FatalStreamError);
      expect((error as FatalStreamError).reason).toBe('down');
    }
  });

  it('refreshes the stored session on the first 401 when a refresh token exists', async () => {
    localStorage.clear();
    persistSession(localStorage, {
      accessToken: 'old-tok',
      refreshToken: 'refresh-tok',
      tokenType: 'Bearer',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ accessToken: 'new-tok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    await expect(
      handleStreamOpen({ ok: false, status: 401 }, createStreamRetryState()),
    ).rejects.toBeInstanceOf(RetriableStreamError);
    expect(loadSession(localStorage)?.accessToken).toBe('new-tok');
  });
});

describe('abortableSleep (official SseStreamUtils)', () => {
  it('resolves after the delay when the signal never aborts', async () => {
    await expect(abortableSleep(1, new AbortController().signal)).resolves.toBeUndefined();
  });

  it('resolves on abort instead of waiting out the delay', async () => {
    const controller = new AbortController();
    let resolved = false;
    const done = abortableSleep(30_000, controller.signal).then(() => {
      resolved = true;
    });
    controller.abort();
    await done;
    expect(resolved).toBe(true);
  });
});

describe('parseSseBuffer', () => {
  it('splits frames at blank lines, joining multi-line data payloads', () => {
    const { events, remainder } = parseSseBuffer('data: {"a":1}\n\ndata: line1\ndata: line2\n\n');
    expect(events).toEqual(['{"a":1}', 'line1\nline2']);
    expect(remainder).toBe('');
  });

  it('skips heartbeat comments and frames without data', () => {
    const { events, remainder } = parseSseBuffer(': heartbeat\n\nevent: ping\n\ndata: x\n\n');
    expect(events).toEqual(['x']);
    expect(remainder).toBe('');
  });

  it('returns the trailing partial frame as the remainder', () => {
    const { events, remainder } = parseSseBuffer('data: done\n\ndata: par');
    expect(events).toEqual(['done']);
    expect(remainder).toBe('data: par');
  });

  it('strips the single space after data:', () => {
    expect(parseSseBuffer('data:  spaced\n\n').events).toEqual([' spaced']);
  });
});

describe('parseServiceProgressEvent', () => {
  it('maps a full event including counters, the progress tree, and the embedded pipeline', () => {
    const parsed = parseServiceProgressEvent(
      progressPayload({
        globalCounters: [{ entityType: 'Table', done: 5, total: 10 }],
        progress: { label: 'db', processed: 5, children: [{ label: 's', processed: 5 }] },
        stepName: 'metadata',
        estimatedSecondsRemaining: 42,
      }),
    );
    expect(parsed?.pipelineFqn).toBe('pg.metadata');
    expect(parsed?.runId).toBe('run-1');
    expect(parsed?.event).toMatchObject({
      runId: 'run-1',
      timestamp: 1700000000000,
      updateType: 'PROCESSING',
      totalAssetsIngested: 12,
      stepName: 'metadata',
      estimatedSecondsRemaining: 42,
    });
    expect(parsed?.event.globalCounters).toEqual([{ entityType: 'Table', done: 5, total: 10 }]);
    expect(parsed?.event.progress).toMatchObject({ label: 'db', processed: 5 });
  });

  it('preserves an explicit null ETA and distinguishes it from an absent field', () => {
    const nulled = parseServiceProgressEvent(progressPayload({ estimatedSecondsRemaining: null }));
    expect(nulled?.event.estimatedSecondsRemaining).toBeNull();
    const absent = parseServiceProgressEvent(progressPayload({}));
    expect(absent?.event.estimatedSecondsRemaining).toBeUndefined();
  });

  it('clears a stale ETA end to end when the mapped event carries an explicit null', () => {
    const agent: Agent = {
      id: 'p1',
      fqn: 'pg.metadata',
      pipelineType: 'metadata',
      name: 'Metadata Agent',
      type: 'Metadata',
      unit: 'assets',
      verb: 'ingested',
      status: 'running',
      pct: 50,
      eta: 90,
      assets: 5,
      target: 10,
      errors: 0,
      warnings: 0,
      recentRuns: [],
    };
    const nulled = parseServiceProgressEvent(progressPayload({ estimatedSecondsRemaining: null }));
    expect(nulled).not.toBeNull();
    expect(applyProgressToAgent(agent, nulled!.event).eta).toBeNull();
    const absent = parseServiceProgressEvent(progressPayload({}));
    expect(absent).not.toBeNull();
    expect(applyProgressToAgent(agent, absent!.event).eta).toBe(90);
  });

  it('carries an embedded pipeline when present and mappable', () => {
    const parsed = parseServiceProgressEvent(
      JSON.stringify({
        pipelineFqn: 'pg.metadata',
        runId: 'run-1',
        ingestionPipeline: { id: 'p1', name: 'pg-metadata', pipelineType: 'metadata' },
        event: { runId: 'run-1', timestamp: 1, updateType: 'DISCOVERY' },
      }),
    );
    expect(parsed?.ingestionPipeline).toMatchObject({ id: 'p1', name: 'pg-metadata' });
  });

  it('returns null for malformed frames, never throwing', () => {
    expect(parseServiceProgressEvent('not json')).toBeNull();
    expect(parseServiceProgressEvent('{"a":1}')).toBeNull();
    expect(parseServiceProgressEvent(progressPayload({ updateType: 'BOGUS' }))).toBeNull();
    expect(parseServiceProgressEvent(progressPayload({ timestamp: undefined }))).toBeNull();
    expect(
      parseServiceProgressEvent(JSON.stringify({ runId: 'r', event: { runId: 'r', timestamp: 1, updateType: 'PROCESSING' } })),
    ).toBeNull();
  });

  it('drops an unmappable embedded pipeline instead of rejecting the event', () => {
    const parsed = parseServiceProgressEvent(
      JSON.stringify({
        pipelineFqn: 'pg.metadata',
        runId: 'run-1',
        ingestionPipeline: { displayName: 'orphan' },
        event: { runId: 'run-1', timestamp: 1, updateType: 'DISCOVERY' },
      }),
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.ingestionPipeline).toBeUndefined();
  });
});

describe('getServiceProgressStreamUrl', () => {
  it('builds the server progress endpoint with the encoded fqn', () => {
    expect(getServiceProgressStreamUrl('databaseService', 'pg.warehouse')).toBe(
      '/api/v1/services/ingestionPipelines/progress/service/databaseService/pg.warehouse/stream',
    );
    expect(getServiceProgressStreamUrl('databaseService', 'a b/c')).toContain('a%20b%2Fc');
  });
});

describe('subscribeToStream registry', () => {
  const unsubscribes: Array<() => void> = [];

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    for (const unsubscribe of unsubscribes.splice(0)) {
      unsubscribe();
    }
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('reports connecting immediately and unavailable on a fatal 503 without retrying', async () => {
    const fetchMock = vi.fn(async () => new Response('no tracking', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const health: StreamHealth[] = [];
    unsubscribes.push(subscribeToStream('/api/stream-a', { onEvent: () => {}, onHealth: (h) => health.push(h) }));
    expect(health).toEqual(['connecting']);
    await vi.waitFor(() => expect(health).toContain('unavailable'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('delivers parsed events to subscribers and reconnects after a clean close', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sseResponse(`data: ${progressPayload()}\n\n`))
      .mockResolvedValue(new Response('no tracking', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const events: ServiceProgressEvent[] = [];
    const health: StreamHealth[] = [];
    unsubscribes.push(
      subscribeToStream('/api/stream-b', {
        onEvent: (event) => events.push(event),
        onHealth: (h) => health.push(h),
      }),
    );
    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]?.pipelineFqn).toBe('pg.metadata');
    expect(health).toContain('live');
    await vi.waitFor(() => expect(health).toContain('unavailable'), { timeout: 5000 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shares one connection between subscribers of the same URL', async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn(() => pending);
    vi.stubGlobal('fetch', fetchMock);
    const health1: StreamHealth[] = [];
    const health2: StreamHealth[] = [];
    unsubscribes.push(
      subscribeToStream('/api/stream-c', { onEvent: () => {}, onHealth: (h) => health1.push(h) }),
      subscribeToStream('/api/stream-c', { onEvent: () => {}, onHealth: (h) => health2.push(h) }),
    );
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch?.(new Response('no tracking', { status: 503 }));
    await vi.waitFor(() => expect(health1).toContain('unavailable'));
    await vi.waitFor(() => expect(health2).toContain('unavailable'));
  });

  it('drops the registry entry when the last subscriber leaves', async () => {
    const fetchMock = vi.fn(async () => new Response('no tracking', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const first = subscribeToStream('/api/stream-d', { onEvent: () => {}, onHealth: () => {} });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    first();
    unsubscribes.push(subscribeToStream('/api/stream-d', { onEvent: () => {}, onHealth: () => {} }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('lets a late subscriber reconnect fresh after a fatal termination', async () => {
    const fetchMock = vi.fn(async () => new Response('no tracking', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const health1: StreamHealth[] = [];
    unsubscribes.push(
      subscribeToStream('/api/stream-e', { onEvent: () => {}, onHealth: (h) => health1.push(h) }),
    );
    await vi.waitFor(() => expect(health1).toContain('unavailable'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The first subscriber is still attached: the fatal drop must
    // still let a late joiner open a fresh connection instead of
    // joining the permanently silent terminated one.
    const health2: StreamHealth[] = [];
    unsubscribes.push(
      subscribeToStream('/api/stream-e', { onEvent: () => {}, onHealth: (h) => health2.push(h) }),
    );
    expect(health2).toEqual(['connecting']);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(health2).toContain('unavailable'));
  });
});

describe('useServiceProgressStream', () => {
  const wrappers: Array<ReturnType<typeof mount>> = [];

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    for (const wrapper of wrappers.splice(0)) {
      wrapper.unmount();
    }
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  function mountHarness(entityType: string | undefined, serviceFqn: string | undefined) {
    const Harness = defineComponent({
      setup() {
        const { streamHealth } = useServiceProgressStream(
          ref(entityType),
          ref(serviceFqn),
          () => {},
        );
        return { streamHealth };
      },
      template: '<div>{{ streamHealth }}</div>',
    });
    const wrapper = mount(Harness, { attachTo: document.body });
    wrappers.push(wrapper);
    return wrapper;
  }

  it('does not fetch when the service identity is missing', async () => {
    const fetchMock = vi.fn(async () => new Response('x', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountHarness(undefined, undefined);
    expect(wrapper.vm.streamHealth).toBe('connecting');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reflects the terminal health and unsubscribes on unmount', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response('no tracking', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountHarness('databaseService', 'pg.warehouse');
    await vi.waitFor(() => expect(wrapper.vm.streamHealth).toBe('unavailable'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/api/v1/services/ingestionPipelines/progress/service/databaseService/pg.warehouse/stream',
    );
    wrapper.unmount();
    subscribeToStream(getServiceProgressStreamUrl('databaseService', 'pg.warehouse'), {
      onEvent: () => {},
      onHealth: () => {},
    })();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
