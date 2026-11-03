/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import { PERSONA_LANDING_HANDLED_KEY } from '@/views/admin/personaPage';
import PersonaLandingRedirect from './PersonaLandingRedirect.vue';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mountRedirect(options: { storedPersona?: string; handled?: boolean; landing?: string }) {
  const pinia = createPinia();
  setActivePinia(pinia);
  localStorage.clear();
  sessionStorage.clear();
  if (options.storedPersona) {
    localStorage.setItem('sm.persona.v1', options.storedPersona);
  }
  if (options.handled) {
    sessionStorage.setItem(PERSONA_LANDING_HANDLED_KEY, '1');
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '', component: PersonaLandingRedirect },
      { path: '/my-data', name: 'home', component: { template: '<div>home</div>' } },
      { path: '/marketplace', name: 'marketplace-overview', component: { template: '<div>mkt</div>' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/v1/personas')) {
        return jsonResponse({
          data: [{ id: 'p1', name: 'Analyst', fullyQualifiedName: 'Analyst' }],
          paging: { total: 1 },
        });
      }
      if (url.includes('/v1/docStore/name/')) {
        return jsonResponse({
          name: 'Analyst-Analyst',
          fullyQualifiedName: 'persona.Analyst',
          entityType: 'Page',
          data: {
            pages: [],
            personaPreferences: [
              { personaId: 'p1', personaName: 'Analyst', defaultLandingPage: options.landing ?? '/my-data' },
            ],
          },
        });
      }
      return jsonResponse({});
    }),
  );
  const wrapper = mount(PersonaLandingRedirect, {
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('PersonaLandingRedirect', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('redirects the app entry to the persona landing page', async () => {
    const { router } = await mountRedirect({ storedPersona: 'p1', landing: '/marketplace' });
    expect(router.currentRoute.value.path).toBe('/marketplace');
    expect(sessionStorage.getItem(PERSONA_LANDING_HANDLED_KEY)).toBe('1');
  });

  it('resolves to Home when the landing page is the default', async () => {
    const { router } = await mountRedirect({ storedPersona: 'p1', landing: '/my-data' });
    expect(router.currentRoute.value.name).toBe('home');
  });

  it('resolves to Home when the entry was already handled', async () => {
    const { router } = await mountRedirect({ storedPersona: 'p1', landing: '/marketplace', handled: true });
    expect(router.currentRoute.value.name).toBe('home');
  });

  it('resolves to Home when no persona is selected', async () => {
    const { router } = await mountRedirect({});
    expect(router.currentRoute.value.name).toBe('home');
  });
});
