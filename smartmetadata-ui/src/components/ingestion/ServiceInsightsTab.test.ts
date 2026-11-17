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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import type { IngestionPipeline } from '@/types/ingestion';
import ServiceInsightsTab from './ServiceInsightsTab.vue';

const listChartsMock = vi.fn();
const searchMock = vi.fn();
const serviceNameFilterMock = vi.fn();

vi.mock('@/api/dataInsights', () => ({
  listSystemChartData: (...args: unknown[]) => listChartsMock(...args),
}));

vi.mock('@/api/serviceSearch', () => ({
  searchServiceIndex: (...args: unknown[]) => searchMock(...args),
  getServiceNameQueryFilter: (...args: unknown[]) => serviceNameFilterMock(...args),
}));

type PipelineFixture = IngestionPipeline & { provider?: string };

function pipeline(overrides: Partial<PipelineFixture> = {}): PipelineFixture {
  return {
    id: 'p1',
    name: 'svc_Metadata_Agent',
    fullyQualifiedName: 'svc.Metadata_Agent',
    pipelineType: 'metadata',
    provider: 'automation',
    ...overrides,
  };
}

function mountTab(props: Record<string, unknown> = {}) {
  return mount(ServiceInsightsTab, {
    props: { serviceName: 'svc', serviceKind: 'database', ...props },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

function utcDayStart(daysAgo: number): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo);
}

describe('ServiceInsightsTab (official ServiceInsightsTab, OSS widgets)', () => {
  beforeEach(() => {
    listChartsMock.mockReset();
    searchMock.mockReset();
    serviceNameFilterMock.mockReset();
    listChartsMock.mockResolvedValue({});
    searchMock.mockResolvedValue({ hits: [], total: 0, aggregations: {} });
    serviceNameFilterMock.mockImplementation((name: string) => ({
      query: { match: { 'service.name.keyword': name } },
    }));
  });

  it('fetches the five platform charts once with the 7-day UTC window, service filter and strict mode', async () => {
    const wrapper = mountTab();
    await flushPromises();
    expect(listChartsMock).toHaveBeenCalledTimes(1);
    const [names, start, end, options] = listChartsMock.mock.calls[0] as unknown as [
      string[],
      number,
      number,
      Record<string, unknown>,
    ];
    expect(names).toEqual([
      'assets_with_description',
      'assets_with_pii',
      'assets_with_tier',
      'assets_with_owners',
      'healthy_data_assets',
    ]);
    expect(start).toBe(utcDayStart(6));
    expect(end).toBe(utcDayStart(0));
    expect(options.filter).toBe('{"query":{"match":{"service.name.keyword":"svc"}}}');
    expect(options.strict).toBe(true);
    expect(wrapper.find('[data-testid="agent-status-widget"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="total-data-assets-widget"]').exists()).toBe(true);
  });

  it('formats two-day charts with the absolute change and interval count', async () => {
    listChartsMock.mockResolvedValue({
      assets_with_description: [
        { day: utcDayStart(6), count: 40 },
        { day: utcDayStart(0), count: 50 },
      ],
    });
    const wrapper = mountTab();
    await flushPromises();
    expect(wrapper.text()).toContain('Description Coverage');
    expect(wrapper.text()).toContain('50%');
    expect(wrapper.text()).toContain('In the last day');
    expect(wrapper.find('.platform-insights-widget__badge').text()).toContain('10%');
  });

  it('synthesizes a previous-day zero point for a single result', async () => {
    listChartsMock.mockResolvedValue({
      assets_with_tier: [{ day: utcDayStart(0), count: 30 }],
    });
    const wrapper = mountTab();
    await flushPromises();
    expect(wrapper.text()).toContain('Tier Coverage');
    expect(wrapper.find('.platform-insights-widget__badge').text()).toContain('30%');
  });

  it('renders no card for a chart with no data', async () => {
    listChartsMock.mockResolvedValue({
      assets_with_description: [{ day: utcDayStart(0), count: 10 }],
    });
    const wrapper = mountTab();
    await flushPromises();
    expect(wrapper.findAll('.platform-insights-widget__card')).toHaveLength(1);
    expect(wrapper.text()).not.toContain('PII Coverage');
  });

  it('orders asset counts by service type, skips missing buckets and ignores unknown ones', async () => {
    searchMock.mockResolvedValue({
      hits: [],
      total: 0,
      aggregations: {
        entityType: {
          buckets: [
            { key: 'table', doc_count: 5 },
            { key: 'somethingElse', doc_count: 99 },
            { key: 'database', doc_count: 2 },
            { key: 'query', doc_count: 7 },
          ],
        },
      },
    });
    const wrapper = mountTab();
    await flushPromises();
    expect(searchMock).toHaveBeenCalledWith({
      queryFilter: { query: { match: { 'service.name.keyword': 'svc' } } },
      searchIndex: 'all',
      pageSize: 0,
      fetchSource: false,
    });
    const rows = wrapper.findAll('.total-data-assets-widget__row');
    expect(rows.map((row) => row.text())).toEqual(['Database2', 'Table5', 'Query7']);
  });

  it('keeps charts rendering when the asset count fetch fails silently', async () => {
    searchMock.mockRejectedValue(new Error('search down'));
    listChartsMock.mockResolvedValue({
      assets_with_description: [{ day: utcDayStart(0), count: 10 }],
    });
    const wrapper = mountTab();
    await flushPromises();
    expect(wrapper.text()).toContain('Description Coverage');
    expect(wrapper.find('[data-testid="total-data-assets-empty"]').exists()).toBe(true);
  });

  it('renders no charts and skips the asset fetch when the chart fetch fails', async () => {
    listChartsMock.mockRejectedValue(new Error('charts down'));
    const wrapper = mountTab();
    await flushPromises();
    expect(wrapper.findAll('.platform-insights-widget__card')).toHaveLength(0);
    expect(searchMock).not.toHaveBeenCalled();
  });

  it('filters agents to automation providers, keeps the first per type and orders them', async () => {
    const wrapper = mountTab({
      ingestionPipelines: [
        pipeline({ id: 'prof', name: 'svc_Profiler', pipelineType: 'profiler' }),
        pipeline({ id: 'user', name: 'svc_Custom', pipelineType: 'metadata', provider: 'user' }),
        pipeline({ id: 'meta1', name: 'svc_Metadata1', pipelineType: 'metadata' }),
        pipeline({ id: 'meta2', name: 'svc_Metadata2', pipelineType: 'metadata' }),
        pipeline({ id: 'noprov', name: 'svc_Usage', pipelineType: 'usage', provider: undefined }),
      ],
    });
    await flushPromises();
    await wrapper.find('[data-testid="agent-status-widget"] .ant-collapse-header').trigger('click');
    const cards = wrapper.findAll('[data-testid^="agent-status-card-"]');
    expect(cards.map((card) => card.attributes('data-testid'))).toEqual([
      'agent-status-card-Metadata',
      'agent-status-card-Profiler',
    ]);
  });

  it('maps pipeline states onto agent statuses with Pending as the default', async () => {
    const wrapper = mountTab({
      ingestionPipelines: [
        pipeline({
          pipelineType: 'metadata',
          pipelineStatuses: [{ pipelineState: 'PartialSuccess' }],
        }),
        pipeline({
          id: 'u1',
          pipelineType: 'usage',
          pipelineStatuses: [{ pipelineState: 'Queued' }],
        }),
        pipeline({ id: 'l1', pipelineType: 'lineage' }),
      ],
    });
    await flushPromises();
    expect(
      wrapper.find('[data-testid="agent-status-summary-item-Successful"] [data-testid="pipeline-count"]').text(),
    ).toBe('1');
    expect(
      wrapper.find('[data-testid="agent-status-summary-item-Pending"] [data-testid="pipeline-count"]').text(),
    ).toBe('2');
    expect(wrapper.find('[data-testid="agent-status-summary-item-Failed"]').exists()).toBe(false);
  });

  it('recomputes agentsInfo when the pipelines prop changes', async () => {
    const wrapper = mountTab({ ingestionPipelines: [pipeline()] });
    await flushPromises();
    expect(wrapper.find('[data-testid="agent-status-summary-item-Pending"]').exists()).toBe(true);
    await wrapper.setProps({
      ingestionPipelines: [
        pipeline({ pipelineStatuses: [{ pipelineState: 'Success' }] }),
      ],
    });
    expect(wrapper.find('[data-testid="agent-status-summary-item-Successful"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="agent-status-summary-item-Pending"]').exists()).toBe(false);
  });

  it('shows the Healthy chart only for database services', async () => {
    listChartsMock.mockResolvedValue({
      healthy_data_assets: [{ day: utcDayStart(0), count: 90 }],
    });
    const databaseTab = mountTab({ serviceKind: 'database' });
    await flushPromises();
    expect(databaseTab.text()).toContain('Healthy Data Assets');
    const messagingTab = mountTab({ serviceKind: 'messaging' });
    await flushPromises();
    expect(messagingTab.text()).not.toContain('Healthy Data Assets');
  });

  it('passes the live AutoPilot status through to the agents widget', async () => {
    const wrapper = mountTab({
      liveAutoPilotStatus: { id: 'w1', status: 'RUNNING' },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="agents-status-message"]').text()).toBe(
      'AutoPilot agents are running.',
    );
  });
});
