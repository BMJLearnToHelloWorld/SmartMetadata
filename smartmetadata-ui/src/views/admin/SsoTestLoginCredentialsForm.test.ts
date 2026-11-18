/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import SsoTestLoginCredentialsForm from './SsoTestLoginCredentialsForm.vue';

function mountForm(isSubmitting = false) {
  return mount(SsoTestLoginCredentialsForm, {
    props: { isSubmitting },
    global: { plugins: [Antd, createTestI18n('en-US')] },
  });
}

async function fillAndSubmit(
  wrapper: ReturnType<typeof mountForm>,
  email: string,
  password: string,
) {
  await wrapper.find('[data-testid="sso-test-login-email"]').setValue(email);
  await wrapper.find('input[type="password"]').setValue(password);
  await wrapper.find('form').trigger('submit');
  await flushPromises();
}

describe('SsoTestLoginCredentialsForm', () => {
  it('explains the one-time use and marks the fields autocomplete-safe', () => {
    const wrapper = mountForm();
    expect(wrapper.text()).toContain(
      'Enter the email and password of an account in this directory. They are used once to verify the sign-in and are never stored.',
    );
    expect(wrapper.find('[data-testid="sso-test-login-email"]').attributes('autocomplete')).toBe(
      'off',
    );
    expect(wrapper.find('[data-testid="sso-test-login-password"]').exists()).toBe(true);
    expect(wrapper.find('input[type="password"]').attributes('autocomplete')).toBe('new-password');
  });

  it('requires an email and a password', async () => {
    const wrapper = mountForm();
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.findAll('.ant-form-item-has-error').length).toBeGreaterThanOrEqual(2);
  });

  it('rejects a malformed email and accepts a well-formed one', async () => {
    const wrapper = mountForm();
    await fillAndSubmit(wrapper, 'a@b', 'secret');
    expect(wrapper.emitted('submit')).toBeUndefined();
    await fillAndSubmit(wrapper, 'a@b.c', 'secret');
    expect(wrapper.emitted('submit')).toEqual([['a@b.c', 'secret']]);
  });

  it('requires the password even with a valid email', async () => {
    const wrapper = mountForm();
    await fillAndSubmit(wrapper, 'a@b.c', '');
    expect(wrapper.emitted('submit')).toBeUndefined();
  });

  it('disables the submit button while submitting', () => {
    const wrapper = mountForm(true);
    const button = wrapper.find('[data-testid="sso-test-login-submit-credentials"]');
    expect(button.attributes('disabled')).toBeDefined();
    expect(button.classes()).toContain('ant-btn-loading');
  });

  it('keeps the typed values after submitting', async () => {
    const wrapper = mountForm();
    await fillAndSubmit(wrapper, 'admin@example.test', 'secret');
    expect(wrapper.emitted('submit')).toEqual([['admin@example.test', 'secret']]);
    expect(
      (wrapper.find('[data-testid="sso-test-login-email"]').element as HTMLInputElement).value,
    ).toBe('admin@example.test');
    expect(
      (wrapper.find('input[type="password"]').element as HTMLInputElement).value,
    ).toBe('secret');
  });
});
