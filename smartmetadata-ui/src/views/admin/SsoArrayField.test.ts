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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import SsoArrayField from './SsoArrayField.vue';

function mountField(props: Record<string, unknown> = {}) {
  return mount(SsoArrayField, {
    props: {
      fieldId: 'root/authenticationConfiguration/publicKeyUrls',
      name: 'publicKeyUrls',
      label: 'Public Key Urls',
      modelValue: [],
      placeholder: 'Enter each value and press Enter',
      ...props,
    },
    global: { plugins: [createTestI18n('en-US')] },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SsoArrayField', () => {
  it('renders the label with required class and deprecated badge', () => {
    const wrapper = mountField({ required: true, deprecated: true });
    const label = wrapper.find('.sso-array-field-label');
    expect(label.text()).toContain('Public Key Urls');
    expect(label.classes()).toContain('required-field');
    expect(label.text()).toContain('Deprecated');
  });

  it('removes a chip with change plus clear-error', async () => {
    const wrapper = mountField({ modelValue: ['a', 'b'] });
    const chips = wrapper.findAll('[data-testid="sso-array-chip"]');
    expect(chips.length).toBe(2);
    await chips[0].find('button').trigger('click');
    expect(wrapper.emitted('change')).toEqual([[['b']]]);
    expect(wrapper.emitted('clear-error')).toEqual([
      ['root/authenticationConfiguration/publicKeyUrls'],
    ]);
  });

  it('inserts CSV-split values on Enter, deduplicated, without clear-error', async () => {
    const wrapper = mountField({
      fieldId: 'root/authenticationConfiguration/jwtPrincipalClaims',
      name: 'jwtPrincipalClaims',
      modelValue: ['email'],
    });
    const input = wrapper.find('input');
    await input.setValue('email,sub,"a,b"');
    await input.trigger('keydown.enter');
    expect(wrapper.emitted('change')).toEqual([[['email', 'sub', 'a,b']]]);
    expect(wrapper.emitted('clear-error')).toBeUndefined();
    expect((input.element as HTMLInputElement).value).toBe('');
  });

  it('adds the whole input for URL fields even when invalid and shows the hint', async () => {
    const wrapper = mountField({
      isUrlField: true,
      modelValue: ['https://ok.example.com'],
    });
    expect(wrapper.find('.sso-array-field-hint').exists()).toBe(false);
    const input = wrapper.find('input');
    await input.setValue('not-a-url');
    await input.trigger('keydown.enter');
    expect(wrapper.emitted('change')).toEqual([
      [['https://ok.example.com', 'not-a-url']],
    ]);

    await wrapper.setProps({
      modelValue: ['https://ok.example.com', 'not-a-url'],
    });
    expect(wrapper.find('.sso-array-field-hint').exists()).toBe(true);
    expect(wrapper.find('.sso-array-field-hint').text()).toBe(
      'Please enter valid URLs (e.g., https://example.com)',
    );
    expect(wrapper.find('.field-error').classes()).toContain('has-error');
  });

  it('converts scope between string storage and array UI', async () => {
    const wrapper = mountField({
      fieldId: 'root/authenticationConfiguration/oidcConfiguration/scope',
      name: 'scope',
      isScopeField: true,
      modelValue: 'openid email profile',
    });
    expect(wrapper.findAll('[data-testid="sso-array-chip"]').length).toBe(3);
    const input = wrapper.find('input');
    await input.setValue('extra');
    await input.trigger('keydown.enter');
    expect(wrapper.emitted('change')).toEqual([
      ['openid email profile extra'],
    ]);
  });

  it('pastes a JSON array, deduplicated', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { readText: vi.fn().mockResolvedValue('["x", 7]') },
    });
    const wrapper = mountField({ modelValue: ['x'] });
    const input = wrapper.find('input');
    await input.trigger('keydown', { key: 'v', ctrlKey: true });
    await vi.waitFor(() => {
      expect(wrapper.emitted('change')).toEqual([[['x', '7']]]);
    });
  });

  it('falls back to CSV splitting when pasted text is not JSON', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { readText: vi.fn().mockResolvedValue('a, b') },
    });
    const wrapper = mountField();
    await wrapper
      .find('input')
      .trigger('keydown', { key: 'v', metaKey: true });
    await vi.waitFor(() => {
      expect(wrapper.emitted('change')).toEqual([[['a', 'b']]]);
    });
  });

  it('emits nothing when pasted JSON is not an array', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { readText: vi.fn().mockResolvedValue('"just a string"') },
    });
    const wrapper = mountField();
    await wrapper.find('input').trigger('keydown', { key: 'v', ctrlKey: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(wrapper.emitted('change')).toBeUndefined();
  });

  it('renders a select for enum options and inserts via change plus clear-error', async () => {
    const wrapper = mountField({
      options: ['one', 'two'],
      modelValue: ['one'],
    });
    expect(wrapper.find('input').exists()).toBe(false);
    const select = wrapper.find('select');
    expect(select.findAll('option').map((o) => o.text())).toEqual([
      'Enter each value and press Enter',
      'two',
    ]);
    await select.setValue('two');
    expect(wrapper.emitted('change')).toEqual([[['one', 'two']]]);
    expect(wrapper.emitted('clear-error')).toBeDefined();
  });

  it('marks has-error from field errors alone', () => {
    const wrapper = mountField({ hasFieldError: true });
    expect(wrapper.find('.field-error').classes()).toContain('has-error');
    expect(wrapper.find('.sso-array-field-hint').exists()).toBe(false);
  });
});
