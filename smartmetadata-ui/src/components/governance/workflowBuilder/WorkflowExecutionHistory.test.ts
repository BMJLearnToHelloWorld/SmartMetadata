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
import Antd from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import WorkflowExecutionHistory from './WorkflowExecutionHistory.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const PAGE_1 = {
  data: [
    {
      id: 'run-1',
      status: 'FINISHED',
      startedAt: 1_700_000_000_000,
      endedAt: 1_700_000_000_000 + 90_061_000,
      variables: {
        global_relatedEntity: '<#E::table::svc.db.schema.orders>',
      },
    },
    {
      id: 'run-2',
      status: 'RUNNING',
      startedAt: 1_700_000_100_000,
      variables: {},
    },
  ],
  paging: { total: 3, after: 'cursor-1' },
};

const PAGE_2 = {
  data: [
    {
      id: 'run-3',
      status: 'FAILURE',
      startedAt: 1_700_000_200_000,
      endedAt: 1_700_000_200_000 + 5_000,
      variables: {
        global_relatedEntity: '<#E::dashboard::svc.marketing>',
      },
    },
  ],
  paging: { total: 3, before: 'cursor-1' },
};

async function mountHistory(fetchImpl: (input: RequestInfo | URL) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(fetchImpl));
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/workflows/:fqn', component: { template: '<div />' } },
      // The related-entity link resolves this route; it only needs to exist.
      {
        path: '/assets/:entityType/:fqn',
        name: 'asset',
        component: { template: '<div />' },
      },
    ],
  });
  await router.push('/workflows/approve-glossary-term');
  await router.isReady();
  const wrapper = mount(WorkflowExecutionHistory, {
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

describe('WorkflowExecutionHistory', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders runs with status, related entity and duration', { timeout: 15000 }, async () => {
    const wrapper = await mountHistory(async () => jsonResponse(PAGE_1));
    expect(wrapper.find('[data-testid="workflow-execution-history"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="workflow-status-badge-run-1"]').text()).toBe('Success');
    expect(wrapper.find('[data-testid="workflow-status-badge-run-2"]').text()).toBe('Running');
    // The related entity shows the trailing name and links to the table.
    expect(wrapper.find('[data-testid="related-entity-link"]').text()).toBe('orders');
    expect(wrapper.text()).toContain('1d 1h 1m 1s');
    expect(wrapper.text()).toContain('Running...');
  });

  it('pages with the response cursors', { timeout: 15000 }, async () => {
    const calls: string[] = [];
    const wrapper = await mountHistory(async (input) => {
      calls.push(String(input));
      return jsonResponse(String(input).includes('offset=cursor-1') ? PAGE_2 : PAGE_1);
    });
    const next = wrapper
      .findAll('button')
      .find((b) => b.text().trim() === 'Next');
    expect(next).toBeDefined();
    await next!.trigger('click');
    await flushPromises();
    expect(calls.some((url) => url.includes('offset=cursor-1'))).toBe(true);
    expect(wrapper.find('[data-testid="workflow-status-badge-run-3"]').text()).toBe(
      'Failed',
    );
    // Page 2 has no `after` cursor, so Next disables.
    const nextAfter = wrapper
      .findAll('button')
      .find((b) => b.text().trim() === 'Next');
    expect(nextAfter!.attributes('disabled')).toBeDefined();
  });

  it('renders the empty state when there are no runs', { timeout: 15000 }, async () => {
    const wrapper = await mountHistory(async () =>
      jsonResponse({ data: [], paging: { total: 0 } }),
    );
    expect(
      wrapper.find('[data-testid="workflow-execution-history-empty"]').exists(),
    ).toBe(true);
    expect(wrapper.text()).toContain('No runs recorded yet');
  });

  it('renders the forbidden card on 403', { timeout: 15000 }, async () => {
    const wrapper = await mountHistory(async () =>
      jsonResponse({ message: 'Forbidden' }, 403),
    );
    expect(
      wrapper.find('[data-testid="workflow-execution-history-forbidden"]').exists(),
    ).toBe(true);
  });

  it('renders an error card with a retry on other failures', { timeout: 15000 }, async () => {
    let attempts = 0;
    const wrapper = await mountHistory(async () => {
      attempts += 1;
      if (attempts === 1) {
        return jsonResponse({ message: 'boom' }, 500);
      }
      return jsonResponse(PAGE_1);
    });
    expect(wrapper.find('[data-testid="sm-state-error"]').exists()).toBe(true);
    await wrapper.find('.sm-state__retry').trigger('click');
    await flushPromises();
    expect(attempts).toBe(2);
    expect(wrapper.find('[data-testid="workflow-execution-history"]').exists()).toBe(true);
  });
});
