/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import { useAuthStore } from '@/stores/auth';
import RegistrationConfirmationView from './RegistrationConfirmationView.vue';
import SsoSignUpView from './SsoSignUpView.vue';

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
      { path: '/signup/sso', name: 'sso-signup', component: SsoSignUpView },
      { path: '/users/registrationConfirmation', name: 'registration-confirmation', component: RegistrationConfirmationView },
    ],
  });
  await router.push({ path, query });
  await router.isReady();
  const wrapper = mount(component as never, { global: { plugins: [pinia, router, Antd, createTestI18n()] } });
  await flushPromises();
  return { wrapper, router, pinia };
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)));
}

describe('R7 auth views', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('redirects the SSO complete-profile page to login when there is no newUser', async () => {
    stubFetch(() => new Response('not found', { status: 404 }));
    const { router } = await mountView(SsoSignUpView, '/signup/sso');
    expect(router.currentRoute.value.name).toBe('login');
  });

  it('creates the SSO account from a pre-seeded newUser profile and lands on my-data', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useAuthStore().newUser = { name: '', email: 'ada@example.org' };
    stubFetch((url, init) => {
      if (url.includes('/api/v1/teams')) {
        return new Response(JSON.stringify({ data: [], paging: {} }), { status: 200 });
      }
      if (url.includes('/api/v1/users') && init?.method === 'POST') {
        return new Response(JSON.stringify({ id: 'u1', name: 'ada', email: 'ada@example.org' }), { status: 200 });
      }
      if (url.includes('/api/v1/users/loggedInUser')) {
        return new Response(JSON.stringify({ name: 'ada', email: 'ada@example.org' }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/login', name: 'login', component: LoginStub },
        { path: '/my-data', name: 'home', component: HomeStub },
        { path: '/signup/sso', name: 'sso-signup', component: SsoSignUpView },
      ],
    });
    await router.push('/signup/sso');
    await router.isReady();
    const wrapper = mount(SsoSignUpView, { global: { plugins: [pinia, router, Antd, createTestI18n()] } });
    await flushPromises();
    expect(wrapper.find('[data-testid="sso-signup-email"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="sso-signup-submit"]').exists()).toBe(true);
    const input = wrapper.find('[data-testid="sso-signup-full-name"]');
    await input.setValue('Ada Lovelace');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('home');
    expect(useAuthStore().newUser).toBeNull();
  });

  it('shows the verified state when registration confirmation returns data', async () => {
    stubFetch((url) =>
      url.includes('/registrationConfirmation')
        ? new Response(JSON.stringify({ id: 'u1' }), { status: 200 })
        : new Response('not found', { status: 404 }),
    );
    const { wrapper } = await mountView(RegistrationConfirmationView, '/users/registrationConfirmation', {
      token: 'reg-1',
    });
    expect(wrapper.find('[data-testid="registration-verified"]').exists()).toBe(true);
  });

  it('shows the expired state when registration confirmation fails', async () => {
    stubFetch(() => new Response('not found', { status: 404 }));
    const { wrapper } = await mountView(RegistrationConfirmationView, '/users/registrationConfirmation', {
      token: 'reg-1',
    });
    expect(wrapper.find('[data-testid="registration-expired"]').exists()).toBe(true);
  });

  it('shows the expired state without requesting when the token is missing', async () => {
    const mock = vi.fn(async () => new Response('not found', { status: 404 }));
    vi.stubGlobal('fetch', mock);
    const { wrapper } = await mountView(RegistrationConfirmationView, '/users/registrationConfirmation');
    expect(wrapper.find('[data-testid="registration-expired"]').exists()).toBe(true);
    expect(mock).not.toHaveBeenCalled();
  });
});
