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
import { useAuthStore } from '@/stores/auth';
import { createTestI18n } from '@/test/i18n';
import PersonaCustomizeView from './PersonaCustomizeView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const PERSONA = { id: 'p1', name: 'Analyst', fullyQualifiedName: 'Analyst' };
const DOC = {
  id: 'doc1',
  name: 'Analyst-Analyst',
  fullyQualifiedName: 'persona.Analyst',
  entityType: 'Page',
  data: {
    pages: [{ pageType: 'LandingPage', layout: { widgets: [] } }],
    personaPreferences: [{ personaId: 'p1', personaName: 'Analyst', appMode: 'classic' }],
  },
};

async function mountCustomize(category: string, docStatus = 200) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = { id: 'admin', name: 'admin', isAdmin: true };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/admin/settings/persona/:fqn/customize/:category',
        name: 'admin-settings-persona-customize',
        component: PersonaCustomizeView,
        props: true,
      },
      {
        path: '/admin/settings/persona/:fqn',
        name: 'admin-settings-persona-detail',
        component: { template: '<div>detail</div>' },
      },
    ],
  });
  await router.push(`/admin/settings/persona/Analyst/customize/${category}`);
  await router.isReady();
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.includes('/v1/personas/name/')) {
        return jsonResponse({ ...PERSONA });
      }
      if (url.includes('/v1/docStore/name/')) {
        return docStatus === 200 ? jsonResponse({ ...DOC }) : new Response('Not found', { status: 404 });
      }
      if (url.includes('/v1/docStore/doc1') && init?.method === 'PATCH') {
        return jsonResponse({ ...DOC });
      }
      return jsonResponse({});
    }),
  );
  const wrapper = mount(PersonaCustomizeView, {
    props: { fqn: 'Analyst', category },
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router, requests };
}

describe('PersonaCustomizeView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('dispatches app-layout to the app layout editor', async () => {
    const { wrapper } = await mountCustomize('app-layout');
    expect(wrapper.find('[data-testid="app-layout-editor"]').exists()).toBe(true);
  });

  it('dispatches LandingPage to the page JSON editor with the stored page', async () => {
    const { wrapper } = await mountCustomize('LandingPage');
    expect(wrapper.find('[data-testid="page-json-editor"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="page-json-textarea"]').element.value).toContain('LandingPage');
  });

  it('dispatches governance to the entity overlay', async () => {
    const { wrapper } = await mountCustomize('governance');
    expect(wrapper.find('[data-testid="entity-customize-overlay"]').exists()).toBe(true);
  });

  it('renders no fake editor for an unknown category', async () => {
    const { wrapper } = await mountCustomize('navigation');
    expect(wrapper.find('[data-testid="persona-customize-unknown"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="app-layout-editor"]').exists()).toBe(false);
  });

  it('falls back to the empty document template on 404', async () => {
    const { wrapper } = await mountCustomize('LandingPage', 404);
    expect(wrapper.find('[data-testid="page-json-editor"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="page-json-textarea"]').element.value).toContain('LandingPage');
  });
});
