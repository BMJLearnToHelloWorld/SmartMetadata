/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import Antd from 'ant-design-vue';
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { createI18n } from 'vue-i18n';
import AppSchedule from './AppSchedule.vue';

const getIngestionPipelineByFqn = vi.hoisted(() => vi.fn());
vi.mock('@/api/ingestionPipelines', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/api/ingestionPipelines')>();
  return { ...original, getIngestionPipelineByFqn };
});

const refreshAppHistory = vi.hoisted(() => vi.fn());
const RunsHistoryStub = defineComponent({
  setup(_, { expose }) {
    expose({ refreshAppHistory });
    return () => h('div', { class: 'runs-history-stub' });
  },
});

const MESSAGES = {
  en: {
    label: {
      'schedule-type': 'Schedule Type',
      'schedule-interval': 'Schedule Interval',
      deploy: 'Deploy',
      edit: 'Edit',
      'run-now': 'Run Now',
      cancel: 'Cancel',
      save: 'Save',
      'update-entity': 'Update {entity}',
      schedule: 'Schedule',
    },
    message: {
      'application-disabled-message': 'Application is disabled.',
      'no-ingestion-pipeline-found': 'No ingestion pipeline found.',
    },
  },
};

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function waitFor(check: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (check()) {
      return;
    }
    await flush();
  }
  throw new Error(`timed out waiting for ${label}`);
}

function mountSchedule(props: Record<string, unknown> = {}) {
  return mount(AppSchedule, {
    props: {
      appData: {
        id: 'app-1',
        name: 'SearchIndexingApplication',
        fullyQualifiedName: 'SearchIndexingApplication',
        appType: 'internal',
        scheduleType: 'ScheduledOrManual',
        appSchedule: { cronExpression: '0 0 * * *', scheduleTimeline: 'Daily' },
      },
      loading: { isRunLoading: false, isDeployLoading: false },
      onSave: vi.fn(),
      onDemandTrigger: vi.fn(),
      onDeployTrigger: vi.fn(),
      ...props,
    },
    global: {
      plugins: [
        Antd,
        createPinia(),
        createI18n({ legacy: false, locale: 'en', messages: MESSAGES }),
      ],
      stubs: {
        AppRunsHistory: RunsHistoryStub,
        ScheduleIntervalField: {
          props: ['modelValue', 'includePeriodOptions', 'testIdPrefix'],
          template:
            '<input data-testid="schedule-interval-stub" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
        },
      },
    },
    attachTo: document.body,
  });
}

describe('AppSchedule', () => {
  beforeEach(() => {
    getIngestionPipelineByFqn.mockResolvedValue({ deployed: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('renders the summary rows and skips the pipeline check for internal apps', async () => {
    const wrapper = mountSchedule();
    await flush();
    expect(getIngestionPipelineByFqn).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="schedule-type"]').text()).toBe('Daily');
    // cronstrue loads dynamically; wait for the interval text to land.
    await waitFor(
      () => wrapper.find('[data-testid="cron-string"]').exists(),
      'the cron-string summary row',
    );
    expect(wrapper.find('[data-testid="cron-string"]').text()).toContain('12:00 AM');
    expect(wrapper.find('.runs-history-stub').exists()).toBe(true);
    wrapper.unmount();
  });

  it('gates the action buttons on app type, flags, and system status', async () => {
    const wrapper = mountSchedule();
    await flush();
    expect(wrapper.find('[data-testid="deploy-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="edit-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="run-now-button"]').exists()).toBe(true);
    wrapper.unmount();

    const systemApp = mountSchedule({
      appData: {
        id: 'app-1',
        name: 'SearchIndexingApplication',
        fullyQualifiedName: 'SearchIndexingApplication',
        appType: 'internal',
        scheduleType: 'Scheduled',
        system: true,
      },
    });
    await flush();
    expect(systemApp.find('[data-testid="edit-button"]').exists()).toBe(false);
    expect(systemApp.find('[data-testid="run-now-button"]').exists()).toBe(false);
    systemApp.unmount();
  });

  it('shows Deploy and runs history for a deployed external app', async () => {
    const wrapper = mountSchedule({
      appData: {
        id: 'app-1',
        name: 'ExternalApp',
        fullyQualifiedName: 'ExternalApp',
        appType: 'external',
        scheduleType: 'ScheduledOrManual',
        pipelines: [{ fullyQualifiedName: 'ExternalApp.pipeline' }],
      },
    });
    await flush();
    expect(getIngestionPipelineByFqn).toHaveBeenCalledWith('ExternalApp.pipeline');
    expect(wrapper.find('[data-testid="deploy-button"]').exists()).toBe(true);
    expect(wrapper.find('.runs-history-stub').exists()).toBe(true);
    wrapper.unmount();
  });

  it('shows the no-pipeline message when the external pipeline is not deployed', async () => {
    getIngestionPipelineByFqn.mockResolvedValue({ deployed: false });
    const wrapper = mountSchedule({
      appData: {
        id: 'app-1',
        name: 'ExternalApp',
        fullyQualifiedName: 'ExternalApp',
        appType: 'external',
        scheduleType: 'ScheduledOrManual',
        pipelines: [{ fullyQualifiedName: 'ExternalApp.pipeline' }],
      },
    });
    await flush();
    expect(wrapper.find('.runs-history-stub').exists()).toBe(false);
    expect(wrapper.text()).toContain('No ingestion pipeline found.');
    wrapper.unmount();
  });

  it('treats a failed pipeline check as undeployed', async () => {
    getIngestionPipelineByFqn.mockRejectedValue(new Error('boom'));
    const wrapper = mountSchedule({
      appData: {
        id: 'app-1',
        name: 'ExternalApp',
        fullyQualifiedName: 'ExternalApp',
        appType: 'external',
        scheduleType: 'ScheduledOrManual',
        pipelines: [{ fullyQualifiedName: 'ExternalApp.pipeline' }],
      },
    });
    await flush();
    expect(wrapper.text()).toContain('No ingestion pipeline found.');
    wrapper.unmount();
  });

  it('hides all buttons and shows the disabled reason for a disabled app', async () => {
    const wrapper = mountSchedule({ disabled: true, disabledReason: 'Cache warmup is disabled.' });
    await flush();
    expect(wrapper.find('[data-testid="edit-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="run-now-button"]').exists()).toBe(false);
    expect(wrapper.find('.runs-history-stub').exists()).toBe(false);
    expect(wrapper.text()).toContain('Cache warmup is disabled.');
    wrapper.unmount();
  });

  it('opens the edit dialog seeded from the current cron and saves through onSave', async () => {
    const onSave = vi.fn();
    const wrapper = mountSchedule({ onSave });
    await flush();
    await wrapper.find('[data-testid="edit-button"]').trigger('click');
    await flush();
    expect(document.body.querySelector('[data-testid="update-schedule-modal"]')).toBeTruthy();
    const input = document.body.querySelector(
      '[data-testid="schedule-interval-stub"]',
    ) as HTMLInputElement;
    expect(input.value).toBe('0 0 * * *');
    (document.body.querySelector('[data-testid="deploy-button"]') as HTMLElement).click();
    await flush();
    expect(onSave).toHaveBeenCalledWith('0 0 * * *');
    // The dialog element lingers in jsdom while antd's close
    // transition never fires; the save call above is the behavior.
    wrapper.unmount();
  });

  it('lets onEditSchedule override the dialog open', async () => {
    const onEditSchedule = vi.fn();
    const wrapper = mountSchedule({ onEditSchedule });
    await flush();
    await wrapper.find('[data-testid="edit-button"]').trigger('click');
    await flush();
    expect(onEditSchedule).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector('[data-testid="update-schedule-modal"]')).toBeNull();
    wrapper.unmount();
  });

  it('triggers on demand and refreshes the runs history after 750ms', async () => {
    const onDemandTrigger = vi.fn(async () => {});
    const wrapper = mountSchedule({ onDemandTrigger });
    await flush();
    await wrapper.find('[data-testid="run-now-button"]').trigger('click');
    await flush();
    expect(onDemandTrigger).toHaveBeenCalledTimes(1);
    expect(refreshAppHistory).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(refreshAppHistory).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});
