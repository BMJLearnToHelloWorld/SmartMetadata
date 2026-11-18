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
import { createPinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { createSsoFreshFormData } from '@/admin/ssoDefaults';
import type { SsoFormData } from '@/admin/ssoSchemas';
import type { TestLoginResult } from '@/api/system';
import type { ConfigurationCheckState } from '@/composables/useSsoTestLogin';
import { createTestI18n } from '@/test/i18n';
import SsoSchemaForm from './SsoSchemaForm.vue';

const applySecurityConfiguration = vi.fn();
const patchSecurityConfiguration = vi.fn();
const validateSecurityConfiguration = vi.fn();

vi.mock('@/api/system', async () => {
  const actual = await vi.importActual<typeof import('@/api/system')>('@/api/system');
  return {
    ...actual,
    applySecurityConfiguration: (...args: unknown[]) =>
      applySecurityConfiguration(...args),
    patchSecurityConfiguration: (...args: unknown[]) =>
      patchSecurityConfiguration(...args),
    validateSecurityConfiguration: (...args: unknown[]) =>
      validateSecurityConfiguration(...args),
  };
});

const mockTestLoginIsTesting = ref(false);
const mockTestLoginIsAwaitingCredentials = ref(false);
const mockTestLoginCheck = ref<ConfigurationCheckState | undefined>(undefined);
const mockTestLoginResult = ref<TestLoginResult | undefined>(undefined);
const mockTestLoginError = ref<string | undefined>(undefined);
const mockRunTestLogin = vi.fn();
const mockSubmitTestLoginCredentials = vi.fn();
const mockResetTestLogin = vi.fn();

vi.mock('@/composables/useSsoTestLogin', async () => {
  const actual =
    await vi.importActual<typeof import('@/composables/useSsoTestLogin')>(
      '@/composables/useSsoTestLogin',
    );
  return {
    ...actual,
    useSsoTestLogin: () => ({
      isTesting: mockTestLoginIsTesting,
      isAwaitingCredentials: mockTestLoginIsAwaitingCredentials,
      configurationCheck: mockTestLoginCheck,
      result: mockTestLoginResult,
      error: mockTestLoginError,
      runTestLogin: (...args: unknown[]) => mockRunTestLogin(...args),
      submitCredentials: (...args: unknown[]) =>
        mockSubmitTestLoginCredentials(...args),
      reset: (...args: unknown[]) => mockResetTestLogin(...args),
    }),
  };
});

vi.mock('@/api/ssoRoles', () => ({
  searchSsoRoles: vi.fn().mockResolvedValue([]),
}));

const locationReplaceSpy = vi.fn();
Object.defineProperty(window, 'location', {
  value: {
    href: window.location.href,
    origin: window.location.origin,
    replace: locationReplaceSpy,
  },
  configurable: true,
});

const GOOGLE_MD = [
  '$$section',
  '## Provider Name',
  '$(id="providerName")',
  'Name your provider.',
  '$$',
].join('\n');

function mountForm(props: Record<string, unknown> = {}) {
  return mount(SsoSchemaForm, {
    props,
    global: {
      plugins: [createPinia(), createTestI18n('en-US')],
    },
  });
}

function existingGoogleConfig(): SsoFormData {
  return createSsoFreshFormData('google');
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, text: async () => GOOGLE_MD })),
  );
  HTMLElement.prototype.scrollIntoView = vi.fn();
  applySecurityConfiguration.mockReset();
  patchSecurityConfiguration.mockReset();
  validateSecurityConfiguration.mockReset();
  mockRunTestLogin.mockReset();
  locationReplaceSpy.mockReset();
  mockTestLoginResult.value = undefined;
  mockTestLoginError.value = undefined;
  mockTestLoginCheck.value = undefined;
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('SsoSchemaForm', () => {
  it('shows the loader while the parent config has not loaded', () => {
    const wrapper = mountForm({ onChangeProvider: () => {} });
    expect(wrapper.find('[data-testid="loader"]').exists()).toBe(true);
    expect(
      wrapper.find('[data-testid="sso-configuration-form-card"]').exists(),
    ).toBe(false);
  });

  it('renders the card variant for a new config with warning and gated save', async () => {
    const wrapper = mountForm({
      selectedProvider: 'google',
      onChangeProvider: () => {},
      onProviderSelect: () => {},
    });
    await flushPromises();
    await nextTick();
    expect(wrapper.find('h1').text()).toContain('Google');
    expect(wrapper.find('h1').text()).toContain('Set Up');
    expect(wrapper.find('.sso-save-warning').exists()).toBe(true);
    expect(wrapper.find('.sso-test-login-required').exists()).toBe(true);
    const save = wrapper.find('[data-testid="save-sso-configuration"]');
    expect(save.attributes('disabled')).toBeDefined();
    expect(
      wrapper.find('[data-testid="test-login-sso-configuration"]').exists(),
    ).toBe(true);
    expect(
      wrapper.find('[data-testid="save-anyway-sso-configuration"]').exists(),
    ).toBe(true);
    expect(wrapper.find('[data-testid="change-provider-button"]').exists()).toBe(
      false,
    );
    expect(
      wrapper.find('[data-testid="sso-configuration-form-card"]').exists(),
    ).toBe(true);
  });

  it('opens the cancel modal and discards back to the selector', async () => {
    const onChangeProvider = vi.fn();
    const wrapper = mountForm({
      selectedProvider: 'google',
      onChangeProvider,
      onProviderSelect: () => {},
    });
    await flushPromises();
    await nextTick();
    await wrapper.find('[data-testid="cancel-sso-configuration"]').trigger('click');
    await nextTick();
    expect(
      document.querySelector('[data-testid="unsaved-changes-modal"]'),
    ).not.toBeNull();
    (
      document.querySelector(
        '[data-testid="unsaved-changes-modal-discard"]',
      ) as HTMLElement
    ).click();
    await nextTick();
    expect(onChangeProvider).toHaveBeenCalledTimes(1);
  });

  it('renders the hideBorder variant for an existing config without warnings', async () => {
    const wrapper = mountForm({
      hideBorder: true,
      forceEditMode: true,
      securityConfig: existingGoogleConfig(),
      onChangeProvider: () => {},
    });
    await flushPromises();
    await nextTick();
    expect(wrapper.find('[data-testid="resizable-panels"]').exists()).toBe(true);
    expect(wrapper.find('.sso-save-warning').exists()).toBe(false);
    expect(wrapper.find('.sso-provider-header').exists()).toBe(false);
    const save = wrapper.find('[data-testid="save-sso-configuration"]');
    expect(save.attributes('disabled')).toBeUndefined();
    expect(
      wrapper.find('[data-testid="service-requirements"]').exists(),
    ).toBe(true);
  });

  it('renders the internal selector when no change-provider handler exists', async () => {
    const wrapper = mountForm({ securityConfig: null });
    await flushPromises();
    await nextTick();
    expect(
      wrapper.find('[data-testid="sso-provider-card-google"]').exists(),
    ).toBe(true);
    await wrapper
      .find('[data-testid="sso-provider-card-google"]')
      .trigger('click');
    await wrapper.find('[data-testid="sso-provider-configure"]').trigger('click');
    await nextTick();
    expect(
      wrapper.find('[data-testid="sso-configuration-form-card"]').exists(),
    ).toBe(true);
    expect(
      wrapper.find('[data-testid="save-sso-configuration"]').exists(),
    ).toBe(true);
  });

  it('renders the SAML upload block for saml', async () => {
    const wrapper = mountForm({
      selectedProvider: 'saml',
      onChangeProvider: () => {},
      onProviderSelect: () => {},
    });
    await flushPromises();
    await nextTick();
    expect(wrapper.find('[data-testid="file-uploader"]').exists()).toBe(true);
  });

  it('hides actions when read-only', async () => {
    const wrapper = mountForm({
      hideBorder: true,
      forceEditMode: true,
      isReadOnly: true,
      securityConfig: existingGoogleConfig(),
      onChangeProvider: () => {},
    });
    await flushPromises();
    await nextTick();
    expect(wrapper.find('[data-testid="save-sso-configuration"]').exists()).toBe(
      false,
    );
    expect(
      wrapper.find('[data-testid="cancel-sso-configuration"]').exists(),
    ).toBe(false);
    expect(
      wrapper.find('[data-testid="test-login-sso-configuration"]').exists(),
    ).toBe(false);
  });

  it('saves a new config through validate then PUT via save-anyway', async () => {
    validateSecurityConfiguration.mockResolvedValue({ status: 'success' });
    applySecurityConfiguration.mockResolvedValue(existingGoogleConfig());
    const wrapper = mountForm({
      selectedProvider: 'google',
      onChangeProvider: () => {},
      onProviderSelect: () => {},
    });
    await flushPromises();
    await nextTick();
    await wrapper
      .find('[data-testid="save-anyway-sso-configuration"]')
      .trigger('click');
    await flushPromises();
    expect(validateSecurityConfiguration).toHaveBeenCalledTimes(1);
    expect(applySecurityConfiguration).toHaveBeenCalledTimes(1);
    const payload = applySecurityConfiguration.mock.calls[0][0] as SsoFormData;
    expect(payload.authenticationConfiguration.provider).toBe('google');
    expect(locationReplaceSpy).toHaveBeenCalledWith('/login');
  });

  it('tracks the focused field into the doc panel', async () => {
    const wrapper = mount(SsoSchemaForm, {
      attachTo: document.body,
      props: {
        hideBorder: true,
        forceEditMode: true,
        securityConfig: existingGoogleConfig(),
        onChangeProvider: () => {},
      },
      global: {
        plugins: [createPinia(), createTestI18n('en-US')],
      },
    });
    await flushPromises();
    await nextTick();
    const input = wrapper.find(
      '#root\\/authenticationConfiguration\\/providerName',
    );
    input.element.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await vi.waitFor(() => {
      const section = wrapper.find('section[data-id="providerName"]');
      expect(section.attributes('data-highlighted')).toBe('true');
    });
    wrapper.unmount();
  });
});
