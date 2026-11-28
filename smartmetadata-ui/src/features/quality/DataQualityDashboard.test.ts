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
import dayjs from 'dayjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import SmChart from '@/features/charts/SmChart.vue';
import DataQualityDashboard from './DataQualityDashboard.vue';
import type { DqDashboardChartFilters, DqHiddenFilter } from '@/quality/dashboard';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const batchRequests: unknown[] = [];
const DAY_1 = 1700000000000;
const DAY_2 = 1700086400000;

function batchReport(key: string, data: Array<Record<string, unknown>>) {
  return {
    key,
    report: {
      metadata: { keys: [], dimensions: [], metrics: [] },
      data,
    },
  };
}

function stubFetch(): void {
  batchRequests.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/dataQualityReport/batch') && typeof init?.body === 'string') {
        try {
          batchRequests.push(JSON.parse(init.body));
        } catch {
          batchRequests.push(init.body);
        }
        return jsonResponse({
          results: [
            batchReport('status', [
              { 'testCaseResult.testCaseStatus': 'Success', document_count: '3' },
              { 'testCaseResult.testCaseStatus': 'Failed', document_count: '1' },
            ]),
            batchReport('dimensionStatus', [
              { dataQualityDimensionName: 'Completeness', 'testCaseResult.testCaseStatus': 'Success', document_count: '2' },
            ]),
            batchReport('noDimensionStatus', []),
            batchReport('covered', [{ originEntityFQN: '2' }]),
            batchReport('unhealthyCovered', [{ originEntityFQN: '1' }]),
            batchReport('totalTables', [{ fullyQualifiedName: '20' }]),
            batchReport('statusSuccess', [
              { timestamp: DAY_1, 'testCase.fullyQualifiedName': '2' },
              { timestamp: DAY_2, 'testCase.fullyQualifiedName': '3' },
            ]),
            batchReport('statusAborted', [{ timestamp: DAY_1, 'testCase.fullyQualifiedName': '0' }]),
            batchReport('statusFailed', [{ timestamp: DAY_1, 'testCase.fullyQualifiedName': '1' }]),
            batchReport('incidentsOpen', [
              { timestamp: DAY_1, stateId: '1' },
              { timestamp: DAY_2, stateId: '2' },
            ]),
            batchReport('incidentsResolved', [
              { timestamp: DAY_1, stateId: '2' },
              { timestamp: DAY_2, stateId: '4' },
            ]),
            batchReport('timeResponse', [
              { timestamp: DAY_1, 'metrics.value': '3600000' },
              { timestamp: DAY_2, 'metrics.value': '3600000' },
            ]),
            batchReport('timeResolution', [{ timestamp: DAY_1, 'metrics.value': '7200000' }]),
          ],
        });
      }
      if (url.includes('/api/v1/search/query')) {
        const index = new URL(url, 'http://local.test').searchParams.get('index') ?? '';
        const q = new URL(url, 'http://local.test').searchParams.get('q') ?? '';
        if (index === 'tag' && q.includes('classification.name:Tier')) {
          return jsonResponse({
            hits: {
              total: { value: 1 },
              hits: [
                {
                  _source: {
                    name: 'Gold',
                    displayName: 'Gold',
                    fullyQualifiedName: 'Tier.Gold',
                    classification: { name: 'Tier' },
                  },
                },
              ],
            },
          });
        }
        return jsonResponse({
          hits: { total: { value: 0 }, hits: [] },
        });
      }
      return new Response('not found', { status: 404 });
    }),
  );
}

async function createTestRouter(): Promise<Router> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div>home</div>' } },
      { path: '/data-quality/:tab/:subTab?', name: 'quality-data-quality-tab', component: { template: '<div>cases</div>' } },
      { path: '/quality/test-cases', name: 'quality-test-cases', component: { template: '<div>cases</div>' } },
      { path: '/search', name: 'search', component: { template: '<div>search</div>' } },
      { path: '/observability/incidents', name: 'observability-incidents', component: { template: '<div>incidents</div>' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  return router;
}

async function mountDashboard(props: {
  initialFilters?: DqDashboardChartFilters;
  hideFilterBar?: boolean;
  hiddenFilters?: DqHiddenFilter[];
  isGovernanceView?: boolean;
  className?: string;
} = {}) {
  const router = await createTestRouter();
  const wrapper = mount(DataQualityDashboard, {
    props: { isGovernanceView: true, ...props },
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  await flushPromises();
  return { wrapper, router };
}

function batchItem(key: string): { key: string; index: string; q?: string } | undefined {
  for (const body of batchRequests as Array<{ requests: Array<{ key: string; index: string; q?: string }> }>) {
    const found = body.requests.find((item) => item.key === key);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function lastBatchItem(key: string): { key: string; index: string; q?: string } | undefined {
  const bodies = batchRequests as Array<{ requests: Array<{ key: string; index: string; q?: string }> }>;
  for (let i = bodies.length - 1; i >= 0; i -= 1) {
    const found = bodies[i].requests.find((item) => item.key === key);
    if (found) {
      return found;
    }
  }
  return undefined;
}

describe('DataQualityDashboard', () => {
  beforeEach(() => {
    stubFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('renders the four pin sections in order', async () => {
    const { wrapper } = await mountDashboard();
    const container = wrapper.get('[data-testid="dq-dashboard-container"]');
    const text = container.text();
    const healthAt = text.indexOf('Data Health');
    const dimensionsAt = text.indexOf('Data Dimensions');
    const statusAt = text.indexOf('Test Case Status');
    const incidentsAt = text.indexOf('Incident Metrics');
    expect(healthAt).toBeGreaterThanOrEqual(0);
    expect(dimensionsAt).toBeGreaterThan(healthAt);
    expect(statusAt).toBeGreaterThan(dimensionsAt);
    expect(incidentsAt).toBeGreaterThan(statusAt);
    expect(wrapper.find('[data-testid="dq-dashboard-health"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="dq-dashboard-dimensions"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="dq-dashboard-status"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="dq-dashboard-incidents"]').exists()).toBe(true);
  });

  it('derives coverage, health and results from the shared batch', async () => {
    const { wrapper } = await mountDashboard();
    expect(wrapper.get('[data-testid="dq-dashboard-coverage-card"]').text()).toContain('Data Assets Coverage');
    expect(wrapper.get('[data-testid="dq-dashboard-coverage-card"]').text()).toContain('20');
    expect(wrapper.get('[data-testid="dq-dashboard-coverage-card"]').text()).toContain('Covered 2');
    expect(wrapper.get('[data-testid="dq-dashboard-healthy-card"]').text()).toContain('Healthy Data Assets');
    expect(wrapper.get('[data-testid="dq-dashboard-healthy-card"]').text()).toContain('Healthy 1');
    expect(wrapper.get('[data-testid="dq-dashboard-healthy-card"]').text()).toContain('Unhealthy 1');
    expect(wrapper.get('[data-testid="dq-dashboard-results-card"]').text()).toContain('Total Tests');
    expect(wrapper.get('[data-testid="dq-dashboard-results-card"]').text()).toContain('Success 3');
    expect(wrapper.get('[data-testid="dq-dashboard-results-card"]').text()).toContain('Failed 1');
    expect(wrapper.find('[data-testid="dq-dashboard-dimension-Completeness"]').exists()).toBe(true);
    // The time-series batch uses the testCaseResult / resolution-status
    // indexes, never the testCase index.
    expect(batchItem('statusSuccess')?.index).toBe('testCaseResult');
    expect(batchItem('incidentsOpen')?.index).toBe('testCaseResolutionStatus');
    expect(batchItem('totalTables')?.index).toBe('table');
  });

  it('renders the incident section with latest values and average times', async () => {
    const { wrapper } = await mountDashboard();
    expect(wrapper.get('[data-testid="dq-dashboard-incidents-open-value"]').text()).toBe('2');
    expect(wrapper.get('[data-testid="dq-dashboard-incidents-resolved-value"]').text()).toBe('4');
    expect(wrapper.get('[data-testid="dq-dashboard-incidents-response-value"]').text()).toBe('1h');
    expect(wrapper.get('[data-testid="dq-dashboard-incidents-resolution-value"]').text()).toBe('2h');
    expect(wrapper.get('[data-testid="dq-dashboard-status-success-value"]').text()).toBe('3');
    expect(wrapper.get('[data-testid="dq-dashboard-status-failed-value"]').text()).toBe('1');
    expect(wrapper.get('[data-testid="dq-dashboard-status-success-chart"]').attributes('data-points')).toBe('1');
    expect(wrapper.get('[data-testid="dq-dashboard-incidents-open-chart"]').attributes('data-points')).toBe('1');
    expect(wrapper.get('[data-testid="dq-dashboard-incidents-response-chart"]').attributes('data-points')).toBe('1');
  });

  it('uses UserTeam and glossary tree pickers for owner and glossary facets (pin filter types)', async () => {
    const { wrapper } = await mountDashboard();
    expect(wrapper.find('[data-testid="dq-dashboard-filter-owner"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="dq-dashboard-filter-glossary"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="dq-dashboard-owner-user-team"]').exists()).toBe(false);
  });

  it('hides hidden filters but still applies the initial filter to the queries', async () => {
    const { wrapper } = await mountDashboard({
      initialFilters: { tags: ['PII.Sensitive'] },
      hiddenFilters: ['tags', 'glossaryTerms'],
    });
    expect(wrapper.find('[data-testid="dq-dashboard-filter-tag"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="dq-dashboard-filter-glossary"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="dq-dashboard-filter-owner"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="dq-dashboard-filter-tier"]').exists()).toBe(true);
    expect(batchItem('status')?.q).toContain('PII.Sensitive');
  });

  it('scopes a term mount through the merged tags clause', async () => {
    const { wrapper } = await mountDashboard({
      initialFilters: { glossaryTerms: ['Glossary.Term'] },
      hiddenFilters: ['glossaryTerms'],
    });
    expect(wrapper.find('[data-testid="dq-dashboard-filter-glossary"]').exists()).toBe(false);
    const q = batchItem('status')?.q ?? '';
    expect(q).toContain('Glossary.Term');
    expect(q).toContain('tags.tagFQN');
    expect(q).not.toContain('glossaryTerms');
  });

  it('refetches scoped to the new entity when initialFilters changes in place', async () => {
    const { wrapper } = await mountDashboard({
      initialFilters: { glossaryTerms: ['Glossary.OldTerm'] },
      hiddenFilters: ['glossaryTerms'],
    });
    expect(batchItem('status')?.q).toContain('Glossary.OldTerm');
    const requestsBefore = batchRequests.length;
    await wrapper.setProps({ initialFilters: { glossaryTerms: ['Glossary.NewTerm'] } });
    await flushPromises();
    await flushPromises();
    expect(batchRequests.length).toBeGreaterThan(requestsBefore);
    const q = lastBatchItem('status')?.q ?? '';
    expect(q).toContain('Glossary.NewTerm');
    expect(q).not.toContain('Glossary.OldTerm');
  });

  it('scopes a Tier tag through the tier key, never the tags clause', async () => {
    await mountDashboard({ initialFilters: { tier: ['Tier.Gold'] }, hiddenFilters: ['tags', 'tier'] });
    const q = batchItem('status')?.q ?? '';
    expect(q).toContain('Tier.Gold');
    expect(q).toContain('tier.tagFQN');
    expect(q).not.toContain('tags.tagFQN');
  });

  it('marks the governance view with the no-shadow class', async () => {
    const { wrapper: governed } = await mountDashboard({ isGovernanceView: true, className: 'data-quality-governance-tab-wrapper' });
    expect(governed.get('[data-testid="dq-dashboard-container"]').classes()).toContain('dq-dashboard--governance');
    expect(governed.get('[data-testid="dq-dashboard-container"]').classes()).toContain(
      'data-quality-governance-tab-wrapper',
    );
    const { wrapper: plain } = await mountDashboard({ isGovernanceView: false });
    expect(plain.get('[data-testid="dq-dashboard-container"]').classes()).not.toContain(
      'dq-dashboard--governance',
    );
  });

  it('hides the whole filter bar when hideFilterBar is set', async () => {
    const { wrapper } = await mountDashboard({ hideFilterBar: true });
    expect(wrapper.find('[data-testid="dq-dashboard-filters"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="dq-dashboard-health"]').exists()).toBe(true);
  });

  it('drills the coverage donut covered slice to the test-suites tab', async () => {
    const { wrapper, router } = await mountDashboard();
    const charts = wrapper.findAllComponents(SmChart);
    await charts[0].vm.$emit('segment-click', 0);
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/data-quality/test-suites');
    expect(router.currentRoute.value.params.tab).toBe('test-suites');
    expect(router.currentRoute.value.query.tab).toBeUndefined();
  });

  it('drills the coverage donut not-covered slice to explore (pin ROUTES.EXPLORE)', async () => {
    const { wrapper, router } = await mountDashboard();
    const charts = wrapper.findAllComponents(SmChart);
    await charts[0].vm.$emit('segment-click', 1);
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('search');
  });

  it('drills the healthy donut segments to per-status lists (pin BINARY_STATUS_PIE_SEGMENT_ORDER)', async () => {
    const { wrapper, router } = await mountDashboard();
    const charts = wrapper.findAllComponents(SmChart);
    await charts[1].vm.$emit('segment-click', 0);
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/data-quality/test-cases');
    expect(router.currentRoute.value.params.tab).toBe('test-cases');
    expect(router.currentRoute.value.query.tab).toBeUndefined();
    expect(router.currentRoute.value.query.testCaseStatus).toEqual(['Success', 'Queued']);
    await charts[1].vm.$emit('segment-click', 1);
    await flushPromises();
    expect(router.currentRoute.value.query.testCaseStatus).toEqual(['Failed', 'Aborted']);
  });

  it('drills the results donut segments to per-status lists (pin TEST_CASE_STATUS_PIE_SEGMENT_ORDER)', async () => {
    const { wrapper, router } = await mountDashboard();
    const charts = wrapper.findAllComponents(SmChart);
    await charts[2].vm.$emit('segment-click', 0);
    await flushPromises();
    expect(router.currentRoute.value.query.testCaseStatus).toBe('Success');
    await charts[2].vm.$emit('segment-click', 1);
    await flushPromises();
    expect(router.currentRoute.value.query.testCaseStatus).toBe('Failed');
    await charts[2].vm.$emit('segment-click', 2);
    await flushPromises();
    expect(router.currentRoute.value.query.testCaseStatus).toBe('Aborted');
  });

  it('drills a dimension card to the test-case list with the dimension and the current slice', async () => {
    const { wrapper, router } = await mountDashboard({
      initialFilters: { tags: ['PII.Sensitive'] },
      hiddenFilters: ['tags', 'glossaryTerms'],
    });
    await wrapper.get('[data-testid="dq-dashboard-dimension-Completeness"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/data-quality/test-cases');
    expect(router.currentRoute.value.params.tab).toBe('test-cases');
    expect(router.currentRoute.value.query.tab).toBeUndefined();
    expect(router.currentRoute.value.query.dataQualityDimension).toBe('Completeness');
    expect(router.currentRoute.value.query.tags).toContain('PII.Sensitive');
  });

  it('drills a status area chart to the test-case list with that status', async () => {
    const { wrapper, router } = await mountDashboard();
    await wrapper.get('[data-testid="dq-dashboard-status-failed"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/data-quality/test-cases');
    expect(router.currentRoute.value.params.tab).toBe('test-cases');
    expect(router.currentRoute.value.query.tab).toBeUndefined();
    expect(router.currentRoute.value.query.testCaseStatus).toBe('Failed');
  });

  it('drills an incident-count area chart to the incident manager with status and range', async () => {
    const { wrapper, router } = await mountDashboard();
    await wrapper.get('[data-testid="dq-dashboard-incidents-open"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('observability-incidents');
    expect(router.currentRoute.value.query.testCaseResolutionStatusType).toBe('New');
    expect(router.currentRoute.value.query.startTs).toBeDefined();
    expect(router.currentRoute.value.query.endTs).toBeDefined();
  });

  it('keeps the incident-time charts display-only', async () => {
    const { wrapper } = await mountDashboard();
    expect(wrapper.get('[data-testid="dq-dashboard-incidents-response"]').element.tagName).toBe('DIV');
    expect(wrapper.get('[data-testid="dq-dashboard-incidents-resolution"]').element.tagName).toBe('DIV');
  });

  it('applies two tier picks to the queries (multi-select)', async () => {
    const { wrapper } = await mountDashboard();
    const selects = wrapper.findAllComponents({ name: 'ASelect' });
  // Filter-bar order: owner (UserTeam), tier, certification, tag, glossary (tree), data product.
    const tierSelect = selects[0];
    expect(tierSelect.exists()).toBe(true);
    await tierSelect.vm.$emit('change', ['Tier.Gold', 'Tier.Silver']);
    await flushPromises();
    await flushPromises();
    const q = lastBatchItem('status')?.q ?? '';
    expect(q).toContain('Tier.Gold');
    expect(q).toContain('Tier.Silver');
  });

  it('selects every loaded option from the tier dropdown (select all)', async () => {
    const { wrapper } = await mountDashboard();
    const selector = wrapper
      .find('[data-testid="dq-dashboard-filter-tier"] .ant-select-selector')
      .element as HTMLElement;
    selector.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    selector.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    const selectAllButton = Array.from(document.body.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Select All'),
    ) as HTMLElement | undefined;
    expect(selectAllButton).toBeDefined();
    selectAllButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    await flushPromises();
    const selects = wrapper.findAllComponents({ name: 'ASelect' });
    expect(selects[0].props('value')).toEqual(['Tier.Gold']);
    expect(lastBatchItem('status')?.q ?? '').toContain('Tier.Gold');
  });

  it('moves the time window when the date range changes', async () => {
    const { wrapper } = await mountDashboard();
    const picker = wrapper.findComponent({ name: 'ARangePicker' });
    expect(picker.exists()).toBe(true);
    await picker.vm.$emit('change', [dayjs('2026-02-10T10:30:00'), dayjs('2026-02-12T15:45:00')]);
    await flushPromises();
    await flushPromises();
    const q = lastBatchItem('status')?.q ?? '';
    expect(q).toContain(String(dayjs('2026-02-10').startOf('day').valueOf()));
    expect(q).toContain(String(dayjs('2026-02-12').endOf('day').valueOf()));
  });

  it('seeds the filter state with the full initial array, not just the first value', async () => {
    const { wrapper } = await mountDashboard({
      initialFilters: { tags: ['PII.A', 'PII.B'] },
    });
    const q = batchItem('status')?.q ?? '';
    expect(q).toContain('PII.A');
    expect(q).toContain('PII.B');
    // Filter-bar order: owner (UserTeam), tier, certification, tag, glossary (tree), data product.
    const tagSelect = wrapper.findAllComponents({ name: 'ASelect' })[2];
    expect(tagSelect.props('value')).toEqual(['PII.A', 'PII.B']);
  });
});
