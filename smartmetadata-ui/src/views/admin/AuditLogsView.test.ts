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
import Antd, { message, Progress, RangePicker, Select } from 'ant-design-vue';
import dayjs from 'dayjs';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import AuditLogsView from './AuditLogsView.vue';

const socketCapture = vi.hoisted(() => ({
  channel: null as string | null,
  handler: null as ((payload: Record<string, unknown>) => void) | null,
}));

vi.mock('@/composables/useSocketChannel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/composables/useSocketChannel')>();
  return {
    ...actual,
    useSocketChannel: (
      channel: string,
      handler: (payload: Record<string, unknown>) => void,
    ) => {
      socketCapture.channel = channel;
      socketCapture.handler = handler;
    },
  };
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const LOGS_PAGE_1 = {
  data: [
    {
      id: 7,
      eventTs: 1700000000000,
      eventType: 'CREATE',
      userName: 'admin',
      actorType: 'USER',
      entityType: 'table',
      entityFQN: 'svc.db.orders',
      summary: 'Table created',
    },
  ],
  paging: { total: 3, after: 'c1' },
};

const LOGS_PAGE_2 = {
  data: [
    {
      id: 8,
      eventTs: 1700000001000,
      eventType: 'UPDATE',
      userName: 'alice',
      actorType: 'USER',
      entityType: 'table',
      entityFQN: 'svc.db.customers',
    },
  ],
  paging: { total: 3, before: 'c0' },
};

const ListStub = defineComponent({
  props: {
    logs: { type: Array, default: () => [] },
    isLoading: { type: Boolean, default: false },
    hasActiveSearch: { type: Boolean, default: false },
    hasActiveFilters: { type: Boolean, default: false },
    onClearFilters: { type: Function, default: undefined },
  },
  setup(props) {
    return () =>
      h('div', { 'data-testid': 'audit-log-list-stub' }, [
        h('span', { 'data-testid': 'stub-log-count' }, String(props.logs.length)),
        h('span', { 'data-testid': 'stub-has-search' }, String(props.hasActiveSearch)),
        h('span', { 'data-testid': 'stub-has-filters' }, String(props.hasActiveFilters)),
        h(
          'button',
          {
            'data-testid': 'stub-clear',
            onClick: () => props.onClearFilters?.(),
          },
          'clear',
        ),
      ]);
  },
});

const PaginationStub = defineComponent({
  props: {
    paging: { type: Object, default: () => ({}) },
    pagingHandler: { type: Function, default: undefined },
    pageSize: { type: Number, default: 25 },
    currentPage: { type: Number, default: 1 },
    isLoading: { type: Boolean, default: false },
    pageSizeOptions: { type: Array, default: () => [] },
    onShowSizeChange: { type: Function, default: undefined },
  },
  setup(props) {
    return () =>
      h('div', { 'data-testid': 'pagination-stub' }, [
        h('span', { 'data-testid': 'stub-page-size' }, String(props.pageSize)),
        h('span', { 'data-testid': 'stub-current-page' }, String(props.currentPage)),
        h('span', { 'data-testid': 'stub-page-options' }, JSON.stringify(props.pageSizeOptions)),
        h(
          'button',
          {
            'data-testid': 'stub-next',
            onClick: () =>
              props.pagingHandler?.({ currentPage: props.currentPage + 1, cursorType: 'after' }),
          },
          'next',
        ),
        h(
          'button',
          {
            'data-testid': 'stub-prev',
            onClick: () =>
              props.pagingHandler?.({ currentPage: props.currentPage - 1, cursorType: 'before' }),
          },
          'prev',
        ),
        h(
          'button',
          { 'data-testid': 'stub-size', onClick: () => props.onShowSizeChange?.(50) },
          'size',
        ),
      ]);
  },
});

const ModalStub = defineComponent({
  props: {
    open: { type: Boolean, default: false },
    okButtonProps: { type: Object, default: () => ({}) },
    confirmLoading: { type: Boolean, default: false },
  },
  emits: ['ok', 'cancel'],
  setup(props, { emit, slots, attrs }) {
    return () =>
      props.open
        ? h('div', { ...attrs, 'data-testid': 'export-audit-logs-modal' }, [
            h(
              'button',
              {
                'data-testid': 'modal-ok',
                disabled: Boolean(
                  (props.okButtonProps as { disabled?: boolean }).disabled,
                ),
                onClick: () => emit('ok'),
              },
              'ok',
            ),
            h(
              'button',
              { 'data-testid': 'modal-cancel', onClick: () => emit('cancel') },
              'cancel',
            ),
            slots.default?.(),
          ])
        : null;
  },
});

interface FetchBehaviour {
  pollStatuses?: string[];
  exportStatus?: number;
  logsStatus?: number;
}

function installFetch(behaviour: FetchBehaviour = {}) {
  const calls: string[] = [];
  let pollIndex = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/export/job1/result')) {
      return new Response('{"exported":true}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/export/job1')) {
      const status = behaviour.pollStatuses?.[pollIndex] ?? 'IN_PROGRESS';
      pollIndex += 1;
      return jsonResponse({ jobId: 'job1', status });
    }
    if (url.includes('/audit/logs/export')) {
      if (behaviour.exportStatus && behaviour.exportStatus !== 200) {
        return jsonResponse({ message: 'export boom' }, behaviour.exportStatus);
      }
      return jsonResponse({ jobId: 'job1', message: 'Export started' });
    }
    if (url.includes('/v1/search/query')) {
      return jsonResponse({
        hits: {
          total: { value: 1 },
          hits: [
            {
              _index: 'user_search_index',
              _id: 'u1',
              _source: { id: 'u1', name: 'alice', displayName: 'Alice', entityType: 'user' },
            },
          ],
        },
      });
    }
    if (url.includes('/api/v1/audit/logs')) {
      if (behaviour.logsStatus && behaviour.logsStatus !== 200) {
        return new Response('boom', { status: behaviour.logsStatus });
      }
      const parsed = new URL(url, 'http://localhost');
      if (parsed.searchParams.get('after') === 'c1') {
        return jsonResponse(LOGS_PAGE_2);
      }
      return jsonResponse(LOGS_PAGE_1);
    }
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

async function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/admin/settings/audit-logs',
        name: 'admin-settings-audit-logs',
        component: AuditLogsView,
      },
      { path: '/admin/settings', name: 'admin-settings', component: { template: '<div>hub</div>' } },
      { path: '/settings/:category', name: 'settings-category', component: { template: '<div />' } },
    ],
  });
  await router.push('/admin/settings/audit-logs');
  await router.isReady();
  const wrapper = mount(AuditLogsView, {
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
      stubs: { AuditLogList: ListStub, NextPrevious: PaginationStub, AModal: ModalStub },
    },
  });
  await flushPromises();
  return wrapper;
}

function selectAt(wrapper: Awaited<ReturnType<typeof mountView>>, index: number) {
  return wrapper.findAllComponents(Select)[index]!;
}

async function openExportModal(wrapper: Awaited<ReturnType<typeof mountView>>) {
  await wrapper.get('[data-testid="export-audit-logs-button"]').trigger('click');
  await flushPromises();
  expect(wrapper.find('[data-testid="export-audit-logs-modal"]').exists()).toBe(true);
}

async function setExportRange(wrapper: Awaited<ReturnType<typeof mountView>>) {
  const picker = wrapper.findComponent(RangePicker);
  await picker.vm.$emit('change', [dayjs('2026-11-10'), dayjs('2026-11-12')], [
    '2026-11-10',
    '2026-11-12',
  ]);
  await flushPromises();
}

describe('AuditLogsView', () => {
  let blobs: Blob[];
  let downloads: Array<{ href: string; download: string }>;
  let originalCreateObjectURL: typeof URL.createObjectURL;
  let originalRevokeObjectURL: typeof URL.revokeObjectURL;
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    blobs = [];
    downloads = [];
    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return 'blob:mock';
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
    clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloads.push({ href: this.href, download: this.download });
      });
    socketCapture.channel = null;
    socketCapture.handler = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    clickSpy.mockRestore();
  });

  it('fetches the first page with limit 25 and renders the header, search and pagination', async () => {
    const { calls } = installFetch();
    const wrapper = await mountView();
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]!, 'http://localhost');
    expect(url.searchParams.get('limit')).toBe('25');
    expect(url.searchParams.get('q')).toBe(null);
    expect(wrapper.find('[data-testid="stub-log-count"]').text()).toBe('1');
    expect(wrapper.find('[data-testid="audit-logs-page-header"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="export-audit-logs-button"]').text()).toBe('Export');
    expect(wrapper.find('[data-testid="audit-log-search"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="audit-log-filters"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="stub-page-size"]').text()).toBe('25');
    expect(wrapper.find('[data-testid="stub-page-options"]').text()).toBe('[15,25,50]');
    expect(socketCapture.channel).toBe('csvExportChannel');
  });

  it('debounces search input and refetches with q', async () => {
    const { calls } = installFetch();
    const wrapper = await mountView();
    await wrapper.get('[data-testid="audit-log-search"]').setValue('orders');
    await vi.advanceTimersByTimeAsync(299);
    await flushPromises();
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await flushPromises();
    expect(calls).toHaveLength(2);
    expect(new URL(calls[1]!, 'http://localhost').searchParams.get('q')).toBe('orders');
    expect(wrapper.find('[data-testid="stub-has-search"]').text()).toBe('true');
  });

  it('applies a preset time filter as a rolling window and removes it via the chip', async () => {
    const { calls } = installFetch();
    const wrapper = await mountView();
    await selectAt(wrapper, 0).vm.$emit('change', 'last7days');
    await flushPromises();
    expect(calls).toHaveLength(2);
    const params = new URL(calls[1]!, 'http://localhost').searchParams;
    const startTs = Number(params.get('startTs'));
    const endTs = Number(params.get('endTs'));
    expect(endTs - startTs).toBe(7 * 24 * 60 * 60 * 1000);
    expect(Math.abs(endTs - Date.now())).toBeLessThan(5000);
    const chip = wrapper.find('[data-testid="filter-chip-time"]');
    expect(chip.exists()).toBe(true);
    expect(chip.text()).toContain('Time');
    await wrapper.get('[data-testid="remove-filter-time"]').trigger('click');
    await flushPromises();
    expect(calls).toHaveLength(3);
    const cleared = new URL(calls[2]!, 'http://localhost').searchParams;
    expect(cleared.get('startTs')).toBe(null);
    expect(wrapper.find('[data-testid="filter-chip-time"]').exists()).toBe(false);
  });

  it('applies a custom range with natural-day bounds and shows the custom-range chip', async () => {
    const { calls } = installFetch();
    const wrapper = await mountView();
    await selectAt(wrapper, 0).vm.$emit('change', 'customRange');
    await flushPromises();
    expect(calls).toHaveLength(1);
    const picker = wrapper.find('[data-testid="audit-log-custom-range"]');
    expect(picker.exists()).toBe(true);
    const rangePicker = wrapper.findComponent(RangePicker);
    await rangePicker.vm.$emit('change', [dayjs('2026-11-10'), dayjs('2026-11-12')], [
      '2026-11-10',
      '2026-11-12',
    ]);
    await flushPromises();
    expect(calls).toHaveLength(2);
    const params = new URL(calls[1]!, 'http://localhost').searchParams;
    expect(Number(params.get('startTs'))).toBe(dayjs('2026-11-10').startOf('day').valueOf());
    expect(Number(params.get('endTs'))).toBe(dayjs('2026-11-13').startOf('day').valueOf() - 1);
    expect(wrapper.find('[data-testid="filter-chip-time"]').text()).toContain('Custom Range');
  });

  it('searches users with the string isBot term filter and applies userName plus actorType', async () => {
    const { calls } = installFetch();
    const wrapper = await mountView();
    const userSelect = selectAt(wrapper, 1);
    await userSelect.vm.$emit('dropdown-visible-change', true);
    await flushPromises();
    const searchCalls = calls.filter((url) => url.includes('/v1/search/query'));
    expect(searchCalls).toHaveLength(1);
    const searchParams = new URL(searchCalls[0]!, 'http://localhost').searchParams;
    expect(searchParams.get('index')).toBe('user');
    expect(searchParams.get('query_filter')).toBe(
      '{"query":{"bool":{"must":[{"term":{"isBot":"false"}}]}}}',
    );
    await userSelect.vm.$emit('search', 'ali');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    expect(calls.filter((url) => url.includes('/v1/search/query'))).toHaveLength(2);
    await userSelect.vm.$emit('change', 'alice');
    await flushPromises();
    const listCalls = calls.filter((url) => url.includes('/api/v1/audit/logs'));
    const params = new URL(listCalls[listCalls.length - 1]!, 'http://localhost').searchParams;
    expect(params.get('userName')).toBe('alice');
    expect(params.get('actorType')).toBe('USER');
    expect(wrapper.find('[data-testid="filter-chip-user"]').text()).toContain('Alice');
  });

  it('applies the bot filter with actorType BOT', async () => {
    const { calls } = installFetch();
    const wrapper = await mountView();
    const botSelect = selectAt(wrapper, 2);
    await botSelect.vm.$emit('dropdown-visible-change', true);
    await flushPromises();
    const searchParams = new URL(
      calls.find((url) => url.includes('/v1/search/query'))!,
      'http://localhost',
    ).searchParams;
    expect(searchParams.get('query_filter')).toBe(
      '{"query":{"bool":{"must":[{"term":{"isBot":"true"}}]}}}',
    );
    await botSelect.vm.$emit('change', 'alice');
    await flushPromises();
    const listCalls = calls.filter((url) => url.includes('/api/v1/audit/logs'));
    const params = new URL(listCalls[listCalls.length - 1]!, 'http://localhost').searchParams;
    expect(params.get('actorType')).toBe('BOT');
  });

  it('applies the entity-type filter with the literal option label', async () => {
    const { calls } = installFetch();
    const wrapper = await mountView();
    await selectAt(wrapper, 3).vm.$emit('change', 'table');
    await flushPromises();
    const listCalls = calls.filter((url) => url.includes('/api/v1/audit/logs'));
    expect(new URL(listCalls[listCalls.length - 1]!, 'http://localhost').searchParams.get('entityType')).toBe('table');
    expect(wrapper.find('[data-testid="filter-chip-entityType"]').text()).toContain('Table');
  });

  it('clears filters and search together', async () => {
    const { calls } = installFetch();
    const wrapper = await mountView();
    await selectAt(wrapper, 3).vm.$emit('change', 'table');
    await wrapper.get('[data-testid="audit-log-search"]').setValue('x');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    await wrapper.get('[data-testid="clear-filters"]').trigger('click');
    await flushPromises();
    const last = new URL(calls[calls.length - 1]!, 'http://localhost');
    expect(last.searchParams.get('entityType')).toBe(null);
    expect(last.searchParams.get('q')).toBe(null);
    expect(wrapper.find('[data-testid="filter-selection-container"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="stub-has-filters"]').text()).toBe('false');
  });

  it('pages with cursors and resets to page one on a size change', async () => {
    const { calls } = installFetch();
    const wrapper = await mountView();
    await wrapper.get('[data-testid="stub-next"]').trigger('click');
    await flushPromises();
    expect(new URL(calls[calls.length - 1]!, 'http://localhost').searchParams.get('after')).toBe('c1');
    expect(wrapper.find('[data-testid="stub-current-page"]').text()).toBe('2');
    await wrapper.get('[data-testid="stub-prev"]').trigger('click');
    await flushPromises();
    expect(new URL(calls[calls.length - 1]!, 'http://localhost').searchParams.get('before')).toBe('c0');
    await wrapper.get('[data-testid="stub-size"]').trigger('click');
    await flushPromises();
    const sized = new URL(calls[calls.length - 1]!, 'http://localhost').searchParams;
    expect(sized.get('limit')).toBe('50');
    expect(sized.get('after')).toBe(null);
    expect(wrapper.find('[data-testid="stub-current-page"]').text()).toBe('1');
  });

  it('toasts when the list endpoint fails', async () => {
    installFetch({ logsStatus: 500 });
    const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
    const wrapper = await mountView();
    expect(errorSpy).toHaveBeenCalled();
    expect(wrapper.find('[data-testid="stub-log-count"]').text()).toBe('0');
  });

  it('exports through the modal: range-gated OK, job start, poll completion, JSON download', async () => {
    const { calls } = installFetch({ pollStatuses: ['IN_PROGRESS', 'COMPLETED'] });
    const successSpy = vi.spyOn(message, 'success').mockImplementation(() => undefined as never);
    const wrapper = await mountView();
    await openExportModal(wrapper);
    const okButton = wrapper.get('[data-testid="modal-ok"]');
    expect((okButton.element as HTMLButtonElement).disabled).toBe(true);
    await setExportRange(wrapper);
    expect((wrapper.get('[data-testid="modal-ok"]').element as HTMLButtonElement).disabled).toBe(false);
    await wrapper.get('[data-testid="modal-ok"]').trigger('click');
    await flushPromises();
    const exportCall = calls.find((url) => url.includes('/audit/logs/export'))!;
    const params = new URL(exportCall, 'http://localhost').searchParams;
    expect(Number(params.get('startTs'))).toBe(dayjs('2026-11-10').startOf('day').valueOf());
    expect(Number(params.get('endTs'))).toBe(dayjs('2026-11-13').startOf('day').valueOf() - 1);
    expect(wrapper.text()).toContain('Export started');
    await vi.advanceTimersByTimeAsync(5000);
    await flushPromises();
    expect(calls.filter((url) => url.includes('/export/job1') && !url.includes('/result'))).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5000);
    await flushPromises();
    expect(calls.some((url) => url.includes('/export/job1/result'))).toBe(true);
    expect(downloads).toHaveLength(1);
    expect(downloads[0]!.download).toMatch(/^audit_logs_\d{8}_\d{6}\.json$/);
    expect(blobs).toHaveLength(1);
    expect(blobs[0]!.type).toBe('application/json');
    await expect(blobs[0]!.text()).resolves.toBe('{"exported":true}');
    expect(successSpy).toHaveBeenCalledWith('Export completed successfully!');
    expect(wrapper.find('[data-testid="export-audit-logs-modal"]').exists()).toBe(false);
  });

  it('does not download when the poll reports FAILED or CANCELLED', async () => {
    for (const status of ['FAILED', 'CANCELLED']) {
      const { calls } = installFetch({ pollStatuses: [status] });
      const wrapper = await mountView();
      await openExportModal(wrapper);
      await setExportRange(wrapper);
      await wrapper.get('[data-testid="modal-ok"]').trigger('click');
      await flushPromises();
      await vi.advanceTimersByTimeAsync(5000);
      await flushPromises();
      expect(calls.some((url) => url.includes('/export/job1/result'))).toBe(false);
      expect(downloads).toHaveLength(0);
      // The export ended, so the modal can close.
      await wrapper.get('[data-testid="modal-cancel"]').trigger('click');
      await flushPromises();
      expect(wrapper.find('[data-testid="export-audit-logs-modal"]').exists()).toBe(false);
      wrapper.unmount();
      vi.unstubAllGlobals();
    }
  });

  it('retries the poll after a transient failure', async () => {
    let pollAttempts = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/export/job1/result')) {
          return new Response('{}', { status: 200 });
        }
        if (url.includes('/export/job1')) {
          pollAttempts += 1;
          if (pollAttempts === 1) {
            return new Response('boom', { status: 500 });
          }
          return jsonResponse({ jobId: 'job1', status: 'COMPLETED' });
        }
        if (url.includes('/audit/logs/export')) {
          return jsonResponse({ jobId: 'job1', message: 'Export started' });
        }
        if (url.includes('/api/v1/audit/logs')) {
          return jsonResponse(LOGS_PAGE_1);
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const wrapper = await mountView();
    await openExportModal(wrapper);
    await setExportRange(wrapper);
    await wrapper.get('[data-testid="modal-ok"]').trigger('click');
    await flushPromises();
    await vi.advanceTimersByTimeAsync(5000);
    await flushPromises();
    await vi.advanceTimersByTimeAsync(5000);
    await flushPromises();
    expect(downloads).toHaveLength(1);
  });

  it('completes immediately on a socket event carrying the payload inline', async () => {
    installFetch({ pollStatuses: ['IN_PROGRESS'] });
    const wrapper = await mountView();
    await openExportModal(wrapper);
    await setExportRange(wrapper);
    await wrapper.get('[data-testid="modal-ok"]').trigger('click');
    await flushPromises();
    socketCapture.handler!({
      jobId: 'job1',
      status: 'COMPLETED',
      data: '{"inline":true}',
      error: null,
    });
    await flushPromises();
    expect(downloads).toHaveLength(1);
    await expect(blobs[0]!.text()).resolves.toBe('{"inline":true}');
    expect(wrapper.find('[data-testid="export-audit-logs-modal"]').exists()).toBe(false);
  });

  it('fetches the result on a socket completion without inline data', async () => {
    const { calls } = installFetch({ pollStatuses: ['IN_PROGRESS'] });
    const wrapper = await mountView();
    await openExportModal(wrapper);
    await setExportRange(wrapper);
    await wrapper.get('[data-testid="modal-ok"]').trigger('click');
    await flushPromises();
    socketCapture.handler!({ jobId: 'job1', status: 'COMPLETED', data: null, error: null });
    await flushPromises();
    expect(calls.some((url) => url.includes('/export/job1/result'))).toBe(true);
    expect(downloads).toHaveLength(1);
  });

  it('downloads once when the socket and the poll race on completion', async () => {
    let resolveResult: (value: Response) => void = () => undefined;
    let resultCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/export/job1/result')) {
          resultCalls += 1;
          return new Promise<Response>((resolve) => {
            resolveResult = resolve;
          });
        }
        if (url.includes('/export/job1')) {
          return jsonResponse({ jobId: 'job1', status: 'COMPLETED' });
        }
        if (url.includes('/audit/logs/export')) {
          return jsonResponse({ jobId: 'job1', message: 'Export started' });
        }
        if (url.includes('/api/v1/audit/logs')) {
          return jsonResponse(LOGS_PAGE_1);
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const wrapper = await mountView();
    await openExportModal(wrapper);
    await setExportRange(wrapper);
    await wrapper.get('[data-testid="modal-ok"]').trigger('click');
    await flushPromises();
    // The poll tick observes COMPLETED first and starts the result fetch.
    await vi.advanceTimersByTimeAsync(5000);
    await flushPromises();
    expect(resultCalls).toBe(1);
    // The socket completion for the same job must not start a second fetch.
    socketCapture.handler!({ jobId: 'job1', status: 'COMPLETED', data: null, error: null });
    await flushPromises();
    expect(resultCalls).toBe(1);
    resolveResult(new Response('{"exported":true}', { status: 200 }));
    await flushPromises();
    expect(downloads).toHaveLength(1);
  });

  it('ignores socket events for other jobs', async () => {
    installFetch({ pollStatuses: ['IN_PROGRESS'] });
    const wrapper = await mountView();
    await openExportModal(wrapper);
    await setExportRange(wrapper);
    await wrapper.get('[data-testid="modal-ok"]').trigger('click');
    await flushPromises();
    socketCapture.handler!({ jobId: 'other', status: 'COMPLETED', data: 'x', error: null });
    await flushPromises();
    expect(downloads).toHaveLength(0);
    expect(wrapper.find('[data-testid="export-audit-logs-modal"]').exists()).toBe(true);
  });

  it('ends the export on a socket FAILED and stops polling', async () => {
    const { calls } = installFetch({ pollStatuses: ['IN_PROGRESS'] });
    const wrapper = await mountView();
    await openExportModal(wrapper);
    await setExportRange(wrapper);
    await wrapper.get('[data-testid="modal-ok"]').trigger('click');
    await flushPromises();
    socketCapture.handler!({
      jobId: 'job1',
      status: 'FAILED',
      data: null,
      error: 'job exploded',
    });
    await flushPromises();
    expect(wrapper.text()).toContain('job exploded');
    await vi.advanceTimersByTimeAsync(10000);
    await flushPromises();
    expect(calls.filter((url) => url.includes('/export/job1'))).toHaveLength(0);
    expect(downloads).toHaveLength(0);
    await wrapper.get('[data-testid="modal-cancel"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="export-audit-logs-modal"]').exists()).toBe(false);
  });

  it('keeps the export running on a socket CANCELLED until the poll ends it', async () => {
    installFetch({ pollStatuses: ['CANCELLED'] });
    const wrapper = await mountView();
    await openExportModal(wrapper);
    await setExportRange(wrapper);
    await wrapper.get('[data-testid="modal-ok"]').trigger('click');
    await flushPromises();
    socketCapture.handler!({ jobId: 'job1', status: 'CANCELLED', data: null, error: null });
    await flushPromises();
    await wrapper.get('[data-testid="modal-cancel"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="export-audit-logs-modal"]').exists()).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    await flushPromises();
    await wrapper.get('[data-testid="modal-cancel"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="export-audit-logs-modal"]').exists()).toBe(false);
  });

  it('shows progress while the job runs', async () => {
    installFetch({ pollStatuses: ['IN_PROGRESS'] });
    const wrapper = await mountView();
    await openExportModal(wrapper);
    await setExportRange(wrapper);
    await wrapper.get('[data-testid="modal-ok"]').trigger('click');
    await flushPromises();
    socketCapture.handler!({
      jobId: 'job1',
      status: 'IN_PROGRESS',
      data: null,
      error: null,
      progress: 25,
      total: 100,
      message: 'Working',
    });
    await flushPromises();
    expect(wrapper.text()).toContain('Working');
    expect(wrapper.findComponent(Progress).props('percent')).toBe(25);
  });

  it('blocks modal close while exporting and resets on close once idle', async () => {
    installFetch({ pollStatuses: ['IN_PROGRESS'] });
    const wrapper = await mountView();
    await openExportModal(wrapper);
    await setExportRange(wrapper);
    await wrapper.get('[data-testid="modal-ok"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="modal-cancel"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="export-audit-logs-modal"]').exists()).toBe(true);
    socketCapture.handler!({ jobId: 'job1', status: 'FAILED', data: null, error: 'e' });
    await flushPromises();
    await wrapper.get('[data-testid="modal-cancel"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="export-audit-logs-modal"]').exists()).toBe(false);
    await openExportModal(wrapper);
    expect((wrapper.get('[data-testid="modal-ok"]').element as HTMLButtonElement).disabled).toBe(true);
  });

  it('toasts when the export request fails and stays in the modal', async () => {
    installFetch({ exportStatus: 500 });
    const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
    const wrapper = await mountView();
    await openExportModal(wrapper);
    await setExportRange(wrapper);
    await wrapper.get('[data-testid="modal-ok"]').trigger('click');
    await flushPromises();
    expect(errorSpy).toHaveBeenCalledWith('export boom');
    expect(wrapper.find('[data-testid="export-audit-logs-modal"]').exists()).toBe(true);
  });

  it('lets the active time filter override the modal range in the export request', async () => {
    const { calls } = installFetch({ pollStatuses: ['IN_PROGRESS'] });
    const wrapper = await mountView();
    await selectAt(wrapper, 0).vm.$emit('change', 'last7days');
    await flushPromises();
    const listParams = new URL(
      calls.filter((url) => url.includes('/api/v1/audit/logs')).pop()!,
      'http://localhost',
    ).searchParams;
    await openExportModal(wrapper);
    await setExportRange(wrapper);
    await wrapper.get('[data-testid="modal-ok"]').trigger('click');
    await flushPromises();
    const exportParams = new URL(
      calls.find((url) => url.includes('/audit/logs/export'))!,
      'http://localhost',
    ).searchParams;
    expect(exportParams.get('startTs')).toBe(listParams.get('startTs'));
    expect(exportParams.get('endTs')).toBe(listParams.get('endTs'));
  });
});
