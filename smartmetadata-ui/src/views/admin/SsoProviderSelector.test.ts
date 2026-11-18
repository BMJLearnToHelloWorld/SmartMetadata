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
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import SsoProviderSelector from './SsoProviderSelector.vue';

function mountSelector(selectedProvider?: string) {
  return mount(SsoProviderSelector, {
    props: { selectedProvider },
    global: { plugins: [createTestI18n('en-US')] },
  });
}

describe('SsoProviderSelector', () => {
  it('renders the eight cards in pin order with hyphenated labels', () => {
    const wrapper = mountSelector();
    expect(wrapper.find('h5').text()).toBe('Choose Provider');
    const cards = wrapper.findAll('[role="button"]');
    expect(cards.map((card) => card.text())).toEqual([
      'Google',
      'Azure AD',
      'Okta',
      'SAML',
      'AWS-Cognito',
      'Custom-OIDC',
      'LDAP',
      'Auth0',
    ]);
    expect(cards.every((card) => card.attributes('tabindex') === '0')).toBe(true);
  });

  it('selects locally on click and emits only on Configure', async () => {
    const wrapper = mountSelector();
    const configure = wrapper.find('[data-testid="sso-provider-configure"]');
    expect(configure.attributes('disabled')).toBeDefined();

    const card = wrapper.find('[data-testid="sso-provider-card-okta"]');
    await card.trigger('click');
    expect(card.classes()).toContain('selected');
    expect(wrapper.emitted('provider-select')).toBeUndefined();

    await configure.trigger('click');
    expect(wrapper.emitted('provider-select')).toEqual([['okta']]);
  });

  it('selects on Enter and Space', async () => {
    const wrapper = mountSelector();
    const card = wrapper.find('[data-testid="sso-provider-card-saml"]');
    await card.trigger('keydown', { key: 'Enter' });
    expect(card.classes()).toContain('selected');
    const ldap = wrapper.find('[data-testid="sso-provider-card-ldap"]');
    await ldap.trigger('keydown', { key: ' ' });
    expect(ldap.classes()).toContain('selected');
    expect(card.classes()).not.toContain('selected');
  });

  it('seeds selection from the prop and ignores later prop changes', async () => {
    const wrapper = mountSelector('google');
    expect(
      wrapper.find('[data-testid="sso-provider-card-google"]').classes(),
    ).toContain('selected');
    expect(
      wrapper.find('[data-testid="sso-provider-configure"]').attributes('disabled'),
    ).toBeUndefined();

    await wrapper.setProps({ selectedProvider: 'okta' });
    expect(
      wrapper.find('[data-testid="sso-provider-card-google"]').classes(),
    ).toContain('selected');
    expect(
      wrapper.find('[data-testid="sso-provider-card-okta"]').classes(),
    ).not.toContain('selected');
  });
});
