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
import Antd from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { persistSession } from '@/auth/token';
import { createTestI18n } from '@/test/i18n';
import WidgetAssetHealthCell from './WidgetAssetHealthCell.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mountCell(props: Record<string, unknown> = {}) {
  return mount(WidgetAssetHealthCell, {
    props: {
      tableId: 'table-1',
      tableFqn: 'svc.db.schema.table',
      serviceFqn: 'svc',
      serviceId: 'svc-id',
      testSuiteId: 'suite-1',
      ...props,
    },
    global: { plugins: [Antd, createTestI18n()], stubs: { RouterLink: { name: 'RouterLink', template: '<a><slot /></a>', props: ['to'] } } },
    attachTo: document.body,
  });
}

async function flush() {
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
}

interface Fixture {
  pipelineState?: string;
  summary?: Record<string, number>;
  incidents?: unknown[];
  contractStatus?: string;
  contract404?: boolean;
}

function stubFetch(fixture: Fixture) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/services/ingestionPipelines')) {
      return jsonResponse({
        data: fixture.pipelineState
          ? [
              {
                id: 'p1',
                name: 'metadata',
                pipelineStatuses: [{ pipelineState: fixture.pipelineState, startDate: 1000, endDate: 2000 }],
              },
            ]
          : [],
        paging: { total: fixture.pipelineState ? 1 : 0 },
      });
    }
    if (url.includes('/testSuites/executionSummary')) {
      return jsonResponse(fixture.summary ?? { success: 10, total: 10 });
    }
    if (url.includes('/testCaseIncidentStatus')) {
      return jsonResponse({ data: fixture.incidents ?? [], paging: { total: fixture.incidents?.length ?? 0 } });
    }
    if (url.includes('/dataContracts/entity')) {
      if (fixture.contract404) {
        return jsonResponse({ message: 'not found' }, 404);
      }
      return jsonResponse({
        id: 'c1',
        name: 'contract',
        latestResult: fixture.contractStatus ? { status: fixture.contractStatus } : undefined,
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
}

describe('WidgetAssetHealthCell', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('renders all four rows healthy with an all-clear header', async () => {
    vi.stubGlobal('fetch', stubFetch({ pipelineState: 'success', contractStatus: 'Success' }));
    const wrapper = mountCell();
    await flush();
    expect(wrapper.find('[data-testid="asset-health"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="asset-health-header"]').text()).toContain('All clear');
    expect(wrapper.findAll('[data-testid="asset-health-row"]')).toHaveLength(4);
    expect(wrapper.findAll('[data-testid="asset-health-cta"]')).toHaveLength(0);
    expect(wrapper.text()).toContain('Pipeline');
    expect(wrapper.text()).toContain('Data Quality');
    expect(wrapper.text()).toContain('Data Observability');
    expect(wrapper.text()).toContain('Contract');
    wrapper.unmount();
  });

  it('renders setup rows with CTAs when nothing is configured', async () => {
    vi.stubGlobal('fetch', stubFetch({ contract404: true }));
    const wrapper = mountCell({ testSuiteId: undefined });
    await flush();
    expect(wrapper.find('[data-testid="asset-health-header"]').text()).toContain('Not set up');
    const ctas = wrapper.findAll('[data-testid="asset-health-cta"]');
    expect(ctas).toHaveLength(4);
    const targets = wrapper
      .findAllComponents({ name: 'RouterLink' })
      .map((link) => link.props('to') as { name?: string; path?: string; query?: Record<string, string> });
    expect(targets).toHaveLength(4);
    expect(targets[0].name).toBe('ingestion-service');
    expect(targets[0].query?.tab).toBe('agents');
    expect(targets[1].path).toBe('/table/svc.db.schema.table/profiler');
    expect(targets[2].path).toBe('/table/svc.db.schema.table/profiler');
    expect(targets[3].path).toBe('/table/svc.db.schema.table/contract');
    wrapper.unmount();
  });

  it('shows a failed data-quality row and an attention header', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch({
        pipelineState: 'success',
        summary: { success: 8, failed: 2, total: 10 },
        contractStatus: 'Success',
      }),
    );
    const wrapper = mountCell();
    await flush();
    expect(wrapper.find('[data-testid="asset-health-header"]').text()).toContain('Attention');
    expect(wrapper.text()).toContain('2 failed');
    wrapper.unmount();
  });

  it('shows an error state with a retry when the pipeline load fails', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/services/ingestionPipelines')) {
          calls += 1;
          if (calls === 1) {
            return jsonResponse({ message: 'boom' }, 500);
          }
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return stubFetch({ contract404: true })(input);
      }),
    );
    const wrapper = mountCell();
    await flush();
    expect(wrapper.find('[data-testid="asset-health-error"]').exists()).toBe(true);
    await wrapper.find('[data-testid="asset-health-retry"]').trigger('click');
    await flush();
    expect(wrapper.find('[data-testid="asset-health"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
