/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import { useAuthStore } from '@/stores/auth';
import GlossaryTermRelationSettingsView from './GlossaryTermRelationSettingsView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mountView(asAdmin = true) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = asAdmin
    ? { id: 'admin', name: 'admin', isAdmin: true }
    : { id: 'u9', name: 'bob' };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/admin/settings/governance/glossary-term-relations',
        name: 'admin-settings-governance-glossary-term-relations',
        component: GlossaryTermRelationSettingsView,
      },
    ],
  });
  await router.push('/admin/settings/governance/glossary-term-relations');
  await router.isReady();
  const wrapper = mount(GlossaryTermRelationSettingsView, {
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper };
}

describe('GlossaryTermRelationSettingsView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/v1/glossaryTerms/relationTypes/usage')) {
          return jsonResponse([{ relationshipType: { name: 'isA' }, count: 2 }]);
        }
        if (url.includes('/api/v1/relationshipTypes')) {
          if (init?.method === 'POST') {
            const body = JSON.parse(String(init.body));
            return jsonResponse({ id: 'r3', ...body, systemDefined: false });
          }
          if (init?.method === 'DELETE') {
            return jsonResponse({});
          }
          return jsonResponse({
            data: [
              {
                id: 'r1',
                name: 'isA',
                displayName: 'Is A',
                description: '',
                rdfPredicate: 'http://example.test/isA',
                category: 'CORE',
                characteristics: ['TRANSITIVE'],
                crossGlossaryAllowed: true,
                paletteKey: 'VIOLET',
                systemDefined: true,
              },
              {
                id: 'r2',
                name: 'partOf',
                displayName: 'Part Of',
                description: '',
                rdfPredicate: 'http://example.test/partOf',
                category: 'CUSTOM',
                characteristics: [],
                crossGlossaryAllowed: false,
                paletteKey: 'BLUE',
                systemDefined: false,
              },
            ],
            paging: { total: 2 },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lists types with usage counts and blocks edit/delete for system types', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="relation-type-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('isA');
    expect(wrapper.text()).toContain('partOf');
    expect(wrapper.find('[data-testid="edit-isA-btn"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="delete-isA-btn"]').attributes('disabled')).toBeDefined();
    // partOf is neither system-defined nor in use: its actions are live.
    expect(wrapper.find('[data-testid="edit-partOf-btn"]').attributes('disabled')).toBeUndefined();
    expect(wrapper.find('[data-testid="delete-partOf-btn"]').attributes('disabled')).toBeUndefined();
  });

  it('creates a type through the form with a POST to /v1/relationshipTypes', async () => {
    const { wrapper } = await mountView();
    await wrapper.find('[data-testid="add-relation-type-btn"]').trigger('click');
    await flushPromises();
    const name = document.querySelector('[data-testid="relation-type-name"]') as HTMLInputElement | null;
    const displayName = document.querySelector('[data-testid="relation-type-display-name"]') as HTMLInputElement | null;
    const predicate = document.querySelector('[data-testid="relation-type-rdf-predicate"]') as HTMLInputElement | null;
    expect(name).not.toBeNull();
    await new DOMWrapper(name!).setValue('relatedTo');
    await new DOMWrapper(displayName!).setValue('Related To');
    await new DOMWrapper(predicate!).setValue('http://example.test/relatedTo');
    await flushPromises();
    const okButton = document.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement | null;
    expect(okButton).not.toBeNull();
    okButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    const post = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'POST');
    expect(post).toBeDefined();
    expect(String(post?.[0])).toContain('/api/v1/relationshipTypes');
    expect(JSON.parse(String(post?.[1]?.body)).name).toBe('relatedTo');
    expect(wrapper.text()).toContain('relatedTo');
  });

  it('shows the forbidden page for non-admin users', async () => {
    const { wrapper } = await mountView(false);
    expect(wrapper.find('[data-testid="relation-type-table"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Access not allowed');
  });
});
