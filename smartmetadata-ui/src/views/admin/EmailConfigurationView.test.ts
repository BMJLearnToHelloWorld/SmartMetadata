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
import { InputNumber, Modal, message } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import EmailConfigurationView from './EmailConfigurationView.vue';

vi.mock('@/api/system', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/system')>();
  return {
    ...actual,
    getSetting: vi.fn(),
    getSettingsSource: vi.fn(),
    updateSetting: vi.fn(),
  };
});

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/client')>();
  return { ...actual, apiRequest: vi.fn() };
});

import { apiRequest } from '@/api/client';
import { getSetting, getSettingsSource, updateSetting } from '@/api/system';

const getMock = getSetting as unknown as ReturnType<typeof vi.fn>;
const sourcesMock = getSettingsSource as unknown as ReturnType<typeof vi.fn>;
const updateMock = updateSetting as unknown as ReturnType<typeof vi.fn>;
const apiRequestMock = apiRequest as unknown as ReturnType<typeof vi.fn>;

const FULL_CONFIG = {
  username: 'ops',
  password: 'secret',
  senderMail: 'noreply@example.com',
  serverEndpoint: 'smtp.example.com',
  serverPort: 25,
  emailingEntity: '',
  enableSmtpServer: true,
  supportUrl: '',
  transportationStrategy: 'SMTP',
  templates: 'should-be-hidden',
  openMetadataUrl: 'https://om.example.com',
  unknownField: 'uv',
};

async function mountView(asAdmin = true) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = asAdmin
    ? { id: 'admin', name: 'admin', isAdmin: true }
    : { id: 'u9', name: 'bob' };
  const i18n = createI18n({
    legacy: false,
    locale: 'en-US',
    messages: {
      'en-US': {
        label: {
          add: 'Add',
          entity: 'entity',
          'doc-plural-lowercase': 'docs',
          documentation: 'Documentation',
        },
        message: {
          'adding-new-entity-is-easy-just-give-it-a-spin':
            'Adding a new {entity} is easy, just give it a spin',
          'refer-to-our-doc': 'Refer to our {doc}',
        },
        settings: {
          email: {
            title: 'Email',
            lead: 'Lead',
            loadFailed: 'Fetch failed',
            saved: 'Saved',
            saveFailed: 'Save failed',
            fieldRequired: 'Field {field} is required',
            testEmail: 'Test Email',
            testEmailConnection: 'Test Email Connection',
            emailLabel: 'Email',
            invalidEmail: '{field} is invalid',
            test: 'Test',
            testFailed: 'Test failed',
            add: 'Add',
            edit: 'Edit',
            cancel: 'Cancel',
            configLowercase: 'email configuration',
            createConfig: 'Create email configuration',
            testEmailPlaceholder: 'Enter email',
          },
          system: {
            username: 'Username',
            password: 'Password',
            senderMail: 'Sender Email',
            serverEndpoint: 'Server Endpoint',
            serverPort: 'Server Port',
            emailingEntity: 'Emailing Entity',
            enableSmtp: 'Enable SMTP Server',
            supportUrl: 'Support URL',
            transport: 'Transportation Strategy',
            saveEmail: 'Save',
          },
          omUrl: { url: 'Brand Name URL' },
        },
      },
    },
  });
  // The view renders a real SmBreadcrumb (RouterLink), so the mount needs
  // a real router — same pattern as TimeFormatSettingsView.test.ts: the
  // view route, the breadcrumb targets it links to by name
  // (admin-settings, settings-category), plus a catch-all keeping sibling
  // links resolvable.
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/settings/preferences/email',
        name: 'settings-preferences-email',
        component: EmailConfigurationView,
      },
      { path: '/settings', name: 'admin-settings', component: { template: '<div />' } },
      {
        path: '/settings/:category',
        name: 'settings-category',
        component: { template: '<div />' },
      },
      { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
    ],
  });
  await router.push({ name: 'settings-preferences-email' });
  await router.isReady();
  return mount(EmailConfigurationView, {
    global: {
      plugins: [router, i18n, pinia],
      stubs: {
        PreferencePageShell: {
          template: '<div data-testid="email-configuration"><slot /></div>',
          props: ['title', 'lead', 'testId', 'errorMessage', 'loading'],
        },
        SettingsSourceBanner: { template: '<div />' },
      },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getMock.mockResolvedValue({ configValue: FULL_CONFIG });
  sourcesMock.mockResolvedValue([]);
  updateMock.mockResolvedValue(undefined);
  apiRequestMock.mockResolvedValue('Test email sent');
});

describe('EmailConfigurationView detail', () => {
  it('renders sorted keys minus templates, stringifying booleans/numbers and empty as --', async () => {
    const wrapper = await mountView();
    await flushPromises();
    const cols = wrapper.findAll('.ant-col');
    const pairs = cols.map((col) => [
      col.find('.ant-typography-secondary').text(),
      col.find('div').text(),
    ]);
    expect(pairs).toEqual([
      ['Emailing Entity:', '--'],
      ['Enable SMTP Server:', 'true'],
      ['Brand Name URL:', 'https://om.example.com'],
      ['Password:', 'secret'],
      ['Sender Email:', 'noreply@example.com'],
      ['Server Endpoint:', 'smtp.example.com'],
      ['Server Port:', '25'],
      ['Support URL:', '--'],
      ['Transportation Strategy:', 'SMTP'],
      [':', 'uv'],
      ['Username:', 'ops'],
    ]);
    expect(wrapper.text()).not.toContain('should-be-hidden');
  });

  it('shows the create placeholder with no action when the config is absent', async () => {
    getMock.mockResolvedValue({ configValue: undefined });
    const wrapper = await mountView();
    await flushPromises();
    const placeholder = wrapper.find(
      '[data-testid="create-error-placeholder-email configuration"]',
    );
    expect(placeholder.exists()).toBe(true);
    expect(placeholder.findAll('button').length).toBe(0);
    expect(
      wrapper.find('[data-testid="edit-email-configuration"]').text(),
    ).toContain('Add');
  });

  it('labels the action button Edit when a config exists', async () => {
    const wrapper = await mountView();
    await flushPromises();
    expect(
      wrapper.find('[data-testid="edit-email-configuration"]').text(),
    ).toContain('Edit');
  });

  it('shows Test Email only for an admin with a sender mail', async () => {
    const admin = await mountView(true);
    await flushPromises();
    expect(admin.find('[data-testid="test-email-button"]').exists()).toBe(true);

    getMock.mockResolvedValue({ configValue: { senderMail: '' } });
    const noSender = await mountView(true);
    await flushPromises();
    expect(noSender.find('[data-testid="test-email-button"]').exists()).toBe(false);

    getMock.mockResolvedValue({ configValue: FULL_CONFIG });
    const nonAdmin = await mountView(false);
    await flushPromises();
    expect(nonAdmin.find('[data-testid="test-email-button"]').exists()).toBe(false);
  });

  it('hides the edit action when every form field is deployment-managed', async () => {
    sourcesMock.mockResolvedValue([
      {
        configType: 'emailConfiguration',
        source: 'ENV',
        editable: true,
        managedPaths: [
          '/username',
          '/password',
          '/senderMail',
          '/serverEndpoint',
          '/serverPort',
          '/emailingEntity',
          '/enableSmtpServer',
          '/supportUrl',
          '/transportationStrategy',
        ],
        overriddenFields: [],
      },
    ]);
    const wrapper = await mountView();
    await flushPromises();
    expect(wrapper.find('[data-testid="edit-email-configuration"]').exists()).toBe(false);
  });
});

describe('EmailConfigurationView edit', () => {
  it('saves the 9-field payload, dropping the masked password and empty optionals', async () => {
    const wrapper = await mountView();
    await flushPromises();
    await wrapper.find('[data-testid="edit-email-configuration"]').trigger('click');
    await wrapper.vm.$nextTick();

    const password = wrapper.find('[data-testid="password-input"]');
    await password.setValue('*********');
    await wrapper.find('[data-testid="save-email-config"]').trigger('click');
    await flushPromises();

    expect(updateMock).toHaveBeenCalledTimes(1);
    const [configType, payload] = updateMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(configType).toBe('emailConfiguration');
    expect(payload).toEqual({
      serverEndpoint: 'smtp.example.com',
      serverPort: 25,
      transportationStrategy: 'SMTP',
      enableSmtpServer: true,
      senderMail: 'noreply@example.com',
      emailingEntity: undefined,
      username: 'ops',
      supportUrl: undefined,
    });
    expect('password' in payload).toBe(false);
    expect('templates' in payload).toBe(false);
  });

  it('blocks save when a required field is empty', async () => {
    const wrapper = await mountView();
    await flushPromises();
    await wrapper.find('[data-testid="edit-email-configuration"]').trigger('click');
    await wrapper.vm.$nextTick();
    await wrapper.find('[data-testid="sender-email-input"]').setValue('');
    await wrapper.find('[data-testid="save-email-config"]').trigger('click');
    await flushPromises();
    expect(updateMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Field Sender Email is required');
  });

  it('disables individually managed fields but keeps Save when not all are managed', async () => {
    sourcesMock.mockResolvedValue([
      {
        configType: 'emailConfiguration',
        source: 'ENV',
        editable: true,
        managedPaths: ['/username'],
        overriddenFields: [],
      },
    ]);
    const wrapper = await mountView();
    await flushPromises();
    await wrapper.find('[data-testid="edit-email-configuration"]').trigger('click');
    await wrapper.vm.$nextTick();
    const username = wrapper.find('[data-testid="username-input"]');
    expect(username.attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="save-email-config"]').exists()).toBe(true);
  });

  it('carries no lower bound on the server port input', async () => {
    const wrapper = await mountView();
    await flushPromises();
    await wrapper.find('[data-testid="edit-email-configuration"]').trigger('click');
    await wrapper.vm.$nextTick();
    const port = wrapper.findComponent(InputNumber);
    expect(port.props('min')).toBeUndefined();
  });

  it('returns to the detail view on cancel without saving', async () => {
    const wrapper = await mountView();
    await flushPromises();
    await wrapper.find('[data-testid="edit-email-configuration"]').trigger('click');
    await wrapper.vm.$nextTick();
    await wrapper.find('[data-testid="email-cancel"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(updateMock).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="email-config-form"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="edit-email-configuration"]').exists()).toBe(true);
  });
});

describe('EmailConfigurationView test email', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('sends the test email and toasts the response string', async () => {
    const successSpy = vi.spyOn(message, 'success');
    const wrapper = await mountView();
    await flushPromises();
    await wrapper.find('[data-testid="test-email-button"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(document.body.querySelector('[data-testid="test-email-input"]')).not.toBeNull();
    const input = document.body.querySelector(
      '[data-testid="test-email-input"]',
    ) as HTMLInputElement;
    input.value = 'a@b.com';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await wrapper.vm.$nextTick();
    const okButton = document.body.querySelector('.ant-modal-footer .ant-btn-primary');
    (okButton as HTMLButtonElement).click();
    await flushPromises();
    expect(apiRequestMock).toHaveBeenCalledWith('/v1/system/email/test', {
      method: 'PUT',
      json: { email: 'a@b.com' },
      response: 'text',
    });
    expect(successSpy).toHaveBeenCalledWith('Test email sent');
    successSpy.mockRestore();
  });

  it('unquotes a JSON-string response body before toasting it', async () => {
    apiRequestMock.mockResolvedValue('"Test email sent"');
    const successSpy = vi.spyOn(message, 'success');
    const wrapper = await mountView();
    await flushPromises();
    await wrapper.find('[data-testid="test-email-button"]').trigger('click');
    await wrapper.vm.$nextTick();
    const input = document.body.querySelector(
      '[data-testid="test-email-input"]',
    ) as HTMLInputElement;
    input.value = 'a@b.com';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await wrapper.vm.$nextTick();
    const okButton = document.body.querySelector('.ant-modal-footer .ant-btn-primary');
    (okButton as HTMLButtonElement).click();
    await flushPromises();
    expect(successSpy).toHaveBeenCalledWith('Test email sent');
    successSpy.mockRestore();
  });

  it('rejects an invalid email without calling the endpoint', async () => {
    const wrapper = await mountView();
    await flushPromises();
    await wrapper.find('[data-testid="test-email-button"]').trigger('click');
    await wrapper.vm.$nextTick();
    const input = document.body.querySelector(
      '[data-testid="test-email-input"]',
    ) as HTMLInputElement;
    input.value = 'not-an-email';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await wrapper.vm.$nextTick();
    const okButton = document.body.querySelector('.ant-modal-footer .ant-btn-primary');
    (okButton as HTMLButtonElement).click();
    await flushPromises();
    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Email is invalid');
  });

  it('closes the modal even when the test call fails', async () => {
    apiRequestMock.mockRejectedValue(new Error('SMTP down'));
    const errorSpy = vi.spyOn(message, 'error');
    const wrapper = await mountView();
    await flushPromises();
    await wrapper.find('[data-testid="test-email-button"]').trigger('click');
    await wrapper.vm.$nextTick();
    const input = document.body.querySelector(
      '[data-testid="test-email-input"]',
    ) as HTMLInputElement;
    input.value = 'a@b.com';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await wrapper.vm.$nextTick();
    const okButton = document.body.querySelector('.ant-modal-footer .ant-btn-primary');
    (okButton as HTMLButtonElement).click();
    await flushPromises();
    expect(errorSpy).toHaveBeenCalledWith('SMTP down');
    expect(wrapper.findComponent(Modal).props('open')).toBe(false);
    errorSpy.mockRestore();
  });
});
