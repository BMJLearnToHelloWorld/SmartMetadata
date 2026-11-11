/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import { getLogsFromResponse, useIngestionLogs } from './useIngestionLogs';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mountHarness() {
  const Harness = defineComponent({
    setup() {
      const result = useIngestionLogs({
        enabled: () => true,
        fqn: () => 'warehouse.warehouse-metadata',
        pipelineType: () => 'metadata',
        runId: () => 'r1',
        runActive: () => false,
        title: () => 'p1',
      });
      return { ...result };
    },
    template: '<div>{{ logs }}</div>',
  });
  return mount(Harness, { attachTo: document.body });
}

describe('useIngestionLogs (P-04)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('loads the first page and appends the next page on loadMore', async () => {
    let pageCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/logs/warehouse.warehouse-metadata/last')) {
          pageCalls += 1;
          if (pageCalls === 1) {
            return jsonResponse({ logs: 'line1\nline2', after: '2', total: 4 });
          }
          return jsonResponse({ logs: 'line3\nline4', after: '4', total: 4 });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const wrapper = mountHarness();
    await flushPromises();
    expect(wrapper.vm.logs).toContain('line1');
    expect(wrapper.vm.hasMore).toBe(true);
    expect(wrapper.vm.totalLines).toBe(2);
    await (wrapper.vm.loadMore as () => void)();
    await flushPromises();
    expect(wrapper.vm.logs).toContain('line3');
    expect(wrapper.vm.logs).toContain('line1');
    expect(wrapper.vm.hasMore).toBe(false);
    expect(pageCalls).toBe(2);
  });

  it('surfaces a missing run as an error state, not an empty page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('no run', { status: 404 })),
    );
    const wrapper = mountHarness();
    await flushPromises();
    expect(wrapper.vm.error).toBeTruthy();
    expect(wrapper.vm.logs).toBe('');
  });

  it('downloads via GET /last/download (P-04)', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        urls.push(url);
        if (url.includes('/last/download')) {
          // String body: the client's blob branch reads it back as a Blob.
          return new Response('line1', { status: 200 });
        }
        if (url.includes('/logs/warehouse.warehouse-metadata/last')) {
          return jsonResponse({ logs: 'line1', after: '1', total: 1 });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const wrapper = mountHarness();
    await flushPromises();
    expect(wrapper.vm.logs).toContain('line1');
    // jsdom has no createObjectURL: spy on the real URL statics (never
    // replace the URL constructor — apiRequest builds `new URL(...)`).
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    await (wrapper.vm.download as () => void)();
    await flushPromises();
    expect(urls.some((url) => url.includes('/last/download'))).toBe(true);
    expect(wrapper.vm.downloading).toBe(false);
  });

  it('prefers the generic logs key, else the pipeline-type task field', () => {
    expect(getLogsFromResponse({ logs: 'generic' }, 'metadata')).toBe('generic');
    expect(getLogsFromResponse({ profiler_task: 'profiler lines' }, 'profiler')).toBe('profiler lines');
    expect(getLogsFromResponse({}, 'metadata')).toBe('');
  });
});
