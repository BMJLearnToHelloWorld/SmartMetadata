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
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { encodeLoginPassword } from '@/auth/token';
import { createTestI18n } from '@/test/i18n';
import LoginView from './LoginView.vue';

async function mountLogin() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', name: 'login', component: LoginView },
      { path: '/my-data', name: 'home', component: { template: '<div>home</div>' } },
      { path: '/search', name: 'search', component: { template: '<div>search</div>' } },
    ],
  });
  await router.push('/login');
  await router.isReady();
  const wrapper = mount(LoginView, {
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
    },
  });
  return { wrapper, router };
}

describe('LoginView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/v1/users/login')) {
          const body = JSON.parse(String(init?.body ?? '{}')) as { email?: string; password?: string };
          expect(body.password).toBe(encodeLoginPassword('admin'));
          return new Response(JSON.stringify({ accessToken: 'jwt-1', tokenType: 'Bearer' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.includes('/api/v1/users/loggedInUser')) {
          return new Response(JSON.stringify({ name: 'admin', email: 'admin@open-metadata.org' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.includes('/api/v1/system/config/auth')) {
          return new Response(JSON.stringify({ provider: 'basic' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders the sign-in form', async () => {
    const { wrapper } = await mountLogin();
    expect(wrapper.text()).toContain('Sign In');
    expect(wrapper.text()).toContain('Sign in with your catalog account.');
    expect(wrapper.text()).not.toMatch(/Base64/);
    expect(wrapper.find('[data-testid="login-email"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="login-submit"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="locale-switcher"]').exists()).toBe(true);
  });

  it('submits a Base64 password to the login API and persists the token', async () => {
    const { wrapper, router } = await mountLogin();
    await wrapper.find('[data-testid="login-email"]').setValue('admin@open-metadata.org');
    await wrapper.find('[data-testid="login-password"]').setValue('admin');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(fetch).toHaveBeenCalled();
    const stored = JSON.parse(localStorage.getItem('sm.auth.v1') ?? 'null') as { accessToken?: string };
    expect(stored.accessToken).toBe('jwt-1');
    expect(router.currentRoute.value.name).toBe('home');
  });

  it('renders the SSO sign-in button with the official brand name (R7)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('/api/v1/system/config/auth')) {
          return new Response(
            JSON.stringify({
              provider: 'okta',
              providerName: 'Company Okta',
              authority: 'https://example.okta.com',
              callbackUrl: 'https://example.com/callback',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountLogin();
    await flushPromises();
    expect(wrapper.find('[data-testid="sso-signin"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Sign in with Okta');
  });

  it('renders the unsupported-provider warning instead of a button for unknown providers (R7)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('/api/v1/system/config/auth')) {
          return new Response(JSON.stringify({ provider: 'mystery-sso' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountLogin();
    await flushPromises();
    expect(wrapper.find('[data-testid="sso-signin"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="sso-unsupported"]').exists()).toBe(true);
  });

  it('hides the password form and explains SSO when the server is OIDC-only', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('/api/v1/system/config/auth')) {
          return new Response(
            JSON.stringify({
              provider: 'okta',
              providerName: 'Company Okta',
              authority: 'https://example.okta.com',
              callbackUrl: 'https://example.com/callback',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountLogin();
    await flushPromises();
    expect(wrapper.find('[data-testid="sso-only-message"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Company Okta');
    expect(wrapper.find('[data-testid="login-submit"]').exists()).toBe(false);
  });
});
