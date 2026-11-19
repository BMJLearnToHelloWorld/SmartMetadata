/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSsoFreshFormData } from '@/admin/ssoDefaults';
import { getSsoProviderSchema } from '@/admin/ssoSchemas';
import type { SsoSecuritySources } from '@/admin/ssoSettingsSource';
import { getSsoUiEntry, resolveSsoUiSchema } from '@/admin/ssoUiSchema';
import { searchSsoRoles } from '@/api/ssoRoles';
import { createTestI18n } from '@/test/i18n';
import SsoSchemaNode from './SsoSchemaNode.vue';

vi.mock('@/api/ssoRoles', () => ({
  searchSsoRoles: vi.fn(),
}));

vi.mocked(searchSsoRoles).mockResolvedValue([]);

const EMPTY_MANAGED: SsoSecuritySources['managedPaths'] = {
  authenticationConfiguration: [],
  authorizerConfiguration: [],
};

function mountSection(args: {
  provider: string;
  section: 'authenticationConfiguration' | 'authorizerConfiguration';
  hasExistingConfig?: boolean;
  managedPaths?: SsoSecuritySources['managedPaths'];
  errors?: Record<string, string[]>;
  locale?: 'en-US' | 'zh-CN';
  data?: Record<string, unknown>;
  clientType?: string;
}) {
  const provider = args.provider;
  const hasExistingConfig = args.hasExistingConfig ?? false;
  const schema = getSsoProviderSchema(provider, hasExistingConfig);
  const fresh = createSsoFreshFormData(provider);
  const clientType = fresh.authenticationConfiguration.clientType as
    | string
    | undefined;
  const uiSchema = resolveSsoUiSchema({
    provider,
    hasExistingConfig,
    hasSavedData: hasExistingConfig,
    clientType: args.clientType ?? clientType,
  });
  const sectionSchema = schema.properties![args.section]!;
  return mount(SsoSchemaNode, {
    props: {
      fieldId: `root/${args.section}`,
      path: [args.section],
      schema: sectionSchema,
      entry: getSsoUiEntry(uiSchema, [args.section]),
      modelValue: args.data ?? fresh[args.section],
      getFieldErrors: (fieldId: string) => args.errors?.[fieldId] ?? [],
      managedPaths: args.managedPaths ?? EMPTY_MANAGED,
      locale: args.locale ?? 'en-US',
      brandName: 'iSmart',
    },
    global: { plugins: [createTestI18n(args.locale ?? 'en-US')] },
  });
}

function fieldLabelOrder(wrapper: ReturnType<typeof mountSection>): string[] {
  return wrapper
    .findAll('label.control-label[for]')
    .map((label) => label.attributes('for')!);
}

describe('SsoSchemaNode', () => {
  beforeEach(() => {
    vi.mocked(searchSsoRoles).mockClear();
  });

  it('renders Google confidential fields in group order with hidden fields absent', () => {
    const wrapper = mountSection({
      provider: 'google',
      section: 'authenticationConfiguration',
    });
    const order = fieldLabelOrder(wrapper);
    // Group order: Basic, Client, Authority, Security, provider objects,
    // Identity, remaining — hidden fields never render.
    expect(order[0]).toBe(
      'root/authenticationConfiguration/providerName',
    );
    expect(order).toContain('root/authenticationConfiguration/clientType');
    expect(order).toContain('root/authenticationConfiguration/authority');
    // publicKeyUrls is hidden in confidential mode (standard schemas);
    // it appears only in public mode via the overlay.
    expect(
      wrapper
        .find(
          '[data-testid="sso-configuration-form-array-field-template-publicKeyUrls"]',
        )
        .exists(),
    ).toBe(false);
    expect(order.indexOf('root/authenticationConfiguration/providerName')).toBeLessThan(
      order.indexOf('root/authenticationConfiguration/clientType'),
    );
    expect(order.indexOf('root/authenticationConfiguration/authority')).toBeLessThan(
      order.indexOf('root/authenticationConfiguration/emailClaim'),
    );
    expect(order).not.toContain('root/authenticationConfiguration/provider');
    expect(order).not.toContain('root/authenticationConfiguration/clientId');
    expect(order).not.toContain('root/authenticationConfiguration/callbackUrl');
    expect(order).not.toContain(
      'root/authenticationConfiguration/tokenValidationAlgorithm',
    );
    expect(order).not.toContain(
      'root/authenticationConfiguration/forceSecureSessionCookie',
    );
    expect(order).not.toContain(
      'root/authenticationConfiguration/responseType',
    );
    // OIDC object title comes from the confidential `??=` rule.
    expect(
      wrapper.find('#root\\/authenticationConfiguration\\/oidcConfiguration__title')
        .exists(),
    ).toBe(true);
  });

  it('shows publicKeyUrls and hides the OIDC block in public mode', () => {
    const wrapper = mountSection({
      provider: 'google',
      section: 'authenticationConfiguration',
      clientType: 'public',
    });
    expect(
      wrapper
        .find(
          '[data-testid="sso-configuration-form-array-field-template-publicKeyUrls"]',
        )
        .exists(),
    ).toBe(true);
    expect(
      wrapper
        .find(
          'label.control-label[for="root/authenticationConfiguration/oidcConfiguration/id"]',
        )
        .exists(),
    ).toBe(false);
    expect(
      fieldLabelOrder(wrapper).includes(
        'root/authenticationConfiguration/clientId',
      ),
    ).toBe(true);
  });

  it('renders booleans as checkbox plus title with no label element', () => {
    const wrapper = mountSection({
      provider: 'google',
      section: 'authenticationConfiguration',
    });
    // enableSelfSignup is a visible boolean for new configs.
    const checkbox = wrapper.find(
      '#root\\/authenticationConfiguration\\/enableSelfSignup',
    );
    expect(checkbox.exists()).toBe(true);
    expect(
      wrapper.find(
        'label.control-label[for="root/authenticationConfiguration/enableSelfSignup"]',
      ).exists(),
    ).toBe(false);
  });

  it('marks providerName required and jwtPrincipalClaims deprecated', () => {
    const wrapper = mountSection({
      provider: 'google',
      section: 'authenticationConfiguration',
    });
    const providerNameLabel = wrapper.find(
      'label.control-label[for="root/authenticationConfiguration/providerName"]',
    );
    expect(providerNameLabel.find('.required').exists()).toBe(true);
    // jwtPrincipalClaims is an array field: badge lives in its own label.
    expect(wrapper.text()).toContain('Deprecated');
  });

  it('keeps advanced OIDC fields mounted but collapsed', async () => {
    const wrapper = mountSection({
      provider: 'google',
      section: 'authenticationConfiguration',
    });
    const toggle = wrapper.find('button[aria-expanded="false"]');
    expect(toggle.exists()).toBe(true);
    expect(toggle.text()).toBe('Advanced Config');
    const useNonce = wrapper.find(
      '#root\\/authenticationConfiguration\\/oidcConfiguration\\/useNonce',
    );
    expect(useNonce.exists()).toBe(true);
    // Collapsed: the accordion body is v-show hidden.
    expect(
      (useNonce.element.closest('div[style*="display: none"]') !== null),
    ).toBe(true);
    await toggle.trigger('click');
    expect(wrapper.find('button[aria-expanded="true"]').exists()).toBe(true);
    expect(
      (useNonce.element.closest('div[style*="display: none"]') !== null),
    ).toBe(false);
  });

  it('renders useNonce as a text input showing the boolean default', () => {
    const wrapper = mountSection({
      provider: 'google',
      section: 'authenticationConfiguration',
    });
    const useNonce = wrapper.find(
      '#root\\/authenticationConfiguration\\/oidcConfiguration\\/useNonce',
    );
    expect(useNonce.element.tagName).toBe('INPUT');
    expect((useNonce.element as HTMLInputElement).type).toBe('text');
    expect((useNonce.element as HTMLInputElement).value).toBe('false');
  });

  it('emits field changes with the RJSF id', async () => {
    const wrapper = mountSection({
      provider: 'google',
      section: 'authenticationConfiguration',
    });
    const input = wrapper.find(
      '#root\\/authenticationConfiguration\\/providerName',
    );
    (input.element as HTMLInputElement).value = 'Acme SSO';
    await input.trigger('input');
    expect(wrapper.emitted('change')).toEqual([
      ['root/authenticationConfiguration/providerName', 'Acme SSO'],
    ]);
  });

  it('renders display errors under the field', () => {
    const wrapper = mountSection({
      provider: 'google',
      section: 'authenticationConfiguration',
      errors: {
        'root/authenticationConfiguration/providerName': [
          'Provider Name is required.',
        ],
      },
    });
    const items = wrapper.findAll('.form-field-error');
    expect(items.map((item) => item.text())).toEqual([
      'Provider Name is required.',
    ]);
  });

  it('disables fields whose pointer is deployment-managed', () => {
    const wrapper = mountSection({
      provider: 'google',
      section: 'authenticationConfiguration',
      managedPaths: {
        authenticationConfiguration: ['/providerName'],
        authorizerConfiguration: [],
      },
    });
    const input = wrapper.find(
      '#root\\/authenticationConfiguration\\/providerName',
    );
    expect((input.element as HTMLInputElement).disabled).toBe(true);
    const authority = wrapper.find(
      '#root\\/authenticationConfiguration\\/authority',
    );
    expect((authority.element as HTMLInputElement).disabled).toBe(false);
  });

  it('renders the LDAP roles field and role-mapping widget', () => {
    const wrapper = mountSection({
      provider: 'ldap',
      section: 'authenticationConfiguration',
    });
    expect(
      wrapper
        .find(
          '[data-testid="sso-configuration-form-array-field-template-authReassignRoles"]',
        )
        .exists(),
    ).toBe(true);
    expect(wrapper.find('.ldap-role-mapping-widget').exists()).toBe(true);
    expect(
      wrapper
        .find('[data-testid="sso-configuration-form-array-field-template-authReassignRoles"]')
        .exists(),
    ).toBe(true);
  });

  it('keeps tokenValidationAlgorithm visible for custom-oidc', () => {
    const wrapper = mountSection({
      provider: 'custom-oidc',
      section: 'authenticationConfiguration',
    });
    expect(
      wrapper
        .find(
          'label.control-label[for="root/authenticationConfiguration/tokenValidationAlgorithm"]',
        )
        .exists(),
    ).toBe(true);
  });

  it('renders SAML security tokenValidity inside the accordion', () => {
    const wrapper = mountSection({
      provider: 'saml',
      section: 'authenticationConfiguration',
    });
    const tokenValidity = wrapper.find(
      '#root\\/authenticationConfiguration\\/samlConfiguration\\/security\\/tokenValidity',
    );
    expect(tokenValidity.exists()).toBe(true);
    expect(
      tokenValidity.element.closest('div[style*="display: none"]') !== null,
    ).toBe(true);
  });

  it('renders the authorizer section with the adminEmails array', () => {
    const wrapper = mountSection({
      provider: 'google',
      section: 'authorizerConfiguration',
    });
    expect(
      wrapper
        .find(
          '[data-testid="sso-configuration-form-array-field-template-adminEmails"]',
        )
        .exists(),
    ).toBe(true);
    expect(
      wrapper
        .find(
          'label.control-label[for="root/authorizerConfiguration/className"]',
        )
        .exists(),
    ).toBe(false);
  });

  it('renders Chinese field labels from the data table', () => {
    const wrapper = mountSection({
      provider: 'google',
      section: 'authenticationConfiguration',
      locale: 'zh-CN',
    });
    const label = wrapper.find(
      'label.control-label[for="root/authenticationConfiguration/providerName"]',
    );
    expect(label.text()).toContain('提供商名称');
  });
});
