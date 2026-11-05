/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { AUTH_STORAGE_KEY } from '@/auth/token';
import { createTestI18n } from '@/test/i18n';
import { useAuthStore } from '@/stores/auth';
import DocsView from './DocsView.vue';

vi.mock('rapidoc', () => ({}));

async function mountDocs(pinia = createPinia()) {
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/docs', name: 'docs', component: DocsView }],
  });
  await router.push({ name: 'docs' });
  await router.isReady();
  const wrapper = mount(DocsView, {
    global: {
      plugins: [router, Antd, pinia, createTestI18n()],
      stubs: { 'rapi-doc': true },
    },
  });
  await flushPromises();
  return wrapper;
}

describe('DocsView', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders in-page RapiDoc against /api/swagger.json with bearer auth', async () => {
    window.localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        accessToken: 'fakeToken',
        tokenType: 'Bearer',
        email: 'admin@example.com',
      }),
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    useAuthStore().hydrate();

    const wrapper = await mountDocs(pinia);
    const rapidoc = wrapper.find('[data-testid="docs-rapidoc"]');
    expect(rapidoc.exists()).toBe(true);
    expect(rapidoc.attributes('spec-url')).toBe('/api/swagger.json');
    expect(rapidoc.attributes('api-key-name')).toBe('Authorization');
    expect(rapidoc.attributes('api-key-location')).toBe('header');
    expect(rapidoc.attributes('api-key-value')).toBe('Bearer fakeToken');
    expect(wrapper.find('[data-testid="docs-swagger-frame"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="docs-spec-download"]').attributes('href')).toBe(
      '/api/swagger.json',
    );
  });

  it('shows a loading placeholder when there is no session token yet', async () => {
    const wrapper = await mountDocs();
    expect(wrapper.find('[data-testid="docs-rapidoc-loading"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="docs-rapidoc"]').exists()).toBe(false);
  });
});
