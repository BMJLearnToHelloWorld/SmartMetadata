/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd, { message } from 'ant-design-vue';
import { createPinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { ApiError } from '@/api/client';
import type { SecurityConfigurationDocument } from '@/api/system';
import { createTestI18n } from '@/test/i18n';
import SsoSettingsView from './SsoSettingsView.vue';

const getSecurityConfigurationDocument = vi.fn();
const getSettingsSource = vi.fn();
const patchSecurityConfiguration = vi.fn();

vi.mock('@/api/system', async () => {
  const actual = await vi.importActual<typeof import('@/api/system')>('@/api/system');
  return {
    ...actual,
    getSecurityConfigurationDocument: (...args: unknown[]) =>
      getSecurityConfigurationDocument(...args),
    getSettingsSource: (...args: unknown[]) => getSettingsSource(...args),
    patchSecurityConfiguration: (...args: unknown[]) =>
      patchSecurityConfiguration(...args),
  };
});

vi.mock('@/api/ssoRoles', () => ({
  searchSsoRoles: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/composables/useSsoTestLogin', async () => {
  const actual =
    await vi.importActual<typeof import('@/composables/useSsoTestLogin')>(
      '@/composables/useSsoTestLogin',
    );
  return {
    ...actual,
    useSsoTestLogin: () => ({
      isTesting: ref(false),
      isAwaitingCredentials: ref(false),
      configurationCheck: ref(undefined),
      result: ref(undefined),
      error: ref(undefined),
      runTestLogin: vi.fn(),
      submitCredentials: vi.fn(),
      reset: vi.fn(),
    }),
  };
});

const basicConfig = (): SecurityConfigurationDocument => ({
  authenticationConfiguration: { provider: 'basic', providerName: 'basic' },
  authorizerConfiguration: {
    className: 'org.openmetadata.service.security.DefaultAuthorizer',
    containerRequestFilter: 'org.openmetadata.service.security.JwtFilter',
  },
});

const googleConfig = (): SecurityConfigurationDocument => ({
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
      discoveryUri:
        'https://accounts.google.com/.well-known/openid-configuration',
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

const ldapConfig = (): SecurityConfigurationDocument => ({
  authenticationConfiguration: {
    provider: 'ldap',
    providerName: 'ldap',
    clientType: 'public',
    enableSelfSignup: false,
  },
  authorizerConfiguration: {
    className: 'org.openmetadata.service.security.DefaultAuthorizer',
    containerRequestFilter: 'org.openmetadata.service.security.JwtFilter',
  },
});

function makeRouter(initialQuery: Record<string, string> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/settings', name: 'admin-settings', component: { template: '<div />' } },
      {
        path: '/settings/sso',
        name: 'admin-settings-sso',
        component: SsoSettingsView,
      },
    ],
  });
  return { router, initialQuery };
}

async function mountView(initialQuery: Record<string, string> = {}) {
  const { router } = makeRouter(initialQuery);
  await router.push({ name: 'admin-settings-sso', query: initialQuery });
  await router.isReady();
  const wrapper = mount(SsoSettingsView, {
    global: {
      plugins: [Antd, createPinia(), createTestI18n('en-US'), router],
    },
  });
  await flushPromises();
  await nextTick();
  return { wrapper, router };
}

describe('SsoSettingsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, text: async () => '' })),
    );
    HTMLElement.prototype.scrollIntoView = vi.fn();
    getSettingsSource.mockResolvedValue([]);
    patchSecurityConfiguration.mockResolvedValue(undefined);
    vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
    vi.spyOn(message, 'success').mockImplementation(() => undefined as never);
    vi.spyOn(message, 'warning').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('shows the loading branch while the config GET is pending', async () => {
    getSecurityConfigurationDocument.mockReturnValue(new Promise(() => {}));
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="sso-settings-layout"]').exists()).toBe(true);
    expect(wrapper.find('.ant-spin').exists()).toBe(true);
    expect(wrapper.find('[data-testid="settings-source-banner"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Settings');
  });

  it('shows the provider selector for a basic stored config', async () => {
    getSecurityConfigurationDocument.mockResolvedValue(basicConfig());
    const { wrapper } = await mountView();
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="sso-provider-configure"]').exists()).toBe(true);
    });
    expect(getSecurityConfigurationDocument).toHaveBeenCalledTimes(1);
    expect(
      wrapper
        .findAll('.ant-breadcrumb li')
        .map((li) => li.text().replace(/\/$/, '')),
    ).toEqual(['Settings', 'SSO']);
  });

  it('shows tabs with the overview default for a stored google config and writes the provider back to the URL', async () => {
    getSecurityConfigurationDocument.mockResolvedValue(googleConfig());
    const { wrapper, router } = await mountView();
    await vi.waitFor(() => {
      expect(wrapper.find('.sso-provider-header h1').text()).toBe('Google');
    });
    expect(router.currentRoute.value.query.provider).toBe('google');
    // Overview is the rendered tab; the Configure pane stays mounted.
    // The integration line landed sso.enableSso; the pin value is the
    // "Enable Self Signup" quirk, and the assertion locks the rendered text.
    expect(wrapper.find('.enable-self-signup-header').text()).toBe('Enable Self Signup');
    // The Configure pane mounts in view mode while Overview is active;
    // switching tabs flips forceEditMode and enters edit mode.
    const tabs = wrapper.findAll('.ant-tabs-tab');
    await tabs[1].trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="save-sso-configuration"]').exists()).toBe(true);
    });
    expect(
      wrapper
        .findAll('.ant-breadcrumb li')
        .map((li) => li.text().replace(/\/$/, '')),
    ).toEqual(['Settings', 'Google']);
  });

  it('defaults to the configure tab for a stored ldap config', async () => {
    getSecurityConfigurationDocument.mockResolvedValue(ldapConfig());
    const { wrapper } = await mountView();
    await vi.waitFor(() => {
      expect(wrapper.find('.sso-provider-header h1').text()).toBe('Ldap');
    });
    expect(wrapper.find('[data-testid="save-sso-configuration"]').exists()).toBe(true);
  });

  it('shows the selector immediately for provider=basic without fetching', async () => {
    const { wrapper } = await mountView({ provider: 'basic' });
    expect(wrapper.find('[data-testid="sso-provider-configure"]').exists()).toBe(true);
    expect(getSecurityConfigurationDocument).not.toHaveBeenCalled();
  });

  it('shows the no-config form for a provider URL param with a basic stored config', async () => {
    getSecurityConfigurationDocument.mockResolvedValue(basicConfig());
    const { wrapper } = await mountView({ provider: 'okta' });
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="save-sso-configuration"]').exists()).toBe(true);
    });
    expect(wrapper.find('[data-testid="sso-provider-configure"]').exists()).toBe(false);
    expect(
      wrapper
        .findAll('.ant-breadcrumb li')
        .map((li) => li.text().replace(/\/$/, '')),
    ).toEqual(['Settings', 'SSO', 'Okta']);
    // The middle SSO crumb links back to the settings SSO page.
    expect(wrapper.findAll('.ant-breadcrumb a').map((a) => a.text())).toEqual([
      'Settings',
      'SSO',
    ]);
  });

  it('falls back to the no-config state with a toast when the GET fails', async () => {
    // A 500 (not 403): 403-on-GET is suppressed by the pin toast rule
    // (resolveSsoErrorDetails), so a toast-bearing failure must use a
    // non-suppressed status. The 403 wiring is locked by the next test.
    getSecurityConfigurationDocument.mockRejectedValue(
      new ApiError(500, JSON.stringify({ message: 'boom' })),
    );
    const { wrapper } = await mountView();
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="sso-provider-configure"]').exists()).toBe(true);
    });
    expect(message.error).toHaveBeenCalled();
    expect(wrapper.text()).not.toContain('Permission');
  });

  it('falls back to the no-config state without a toast when the GET is forbidden', async () => {
    // Pin toast rule: 403 on GET without a principal-domain message is
    // suppressed (ssoToasts.test.ts locks the rule; this locks the view
    // passing method 'GET' to showSsoErrorToast).
    getSecurityConfigurationDocument.mockRejectedValue(
      new ApiError(403, JSON.stringify({ message: 'Forbidden' })),
    );
    const { wrapper } = await mountView();
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="sso-provider-configure"]').exists()).toBe(true);
    });
    expect(message.error).not.toHaveBeenCalled();
    expect(message.warning).not.toHaveBeenCalled();
  });

  it('toggles self signup with a single PATCH op and rolls back on failure', async () => {
    getSecurityConfigurationDocument.mockResolvedValue(googleConfig());
    const { wrapper } = await mountView();
    await vi.waitFor(() => {
      expect(wrapper.find('.enable-sso-card-container').exists()).toBe(true);
    });
    const toggle = wrapper.find('.enable-sso-card-container .ant-switch');
    await toggle.trigger('click');
    await flushPromises();
    expect(patchSecurityConfiguration).toHaveBeenCalledWith([
      {
        op: 'replace',
        path: '/authenticationConfiguration/enableSelfSignup',
        value: false,
      },
    ]);

    patchSecurityConfiguration.mockRejectedValueOnce(
      new ApiError(500, JSON.stringify({ message: 'boom' })),
    );
    await toggle.trigger('click');
    await flushPromises();
    expect(patchSecurityConfiguration).toHaveBeenCalledTimes(2);
    expect(message.error).toHaveBeenCalled();
  });

  it('shows the deployment text instead of the selector when the provider is managed', async () => {
    getSecurityConfigurationDocument.mockResolvedValue(basicConfig());
    getSettingsSource.mockResolvedValue([
      {
        configType: 'authenticationConfiguration',
        editable: true,
        managedPaths: ['/provider'],
        source: 'ENV',
        sourceVariable: 'AUTHENTICATION_PROVIDER',
      },
    ]);
    const { wrapper } = await mountView();
    await vi.waitFor(() => {
      expect(
        wrapper.find('[data-testid="sso-provider-set-by-deployment"]').exists(),
      ).toBe(true);
    });
    expect(wrapper.find('[data-testid="sso-provider-configure"]').exists()).toBe(false);
  });

  it('selecting a provider pushes the URL and shows the no-config form', async () => {
    getSecurityConfigurationDocument.mockResolvedValue(basicConfig());
    const { wrapper, router } = await mountView();
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="sso-provider-configure"]').exists()).toBe(true);
    });
    await wrapper.find('[data-testid="sso-provider-card-azure"]').trigger('click');
    await wrapper.find('[data-testid="sso-provider-configure"]').trigger('click');
    await flushPromises();
    await nextTick();
    expect(router.currentRoute.value.query.provider).toBe('azure');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="save-sso-configuration"]').exists()).toBe(true);
    });
    // The fetch guard keeps the GET at one call across the URL change.
    expect(getSecurityConfigurationDocument).toHaveBeenCalledTimes(1);
  });

  it('discarding a new config returns to the selector through provider=basic', async () => {
    // The Change Provider button only renders in the card variant with an
    // existing config, which no view flow reaches; the view-level
    // change-provider path is the form's cancel-discard callback.
    getSecurityConfigurationDocument.mockResolvedValue(basicConfig());
    const { wrapper, router } = await mountView({ provider: 'okta' });
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="cancel-sso-configuration"]').exists()).toBe(true);
    });
    await wrapper.find('[data-testid="cancel-sso-configuration"]').trigger('click');
    await nextTick();
    // The modal teleports to document.body, outside the wrapper tree.
    const discard = document.querySelector(
      '[data-testid="unsaved-changes-modal-discard"]',
    ) as HTMLElement;
    expect(discard).not.toBeNull();
    discard.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    await nextTick();
    expect(router.currentRoute.value.query.provider).toBe('basic');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="sso-provider-configure"]').exists()).toBe(true);
    });
  });

  it('disables the overview toggle when self signup is managed', async () => {
    getSecurityConfigurationDocument.mockResolvedValue(googleConfig());
    getSettingsSource.mockResolvedValue([
      {
        configType: 'authenticationConfiguration',
        editable: true,
        managedPaths: ['/enableSelfSignup'],
        source: 'ENV',
        sourceVariable: 'ENABLE_SELF_SIGNUP',
      },
    ]);
    const { wrapper } = await mountView();
    await vi.waitFor(() => {
      expect(wrapper.find('.enable-sso-card-container').exists()).toBe(true);
    });
    expect(
      wrapper.find('.enable-sso-card-container .ant-switch').classes(),
    ).toContain('ant-switch-disabled');
  });
});
