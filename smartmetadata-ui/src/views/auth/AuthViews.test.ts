/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import ForgotPasswordView from './ForgotPasswordView.vue';
import LogoutView from './LogoutView.vue';
import ResetPasswordView from './ResetPasswordView.vue';
import SamlCallbackView from './SamlCallbackView.vue';
import SignUpView from './SignUpView.vue';

const LoginStub = { template: '<div>login</div>' };
const HomeStub = { template: '<div>home</div>' };

async function mountView(component: unknown, path: string, query: Record<string, string> = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', name: 'login', component: LoginStub },
      { path: '/my-data', name: 'home', component: HomeStub },
      { path: '/signup', name: 'signup', component: SignUpView },
      { path: '/forgot-password', name: 'forgot-password', component: ForgotPasswordView },
      { path: '/reset-password', name: 'reset-password', component: ResetPasswordView },
      { path: '/saml-callback', name: 'saml-callback', component: SamlCallbackView },
      { path: '/logout', name: 'logout', component: LogoutView },
    ],
  });
  await router.push({ path, query });
  await router.isReady();
  const wrapper = mount(component as never, { global: { plugins: [pinia, router, Antd, createTestI18n()] } });
  await flushPromises();
  return { wrapper, router };
}

function stubFetch(handler: (url: string) => Response) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => handler(String(input))));
}

describe('auth views (Stage 9)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('withholds the signup form when the server disables self-registration', async () => {
    stubFetch((url) =>
      url.includes('/api/v1/system/config/auth')
        ? new Response(JSON.stringify({ provider: 'basic', enableSelfSignup: false }), { status: 200 })
        : new Response('not found', { status: 404 }),
    );
    const { wrapper } = await mountView(SignUpView, '/signup');
    expect(wrapper.find('[data-testid="signup-disabled"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="signup-submit"]').exists()).toBe(false);
  });

  it('shows the forgot-password success state after the link request', async () => {
    stubFetch(() => new Response('200', { status: 200 }));
    const { wrapper } = await mountView(ForgotPasswordView, '/forgot-password');
    const inputs = wrapper.findAll('input');
    await inputs[0]?.setValue('ada@example.org');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(wrapper.find('[data-testid="forgot-sent"]').exists()).toBe(true);
  });

  it('renders an honest error when the reset link lacks token or username', async () => {
    stubFetch(() => new Response('not found', { status: 404 }));
    const { wrapper } = await mountView(ResetPasswordView, '/reset-password', { user: 'ada' });
    expect(wrapper.find('[data-testid="reset-missing-params"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="reset-submit"]').exists()).toBe(false);
  });

  it('renders an honest error when the SAML response carries no id_token', async () => {
    stubFetch(() => new Response('not found', { status: 404 }));
    const { wrapper } = await mountView(SamlCallbackView, '/saml-callback', { name: 'ada' });
    expect(wrapper.find('[data-testid="saml-error"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('did not include an identity token');
  });

  it('completes SAML login from a query id_token and lands on my-data', async () => {
    stubFetch((url) => {
      if (url.includes('/api/v1/users/loggedInUser')) {
        return new Response(JSON.stringify({ name: 'ada', email: 'ada@example.org' }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });
    const { router } = await mountView(SamlCallbackView, '/saml-callback', {
      id_token: 'oidc-token-1',
      email: 'ada@example.org',
    });
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('home');
    expect(localStorage.getItem('sm.auth.v1')).toContain('oidc-token-1');
  });

  it('logs out through the /logout route and lands on login', async () => {
    stubFetch(() => new Response('{}', { status: 200 }));
    const { router } = await mountView(LogoutView, '/logout');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('login');
  });
});
