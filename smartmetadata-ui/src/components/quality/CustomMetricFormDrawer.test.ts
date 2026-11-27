import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import Antd from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persistSession } from '@/auth/token';
import { createTestI18n } from '@/test/i18n';
import CustomMetricFormDrawer from './CustomMetricFormDrawer.vue';

vi.mock('@/utils/codeMirrorUtils', () => ({
  CSMode: { SQL: 'sql' },
}));

vi.mock('@/features/charts/SmChart.vue', () => ({
  default: {
    props: ['kind', 'series', 'empty', 'height', 'testId'],
    template: '<div :data-testid="testId || \'sm-chart-stub\'"></div>',
  },
}));

vi.mock('@/components/shared/SmCodeEditor.vue', () => ({
  default: {
    props: ['value', 'variant', 'mode', 'showCopyButton', 'className'],
    emits: ['change'],
    template:
      '<textarea data-testid="sql-editor-stub" :value="value" @input="$emit(\'change\', $event.target.value)" />',
  },
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function mountDrawer(props: Record<string, unknown> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'home', component: { template: '<div />' } }],
  });
  await router.push('/');
  await router.isReady();
  const wrapper = mount(CustomMetricFormDrawer, {
    props: { open: true, tableId: 'tbl-1', ...props },
    global: { plugins: [router, Antd, createTestI18n('zh-CN')] },
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}

describe('CustomMetricFormDrawer (official table-level QualityTab form)', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/v1/tables/tbl-1/customMetric') && init?.method === 'PUT') {
          return jsonResponse({ id: 'tbl-1' });
        }
        if (url.includes('/api/v1/tables/tbl-1') && url.includes('fields=customMetrics')) {
          return jsonResponse({ id: 'tbl-1', customMetrics: [{ name: 'existing_metric' }] });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.querySelectorAll('.ant-drawer, .ant-message, .ant-modal').forEach((node) => node.remove());
  });

  it('uses official table-metric title, name field, SQL editor, and 新建', async () => {
    const wrapper = await mountDrawer();
    expect(document.body.querySelector('[data-testid="custom-metric-form"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="custom-metric-name"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="sql-editor-container"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="submit-button"]')?.textContent?.replace(/\s+/g, '')).toContain('新建');
    expect(document.body.querySelector('[data-testid="cancel-button"]')).not.toBeNull();
    expect(document.body.textContent).toContain('添加数据表指标');
    expect(document.body.textContent).toContain('SQL查询');
    wrapper.unmount();
  });

  it('PUTs official name + expression without columnName', async () => {
    const wrapper = await mountDrawer();
    const nameInput = document.body.querySelector('[data-testid="custom-metric-name"]') as HTMLInputElement | null;
    expect(nameInput).not.toBeNull();
    await new DOMWrapper(nameInput as HTMLInputElement).setValue('row_ratio');
    const editor = document.body.querySelector('[data-testid="sql-editor-stub"]') as HTMLTextAreaElement | null;
    expect(editor).not.toBeNull();
    editor!.value = 'SELECT 1';
    editor!.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();
    (document.body.querySelector('[data-testid="submit-button"]') as HTMLElement | null)?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    await flushPromises();
    const put = vi.mocked(fetch).mock.calls.find((call) => String(call[0]).includes('/customMetric'));
    expect(put).toBeDefined();
    expect(put?.[1]?.method).toBe('PUT');
    expect(JSON.parse(String(put?.[1]?.body ?? '{}'))).toEqual({ name: 'row_ratio', expression: 'SELECT 1' });
    expect(wrapper.emitted('success')?.length ?? document.body.textContent?.includes('row_ratio')).toBeTruthy();
    wrapper.unmount();
  });

  it('rejects a name that already exists on the table', async () => {
    const wrapper = await mountDrawer({ existingNames: ['existing_metric'] });
    const nameInput = document.body.querySelector('[data-testid="custom-metric-name"]') as HTMLInputElement | null;
    expect(nameInput).not.toBeNull();
    await new DOMWrapper(nameInput as HTMLInputElement).setValue('existing_metric');
    const editor = document.body.querySelector('[data-testid="sql-editor-stub"]') as HTMLTextAreaElement | null;
    editor!.value = 'SELECT 1';
    editor!.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();
    (document.body.querySelector('[data-testid="submit-button"]') as HTMLElement | null)?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    await flushPromises();
    const put = vi.mocked(fetch).mock.calls.find((call) => String(call[0]).includes('/customMetric'));
    expect(put).toBeUndefined();
    const explain = document.body.querySelector('.ant-form-item-explain-error, .ant-form-item-explain');
    expect((explain?.textContent ?? document.body.textContent) ?? '').toMatch(/已存在|already exists/);
    wrapper.unmount();
  });

  it('shows official Show Hint toggle and table profiler preview, and hides the preview when the toggle is off', async () => {
    const wrapper = await mountDrawer({ entityFqn: 'db.schema.tbl' });
    const toggle = document.body.querySelector('[data-testid="show-hint-toggle"]');
    expect(toggle).not.toBeNull();
    expect(document.body.textContent).toContain('显示提示');
    expect(document.body.querySelector('[data-testid="custom-metric-profile-preview"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="table-profiler-chart-container"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="row-metrics"]')).not.toBeNull();
    const drawer = document.body.querySelector('.ant-drawer-content-wrapper') as HTMLElement | null;
    expect(drawer?.style.width || '').toContain('80vw');
    (toggle as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(document.body.querySelector('[data-testid="custom-metric-profile-preview"]')).toBeNull();
    const narrowed = document.body.querySelector('.ant-drawer-content-wrapper') as HTMLElement | null;
    expect(narrowed?.style.width || '').toContain('60vw');
    wrapper.unmount();
  });
});
