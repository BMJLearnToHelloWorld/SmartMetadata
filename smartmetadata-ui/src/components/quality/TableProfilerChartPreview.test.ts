import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persistSession } from '@/auth/token';
import { createTestI18n } from '@/test/i18n';
import TableProfilerChartPreview from './TableProfilerChartPreview.vue';

vi.mock('@/features/charts/SmChart.vue', () => ({
  default: {
    props: ['kind', 'series', 'empty', 'height', 'testId'],
    template: '<div :data-testid="testId || \'sm-chart-stub\'" :data-kind="kind"></div>',
  },
}));

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('TableProfilerChartPreview (official showHeader=false TableProfilerChart)', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/tableProfile')) {
          return jsonResponse({
            data: [
              { timestamp: 2, rowCount: 20, customMetrics: [{ name: 'row_ratio', value: 0.4 }] },
              { timestamp: 1, rowCount: 10, customMetrics: [{ name: 'row_ratio', value: 0.2 }] },
            ],
            paging: { total: 2 },
          });
        }
        if (url.includes('/systemProfile')) {
          return jsonResponse({
            data: [{ timestamp: 1, operation: 'Insert', rowsAffected: 3 }],
            paging: { total: 1 },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('loads official tableProfile and systemProfile ranges and renders data-volume, volume-change, and custom metric charts', async () => {
    const wrapper = mount(TableProfilerChartPreview, {
      props: { entityFqn: 'db.schema.tbl', customMetrics: [{ name: 'row_ratio' }] },
      global: { plugins: [Antd, createTestI18n('zh-CN')] },
    });
    await flushPromises();
    expect(wrapper.get('[data-testid="table-profiler-chart-container"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="table-profiler-chart-metrics"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="row-metrics"]').text()).toContain('数据量');
    expect(wrapper.get('[data-testid="table-profiler-row-count-chart"]').attributes('data-kind')).toBe('area');
    expect(wrapper.get('[data-testid="operation-metrics"]').text()).toContain('数据量变化');
    expect(wrapper.get('[data-testid="table-profiler-operation-chart"]').attributes('data-kind')).toBe('bar');
    expect(wrapper.get('[data-testid="custom-metric-graph-row_ratio"]').text()).toContain('row_ratio');
    const urls = vi.mocked(fetch).mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('/api/v1/tables/db.schema.tbl/tableProfile') && url.includes('startTs='))).toBe(true);
    expect(urls.some((url) => url.includes('/api/v1/tables/db.schema.tbl/systemProfile') && url.includes('endTs='))).toBe(true);
    wrapper.unmount();
  });
});
