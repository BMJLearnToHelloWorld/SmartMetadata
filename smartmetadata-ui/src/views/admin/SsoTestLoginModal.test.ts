/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import Antd, { Modal } from 'ant-design-vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TestLoginResult } from '@/api/system';
import type { ConfigurationCheckState } from '@/composables/useSsoTestLogin';
import { createTestI18n } from '@/test/i18n';
import SsoTestLoginModal from './SsoTestLoginModal.vue';

interface ModalProps {
  open?: boolean;
  isTesting?: boolean;
  isAwaitingCredentials?: boolean;
  configurationCheck?: ConfigurationCheckState;
  result?: TestLoginResult;
  error?: string;
}

const onSubmitCredentials = vi.fn(async () => {});

function mountModal(props: ModalProps = {}) {
  return mount(SsoTestLoginModal, {
    props: {
      open: props.open ?? true,
      isTesting: props.isTesting ?? false,
      isAwaitingCredentials: props.isAwaitingCredentials ?? false,
      configurationCheck: props.configurationCheck,
      result: props.result,
      error: props.error,
      onSubmitCredentials,
    },
    global: { plugins: [Antd, createTestI18n('en-US')] },
  });
}

function bodyText(): string {
  return document.body.textContent ?? '';
}

function bodyQuery(selector: string): Element | null {
  return document.body.querySelector(selector);
}

describe('SsoTestLoginModal', () => {
  let wrapper: VueWrapper | undefined;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    onSubmitCredentials.mockClear();
    document.body.innerHTML = '';
  });

  it('renders the title and description', () => {
    wrapper = mountModal();
    expect(bodyQuery('[data-testid="sso-test-login-modal"]')).not.toBeNull();
    expect(bodyText()).toContain('Test Login');
    expect(bodyText()).toContain(
      'Checks these unsaved settings the way a save does, then signs in with them. Your current session is never changed.',
    );
  });

  it('shows the error alert with the failure reason', () => {
    wrapper = mountModal({ error: 'The IdP refused the request.' });
    const alert = bodyQuery('[data-testid="sso-test-login-error"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain('The IdP refused the request.');
  });

  it('shows the success outcome with the signed-in email', () => {
    wrapper = mountModal({
      result: { status: 'success', resolvedEmail: 'admin@example.test' },
    });
    const alert = bodyQuery('[data-testid="sso-test-login-success"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain('Success');
    expect(alert?.textContent).toContain(
      'You signed in successfully as admin@example.test. These settings are safe to save.',
    );
  });

  it('shows the joined server errors for a failed outcome', () => {
    wrapper = mountModal({
      result: { status: 'failed', errors: ['first reason', 'second reason'] },
    });
    const alert = bodyQuery('[data-testid="sso-test-login-failed"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain('first reason second reason');
  });

  it('shows the generic failure text when a failed outcome carries no errors', () => {
    wrapper = mountModal({ result: { status: 'failed' } });
    const alert = bodyQuery('[data-testid="sso-test-login-failed"]');
    expect(alert?.textContent).toContain(
      'Sign-in completed, but this configuration would reject the login.',
    );
  });

  it('shows the waiting text while testing, and the checking text while the check runs', async () => {
    wrapper = mountModal({ isTesting: true });
    expect(bodyQuery('[data-testid="sso-test-login-loading"]')?.textContent).toContain(
      'Complete the sign-in in the popup window to continue.',
    );
    await wrapper.setProps({ configurationCheck: { status: 'running', problems: [] } });
    await flushPromises();
    expect(bodyQuery('[data-testid="sso-test-login-loading"]')?.textContent).toContain(
      'Checking the configuration before signing in…',
    );
  });

  it('shows the credentials form while awaiting credentials and forwards the submit', async () => {
    wrapper = mountModal({ isAwaitingCredentials: true });
    expect(bodyQuery('[data-testid="sso-test-login-credentials-form"]')).not.toBeNull();
    expect(bodyQuery('[data-testid="sso-test-login-loading"]')).toBeNull();
    const email = bodyQuery('[data-testid="sso-test-login-email"]') as HTMLInputElement;
    const password = bodyQuery('input[type="password"]') as HTMLInputElement;
    email.value = 'admin@example.test';
    email.dispatchEvent(new Event('input', { bubbles: true }));
    password.value = 'secret';
    password.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();
    bodyQuery('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();
    expect(onSubmitCredentials).toHaveBeenCalledWith('admin@example.test', 'secret');
  });

  it('renders the configuration row first, then stages, skipping skipped stages', () => {
    wrapper = mountModal({
      configurationCheck: { status: 'passed', problems: [] },
      result: {
        status: 'pending',
        stages: [
          { stage: 'STARTED', status: 'passed' },
          { stage: 'REDIRECTED', status: 'running' },
          { stage: 'TOKEN_REFRESHED', status: 'skipped' },
        ],
      },
    });
    const stages = bodyQuery('[data-testid="sso-test-login-stages"]');
    expect(stages).not.toBeNull();
    const rows = [...(stages?.querySelectorAll('[data-testid^="sso-test-login-stage-"]') ?? [])].map(
      (row) => row.getAttribute('data-testid'),
    );
    expect(rows).toEqual([
      'sso-test-login-stage-configuration',
      'sso-test-login-stage-STARTED',
      'sso-test-login-stage-REDIRECTED',
    ]);
    expect(bodyQuery('[data-testid="sso-test-login-stage-configuration"]')?.textContent).toContain(
      'Configuration checked',
    );
    expect(bodyQuery('[data-testid="sso-test-login-stage-STARTED"]')?.textContent).toContain(
      'Passed',
    );
    expect(bodyQuery('[data-testid="sso-test-login-stage-REDIRECTED"]')?.textContent).toContain(
      'Running...',
    );
  });

  it('renders an unreached stage as did-not-run once the test has settled', () => {
    wrapper = mountModal({
      result: {
        status: 'success',
        stages: [
          { stage: 'STARTED', status: 'passed' },
          { stage: 'DOMAIN_CHECKED', status: 'pending' },
        ],
      },
    });
    expect(bodyQuery('[data-testid="sso-test-login-stage-DOMAIN_CHECKED"]')?.textContent).toContain(
      "Didn't run",
    );
  });

  it('shows failed configuration problems on the configuration row', () => {
    wrapper = mountModal({
      configurationCheck: { status: 'failed', problems: ['authority is bad', 'client id is bad'] },
    });
    const row = bodyQuery('[data-testid="sso-test-login-stage-configuration"]');
    expect(row?.textContent).toContain('authority is bad');
    expect(row?.textContent).toContain('client id is bad');
    expect(row?.textContent).toContain('Failed');
  });

  it('shows only valued identity rows', () => {
    wrapper = mountModal({
      result: {
        status: 'success',
        resolvedPrincipal: 'admin',
        resolvedEmail: 'admin@example.test',
        mappedRoles: ['DataConsumer', 'DataSteward'],
        mappedTeams: [],
      },
    });
    const details = bodyQuery('[data-testid="sso-test-login-details"]');
    expect(details?.textContent).toContain('admin');
    expect(details?.textContent).toContain('admin@example.test');
    expect(details?.textContent).toContain('DataConsumer, DataSteward');
    expect(details?.textContent).not.toContain('Teams');
    expect(details?.textContent).not.toContain('Domain');
  });

  it('shows the domain row when enforced or failed, with Failed for an unknown outcome', () => {
    wrapper = mountModal({
      result: {
        status: 'success',
        domainCheck: { enforced: true, passed: true, resolvedDomain: 'example.test' },
      },
    });
    expect(bodyQuery('[data-testid="sso-test-login-details"]')?.textContent).toContain(
      'example.test (Success)',
    );
    wrapper.unmount();
    wrapper = mountModal({
      result: {
        status: 'failed',
        domainCheck: { enforced: false, passed: false, resolvedDomain: 'other.test' },
      },
    });
    expect(bodyQuery('[data-testid="sso-test-login-details"]')?.textContent).toContain(
      'other.test (Failed)',
    );
    wrapper.unmount();
    wrapper = mountModal({
      result: {
        status: 'failed',
        domainCheck: { enforced: false, passed: true, resolvedDomain: 'example.test' },
      },
    });
    expect(bodyQuery('[data-testid="sso-test-login-details"]')?.textContent).not.toContain('Domain');
    wrapper.unmount();
    wrapper = mountModal({
      result: { status: 'failed', domainCheck: { enforced: true } },
    });
    expect(bodyQuery('[data-testid="sso-test-login-details"]')?.textContent).toContain('- (Failed)');
  });

  it('emits close from the Close button', async () => {
    wrapper = mountModal();
    (bodyQuery('[data-testid="sso-test-login-close"]') as HTMLElement).click();
    await flushPromises();
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('emits close from the dialog close control and leaves overlay/Escape dismissal enabled', async () => {
    wrapper = mountModal();
    const modal = wrapper.findComponent(Modal);
    // Unset means the library default: overlay and Escape dismiss the modal.
    expect(modal.props('maskClosable')).not.toBe(false);
    expect(modal.props('keyboard')).not.toBe(false);
    (bodyQuery('.ant-modal-close') as HTMLElement).click();
    await flushPromises();
    expect(wrapper.emitted('close')).toHaveLength(1);
  });
});
