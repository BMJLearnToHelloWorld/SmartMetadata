/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import Antd, { message } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { ApiError } from '@/api/client';
import type { SecurityConfigurationDocument, TestLoginResult } from '@/api/system';
import type {
  ConfigurationCheckOutcome,
  ConfigurationCheckState,
} from '@/composables/useSsoTestLogin';
import { createTestI18n } from '@/test/i18n';
import SsoSettingsView from './SsoSettingsView.vue';

const getSecurityConfigurationDocument = vi.fn();
const getSettingsSource = vi.fn();
const patchSecurityConfiguration = vi.fn();
const validateSecurityConfiguration = vi.fn();

vi.mock('@/api/system', async () => {
  const actual = await vi.importActual<typeof import('@/api/system')>('@/api/system');
  return {
    ...actual,
    getSecurityConfigurationDocument: (...args: unknown[]) =>
      getSecurityConfigurationDocument(...args),
    getSettingsSource: (...args: unknown[]) => getSettingsSource(...args),
    patchSecurityConfiguration: (...args: unknown[]) => patchSecurityConfiguration(...args),
    validateSecurityConfiguration: (...args: unknown[]) => validateSecurityConfiguration(...args),
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
      submitCredentials: (...args: unknown[]) => mockSubmitTestLoginCredentials(...args),
      reset: (...args: unknown[]) => mockResetTestLogin(...args),
    }),
  };
});

const mounted: VueWrapper[] = [];

async function mountView(locale: 'en-US' | 'zh-CN' = 'en-US') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/admin/settings/sso', name: 'admin-settings-sso', component: SsoSettingsView }],
  });
  await router.push({ name: 'admin-settings-sso' });
  await router.isReady();
  const wrapper = mount(SsoSettingsView, { global: { plugins: [router, Antd, createTestI18n(locale)] } });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}

describe('SsoSettingsView', () => {
  beforeEach(() => {
    getSecurityConfigurationDocument.mockReset();
    getSettingsSource.mockReset();
    patchSecurityConfiguration.mockReset();
    validateSecurityConfiguration.mockReset();
    mockRunTestLogin.mockReset();
    mockSubmitTestLoginCredentials.mockReset();
    mockResetTestLogin.mockReset();
    mockTestLoginIsTesting.value = false;
    mockTestLoginIsAwaitingCredentials.value = false;
    mockTestLoginCheck.value = undefined;
    mockTestLoginResult.value = undefined;
    mockTestLoginError.value = undefined;
    getSecurityConfigurationDocument.mockResolvedValue({
      authenticationConfiguration: {
        provider: 'google',
        clientId: 'cid',
        callbackUrl: 'https://example.test/callback',
        enableSelfSignup: false,
      },
      authorizerConfiguration: {},
    });
    getSettingsSource.mockResolvedValue({ authenticationEditable: true, authenticationManagedPaths: [] });
    patchSecurityConfiguration.mockResolvedValue(undefined);
    validateSecurityConfiguration.mockResolvedValue({ status: 'success' });
  });

  afterEach(() => {
    for (const wrapper of mounted) {
      wrapper.unmount();
    }
    mounted.length = 0;
  });

  async function openConfigurationTab(wrapper: Awaited<ReturnType<typeof mountView>>) {
    const tabs = wrapper.findAll('.ant-tabs-tab');
    expect(tabs.length).toBeGreaterThanOrEqual(2);
    await tabs[1].trigger('click');
    await flushPromises();
  }

  it('shows the loaded provider on the overview tab', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="sso-current-provider"]').text()).toBe('google');
  });

  it('saves a document-rooted patch without a clientSecret op when the secret is left empty', async () => {
    const wrapper = await mountView();
    await openConfigurationTab(wrapper);
    await wrapper.find('[data-testid="sso-client-id"]').setValue('cid2');
    await flushPromises();
    // A clientId edit is unsafe, so Save is gated: the explicit save-anyway path sends the patch.
    await wrapper.find('[data-testid="save-anyway-sso-configuration"]').trigger('click');
    await flushPromises();
    expect(patchSecurityConfiguration).toHaveBeenCalledTimes(1);
    const ops = patchSecurityConfiguration.mock.calls[0][0] as { path: string }[];
    expect(ops.some((op) => op.path === '/authenticationConfiguration/clientId')).toBe(true);
    expect(ops.some((op) => op.path === '/authenticationConfiguration/clientSecret')).toBe(false);
    expect(ops.some((op) => op.path === '/authenticationConfiguration/oidcConfiguration/secret')).toBe(false);
  });

  it('sends no patch when nothing changed', async () => {
    const wrapper = await mountView();
    await openConfigurationTab(wrapper);
    await wrapper.find('[data-testid="sso-save"]').trigger('click');
    await flushPromises();
    expect(patchSecurityConfiguration).not.toHaveBeenCalled();
  });

  it('locks deployment-owned fields and never sends an op for them', async () => {
    getSettingsSource.mockResolvedValue({
      authenticationEditable: true,
      authenticationManagedPaths: ['/provider'],
    });
    const wrapper = await mountView();
    await openConfigurationTab(wrapper);
    // Ant Design renders Radio.Group's disabled onto its inner radio
    // inputs, not the group root carrying the test id.
    expect(wrapper.find('[data-testid="sso-provider-group"]').findAll('input[disabled]').length).toBeGreaterThan(0);
    expect(wrapper.find('[data-testid="sso-managed-note"]').exists()).toBe(true);
    await wrapper.find('[data-testid="sso-client-id"]').setValue('cid2');
    await flushPromises();
    await wrapper.find('[data-testid="save-anyway-sso-configuration"]').trigger('click');
    await flushPromises();
    expect(patchSecurityConfiguration).toHaveBeenCalledTimes(1);
    const ops = patchSecurityConfiguration.mock.calls[0][0] as { path: string }[];
    expect(ops.some((op) => op.path === '/authenticationConfiguration/provider')).toBe(false);
    expect(ops.some((op) => op.path === '/authenticationConfiguration/clientId')).toBe(true);
  });

  it('labels the built-in provider iSmart in both locales while keeping the openmetadata key (Wave 0 (h))', async () => {
    for (const locale of ['en-US', 'zh-CN'] as const) {
      const wrapper = await mountView(locale);
      await openConfigurationTab(wrapper);
      const group = wrapper.find('[data-testid="sso-provider-group"]');
      // Display label is the product name; the enum key is the API contract.
      expect(group.text()).toContain('iSmart');
      expect(group.text()).not.toContain('OpenMetadata');
      expect(group.find('input[value="openmetadata"]').exists()).toBe(true);
    }
  });

  describe('save-time validation (S24)', () => {
    function rejectSaveWith400() {
      patchSecurityConfiguration.mockRejectedValueOnce(
        new ApiError(
          400,
          JSON.stringify({
            status: 'failed',
            errors: [
              { field: 'authenticationConfiguration.clientId', error: 'Client ID is required' },
              {
                field: 'authenticationConfiguration.oidcConfiguration.secret',
                error: 'Secret is required',
              },
              { field: 'general', error: 'General failure' },
            ],
          }),
        ),
      );
    }

    it('backfills 400 errors onto fields and the problems list, and scrolls to the first', async () => {
      const scrollIntoView = vi.fn();
      const original = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = scrollIntoView;
      const errorSpy = vi.spyOn(message, 'error');
      try {
        rejectSaveWith400();
        const wrapper = await mountView();
        await openConfigurationTab(wrapper);
        await wrapper.find('[data-testid="sso-client-id"]').setValue('cid2');
        await flushPromises();
        await wrapper.find('[data-testid="save-anyway-sso-configuration"]').trigger('click');
        await flushPromises();
        expect(wrapper.text()).toContain('Client ID is required');
        expect(wrapper.findAll('.ant-form-item-has-error').length).toBeGreaterThan(0);
        const problems = wrapper.find('[data-testid="sso-validation-problems"]');
        expect(problems.exists()).toBe(true);
        expect(problems.text()).toContain(
          'authenticationConfiguration.oidcConfiguration.secret: Secret is required',
        );
        expect(problems.text()).toContain('general: General failure');
        expect(errorSpy).not.toHaveBeenCalled();
        expect(scrollIntoView).toHaveBeenCalled();
      } finally {
        Element.prototype.scrollIntoView = original;
        errorSpy.mockRestore();
      }
    });

    it('clears a field error when the field is edited but keeps the problems list', async () => {
      rejectSaveWith400();
      const wrapper = await mountView();
      await openConfigurationTab(wrapper);
      await wrapper.find('[data-testid="sso-client-id"]').setValue('cid2');
      await flushPromises();
      await wrapper.find('[data-testid="save-anyway-sso-configuration"]').trigger('click');
      await flushPromises();
      expect(wrapper.text()).toContain('Client ID is required');
      await wrapper.find('[data-testid="sso-client-id"]').setValue('cid3');
      await flushPromises();
      expect(wrapper.text()).not.toContain('Client ID is required');
      expect(wrapper.find('[data-testid="sso-validation-problems"]').exists()).toBe(true);
    });

    it('clears validation state when a later save succeeds', async () => {
      rejectSaveWith400();
      const wrapper = await mountView();
      await openConfigurationTab(wrapper);
      await wrapper.find('[data-testid="sso-client-id"]').setValue('cid2');
      await flushPromises();
      await wrapper.find('[data-testid="save-anyway-sso-configuration"]').trigger('click');
      await flushPromises();
      expect(wrapper.find('[data-testid="sso-validation-problems"]').exists()).toBe(true);
      await wrapper.find('[data-testid="save-anyway-sso-configuration"]').trigger('click');
      await flushPromises();
      expect(wrapper.find('[data-testid="sso-validation-problems"]').exists()).toBe(false);
      expect(wrapper.findAll('.ant-form-item-has-error')).toHaveLength(0);
    });

    it('shows the generic message when a 400 carries no structured errors', async () => {
      const errorSpy = vi.spyOn(message, 'error');
      try {
        patchSecurityConfiguration.mockRejectedValueOnce(new ApiError(400, 'not json'));
        const wrapper = await mountView();
        await openConfigurationTab(wrapper);
        await wrapper.find('[data-testid="sso-client-id"]').setValue('cid2');
        await flushPromises();
        await wrapper.find('[data-testid="save-anyway-sso-configuration"]').trigger('click');
        await flushPromises();
        expect(errorSpy).toHaveBeenCalledWith('Failed to save the SSO configuration');
        expect(wrapper.find('[data-testid="sso-validation-problems"]').exists()).toBe(false);
      } finally {
        errorSpy.mockRestore();
      }
    });
  });

  describe('Test Login wiring (S25)', () => {
    it('shows the Test Login button for a testable provider and hides it for basic', async () => {
      const wrapper = await mountView();
      await openConfigurationTab(wrapper);
      expect(wrapper.find('[data-testid="test-login-sso-configuration"]').exists()).toBe(true);
      getSecurityConfigurationDocument.mockResolvedValue({
        authenticationConfiguration: { provider: 'basic' },
        authorizerConfiguration: {},
      });
      const basicWrapper = await mountView();
      await openConfigurationTab(basicWrapper);
      expect(basicWrapper.find('[data-testid="test-login-sso-configuration"]').exists()).toBe(false);
    });

    it('runs Test Login with the shared candidate, opens the modal, and resets on close', async () => {
      const wrapper = await mountView();
      await openConfigurationTab(wrapper);
      await wrapper.find('[data-testid="test-login-sso-configuration"]').trigger('click');
      await flushPromises();
      expect(mockRunTestLogin).toHaveBeenCalledTimes(1);
      const [candidateArg, checkFn] = mockRunTestLogin.mock.calls[0] as [
        SecurityConfigurationDocument,
        (doc: SecurityConfigurationDocument) => Promise<ConfigurationCheckOutcome>,
      ];
      expect(candidateArg.authenticationConfiguration.provider).toBe('google');
      expect(candidateArg.authenticationConfiguration.clientId).toBe('cid');
      expect(candidateArg.authorizerConfiguration).toEqual({});
      expect(typeof checkFn).toBe('function');
      expect(document.body.querySelector('[data-testid="sso-test-login-modal"]')).not.toBeNull();
      (document.body.querySelector('[data-testid="sso-test-login-close"]') as HTMLElement).click();
      await flushPromises();
      // Once from starting the test, once from closing the modal.
      expect(mockResetTestLogin).toHaveBeenCalledTimes(2);
    });

    async function captureCheck() {
      const wrapper = await mountView();
      await openConfigurationTab(wrapper);
      await wrapper.find('[data-testid="test-login-sso-configuration"]').trigger('click');
      await flushPromises();
      const [candidateArg, checkFn] = mockRunTestLogin.mock.calls[0] as [
        SecurityConfigurationDocument,
        (doc: SecurityConfigurationDocument) => Promise<ConfigurationCheckOutcome>,
      ];
      return { wrapper, candidateArg, checkFn };
    }

    it('passes the check when validation succeeds with no errors', async () => {
      const { candidateArg, checkFn } = await captureCheck();
      const outcome = await checkFn(candidateArg);
      expect(outcome).toEqual({ passed: true, problems: [] });
      expect(validateSecurityConfiguration).toHaveBeenCalledWith(candidateArg);
    });

    it('backfills a failed check onto the form', async () => {
      validateSecurityConfiguration.mockResolvedValue({
        status: 'failed',
        errors: [{ field: 'authenticationConfiguration.authority', error: 'Authority is bad' }],
      });
      const { wrapper, candidateArg, checkFn } = await captureCheck();
      const outcome = await checkFn(candidateArg);
      await flushPromises();
      expect(outcome).toEqual({ passed: false, problems: ['Authority is bad'] });
      expect(wrapper.text()).toContain('Authority is bad');
    });

    it('backfills field errors when the validate call itself fails with them', async () => {
      validateSecurityConfiguration.mockRejectedValue(
        new ApiError(
          400,
          JSON.stringify({
            errors: [{ field: 'authenticationConfiguration.clientId', error: 'Client ID is bad' }],
          }),
        ),
      );
      const { wrapper, candidateArg, checkFn } = await captureCheck();
      const outcome = await checkFn(candidateArg);
      await flushPromises();
      expect(outcome).toEqual({ passed: false, problems: ['Client ID is bad'] });
      expect(wrapper.text()).toContain('Client ID is bad');
    });

    it('reports the server reason when validate fails without field errors', async () => {
      validateSecurityConfiguration.mockRejectedValue(
        new ApiError(500, JSON.stringify({ message: 'boom' })),
      );
      const { wrapper, candidateArg, checkFn } = await captureCheck();
      const outcome = await checkFn(candidateArg);
      await flushPromises();
      expect(outcome).toEqual({ passed: false, problems: ['boom'] });
      expect(wrapper.find('[data-testid="sso-validation-problems"]').exists()).toBe(false);
    });
  });

  describe('save gate (S26)', () => {
    it('gates an unsafe edit behind Test Login and offers Save anyway', async () => {
      const wrapper = await mountView();
      await openConfigurationTab(wrapper);
      expect(wrapper.find('[data-testid="sso-test-login-required"]').exists()).toBe(false);
      await wrapper.find('[data-testid="sso-client-id"]').setValue('cid2');
      await flushPromises();
      const banner = wrapper.find('[data-testid="sso-test-login-required"]');
      expect(banner.exists()).toBe(true);
      expect(banner.text()).toContain(
        'These changes affect how users sign in. Run Test Login and sign in successfully before saving.',
      );
      expect(wrapper.find('[data-testid="sso-save"]').attributes('disabled')).toBeDefined();
      await wrapper.find('[data-testid="save-anyway-sso-configuration"]').trigger('click');
      await flushPromises();
      expect(patchSecurityConfiguration).toHaveBeenCalledTimes(1);
    });

    it('does not gate a safe-only edit', async () => {
      const wrapper = await mountView();
      await openConfigurationTab(wrapper);
      // setChecked() is private on DOMWrapper: set the property and fire
      // the change the Checkbox listens for.
      const signupInput = wrapper.find('input[type="checkbox"]');
      (signupInput.element as HTMLInputElement).checked = true;
      await signupInput.trigger('change');
      await flushPromises();
      expect(wrapper.find('[data-testid="sso-test-login-required"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="sso-save"]').attributes('disabled')).toBeUndefined();
      await wrapper.find('[data-testid="sso-save"]').trigger('click');
      await flushPromises();
      expect(patchSecurityConfiguration).toHaveBeenCalledTimes(1);
    });

    async function unlockWithPassingTest() {
      const wrapper = await mountView();
      await openConfigurationTab(wrapper);
      await wrapper.find('[data-testid="sso-client-id"]').setValue('cid2');
      await flushPromises();
      expect(wrapper.find('[data-testid="sso-test-login-required"]').exists()).toBe(true);
      await wrapper.find('[data-testid="test-login-sso-configuration"]').trigger('click');
      await flushPromises();
      mockTestLoginResult.value = { status: 'success' };
      await flushPromises();
      expect(wrapper.find('[data-testid="sso-test-login-required"]').exists()).toBe(false);
      return wrapper;
    }

    it('unlocks the gate after a passing Test Login for the same candidate', async () => {
      const wrapper = await unlockWithPassingTest();
      expect(wrapper.find('[data-testid="sso-save"]').attributes('disabled')).toBeUndefined();
    });

    it('re-locks the gate when the candidate is edited after a pass', async () => {
      const wrapper = await unlockWithPassingTest();
      await wrapper.find('[data-testid="sso-client-id"]').setValue('cid3');
      await flushPromises();
      expect(wrapper.find('[data-testid="sso-test-login-required"]').exists()).toBe(true);
    });

    it('keeps a pass when a retest fails for the same candidate', async () => {
      const wrapper = await unlockWithPassingTest();
      await wrapper.find('[data-testid="test-login-sso-configuration"]').trigger('click');
      await flushPromises();
      mockTestLoginResult.value = { status: 'failed', errors: ['nope'] };
      await flushPromises();
      expect(wrapper.find('[data-testid="sso-test-login-required"]').exists()).toBe(false);
    });

    it('gates a new configuration with the before-save message', async () => {
      getSecurityConfigurationDocument.mockResolvedValue({
        authenticationConfiguration: {},
        authorizerConfiguration: {},
      });
      const wrapper = await mountView();
      await openConfigurationTab(wrapper);
      // setChecked() is private on DOMWrapper: set the property and fire
      // the change the Radio.Group listens for.
      const googleInput = wrapper.find('input[value="google"]');
      (googleInput.element as HTMLInputElement).checked = true;
      await googleInput.trigger('change');
      await flushPromises();
      const banner = wrapper.find('[data-testid="sso-test-login-required"]');
      expect(banner.exists()).toBe(true);
      expect(banner.text()).toContain(
        'Run Test Login and sign in successfully before saving. A configuration that cannot sign you in will lock you out.',
      );
    });

    it('shows the Test Login button for the built-in provider without gating an unchanged form', async () => {
      getSecurityConfigurationDocument.mockResolvedValue({
        authenticationConfiguration: { provider: 'openmetadata' },
        authorizerConfiguration: {},
      });
      const wrapper = await mountView();
      await openConfigurationTab(wrapper);
      expect(wrapper.find('[data-testid="test-login-sso-configuration"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="sso-test-login-required"]').exists()).toBe(false);
    });

    it('does not gate basic at all', async () => {
      getSecurityConfigurationDocument.mockResolvedValue({
        authenticationConfiguration: { provider: 'basic' },
        authorizerConfiguration: {},
      });
      const wrapper = await mountView();
      await openConfigurationTab(wrapper);
      expect(wrapper.find('[data-testid="sso-test-login-required"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="sso-save"]').attributes('disabled')).toBeUndefined();
    });
  });

  describe('secret save op and guard (Q1)', () => {
    type PatchOp = { op: string; path: string; value?: unknown };
    const SECRET_PATH = '/authenticationConfiguration/oidcConfiguration/secret';
    const LEGACY_SECRET_PATH = '/authenticationConfiguration/clientSecret';

    function storedDocument(auth: Record<string, unknown>) {
      getSecurityConfigurationDocument.mockResolvedValue({
        authenticationConfiguration: auth,
        authorizerConfiguration: {},
      });
    }

    async function setSecret(wrapper: Awaited<ReturnType<typeof mountView>>, value: string) {
      await wrapper.find('input[type="password"]').setValue(value);
      await flushPromises();
    }

    async function clickSaveAnyway(wrapper: Awaited<ReturnType<typeof mountView>>) {
      await wrapper.find('[data-testid="save-anyway-sso-configuration"]').trigger('click');
      await flushPromises();
    }

    function lastOps(): PatchOp[] {
      return patchSecurityConfiguration.mock.calls[0][0] as PatchOp[];
    }

    function hasSecretOp(ops: PatchOp[]): boolean {
      return ops.some((op) => op.path === SECRET_PATH || op.path === LEGACY_SECRET_PATH);
    }

    it('emits the secret op only when all six conditions hold', async () => {
      storedDocument({
        provider: 'google',
        clientType: 'confidential',
        clientId: 'cid',
        callbackUrl: 'https://example.test/callback',
        enableSelfSignup: false,
        oidcConfiguration: { secret: 'old-secret', discoveryUri: 'https://example.test/.well-known' },
      });
      const wrapper = await mountView();
      await openConfigurationTab(wrapper);
      await setSecret(wrapper, 'new-secret');
      await clickSaveAnyway(wrapper);
      expect(patchSecurityConfiguration).toHaveBeenCalledTimes(1);
      expect(lastOps()).toEqual([{ op: 'add', path: SECRET_PATH, value: 'new-secret' }]);
    });

    it('sends no secret op for a non-OIDC provider', async () => {
      storedDocument({
        provider: 'ldap',
        clientType: 'confidential',
        clientId: 'cid',
        oidcConfiguration: { secret: 'old-secret' },
      });
      const wrapper = await mountView();
      await openConfigurationTab(wrapper);
      await setSecret(wrapper, 'new-secret');
      await wrapper.find('[data-testid="sso-client-id"]').setValue('cid2');
      await flushPromises();
      await clickSaveAnyway(wrapper);
      expect(patchSecurityConfiguration).toHaveBeenCalledTimes(1);
      expect(lastOps().some((op) => op.path === '/authenticationConfiguration/clientId')).toBe(true);
      expect(hasSecretOp(lastOps())).toBe(false);
    });

    it('sends no secret op for a public client', async () => {
      storedDocument({
        provider: 'google',
        clientType: 'public',
        clientId: 'cid',
        oidcConfiguration: { secret: 'old-secret' },
      });
      const wrapper = await mountView();
      await openConfigurationTab(wrapper);
      await setSecret(wrapper, 'new-secret');
      await wrapper.find('[data-testid="sso-client-id"]').setValue('cid2');
      await flushPromises();
      await clickSaveAnyway(wrapper);
      expect(patchSecurityConfiguration).toHaveBeenCalledTimes(1);
      expect(hasSecretOp(lastOps())).toBe(false);
    });

    it('sends no secret op when the client type is empty', async () => {
      storedDocument({
        provider: 'google',
        clientId: 'cid',
        oidcConfiguration: { secret: 'old-secret' },
      });
      const wrapper = await mountView();
      await openConfigurationTab(wrapper);
      await setSecret(wrapper, 'new-secret');
      await wrapper.find('[data-testid="sso-client-id"]').setValue('cid2');
      await flushPromises();
      await clickSaveAnyway(wrapper);
      expect(patchSecurityConfiguration).toHaveBeenCalledTimes(1);
      expect(hasSecretOp(lastOps())).toBe(false);
    });

    it('sends no secret op for a managed secret, and locks the secret input', async () => {
      storedDocument({
        provider: 'google',
        clientType: 'confidential',
        clientId: 'cid',
        oidcConfiguration: { secret: 'old-secret' },
      });
      getSettingsSource.mockResolvedValue({
        authenticationEditable: true,
        authenticationManagedPaths: ['/oidcConfiguration/secret'],
      });
      const wrapper = await mountView();
      await openConfigurationTab(wrapper);
      const secretInput = wrapper.find('input[type="password"]');
      expect(secretInput.attributes('disabled')).toBeDefined();
      await setSecret(wrapper, 'new-secret');
      expect((secretInput.element as HTMLInputElement).value).toBe('new-secret');
      await wrapper.find('[data-testid="sso-client-id"]').setValue('cid2');
      await flushPromises();
      await clickSaveAnyway(wrapper);
      expect(patchSecurityConfiguration).toHaveBeenCalledTimes(1);
      expect(hasSecretOp(lastOps())).toBe(false);
    });

    it('leaves the secret input enabled when only the old clientSecret key is managed', async () => {
      getSettingsSource.mockResolvedValue({
        authenticationEditable: true,
        authenticationManagedPaths: ['/clientSecret'],
      });
      const wrapper = await mountView();
      await openConfigurationTab(wrapper);
      expect(wrapper.find('input[type="password"]').attributes('disabled')).toBeUndefined();
    });

    it('blocks the save with a visible error when the stored provider is not OIDC', async () => {
      const errorSpy = vi.spyOn(message, 'error');
      try {
        storedDocument({
          provider: 'ldap',
          clientType: 'confidential',
          clientId: 'cid',
          oidcConfiguration: { secret: 'old-secret' },
        });
        const wrapper = await mountView();
        await openConfigurationTab(wrapper);
        const googleInput = wrapper.find('input[value="google"]');
        (googleInput.element as HTMLInputElement).checked = true;
        await googleInput.trigger('change');
        await flushPromises();
        await setSecret(wrapper, 'new-secret');
        await clickSaveAnyway(wrapper);
        expect(patchSecurityConfiguration).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledWith(
          "The client secret can't be saved in the current configuration. Clear the secret to save the other changes.",
        );
      } finally {
        errorSpy.mockRestore();
      }
    });

    it('blocks the save when the stored document has no oidc block', async () => {
      const errorSpy = vi.spyOn(message, 'error');
      try {
        storedDocument({
          provider: 'google',
          clientType: 'confidential',
          clientId: 'cid',
        });
        const wrapper = await mountView();
        await openConfigurationTab(wrapper);
        await setSecret(wrapper, 'new-secret');
        await clickSaveAnyway(wrapper);
        expect(patchSecurityConfiguration).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledWith(
          "The client secret can't be saved in the current configuration. Clear the secret to save the other changes.",
        );
      } finally {
        errorSpy.mockRestore();
      }
    });

    it('saves once the secret is cleared after a blocked save', async () => {
      const errorSpy = vi.spyOn(message, 'error');
      try {
        storedDocument({
          provider: 'google',
          clientType: 'confidential',
          clientId: 'cid',
        });
        const wrapper = await mountView();
        await openConfigurationTab(wrapper);
        await wrapper.find('[data-testid="sso-client-id"]').setValue('cid2');
        await flushPromises();
        await setSecret(wrapper, 'new-secret');
        await clickSaveAnyway(wrapper);
        expect(patchSecurityConfiguration).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledTimes(1);
        await setSecret(wrapper, '');
        await clickSaveAnyway(wrapper);
        expect(patchSecurityConfiguration).toHaveBeenCalledTimes(1);
        expect(lastOps().some((op) => op.path === '/authenticationConfiguration/clientId')).toBe(true);
        expect(hasSecretOp(lastOps())).toBe(false);
        expect(errorSpy).toHaveBeenCalledTimes(1);
      } finally {
        errorSpy.mockRestore();
      }
    });

    it('reports the guard error in Chinese', async () => {
      const errorSpy = vi.spyOn(message, 'error');
      try {
        storedDocument({
          provider: 'google',
          clientType: 'confidential',
          clientId: 'cid',
        });
        const wrapper = await mountView('zh-CN');
        await openConfigurationTab(wrapper);
        await setSecret(wrapper, 'new-secret');
        await clickSaveAnyway(wrapper);
        expect(patchSecurityConfiguration).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledWith('当前配置下无法保存客户端密钥。请清除密钥后保存其他更改。');
      } finally {
        errorSpy.mockRestore();
      }
    });
  });
});
