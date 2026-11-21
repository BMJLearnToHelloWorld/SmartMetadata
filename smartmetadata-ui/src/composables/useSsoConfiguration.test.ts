/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { message } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { defineComponent, h, nextTick, ref, type Ref } from 'vue';
import type { SsoFormData } from '@/admin/ssoSchemas';
import type { SsoSecuritySources } from '@/admin/ssoSecuritySources';
import { ApiError } from '@/api/client';
import type { TestLoginResult } from '@/api/system';
import type { ConfigurationCheckState } from '@/composables/useSsoTestLogin';
import { useAuthStore } from '@/stores/auth';
import { createTestI18n } from '@/test/i18n';
import { useSsoConfiguration } from './useSsoConfiguration';

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

type SsoConfigApi = ReturnType<typeof useSsoConfiguration>;

// jsdom's Location.replace is read-only and non-configurable, so the
// redirect is stubbed by replacing the location object once, keeping
// the real origin/href the SSO URL utils read.
const locationReplaceSpy = vi.fn();
Object.defineProperty(window, 'location', {
  value: {
    href: window.location.href,
    origin: window.location.origin,
    replace: locationReplaceSpy,
  },
  configurable: true,
  writable: true,
});

const googleConfigWithoutUseNonce = (): SsoFormData => ({
  authenticationConfiguration: {
    provider: 'google',
    providerName: 'google',
    clientType: 'confidential',
    authority: 'https://accounts.google.com',
    clientId: 'cid',
    callbackUrl: 'https://app.example.com/callback',
    publicKeyUrls: ['https://www.googleapis.com/oauth2/v3/certs'],
    tokenValidationAlgorithm: 'RS256',
    jwtPrincipalClaims: ['email'],
    enableSelfSignup: true,
    oidcConfiguration: {
      id: 'cid',
      type: 'google',
      scope: 'openid email profile',
      discoveryUri: 'https://accounts.google.com/.well-known/openid-configuration',
      clientAuthenticationMethod: 'client_secret_post',
      tokenValidity: 3600,
      sessionExpiry: 604800,
    },
  },
  authorizerConfiguration: {
    className: 'org.openmetadata.service.security.DefaultAuthorizer',
    containerRequestFilter: 'org.openmetadata.service.security.JwtFilter',
    adminPrincipals: [],
    principalDomain: '',
  },
});

// Stored OIDC config as the GET returns it: the secret arrives masked.
const googleConfigWithMaskedSecret = (): SsoFormData => {
  const config = googleConfigWithoutUseNonce();
  (
    config.authenticationConfiguration.oidcConfiguration as Record<
      string,
      unknown
    >
  ).secret = '********';
  return config;
};

const samlConfig = (): SsoFormData => ({
  authenticationConfiguration: {
    provider: 'saml',
    providerName: 'saml',
    clientType: 'public',
    authority: 'https://idp.example.com/metadata',
    callbackUrl: 'https://app.example.com/callback',
    enableSelfSignup: true,
    samlConfiguration: {
      idp: {
        entityId: 'https://idp.example.com/metadata',
        ssoLoginUrl: 'https://idp.example.com/sso',
        idpX509Certificate: 'CERT',
      },
      sp: {},
      security: {},
    },
  },
  authorizerConfiguration: {
    className: 'org.openmetadata.service.security.DefaultAuthorizer',
    containerRequestFilter: 'org.openmetadata.service.security.JwtFilter',
  },
});

describe('useSsoConfiguration', () => {
  let api: SsoConfigApi;
  let securityConfigRef: Ref<SsoFormData | null | undefined>;
  let selectedProviderRef: Ref<string | undefined>;
  let managedPathsRef: Ref<SsoSecuritySources['managedPaths'] | undefined>;
  let isReadOnlyRef: Ref<boolean>;
  let forceEditModeRef: Ref<boolean>;
  let onChangeProvider: Mock<() => void>;
  let onProviderSelect: Mock<(provider: string) => void>;
  let wrapper: VueWrapper | undefined;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let successSpy: ReturnType<typeof vi.spyOn>;
  let warningSpy: ReturnType<typeof vi.spyOn>;

  function mountHarness() {
    const pinia = createPinia();
    setActivePinia(pinia);
    const Harness = defineComponent({
      setup() {
        api = useSsoConfiguration({
          forceEditMode: forceEditModeRef,
          onChangeProvider,
          onProviderSelect,
          selectedProvider: selectedProviderRef,
          securityConfig: securityConfigRef,
          managedPaths: managedPathsRef,
          isReadOnly: isReadOnlyRef,
        });
        return () => h('div');
      },
    });
    wrapper = mount(Harness, {
      global: { plugins: [pinia, createTestI18n('en-US')] },
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    securityConfigRef = ref(undefined);
    selectedProviderRef = ref(undefined);
    managedPathsRef = ref(undefined);
    isReadOnlyRef = ref(false);
    forceEditModeRef = ref(false);
    onChangeProvider = vi.fn<() => void>();
    onProviderSelect = vi.fn<(provider: string) => void>();
    mockTestLoginIsTesting.value = false;
    mockTestLoginIsAwaitingCredentials.value = false;
    mockTestLoginCheck.value = undefined;
    mockTestLoginResult.value = undefined;
    mockTestLoginError.value = undefined;
    errorSpy = vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
    successSpy = vi.spyOn(message, 'success').mockImplementation(() => undefined as never);
    warningSpy = vi.spyOn(message, 'warning').mockImplementation(() => undefined as never);
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    vi.restoreAllMocks();
  });

  describe('setup', () => {
    it('initializes from an existing config, normalized, with the raw baseline kept', () => {
      securityConfigRef.value = googleConfigWithoutUseNonce();
      mountHarness();

      expect(api.hasExistingConfig.value).toBe(true);
      expect(api.currentProvider.value).toBe('google');
      expect(api.showForm.value).toBe(true);
      expect(api.showProviderSelector.value).toBe(false);
      expect(api.isEditMode.value).toBe(false);
      expect(api.isInitializing.value).toBe(false);
      // DEV-NORMALIZE-INIT: the schema default fills internalData only.
      const internalOidc = api.internalData.value
        ?.authenticationConfiguration.oidcConfiguration as Record<string, unknown>;
      expect(internalOidc.useNonce).toBe(true);
      const savedOidc = api.savedData.value?.authenticationConfiguration
        .oidcConfiguration as Record<string, unknown>;
      expect('useNonce' in savedOidc).toBe(false);
    });

    it('honors forceEditMode for an existing config', () => {
      securityConfigRef.value = googleConfigWithoutUseNonce();
      forceEditModeRef.value = true;
      mountHarness();

      expect(api.isEditMode.value).toBe(true);
      expect(api.showForm.value).toBe(true);
    });

    it('re-runs setup when forceEditMode flips, resetting edits to the saved document', async () => {
      securityConfigRef.value = googleConfigWithoutUseNonce();
      forceEditModeRef.value = false;
      mountHarness();
      expect(api.isEditMode.value).toBe(false);

      api.handleFieldChange(['authenticationConfiguration', 'clientId'], 'edited');
      expect(
        api.internalData.value?.authenticationConfiguration.clientId,
      ).toBe('edited');

      forceEditModeRef.value = true;
      await nextTick();

      expect(api.isEditMode.value).toBe(true);
      expect(
        api.internalData.value?.authenticationConfiguration.clientId,
      ).toBe('cid');
    });

    it('shows the selector for a basic provider and for a null config', () => {
      securityConfigRef.value = {
        authenticationConfiguration: { provider: 'basic' },
        authorizerConfiguration: {},
      };
      mountHarness();
      expect(api.showProviderSelector.value).toBe(true);
      expect(api.showForm.value).toBe(false);
      expect(api.hasExistingConfig.value).toBe(false);
      expect(api.isInitializing.value).toBe(false);
      wrapper?.unmount();

      securityConfigRef.value = null;
      mountHarness();
      expect(api.showProviderSelector.value).toBe(true);
      expect(api.showForm.value).toBe(false);
      expect(api.isInitializing.value).toBe(false);
    });

    it('stays initializing while the parent config has not loaded', () => {
      mountHarness();
      expect(api.isInitializing.value).toBe(true);
      expect(api.showForm.value).toBe(false);
      expect(api.showProviderSelector.value).toBe(false);
    });

    it('applies the SAML reverse fill to both the baseline and the form data', () => {
      securityConfigRef.value = samlConfig();
      mountHarness();

      const savedIdp = (
        api.savedData.value?.authenticationConfiguration
          .samlConfiguration as Record<string, unknown>
      ).idp as Record<string, unknown>;
      const internalIdp = (
        api.internalData.value?.authenticationConfiguration
          .samlConfiguration as Record<string, unknown>
      ).idp as Record<string, unknown>;
      expect(savedIdp.authorityUrl).toBe('https://idp.example.com/metadata');
      expect(internalIdp.authorityUrl).toBe('https://idp.example.com/metadata');
    });

    it('initializes a fresh form when a provider is selected', () => {
      selectedProviderRef.value = 'google';
      mountHarness();

      expect(api.hasExistingConfig.value).toBe(false);
      expect(api.savedData.value).toBeUndefined();
      expect(api.currentProvider.value).toBe('google');
      expect(api.isEditMode.value).toBe(true);
      expect(api.showForm.value).toBe(true);
      expect(api.showProviderSelector.value).toBe(false);
      expect(api.isInitializing.value).toBe(false);
      const auth = api.internalData.value?.authenticationConfiguration;
      expect(auth?.provider).toBe('google');
      expect(auth?.clientType).toBe('confidential');
      expect(auth?.authority).toBe('https://accounts.google.com');
    });

    it('shows the selector for a basic selection', () => {
      selectedProviderRef.value = 'basic';
      mountHarness();

      expect(api.showProviderSelector.value).toBe(true);
      expect(api.showForm.value).toBe(false);
      expect(api.isEditMode.value).toBe(false);
      expect(api.isInitializing.value).toBe(false);
    });

    it('reinitializes the fresh form when the selection changes', async () => {
      selectedProviderRef.value = 'google';
      mountHarness();
      selectedProviderRef.value = 'okta';
      await nextTick();

      expect(api.currentProvider.value).toBe('okta');
      expect(api.internalData.value?.authenticationConfiguration.provider).toBe(
        'okta',
      );
      expect(api.internalData.value?.authenticationConfiguration.authority).toBe(
        '',
      );
    });

    it('does not run setup for a config when a provider is selected', () => {
      securityConfigRef.value = googleConfigWithoutUseNonce();
      selectedProviderRef.value = 'okta';
      mountHarness();

      expect(api.hasExistingConfig.value).toBe(false);
      expect(api.currentProvider.value).toBe('okta');
    });
  });

  describe('change pipeline', () => {
    it('sets values, deletes keys on undefined, and is a no-op without data', () => {
      selectedProviderRef.value = 'google';
      mountHarness();

      api.handleFieldChange(['authenticationConfiguration', 'authority'], 'https://new.example.com');
      expect(api.internalData.value?.authenticationConfiguration.authority).toBe(
        'https://new.example.com',
      );
      api.handleFieldChange(['authenticationConfiguration', 'authority'], undefined);
      expect(
        'authority' in (api.internalData.value?.authenticationConfiguration ?? {}),
      ).toBe(false);
    });

    it('keeps a present root callbackUrl on a confidential-to-public transition', () => {
      selectedProviderRef.value = 'google';
      mountHarness();

      // The migration only fills a missing value (pin `??=`): the fresh
      // form's empty-string root callbackUrl is kept, not overwritten.
      api.handleFieldChange(
        ['authenticationConfiguration', 'oidcConfiguration', 'callbackUrl'],
        'https://app.example.com/callback',
      );
      api.handleFieldChange(['authenticationConfiguration', 'clientType'], 'public');

      const auth = api.internalData.value?.authenticationConfiguration;
      expect(auth?.callbackUrl).toBe('');
      expect(auth?.authority).toBe('https://accounts.google.com');
      expect(auth?.publicKeyUrls).toEqual([
        'https://www.googleapis.com/oauth2/v3/certs',
      ]);
    });

    it('fills a missing root callbackUrl from the oidc block on the switch', () => {
      selectedProviderRef.value = 'google';
      mountHarness();

      api.handleFieldChange(['authenticationConfiguration', 'callbackUrl'], undefined);
      api.handleFieldChange(
        ['authenticationConfiguration', 'oidcConfiguration', 'callbackUrl'],
        'https://app.example.com/callback',
      );
      api.handleFieldChange(['authenticationConfiguration', 'clientType'], 'public');

      expect(api.internalData.value?.authenticationConfiguration.callbackUrl).toBe(
        'https://app.example.com/callback',
      );
    });

    it('adopts a provider change from the form data and notifies the parent', () => {
      securityConfigRef.value = googleConfigWithoutUseNonce();
      mountHarness();

      api.handleFieldChange(['authenticationConfiguration', 'provider'], 'okta');

      expect(api.currentProvider.value).toBe('okta');
      expect(onProviderSelect).toHaveBeenCalledWith('okta');
    });
  });

  describe('client validation and error pipeline', () => {
    it('stays silent until live validation arms, then names the full path', async () => {
      selectedProviderRef.value = 'google';
      mountHarness();

      api.handleFieldChange(['authenticationConfiguration', 'sessionExpiry'], 100);
      expect(
        api.getDisplayErrors(['authenticationConfiguration', 'sessionExpiry']),
      ).toEqual([]);

      // A backend error arms live validation.
      validateSecurityConfiguration.mockResolvedValueOnce({
        status: 'failed',
        errors: [{ field: 'authenticationConfiguration.clientId', error: 'bad id' }],
      });
      await api.handleSave();
      await flushPromises();

      expect(
        api.getDisplayErrors(['authenticationConfiguration', 'sessionExpiry']),
      ).toEqual(['Authentication Configuration Session Expiry must be greater than 3600']);
      expect(
        api.getDisplayErrors(['authenticationConfiguration', 'clientId']),
      ).toEqual(['bad id']);
    });

    it('requires providerName only for new configurations', async () => {
      securityConfigRef.value = googleConfigWithoutUseNonce();
      mountHarness();
      api.handleTestLogin();
      const check = mockRunTestLogin.mock.calls[0][1] as (
        payload: unknown,
      ) => Promise<unknown>;
      validateSecurityConfiguration.mockResolvedValueOnce({
        status: 'failed',
        errors: [{ field: 'authenticationConfiguration.clientId', error: 'bad id' }],
      });
      await check({});
      expect(api.liveValidate.value).toBe(true);

      api.handleFieldChange(['authenticationConfiguration', 'providerName'], undefined);
      expect(
        api.getDisplayErrors(['authenticationConfiguration', 'providerName']),
      ).toEqual([]);
    });

    it('requires providerName for new configurations', async () => {
      selectedProviderRef.value = 'google';
      mountHarness();
      validateSecurityConfiguration.mockResolvedValueOnce({
        status: 'failed',
        errors: [{ field: 'authenticationConfiguration.clientId', error: 'bad id' }],
      });
      await api.handleSave();
      await flushPromises();

      api.handleFieldChange(['authenticationConfiguration', 'providerName'], undefined);
      expect(
        api.getDisplayErrors(['authenticationConfiguration', 'providerName']),
      ).toEqual(['Provider Name is required.']);
    });

    it('drops client errors whose field is not rendered', async () => {
      selectedProviderRef.value = 'google';
      mountHarness();
      validateSecurityConfiguration.mockResolvedValueOnce({
        status: 'failed',
        errors: [{ field: 'authenticationConfiguration.clientId', error: 'bad id' }],
      });
      await api.handleSave();
      await flushPromises();

      // Public clients hide the whole oidc block: a minimum error inside
      // it has no rendered element and is dropped.
      api.handleFieldChange(['authenticationConfiguration', 'clientType'], 'public');
      api.handleFieldChange(
        ['authenticationConfiguration', 'oidcConfiguration', 'tokenValidity'],
        0,
      );
      expect(
        api.getDisplayErrors([
          'authenticationConfiguration',
          'oidcConfiguration',
          'tokenValidity',
        ]),
      ).toEqual([]);
    });

    it('clears only the errors of changed fields and arms live validation', async () => {
      selectedProviderRef.value = 'google';
      mountHarness();
      validateSecurityConfiguration.mockResolvedValueOnce({
        status: 'failed',
        errors: [
          { field: 'authenticationConfiguration.clientId', error: 'bad id' },
          { field: 'authenticationConfiguration.authority', error: 'bad authority' },
        ],
      });
      await api.handleSave();
      await flushPromises();

      expect(api.liveValidate.value).toBe(true);
      api.handleFieldChange(['authenticationConfiguration', 'clientId'], 'fixed');
      expect(
        api.getDisplayErrors(['authenticationConfiguration', 'clientId']),
      ).toEqual([]);
      expect(
        api.getDisplayErrors(['authenticationConfiguration', 'authority']),
      ).toEqual(['bad authority']);
      expect(api.errorClearTrigger.value).toBe(1);
    });

    it('clears a single field error by root path', async () => {
      selectedProviderRef.value = 'google';
      mountHarness();
      validateSecurityConfiguration.mockResolvedValueOnce({
        status: 'failed',
        errors: [{ field: 'authenticationConfiguration.clientId', error: 'bad id' }],
      });
      await api.handleSave();
      await flushPromises();

      api.handleClearFieldError('root/authenticationConfiguration/clientId');
      expect(
        api.getDisplayErrors(['authenticationConfiguration', 'clientId']),
      ).toEqual([]);
    });
  });

  describe('save', () => {
    it('saves a new configuration via validate then PUT, then signs out', async () => {
      selectedProviderRef.value = 'google';
      mountHarness();
      const authStore = useAuthStore();
      authStore.session = {
        accessToken: 'token',
        tokenType: 'Bearer',
        email: 'admin@example.com',
      };
      window.localStorage.setItem('sm.locale.v1', 'en-US');
      window.sessionStorage.setItem('probe', '1');
      validateSecurityConfiguration.mockResolvedValueOnce({ status: 'success' });
      applySecurityConfiguration.mockResolvedValueOnce({
        authenticationConfiguration: {},
        authorizerConfiguration: {},
      });

      await api.handleSave();
      await flushPromises();

      expect(validateSecurityConfiguration).toHaveBeenCalledTimes(1);
      expect(applySecurityConfiguration).toHaveBeenCalledTimes(1);
      const payload = applySecurityConfiguration.mock.calls[0][0] as SsoFormData;
      expect(payload.authenticationConfiguration.provider).toBe('google');
      expect(payload.authenticationConfiguration.clientType).toBe('confidential');
      expect(window.localStorage.getItem('sm.locale.v1')).toBeNull();
      expect(window.sessionStorage.getItem('probe')).toBeNull();
      expect(authStore.session).toBeNull();
      expect(locationReplaceSpy).toHaveBeenCalledWith('/login');
      expect(api.isLoading.value).toBe(false);
    });

    it('does not PUT when validation reports field errors', async () => {
      selectedProviderRef.value = 'google';
      mountHarness();
      validateSecurityConfiguration.mockResolvedValueOnce({
        status: 'failed',
        errors: [
          { field: 'authenticationConfiguration.clientId', error: 'bad id' },
          { field: '', error: 'generic boom' },
          { field: '  ', error: 'blank boom' },
        ],
      });

      await api.handleSave();
      await flushPromises();

      expect(applySecurityConfiguration).not.toHaveBeenCalled();
      expect(api.fieldErrors.value).toEqual({
        authenticationConfiguration: { clientId: { __errors: ['bad id'] } },
      });
      expect(errorSpy).toHaveBeenCalledWith('generic boom');
      expect(errorSpy).toHaveBeenCalledWith('blank boom');
      expect(api.isLoading.value).toBe(false);
    });

    it('does not PUT when validation fails with no errors', async () => {
      selectedProviderRef.value = 'google';
      mountHarness();
      validateSecurityConfiguration.mockResolvedValueOnce({ status: 'failed' });

      await api.handleSave();
      await flushPromises();

      expect(applySecurityConfiguration).not.toHaveBeenCalled();
      expect(api.fieldErrors.value).toEqual({});
      expect(successSpy).not.toHaveBeenCalled();
    });

    it('backfills field errors when validation throws a field-error body', async () => {
      selectedProviderRef.value = 'google';
      mountHarness();
      validateSecurityConfiguration.mockRejectedValueOnce(
        new ApiError(
          400,
          JSON.stringify({
            errors: [{ field: 'authenticationConfiguration.authority', error: 'bad authority' }],
          }),
        ),
      );

      await api.handleSave();
      await flushPromises();

      expect(applySecurityConfiguration).not.toHaveBeenCalled();
      expect(
        api.getDisplayErrors(['authenticationConfiguration', 'authority']),
      ).toEqual(['bad authority']);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('toasts the server message when validation throws a generic error', async () => {
      selectedProviderRef.value = 'google';
      mountHarness();
      validateSecurityConfiguration.mockRejectedValueOnce(
        new ApiError(500, JSON.stringify({ message: 'boom' })),
      );

      await api.handleSave();
      await flushPromises();

      expect(applySecurityConfiguration).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith('boom');
    });

    it('saves an existing configuration via PATCH and adopts the cleaned baseline', async () => {
      securityConfigRef.value = googleConfigWithoutUseNonce();
      mountHarness();
      patchSecurityConfiguration.mockResolvedValueOnce(undefined);

      await api.handleSave();
      await flushPromises();

      expect(patchSecurityConfiguration).toHaveBeenCalledTimes(1);
      const ops = patchSecurityConfiguration.mock.calls[0][0] as Array<{
        op: string;
        path: string;
        value?: unknown;
      }>;
      // DEV-NORMALIZE-INIT: the untouched save carries the schema-default
      // fill as an add op — semantically neutral, and the second save
      // then finds nothing to send.
      expect(ops).toContainEqual({
        op: 'add',
        path: '/authenticationConfiguration/oidcConfiguration/useNonce',
        value: true,
      });
      expect(successSpy).toHaveBeenCalledWith(
        'Configuration saved successfully',
        3,
      );
      const savedOidc = api.savedData.value?.authenticationConfiguration
        .oidcConfiguration as Record<string, unknown>;
      expect(savedOidc.useNonce).toBe(true);

      await api.handleSave();
      await flushPromises();
      expect(patchSecurityConfiguration).toHaveBeenCalledTimes(1);
    });

    it('sends a whole-block add when a block appears', async () => {
      const config = googleConfigWithoutUseNonce();
      delete config.authenticationConfiguration.oidcConfiguration;
      securityConfigRef.value = config;
      mountHarness();
      patchSecurityConfiguration.mockResolvedValueOnce(undefined);

      await api.handleSave();
      await flushPromises();

      const ops = patchSecurityConfiguration.mock.calls[0][0] as Array<{
        op: string;
        path: string;
        value?: unknown;
      }>;
      const blockAdd = ops.find(
        (op) => op.path === '/authenticationConfiguration/oidcConfiguration',
      );
      expect(blockAdd?.op).toBe('add');
      expect(
        (blockAdd?.value as Record<string, unknown>).useNonce,
      ).toBe(true);
      expect(
        ops.filter((op) =>
          op.path.startsWith('/authenticationConfiguration/oidcConfiguration/'),
        ),
      ).toEqual([]);
    });

    it('emits a leaf replace for an edited stored OIDC secret (N-1)', async () => {
      securityConfigRef.value = googleConfigWithMaskedSecret();
      mountHarness();
      patchSecurityConfiguration.mockResolvedValueOnce(undefined);

      api.handleFieldChange(
        ['authenticationConfiguration', 'oidcConfiguration', 'secret'],
        'new-secret',
      );
      await api.handleSave();
      await flushPromises();

      expect(patchSecurityConfiguration).toHaveBeenCalledTimes(1);
      const ops = patchSecurityConfiguration.mock.calls[0][0] as Array<{
        op: string;
        path: string;
        value?: unknown;
      }>;
      // The stored provider is OIDC, so the server filter keeps this op
      // and really rewrites the stored secret (pin SystemRepository
      // filterInvalidPatchOperations keys on the stored provider).
      expect(ops).toContainEqual({
        op: 'replace',
        path: '/authenticationConfiguration/oidcConfiguration/secret',
        value: 'new-secret',
      });
      expect(ops.filter((op) => op.path.includes('secret'))).toHaveLength(1);
    });

    it('emits no secret op for an untouched stored secret (N-1)', async () => {
      securityConfigRef.value = googleConfigWithMaskedSecret();
      mountHarness();
      patchSecurityConfiguration.mockResolvedValueOnce(undefined);

      await api.handleSave();
      await flushPromises();

      expect(patchSecurityConfiguration).toHaveBeenCalledTimes(1);
      const ops = patchSecurityConfiguration.mock.calls[0][0] as Array<{
        op: string;
        path: string;
        value?: unknown;
      }>;
      // An absent secret op means "keep the server value": the masked
      // value stays masked and the server restores the live secret.
      expect(ops.filter((op) => op.path.includes('secret'))).toEqual([]);
      expect(applySecurityConfiguration).not.toHaveBeenCalled();
    });

    it('saves via PUT, not PATCH, when a provider is selected after an existing config loads (N-1)', async () => {
      securityConfigRef.value = googleConfigWithoutUseNonce();
      mountHarness();
      expect(api.hasExistingConfig.value).toBe(true);

      selectedProviderRef.value = 'okta';
      await nextTick();

      // The selector route resets to the new-configuration flow: the saved
      // baseline is dropped, so the provider switch never reaches the
      // PATCH filter keyed on the stored provider.
      expect(api.hasExistingConfig.value).toBe(false);
      expect(api.savedData.value).toBeUndefined();
      expect(api.currentProvider.value).toBe('okta');

      validateSecurityConfiguration.mockResolvedValueOnce({
        status: 'success',
      });
      applySecurityConfiguration.mockResolvedValueOnce({
        authenticationConfiguration: {},
        authorizerConfiguration: {},
      });

      await api.handleSave();
      await flushPromises();

      expect(validateSecurityConfiguration).toHaveBeenCalledTimes(1);
      expect(applySecurityConfiguration).toHaveBeenCalledTimes(1);
      expect(patchSecurityConfiguration).not.toHaveBeenCalled();
    });

    it('pins deployment-owned fields in the PATCH candidate only', async () => {
      securityConfigRef.value = googleConfigWithoutUseNonce();
      managedPathsRef.value = {
        authenticationConfiguration: ['/provider'],
        authorizerConfiguration: [],
      };
      mountHarness();
      patchSecurityConfiguration.mockResolvedValueOnce(undefined);

      api.handleFieldChange(['authenticationConfiguration', 'provider'], 'okta');
      await api.handleSave();
      await flushPromises();

      const ops = patchSecurityConfiguration.mock.calls[0][0] as Array<{
        op: string;
        path: string;
      }>;
      expect(
        ops.some((op) => op.path === '/authenticationConfiguration/provider'),
      ).toBe(false);
      // The saved baseline is the cleaned form data, unpinned.
      expect(api.savedData.value?.authenticationConfiguration.provider).toBe(
        'okta',
      );
    });

    it('does nothing without form data', async () => {
      securityConfigRef.value = null;
      mountHarness();

      await api.handleSave();
      await flushPromises();

      expect(validateSecurityConfiguration).not.toHaveBeenCalled();
      expect(patchSecurityConfiguration).not.toHaveBeenCalled();
      expect(applySecurityConfiguration).not.toHaveBeenCalled();
      expect(api.isLoading.value).toBe(false);
    });

    it('backfills field errors when PATCH throws a field-error body', async () => {
      securityConfigRef.value = googleConfigWithoutUseNonce();
      mountHarness();
      patchSecurityConfiguration.mockRejectedValueOnce(
        new ApiError(
          400,
          JSON.stringify({
            errors: [{ field: 'authenticationConfiguration.authority', error: 'bad authority' }],
          }),
        ),
      );

      await api.handleSave();
      await flushPromises();

      expect(
        api.getDisplayErrors(['authenticationConfiguration', 'authority']),
      ).toEqual(['bad authority']);
      expect(successSpy).not.toHaveBeenCalled();
      const savedOidc = api.savedData.value?.authenticationConfiguration
        .oidcConfiguration as Record<string, unknown>;
      expect('useNonce' in savedOidc).toBe(false);
    });
  });

  describe('Test Login gate', () => {
    it('gates a new configuration until a Test Login passes for the exact candidate', async () => {
      selectedProviderRef.value = 'google';
      mountHarness();

      expect(api.isSaveGatedOnTestLogin.value).toBe(true);
      expect(api.canTestLogin.value).toBe(true);
      expect(api.testLoginGateMessage.value).toBe(
        'Run Test Login and sign in successfully before saving. A configuration that cannot sign you in will lock you out.',
      );

      api.handleTestLogin();
      expect(mockResetTestLogin).toHaveBeenCalled();
      expect(api.showTestLoginModal.value).toBe(true);
      expect(mockRunTestLogin).toHaveBeenCalledTimes(1);
      const [payload, check] = mockRunTestLogin.mock.calls[0] as [
        SsoFormData,
        unknown,
      ];
      expect(payload.authenticationConfiguration.provider).toBe('google');
      expect(typeof check).toBe('function');

      mockTestLoginResult.value = { status: 'success' };
      await nextTick();
      expect(api.isSaveGatedOnTestLogin.value).toBe(false);

      api.handleFieldChange(['authenticationConfiguration', 'authority'], 'https://other.example.com');
      expect(api.isSaveGatedOnTestLogin.value).toBe(true);
    });

    it('does not gate an untouched or safely edited existing configuration', async () => {
      securityConfigRef.value = googleConfigWithoutUseNonce();
      mountHarness();

      expect(api.isSaveGatedOnTestLogin.value).toBe(false);
      expect(api.testLoginGateMessage.value).toBe(
        'These changes affect how users sign in. Run Test Login and sign in successfully before saving.',
      );

      api.handleFieldChange(['authenticationConfiguration', 'enableSelfSignup'], false);
      expect(api.isSaveGatedOnTestLogin.value).toBe(false);

      api.handleFieldChange(['authenticationConfiguration', 'authority'], 'https://other.example.com');
      expect(api.isSaveGatedOnTestLogin.value).toBe(true);
    });

    it('does not offer Test Login for a basic provider', () => {
      securityConfigRef.value = {
        authenticationConfiguration: { provider: 'basic' },
        authorizerConfiguration: {},
      };
      mountHarness();
      expect(api.canTestLogin.value).toBe(false);
      expect(api.isSaveGatedOnTestLogin.value).toBe(false);
    });

    it('keeps a recorded pass when the modal closes', async () => {
      selectedProviderRef.value = 'google';
      mountHarness();
      api.handleTestLogin();
      mockTestLoginResult.value = { status: 'success' };
      await nextTick();
      expect(api.isSaveGatedOnTestLogin.value).toBe(false);

      api.handleTestLoginModalClose();
      expect(api.showTestLoginModal.value).toBe(false);
      expect(mockResetTestLogin).toHaveBeenCalledTimes(2);
      expect(api.isSaveGatedOnTestLogin.value).toBe(false);
    });

    it('keeps a recorded pass when a retest fails', async () => {
      selectedProviderRef.value = 'google';
      mountHarness();
      api.handleTestLogin();
      mockTestLoginResult.value = { status: 'success' };
      await nextTick();
      expect(api.isSaveGatedOnTestLogin.value).toBe(false);

      // The watcher only records passedTestLoginKey on success, so a
      // failing retest must not re-close the gate for the same candidate.
      api.handleTestLogin();
      mockTestLoginResult.value = { status: 'failed' };
      await nextTick();
      expect(api.isSaveGatedOnTestLogin.value).toBe(false);
    });

    it('does nothing when Test Login runs without form data', () => {
      securityConfigRef.value = null;
      mountHarness();
      api.handleTestLogin();
      expect(mockRunTestLogin).not.toHaveBeenCalled();
      expect(api.showTestLoginModal.value).toBe(false);
    });
  });

  describe('checkConfiguration', () => {
    async function runCheck() {
      selectedProviderRef.value = 'google';
      mountHarness();
      api.handleTestLogin();
      const check = mockRunTestLogin.mock.calls[0][1] as (
        payload: SsoFormData,
      ) => Promise<{ passed: boolean; problems: string[] }>;
      return check;
    }

    it('passes when validation succeeds with no errors', async () => {
      const check = await runCheck();
      validateSecurityConfiguration.mockResolvedValueOnce({ status: 'success' });
      const outcome = await check(googleConfigWithoutUseNonce());
      expect(outcome).toEqual({ passed: true, problems: [] });
    });

    it('lists problems and backfills fields when validation reports errors', async () => {
      const check = await runCheck();
      validateSecurityConfiguration.mockResolvedValueOnce({
        status: 'failed',
        errors: [
          { field: 'authenticationConfiguration.authority', error: 'bad authority' },
          { field: '', error: 'generic boom' },
        ],
      });
      const outcome = await check(googleConfigWithoutUseNonce());
      expect(outcome).toEqual({
        passed: false,
        problems: ['bad authority', 'generic boom'],
      });
      // Test Login problems do not take the Save split: the blank-field
      // item is listed, never toasted.
      expect(errorSpy).not.toHaveBeenCalled();
      expect(
        api.getDisplayErrors(['authenticationConfiguration', 'authority']),
      ).toEqual(['bad authority']);
    });

    it('reports field problems when validation throws a field-error body', async () => {
      const check = await runCheck();
      validateSecurityConfiguration.mockRejectedValueOnce(
        new ApiError(
          400,
          JSON.stringify({
            errors: [{ field: 'authenticationConfiguration.clientId', error: 'bad id' }],
          }),
        ),
      );
      const outcome = await check(googleConfigWithoutUseNonce());
      expect(outcome).toEqual({ passed: false, problems: ['bad id'] });
    });

    it('reports one problem from the error chain when validation throws generically', async () => {
      const check = await runCheck();
      validateSecurityConfiguration.mockRejectedValueOnce(
        new ApiError(500, JSON.stringify({ message: 'server exploded' })),
      );
      const outcome = await check(googleConfigWithoutUseNonce());
      expect(outcome).toEqual({ passed: false, problems: ['server exploded'] });

      validateSecurityConfiguration.mockRejectedValueOnce(new Error('network down'));
      const fallback = await check(googleConfigWithoutUseNonce());
      expect(fallback).toEqual({
        passed: false,
        problems: [
          'The sign-in could not be validated due to a server error. Please try again.',
        ],
      });
    });
  });

  describe('cancel', () => {
    it('discards to the saved baseline for an existing configuration', async () => {
      securityConfigRef.value = googleConfigWithoutUseNonce();
      mountHarness();
      api.handleFieldChange(['authenticationConfiguration', 'authority'], 'https://other.example.com');
      api.handleCancelClick();
      expect(api.showCancelModal.value).toBe(true);

      api.handleCancelConfirm();
      expect(api.showCancelModal.value).toBe(false);
      expect(api.internalData.value?.authenticationConfiguration.authority).toBe(
        'https://accounts.google.com',
      );
      expect(api.showForm.value).toBe(true);
      expect(onChangeProvider).not.toHaveBeenCalled();
    });

    it('resets to the selector for a new configuration', () => {
      selectedProviderRef.value = 'google';
      mountHarness();
      api.handleCancelClick();
      api.handleCancelConfirm();

      expect(api.showProviderSelector.value).toBe(true);
      expect(api.showForm.value).toBe(false);
      expect(api.isEditMode.value).toBe(false);
      expect(api.currentProvider.value).toBeUndefined();
      expect(api.internalData.value).toBeUndefined();
      expect(onChangeProvider).toHaveBeenCalledTimes(1);
    });

    it('only hides the modal on close', () => {
      selectedProviderRef.value = 'google';
      mountHarness();
      api.handleCancelClick();
      api.handleCancelModalClose();
      expect(api.showCancelModal.value).toBe(false);
      expect(api.showForm.value).toBe(true);
      expect(onChangeProvider).not.toHaveBeenCalled();
    });

    it('refuses save-and-exit while gated, with a warning', async () => {
      selectedProviderRef.value = 'google';
      mountHarness();
      api.handleCancelClick();

      await api.handleSaveAndExit();

      expect(api.showCancelModal.value).toBe(false);
      expect(warningSpy).toHaveBeenCalledWith(
        'Run Test Login and sign in successfully before saving. A configuration that cannot sign you in will lock you out.',
        5,
      );
      expect(validateSecurityConfiguration).not.toHaveBeenCalled();
      expect(applySecurityConfiguration).not.toHaveBeenCalled();
    });

    it('saves and stays for an ungated existing configuration', async () => {
      securityConfigRef.value = googleConfigWithoutUseNonce();
      mountHarness();
      patchSecurityConfiguration.mockResolvedValueOnce(undefined);
      api.handleCancelClick();

      await api.handleSaveAndExit();
      await flushPromises();

      expect(patchSecurityConfiguration).toHaveBeenCalledTimes(1);
      expect(api.showCancelModal.value).toBe(false);
      expect(api.showForm.value).toBe(true);
      expect(api.modalSaveLoading.value).toBe(false);
      expect(api.isLoading.value).toBe(false);
      expect(onChangeProvider).not.toHaveBeenCalled();
    });

    it('saves and resets for an ungated new configuration', async () => {
      selectedProviderRef.value = 'google';
      mountHarness();
      api.handleTestLogin();
      mockTestLoginResult.value = { status: 'success' };
      await nextTick();
      validateSecurityConfiguration.mockResolvedValueOnce({ status: 'success' });
      applySecurityConfiguration.mockResolvedValueOnce({
        authenticationConfiguration: {},
        authorizerConfiguration: {},
      });
      api.handleCancelClick();

      await api.handleSaveAndExit();
      await flushPromises();

      expect(applySecurityConfiguration).toHaveBeenCalledTimes(1);
      expect(api.showProviderSelector.value).toBe(true);
      expect(onChangeProvider).toHaveBeenCalledTimes(1);
    });
  });

  describe('provider selection and locks', () => {
    it('selects a fresh provider without overwriting saved data', () => {
      securityConfigRef.value = googleConfigWithoutUseNonce();
      mountHarness();
      const saved = api.savedData.value;

      api.handleProviderSelect('okta');

      expect(api.currentProvider.value).toBe('okta');
      expect(api.showForm.value).toBe(true);
      expect(api.isEditMode.value).toBe(true);
      expect(api.internalData.value?.authenticationConfiguration.provider).toBe(
        'okta',
      );
      expect(api.savedData.value).toBe(saved);
      expect(onProviderSelect).toHaveBeenCalledWith('okta');
    });

    it('locks provider change and SAML upload by managed paths and read-only', async () => {
      securityConfigRef.value = samlConfig();
      mountHarness();
      expect(api.canChangeProvider.value).toBe(true);
      expect(api.canUploadSamlMetadata.value).toBe(true);

      managedPathsRef.value = {
        authenticationConfiguration: ['/provider'],
        authorizerConfiguration: [],
      };
      await nextTick();
      expect(api.canChangeProvider.value).toBe(false);
      expect(api.canUploadSamlMetadata.value).toBe(true);

      managedPathsRef.value = {
        authenticationConfiguration: ['/samlConfiguration/idp/entityId'],
        authorizerConfiguration: [],
      };
      await nextTick();
      expect(api.canChangeProvider.value).toBe(true);
      expect(api.canUploadSamlMetadata.value).toBe(false);

      isReadOnlyRef.value = true;
      await nextTick();
      expect(api.canChangeProvider.value).toBe(false);
      expect(api.canUploadSamlMetadata.value).toBe(false);
    });
  });

  describe('SAML metadata upload', () => {
    const samlXml = [
      '<EntityDescriptor entityID="https://idp.example.com/metadata" xmlns="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:ds="http://www.w3.org/2000/09/xmldsig#">',
      '<IDPSSODescriptor>',
      '<KeyDescriptor use="signing"><ds:KeyInfo><ds:X509Data><ds:X509Certificate>MIICERTDATA</ds:X509Certificate></ds:X509Data></ds:KeyInfo></KeyDescriptor>',
      '<SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://idp.example.com/sso"/>',
      '</IDPSSODescriptor>',
      '</EntityDescriptor>',
    ].join('');

    function xmlFile(name: string, size: number): File {
      const file = new File(['x'.repeat(size)], name, { type: 'text/xml' });
      return file;
    }

    it('fills the idp fields on a successful parse', async () => {
      selectedProviderRef.value = 'saml';
      mountHarness();
      const file = xmlFile('metadata.xml', 10);
      file.text = () => Promise.resolve(samlXml);

      api.handleMetadataFileUpload([file]);
      await flushPromises();

      const idp = (
        api.internalData.value?.authenticationConfiguration
          .samlConfiguration as Record<string, unknown>
      ).idp as Record<string, unknown>;
      expect(idp.entityId).toBe('https://idp.example.com/metadata');
      expect(idp.ssoLoginUrl).toBe('https://idp.example.com/sso');
      expect(idp.idpX509Certificate).toContain('MIICERTDATA');
      expect(api.metadataUploadStatus.value).toBe('success');
      expect(api.metadataUploadFileName.value).toBe('metadata.xml');
    });

    it('clears the idp fields on a parse failure', async () => {
      selectedProviderRef.value = 'saml';
      mountHarness();
      api.handleFieldChange(
        ['authenticationConfiguration', 'samlConfiguration', 'idp', 'entityId'],
        'preset',
      );
      const file = xmlFile('broken.xml', 10);
      file.text = () => Promise.resolve('<EntityDescriptor');

      api.handleMetadataFileUpload([file]);
      await flushPromises();

      const idp = (
        api.internalData.value?.authenticationConfiguration
          .samlConfiguration as Record<string, unknown>
      ).idp as Record<string, unknown>;
      expect(idp.entityId).toBe('');
      expect(idp.ssoLoginUrl).toBe('');
      expect(idp.idpX509Certificate).toBe('');
      expect(api.metadataUploadStatus.value).toBe('error');
      expect(api.metadataUploadFileName.value).toBe('broken.xml');
    });

    it('keeps the idp fields on a read failure', async () => {
      selectedProviderRef.value = 'saml';
      mountHarness();
      api.handleFieldChange(
        ['authenticationConfiguration', 'samlConfiguration', 'idp', 'entityId'],
        'preset',
      );
      const file = xmlFile('unreadable.xml', 10);
      file.text = () => Promise.reject(new Error('read failed'));

      api.handleMetadataFileUpload([file]);
      await flushPromises();

      const idp = (
        api.internalData.value?.authenticationConfiguration
          .samlConfiguration as Record<string, unknown>
      ).idp as Record<string, unknown>;
      expect(idp.entityId).toBe('preset');
      expect(api.metadataUploadStatus.value).toBe('error');
      expect(api.metadataUploadFileName.value).toBe('unreadable.xml');
    });

    it('rejects oversized files without touching the upload state', async () => {
      selectedProviderRef.value = 'saml';
      mountHarness();
      const file = xmlFile('big.xml', 1024 * 1024 + 1);
      const textSpy = vi.fn(() => Promise.resolve(''));
      file.text = textSpy;

      api.handleMetadataFileUpload([file]);
      await flushPromises();

      expect(errorSpy).toHaveBeenCalledWith('File size exceeds maximum allowed size of 1 MB');
      expect(textSpy).not.toHaveBeenCalled();
      expect(api.metadataUploadStatus.value).toBeNull();
      expect(api.metadataUploadFileName.value).toBe('');
    });

    it('ignores an empty file list', () => {
      selectedProviderRef.value = 'saml';
      mountHarness();
      api.handleMetadataFileUpload([]);
      expect(api.metadataUploadStatus.value).toBeNull();
    });
  });
});
