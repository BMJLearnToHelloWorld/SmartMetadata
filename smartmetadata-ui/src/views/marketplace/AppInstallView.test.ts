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
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import {
  getMarketPlaceApplicationByFqn,
  installApplication,
} from '@/api/marketplaceApps';
import { useAuthStore } from '@/stores/auth';
import type { LoginUser } from '@/types/api';
import { importSchema } from '@/views/marketplace/appAssets';
import AppInstallView from './AppInstallView.vue';

vi.mock('@/api/marketplaceApps', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/marketplaceApps')>();
  return { ...actual, getMarketPlaceApplicationByFqn: vi.fn(), installApplication: vi.fn() };
});
vi.mock('@/views/marketplace/appAssets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/views/marketplace/appAssets')>();
  return { ...actual, importSchema: vi.fn() };
});
const { mockedRefreshLimit } = vi.hoisted(() => ({
  mockedRefreshLimit: vi.fn(async () => {}),
}));
vi.mock('@/stores/shellConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/shellConfig')>();
  return {
    ...actual,
    useShellConfigStore: () => ({ limit: undefined, refreshLimitConfig: mockedRefreshLimit }),
  };
});

const mockedByFqn = vi.mocked(getMarketPlaceApplicationByFqn);
const mockedInstall = vi.mocked(installApplication);
const mockedImportSchema = vi.mocked(importSchema);

const MESSAGES = {
  en: {
    label: {
      application: 'Application',
      'application-plural': 'Applications',
      'install-entity': 'Install {entity}',
      'instance-lowercase': 'instance',
      'for-lowercase': 'for',
      'not-found-lowercase': 'not found',
      'detail-plural': 'Details',
      configure: 'Configure',
      schedule: 'Schedule',
      back: 'Back',
      create: 'Create',
    },
    message: {
      'app-installed-successfully': 'App installed successfully',
    },
    server: {
      'no-application-schema-found': 'No schema found for {appName}',
    },
  },
};

const DUMMY = { template: '<div />' };
const SCHEMA = { type: 'object', properties: {} };

const MARKETPLACE_APP = {
  id: 'm1',
  name: 'DataInsightsReportApplication',
  displayName: 'Data Insights Report',
  description: 'Scheduled insights',
  fullyQualifiedName: 'DataInsightsReportApplication',
  developer: 'Collate',
  developerUrl: 'https://example.test',
  updatedAt: Date.now(),
  appType: 'internal',
  scheduleType: 'Scheduled',
  allowConfiguration: true,
  appConfiguration: { lookbackDays: 7 },
};

async function mountInstall(
  appOverrides: Record<string, unknown> = {},
  asAdmin = true,
  schemaError = false,
  definitionError = false,
) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = { name: asAdmin ? 'admin' : 'bob', isAdmin: asAdmin } as LoginUser;
  if (definitionError) {
    mockedByFqn.mockRejectedValue(new Error('gone'));
  } else {
    mockedByFqn.mockResolvedValue({ ...MARKETPLACE_APP, ...appOverrides });
  }
  if (schemaError) {
    mockedImportSchema.mockRejectedValue(new Error('no schema'));
  } else {
    mockedImportSchema.mockResolvedValue(SCHEMA);
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/marketplace/apps/:fqn/install', name: 'marketplace-app-install', component: DUMMY },
      { path: '/marketplace/apps/:fqn', name: 'marketplace-app-detail', component: DUMMY },
      { path: '/admin/apps', name: 'admin-apps', component: DUMMY },
    ],
  });
  await router.push('/marketplace/apps/DataInsightsReportApplication/install');
  await router.isReady();
  const wrapper = mount(AppInstallView, {
    props: { fqn: 'DataInsightsReportApplication' },
    global: {
      plugins: [Antd, pinia, router, createI18n({ legacy: false, locale: 'en', messages: MESSAGES })],
      stubs: {
        PermissionPlaceholder: { template: '<div data-testid="permission-error-placeholder">Access Denied</div>' },
        NoDataPlaceholder: {
          props: { title: String, testId: String },
          template: '<div class="no-data-stub" :data-testid="testId" :data-title="title" />',
        },
        AppInstallStepper: {
          props: { steps: Array, activeStep: Number },
          template:
            '<div class="stepper-stub" :data-steps="steps.map(s => s.step).join(\',\')" :data-active="activeStep" />',
        },
        AppInstallVerifyCard: {
          name: 'VerifyCardStub',
          props: ['appData', 'nextButtonLabel', 'onSave', 'onCancel'],
          template:
            '<div class="verify-stub"><button data-testid="verify-save" @click="onSave">Next</button><button data-testid="verify-cancel" @click="onCancel">Cancel</button></div>',
        },
        ApplicationConfiguration: {
          name: 'ApplicationConfigurationStub',
          props: ['appData', 'isLoading', 'jsonSchema', 'onCancel', 'onConfigSave'],
          template: '<div class="config-stub" />',
        },
        ScheduleIntervalField: {
          name: 'ScheduleIntervalFieldStub',
          props: ['modelValue', 'includePeriodOptions'],
          emits: ['update:modelValue', 'validity-change'],
          template: '<div class="schedule-field-stub" :data-value="modelValue" />',
        },
      },
    },
  });
  await flushPromises();
  return { wrapper, router };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AppInstallView', () => {
  it('renders all three steps and starts on the verify card', async () => {
    const { wrapper } = await mountInstall();
    expect(mockedByFqn).toHaveBeenCalledWith('DataInsightsReportApplication', 'owners');
    expect(mockedImportSchema).toHaveBeenCalledWith('DataInsightsReportApplication');
    const stepper = wrapper.find('.stepper-stub');
    expect(stepper.attributes('data-steps')).toBe('1,2,3');
    expect(stepper.attributes('data-active')).toBe('1');
    expect(wrapper.find('.verify-stub').exists()).toBe(true);
    wrapper.unmount();
  });

  it('drops the schedule step for NoSchedule apps', async () => {
    const { wrapper } = await mountInstall({ scheduleType: 'NoSchedule' });
    expect(wrapper.find('.stepper-stub').attributes('data-steps')).toBe('1,2');
    wrapper.unmount();
  });

  it('drops the configure step when allowConfiguration is false', async () => {
    const { wrapper } = await mountInstall({ allowConfiguration: false });
    expect(wrapper.find('.stepper-stub').attributes('data-steps')).toBe('1,3');
    wrapper.unmount();
  });

  it('cancel returns to the marketplace detail', async () => {
    const { wrapper, router } = await mountInstall();
    await wrapper.find('[data-testid="verify-cancel"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('marketplace-app-detail');
    wrapper.unmount();
  });

  it('verify save advances to configuration, whose save opens the schedule step', async () => {
    const { wrapper } = await mountInstall();
    await wrapper.find('[data-testid="verify-save"]').trigger('click');
    expect(wrapper.find('.stepper-stub').attributes('data-active')).toBe('2');
    const configStub = wrapper.findComponent({ name: 'ApplicationConfigurationStub' });
    await configStub.props('onConfigSave')({ lookbackDays: 14 });
    await flushPromises();
    expect(wrapper.find('.stepper-stub').attributes('data-active')).toBe('3');
    // Pin getDefaultScheduleValue ignores defaultSchedule when period
    // options are defined: the week option seeds Monday, not the
    // report app's Sunday display default.
    expect(wrapper.find('.schedule-field-stub').attributes('data-value')).toBe('0 0 * * 1');
    wrapper.unmount();
  });

  it('installs with the stored configuration and the schedule on Create', async () => {
    mockedInstall.mockResolvedValue({});
    mockedRefreshLimit.mockResolvedValue(undefined);
    const { wrapper, router } = await mountInstall();
    await wrapper.find('[data-testid="verify-save"]').trigger('click');
    const configStub = wrapper.findComponent({ name: 'ApplicationConfigurationStub' });
    await configStub.props('onConfigSave')({ lookbackDays: 14 });
    await flushPromises();
    await wrapper.find('[data-testid="deploy-button"]').trigger('click');
    await flushPromises();
    expect(mockedInstall).toHaveBeenCalledWith({
      appConfiguration: { lookbackDays: 14 },
      appSchedule: { scheduleTimeline: 'Custom', cronExpression: '0 0 * * 1' },
      name: 'DataInsightsReportApplication',
      description: 'Scheduled insights',
      displayName: 'Data Insights Report',
      ingestionRunner: undefined,
    });
    expect(mockedRefreshLimit).toHaveBeenCalled();
    expect(router.currentRoute.value.name).toBe('admin-apps');
    wrapper.unmount();
  });

  it('installs immediately without an appSchedule key for NoSchedule apps', async () => {
    mockedInstall.mockResolvedValue({});
    mockedRefreshLimit.mockResolvedValue(undefined);
    const { wrapper, router } = await mountInstall({ scheduleType: 'NoSchedule' });
    await wrapper.find('[data-testid="verify-save"]').trigger('click');
    const configStub = wrapper.findComponent({ name: 'ApplicationConfigurationStub' });
    await configStub.props('onConfigSave')({ lookbackDays: 3 });
    await flushPromises();
    expect(mockedInstall).toHaveBeenCalledWith(
      expect.objectContaining({ appConfiguration: { lookbackDays: 3 } }),
    );
    expect(mockedInstall.mock.calls[0][0]).not.toHaveProperty('appSchedule');
    expect(router.currentRoute.value.name).toBe('admin-apps');
    wrapper.unmount();
  });

  it('renders the missing-entity placeholder when the definition fetch fails', async () => {
    const { wrapper } = await mountInstall({}, true, false, true);
    const placeholder = wrapper.find('.no-data-stub');
    expect(placeholder.attributes('data-testid')).toBe('no-data-placeholder');
    expect(placeholder.attributes('data-title')).toBe(
      'Application instance for DataInsightsReportApplication not found',
    );
    wrapper.unmount();
  });

  it('renders the stepper with empty content when only the schema fails', async () => {
    const { wrapper } = await mountInstall({}, true, true);
    expect(wrapper.find('.stepper-stub').exists()).toBe(true);
    expect(wrapper.find('.verify-stub').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows the forbidden view for non-admins without fetching', async () => {
    const { wrapper } = await mountInstall({}, false);
    expect(wrapper.find('[data-testid="app-install-verify"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Access Denied');
    expect(mockedByFqn).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('titles the document with the install-entity label once the app loads (pin pageTitle)', async () => {
    const { wrapper } = await mountInstall();
    expect(document.title).toBe('Install Data Insights Report');
    wrapper.unmount();
  });

  it('falls back to the applications plural title when the definition fetch fails', async () => {
    const { wrapper } = await mountInstall({}, true, false, true);
    expect(document.title).toBe('Applications');
    wrapper.unmount();
  });
});
