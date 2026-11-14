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
import { defineComponent, ref, type Ref } from 'vue';
import type { IngestionPipeline } from '@/types/ingestion';
import { useMetadataAgents } from './useMetadataAgents';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function sseResponse(frames: string[]): Response {
  const payload = frames.map((frame) => `data: ${frame}\n\n`).join('');
  return new Response(new TextEncoder().encode(payload), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function progressEvent(
  fqn: string,
  runId: string,
  timestamp: number,
  updateType: string,
  extra: Record<string, unknown> = {},
  ingestionPipeline?: Record<string, unknown>,
): string {
  return JSON.stringify({
    pipelineFqn: fqn,
    runId,
    ...(ingestionPipeline ? { ingestionPipeline } : {}),
    event: { runId, timestamp, updateType, ...extra },
  });
}

function pipeline(overrides: Partial<IngestionPipeline> = {}): IngestionPipeline {
  return {
    id: 'p1',
    name: 'pg-metadata',
    fullyQualifiedName: 'pg.metadata',
    pipelineType: 'metadata',
    ...overrides,
  };
}

describe('useMetadataAgents (official useMetadataAgents, driven through the real stream)', () => {
  const wrappers: Array<ReturnType<typeof mount>> = [];
  let pipelines: Ref<IngestionPipeline[]>;

  beforeEach(() => {
    localStorage.clear();
    pipelines = ref<IngestionPipeline[]>([]);
  });

  afterEach(() => {
    for (const wrapper of wrappers.splice(0)) {
      wrapper.unmount();
    }
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  function mountHarness(
    fetchImpl: (url: string) => Promise<Response>,
    identity: { entityType?: string; serviceFqn?: string } = {
      entityType: 'databaseService',
      serviceFqn: 'pg.warehouse',
    },
  ) {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => fetchImpl(String(input)));
    vi.stubGlobal('fetch', fetchMock);
    const Harness = defineComponent({
      setup() {
        const result = useMetadataAgents(
          pipelines,
          () => identity.entityType,
          () => identity.serviceFqn,
        );
        return { ...result };
      },
      template: '<div></div>',
    });
    const wrapper = mount(Harness, { attachTo: document.body });
    wrappers.push(wrapper);
    return { wrapper, fetchMock };
  }

  /** Stream mock: the given SSE bodies in order, then a fatal 503 so the stream stops. */
  function streamThenDown(bodies: Response[], onOtherUrl?: (url: string) => Promise<Response>) {
    const queue = [...bodies];
    return async (url: string): Promise<Response> => {
      if (url.includes('/progress/service/')) {
        return queue.shift() ?? new Response('no tracking', { status: 503 });
      }
      return onOtherUrl?.(url) ?? new Response('not found', { status: 404 });
    };
  }

  it('maps the parent list with no discovery and no stream identity needed', async () => {
    pipelines.value = [pipeline()];
    const { wrapper, fetchMock } = mountHarness(streamThenDown([]), {});
    expect(wrapper.vm.agents).toHaveLength(1);
    expect(wrapper.vm.agents[0]).toMatchObject({ fqn: 'pg.metadata', status: 'none' });
    expect(wrapper.vm.discoveredCount).toBe(0);
    expect(wrapper.vm.pipelinesByFqn.get('pg.metadata')?.id).toBe('p1');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('applies live progress to the matching agent', async () => {
    pipelines.value = [pipeline()];
    const { wrapper } = mountHarness(
      streamThenDown([
        sseResponse([
          progressEvent('pg.metadata', 'run-1', 1000, 'PROCESSING', { totalAssetsIngested: 25 }),
        ]),
      ]),
    );
    await vi.waitFor(() => expect(wrapper.vm.agents[0]?.status).toBe('running'));
    expect(wrapper.vm.agents[0]).toMatchObject({ assets: 25, currentRunId: 'run-1' });
  });

  it('ignores a stale replay of the same run', async () => {
    pipelines.value = [pipeline()];
    const { wrapper } = mountHarness(
      streamThenDown([
        sseResponse([
          progressEvent('pg.metadata', 'run-1', 2000, 'PROCESSING', { totalAssetsIngested: 50 }),
          progressEvent('pg.metadata', 'run-1', 1000, 'PROCESSING', { totalAssetsIngested: 99 }),
        ]),
      ]),
    );
    await vi.waitFor(() => expect(wrapper.vm.agents[0]?.assets).toBe(50));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(wrapper.vm.agents[0]?.assets).toBe(50);
  });

  it('resets progress when a new run starts', async () => {
    pipelines.value = [pipeline()];
    const { wrapper } = mountHarness(
      streamThenDown([
        sseResponse([
          progressEvent('pg.metadata', 'run-1', 1000, 'PROCESSING', { totalAssetsIngested: 50 }),
          progressEvent('pg.metadata', 'run-2', 2000, 'PROCESSING', { totalAssetsIngested: 5 }),
        ]),
      ]),
    );
    await vi.waitFor(() => expect(wrapper.vm.agents[0]?.currentRunId).toBe('run-2'));
    expect(wrapper.vm.agents[0]?.assets).toBe(5);
  });

  it('discovers an unknown agent when an event carries its entity', async () => {
    pipelines.value = [pipeline()];
    const { wrapper } = mountHarness(
      streamThenDown([
        sseResponse([
          progressEvent('pg.usage', 'run-9', 1000, 'DISCOVERY', {}, {
            id: 'p2',
            name: 'pg-usage',
            fullyQualifiedName: 'pg.usage',
            pipelineType: 'usage',
          }),
        ]),
      ]),
    );
    await vi.waitFor(() => expect(wrapper.vm.discoveredCount).toBe(1));
    expect(wrapper.vm.agents).toHaveLength(2);
    expect(wrapper.vm.pipelinesByFqn.get('pg.usage')?.pipelineType).toBe('usage');
  });

  it('does not discover non-service-agent types or events without a carried entity', async () => {
    pipelines.value = [pipeline()];
    const { wrapper } = mountHarness(
      streamThenDown([
        sseResponse([
          progressEvent('pg.suite', 'run-9', 1000, 'DISCOVERY', {}, {
            id: 'p3',
            name: 'pg-suite',
            fullyQualifiedName: 'pg.suite',
            pipelineType: 'TestSuite',
          }),
          progressEvent('pg.ghost', 'run-8', 1000, 'PROCESSING', { totalAssetsIngested: 3 }),
        ]),
      ]),
    );
    await vi.waitFor(() => expect(wrapper.vm.agents).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(wrapper.vm.discoveredCount).toBe(0);
    expect(wrapper.vm.agents).toHaveLength(1);
  });

  it('prunes a discovered entry once the parent list carries it', async () => {
    pipelines.value = [pipeline()];
    const carried = pipeline({
      id: 'p2',
      name: 'pg-usage',
      fullyQualifiedName: 'pg.usage',
      pipelineType: 'usage',
    });
    const { wrapper } = mountHarness(
      streamThenDown([
        sseResponse([
          progressEvent('pg.usage', 'run-9', 1000, 'DISCOVERY', {}, {
            id: 'p2',
            name: 'pg-usage',
            fullyQualifiedName: 'pg.usage',
            pipelineType: 'usage',
          }),
        ]),
      ]),
    );
    await vi.waitFor(() => expect(wrapper.vm.discoveredCount).toBe(1));
    pipelines.value = [...pipelines.value, carried];
    await vi.waitFor(() => expect(wrapper.vm.discoveredCount).toBe(0));
    expect(wrapper.vm.agents).toHaveLength(2);
  });

  it('reconciles a completed run by refetching into the parent ref', async () => {
    pipelines.value = [
      pipeline({
        pipelineStatuses: [{ runId: 'run-1', pipelineState: 'running', timestamp: 1000 }],
      }),
    ];
    const fresh = {
      id: 'p1',
      name: 'pg-metadata',
      fullyQualifiedName: 'pg.metadata',
      pipelineType: 'metadata',
      pipelineStatuses: [
        {
          runId: 'run-1',
          pipelineState: 'success',
          timestamp: 1000,
          endDate: 2000,
          status: [{ name: 'metadata', records: 40, errors: 0, warnings: 0 }],
        },
      ],
    };
    const { wrapper, fetchMock } = mountHarness(
      streamThenDown(
        [sseResponse([progressEvent('pg.metadata', 'run-1', 2000, 'PIPELINE_COMPLETE')])],
        async (url) =>
          url.includes('/ingestionPipelines/name/') ? jsonResponse(fresh) : new Response('x', { status: 404 }),
      ),
    );
    await vi.waitFor(() => expect(wrapper.vm.agents[0]?.status).toBe('success'));
    await vi.waitFor(() =>
      expect(pipelines.value[0]?.pipelineStatuses?.[0]?.pipelineState).toBe('success'),
    );
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/ingestionPipelines/name/pg.metadata'))).toBe(
      true,
    );
    expect(wrapper.vm.agents[0]).toMatchObject({ status: 'success', assets: 40 });
  });

  it('keeps the terminal override when the reconcile refetch fails', async () => {
    pipelines.value = [
      pipeline({
        pipelineStatuses: [{ runId: 'run-1', pipelineState: 'running', timestamp: 1000 }],
      }),
    ];
    const { wrapper } = mountHarness(
      streamThenDown(
        [
          sseResponse([
            progressEvent('pg.metadata', 'run-1', 2000, 'PIPELINE_COMPLETE', {
              totalAssetsIngested: 33,
            }),
          ]),
        ],
        async () => new Response('gone', { status: 404 }),
      ),
    );
    await vi.waitFor(() => expect(wrapper.vm.agents[0]?.status).toBe('success'));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(wrapper.vm.agents[0]).toMatchObject({ status: 'success', assets: 33, pct: 100 });
    expect(pipelines.value[0]?.pipelineStatuses?.[0]?.pipelineState).toBe('running');
  });
});
