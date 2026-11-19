/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import Antd, { message } from 'ant-design-vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import type { LoginUser } from '@/types/api';
import AppRunsHistory from './AppRunsHistory.vue';

const getApplicationRuns = vi.hoisted(() => vi.fn());
const fetchAppLogsRecursively = vi.hoisted(() => vi.fn());
const stopApp = vi.hoisted(() => vi.fn());
vi.mock('@/api/apps', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/api/apps')>();
  return { ...original, getApplicationRuns, fetchAppLogsRecursively, stopApp };
});

const socketHandlers = vi.hoisted(
  () => new Map<string, (payload: Record<string, unknown>) => void>(),
);
vi.mock('@/composables/useSocketChannel', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/composables/useSocketChannel')>();
  return {
    ...original,
    useSocketChannel: (channel: string, handler: (payload: Record<string, unknown>) => void) => {
      socketHandlers.set(channel, handler);
    },
  };
});

const MESSAGES = {
  en: {
    label: {
      'run-at': 'Run At',
      'run-type': 'Run Type',
      'triggered-by': 'Triggered By',
      duration: 'Duration',
      status: 'Status',
      'action-plural': 'Actions',
      'log-plural': 'Logs',
      config: 'Config',
      stop: 'Stop',
      close: 'Close',
      page: 'Page',
      of: 'of',
      next: 'Next',
      previous: 'Previous',
      'page-plural': 'Pages',
      'entity-configuration': '{entity} Configuration',
      application: 'Application',
      'no-entity': 'No {entity}',
      configuration: 'Configuration',
    },
    message: { 'no-data-available': 'No data available' },
  },
};

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const baseRun = {
  appId: 'app-1',
  appName: 'SearchIndexingApplication',
  runType: 'scheduled',
  timestamp: 1700000000000,
  startTime: 1700000000000,
  endTime: 1700000060000,
  status: 'success',
  triggeredBy: 'admin',
  executionTime: 60000,
  config: { batchSize: 100 },
  successContext: {
    stats: { jobStats: { totalRecords: 10, successRecords: 10, failedRecords: 0 } },
  },
};

function mountHistory(props: Record<string, unknown> = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = { name: 'admin' } as LoginUser;
  return mount(AppRunsHistory, {
    props: {
      appData: {
        id: 'app-1',
        name: 'SearchIndexingApplication',
        fullyQualifiedName: 'SearchIndexingApplication',
        displayName: 'Search Indexing',
        appType: 'internal',
        scheduleType: 'Scheduled',
        supportsInterrupt: true,
      },
      ...props,
    },
    global: {
      plugins: [Antd, pinia, createI18n({ legacy: false, locale: 'en', messages: MESSAGES })],
      stubs: {
        UserPopOverCard: {
          props: { userName: String, showUserName: Boolean, profileWidth: Number },
          template:
            '<span class="user-popover-stub" :data-user-name="userName" :data-show-user-name="String(showUserName)" :data-profile-width="profileWidth">{{ userName }}</span>',
        },
        AppLogsViewer: {
          props: ['data'],
          template: '<div class="logs-viewer-stub" />',
        },
        AppSchemaForm: {
          props: ['schema', 'formData', 'readonly', 'hideFooter', 'flatPropertyLayout'],
          template: '<div class="schema-form-stub" />',
        },
      },
    },
    attachTo: document.body,
  });
}

describe('AppRunsHistory', () => {
  beforeEach(() => {
    window.localStorage.clear();
    socketHandlers.clear();
    vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
    getApplicationRuns.mockResolvedValue({ data: [], total: 0 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // clearAllMocks, NOT resetAllMocks: resetting would wipe the
    // setup file's matchMedia implementation and break every later
    // antd Table mount in this file.
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('fetches internal runs with offset paging and renders the row cells', async () => {
    getApplicationRuns.mockResolvedValue({ data: [baseRun], total: 1 });
    const wrapper = mountHistory();
    await flush();
    expect(getApplicationRuns).toHaveBeenCalledWith('SearchIndexingApplication', {
      offset: 0,
      limit: 15,
    });
    const row = wrapper.find('tbody tr');
    expect(row.text()).toContain('scheduled');
    expect(row.text()).toContain('admin');
    expect(row.text()).toContain('Success');
    expect(row.text()).toContain('00:01:00');
    const popover = wrapper.find('.user-popover-stub');
    expect(popover.attributes('data-user-name')).toBe('admin');
    expect(popover.attributes('data-show-user-name')).toBe('true');
    expect(popover.attributes('data-profile-width')).toBe('24');
    wrapper.unmount();
  });

  it('renders the synthetic current-config row when an internal app has no runs', async () => {
    const wrapper = mountHistory();
    await flush();
    const row = wrapper.find('tbody tr');
    expect(row.text()).toContain('--');
    const logsButton = wrapper.find('[data-testid="logs"]');
    expect((logsButton.element as HTMLButtonElement).disabled).toBe(true);
    wrapper.unmount();
  });

  it('disables Logs for a success run with a null success context', async () => {
    getApplicationRuns.mockResolvedValue({
      data: [{ ...baseRun, successContext: null }],
      total: 1,
    });
    const wrapper = mountHistory();
    await flush();
    expect((wrapper.find('[data-testid="logs"]').element as HTMLButtonElement).disabled).toBe(true);
    wrapper.unmount();
  });

  it('expands a stats row into the logs viewer when Logs is clicked', async () => {
    getApplicationRuns.mockResolvedValue({ data: [baseRun], total: 1 });
    const wrapper = mountHistory();
    await flush();
    expect(wrapper.find('.logs-viewer-stub').exists()).toBe(false);
    await wrapper.find('[data-testid="logs"]').trigger('click');
    await flush();
    expect(wrapper.find('.logs-viewer-stub').exists()).toBe(true);
    wrapper.unmount();
  });

  it('opens the failure-logs viewer for a stats-less internal run', async () => {
    getApplicationRuns.mockResolvedValue({
      data: [{ ...baseRun, successContext: { stats: {} }, failureContext: { failure: { message: 'boom' } } }],
      total: 1,
    });
    const wrapper = mountHistory();
    await flush();
    await wrapper.find('[data-testid="logs"]').trigger('click');
    await flush();
    expect(document.body.textContent).toContain('boom');
    wrapper.unmount();
  });

  it('fetches external runs in a 30-day window and slices to maxRecords', async () => {
    const runs = [baseRun, { ...baseRun, timestamp: 1700000100000 }, { ...baseRun, timestamp: 1700000200000 }];
    getApplicationRuns.mockResolvedValue({ data: runs, total: 3 });
    const wrapper = mountHistory({
      appData: {
        id: 'app-1',
        name: 'ExternalApp',
        fullyQualifiedName: 'ExternalApp',
        appType: 'external',
        scheduleType: 'ScheduledOrManual',
      },
      maxRecords: 2,
    });
    await flush();
    const params = getApplicationRuns.mock.calls[0][1] as Record<string, unknown>;
    expect(params.limit).toBe(2);
    expect(typeof params.startTs).toBe('number');
    expect(typeof params.endTs).toBe('number');
    expect(wrapper.findAll('tbody tr')).toHaveLength(2);
    wrapper.unmount();
  });

  it('opens external logs through the recursive fetch with the app name and run id', async () => {
    fetchAppLogsRecursively.mockResolvedValue('external log text');
    getApplicationRuns.mockResolvedValue({
      data: [{ ...baseRun, properties: { pipelineRunId: 'run-9' } }],
      total: 1,
    });
    const wrapper = mountHistory({
      appData: {
        id: 'app-1',
        name: 'ExternalApp',
        fullyQualifiedName: 'ExternalApp',
        appType: 'external',
        scheduleType: 'ScheduledOrManual',
      },
    });
    await flush();
    await wrapper.find('[data-testid="logs"]').trigger('click');
    await flush();
    expect(fetchAppLogsRecursively).toHaveBeenCalledWith('ExternalApp', 'run-9');
    expect(document.body.textContent).toContain('external log text');
    wrapper.unmount();
  });

  it('disables the config button without a schema and opens the readonly dialog with one', async () => {
    getApplicationRuns.mockResolvedValue({ data: [baseRun], total: 1 });
    const wrapper = mountHistory();
    await flush();
    expect(
      (wrapper.find('[data-testid="app-historical-config"]').element as HTMLButtonElement).disabled,
    ).toBe(true);
    wrapper.unmount();

    const withSchema = mountHistory({
      jsonSchema: { type: 'object', properties: { batchSize: { type: 'integer' } } },
    });
    await flush();
    await withSchema.find('[data-testid="app-historical-config"]').trigger('click');
    await flush();
    expect(document.body.querySelector('[data-testid="edit-table-type-property-modal"]')).toBeTruthy();
    expect(document.body.querySelector('.schema-form-stub')).toBeTruthy();
    withSchema.unmount();
  });

  it('shows the empty config placeholder when the schema has no properties', async () => {
    getApplicationRuns.mockResolvedValue({ data: [baseRun], total: 1 });
    const wrapper = mountHistory({ jsonSchema: { type: 'object', properties: {} } });
    await flush();
    await wrapper.find('[data-testid="app-historical-config"]').trigger('click');
    await flush();
    expect(document.body.querySelector('[data-testid="app-run-config-empty"]')).toBeTruthy();
    wrapper.unmount();
  });

  it('shows Stop only for interruptible non-terminal runs and refreshes after stopping', async () => {
    stopApp.mockResolvedValue(undefined);
    getApplicationRuns.mockResolvedValue({
      data: [{ ...baseRun, status: 'running' }],
      total: 1,
    });
    const wrapper = mountHistory();
    await flush();
    expect(wrapper.find('[data-testid="stop-button"]').exists()).toBe(true);
    await wrapper.find('[data-testid="stop-button"]').trigger('click');
    await flush();
    (document.body.querySelector('[data-testid="stop-modal-confirm"]') as HTMLElement).click();
    await flush();
    expect(stopApp).toHaveBeenCalledWith('SearchIndexingApplication', undefined);
    expect(getApplicationRuns).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it('hides Stop for terminal runs and for apps without interrupt support', async () => {
    getApplicationRuns.mockResolvedValue({ data: [baseRun], total: 1 });
    const wrapper = mountHistory();
    await flush();
    expect(wrapper.find('[data-testid="stop-button"]').exists()).toBe(false);
    wrapper.unmount();

    getApplicationRuns.mockResolvedValue({
      data: [{ ...baseRun, status: 'running' }],
      total: 1,
    });
    const noInterrupt = mountHistory({
      appData: {
        id: 'app-1',
        name: 'SearchIndexingApplication',
        fullyQualifiedName: 'SearchIndexingApplication',
        appType: 'internal',
        scheduleType: 'Scheduled',
        supportsInterrupt: false,
      },
    });
    await flush();
    expect(noInterrupt.find('[data-testid="stop-button"]').exists()).toBe(false);
    noInterrupt.unmount();
  });

  it('merges socket updates by appId + startTime and never appends unknown runs', async () => {
    getApplicationRuns.mockResolvedValue({ data: [baseRun], total: 1 });
    const wrapper = mountHistory();
    await flush();
    const handler = socketHandlers.get('searchIndexJobStatus');
    expect(handler).toBeDefined();
    handler!({ appId: 'app-1', startTime: 1700000000000, status: 'failed' });
    await flush();
    expect(wrapper.find('tbody tr').text()).toContain('Failed');
    handler!({ appId: 'other', startTime: 1, status: 'running' });
    await flush();
    expect(wrapper.findAll('tbody tr')).toHaveLength(1);
    expect(socketHandlers.has('rdfIndexJobStatus')).toBe(true);
    expect(socketHandlers.has('dataInsightsJobStatus')).toBe(true);
    expect(socketHandlers.has('cacheWarmupJobStatus')).toBe(true);
    wrapper.unmount();
  });

  it('pages with NextPrevious and refetches at the new offset', async () => {
    getApplicationRuns.mockResolvedValue({ data: [baseRun], total: 40 });
    const wrapper = mountHistory();
    await flush();
    expect(wrapper.find('[data-testid="pagination"]').exists()).toBe(true);
    await wrapper.find('[data-testid="next"]').trigger('click');
    await flush();
    expect(getApplicationRuns).toHaveBeenLastCalledWith('SearchIndexingApplication', {
      offset: 15,
      limit: 15,
    });
    wrapper.unmount();
  });

  it('hides pagination when a single page holds all runs', async () => {
    getApplicationRuns.mockResolvedValue({ data: [baseRun], total: 1 });
    const wrapper = mountHistory();
    await flush();
    expect(wrapper.find('[data-testid="pagination"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('starts from the persisted global page size', async () => {
    window.localStorage.setItem(
      'sm.userPreferences.v1',
      JSON.stringify({ version: 1, preferences: { admin: { globalPageSize: 25 } } }),
    );
    getApplicationRuns.mockResolvedValue({ data: [baseRun], total: 1 });
    const wrapper = mountHistory();
    await flush();
    expect(getApplicationRuns).toHaveBeenCalledWith('SearchIndexingApplication', {
      offset: 0,
      limit: 25,
    });
    wrapper.unmount();
  });

  it('exposes refreshAppHistory for the schedule tab', async () => {
    getApplicationRuns.mockResolvedValue({ data: [baseRun], total: 1 });
    const pinia = createPinia();
    setActivePinia(pinia);
    useAuthStore().user = { name: 'admin' } as LoginUser;
    const { defineComponent, h, ref } = await import('vue');
    const exposedRef = ref<{ refreshAppHistory: () => void } | null>(null);
    const Parent = defineComponent({
      setup() {
        return () =>
          h(AppRunsHistory, {
            ref: exposedRef,
            appData: {
              id: 'app-1',
              name: 'SearchIndexingApplication',
              fullyQualifiedName: 'SearchIndexingApplication',
              appType: 'internal',
              scheduleType: 'Scheduled',
            },
          });
      },
    });
    const wrapper = mount(Parent, {
      global: {
        plugins: [Antd, pinia, createI18n({ legacy: false, locale: 'en', messages: MESSAGES })],
        stubs: { UserPopOverCard: true, AppLogsViewer: true },
      },
    });
    await flush();
    expect(getApplicationRuns).toHaveBeenCalledTimes(1);
    exposedRef.value?.refreshAppHistory();
    await flush();
    expect(getApplicationRuns).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
});
