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
import { createTestI18n } from '@/test/i18n';
import { useAuthStore } from '@/stores/auth';
import SparqlPlaygroundView from './SparqlPlaygroundView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mountPlayground(asAdmin = false) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = asAdmin
    ? { id: 'admin', name: 'admin', isAdmin: true }
    : { id: 'u9', name: 'bob' };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/govern/sparql',
        name: 'sparql-playground',
        component: SparqlPlaygroundView,
      },
    ],
  });
  await router.push('/govern/sparql');
  await router.isReady();
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.includes('/v1/rdf/status')) {
        return jsonResponse({ enabled: true, inference: { availableLevels: ['RDFS', 'OWL_DL'] } });
      }
      if (url.includes('/v1/rdf/queries/saved') && (!init?.method || init?.method === 'GET')) {
        return jsonResponse({ queries: [] });
      }
      if (url.includes('/v1/rdf/queries/templates') && (!init?.method || init?.method === 'GET')) {
        return jsonResponse({ queries: [] });
      }
      if (url.includes('/v1/rdf/sparql')) {
        return new Response(
          JSON.stringify({
            head: { vars: ['s', 'p'] },
            results: {
              bindings: [
                { s: { type: 'uri', value: 'https://example.test/a' }, p: { type: 'uri', value: 'https://example.test/p' } },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/sparql-results+json' } },
        );
      }
      if (url.includes('/v1/rdf/queries/saved') && init?.method === 'PUT') {
        return jsonResponse({});
      }
      return jsonResponse({});
    }),
  );
  const wrapper = mount(SparqlPlaygroundView, {
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
    },
  });
  await flushPromises();
  return { wrapper, requests };
}

describe('SparqlPlaygroundView', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders the console with the default query and inference options', async () => {
    const { wrapper } = await mountPlayground();
    expect(wrapper.find('[data-testid="sparql-console"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="sparql-editor"]').exists()).toBe(true);
    const editor = wrapper.find('[data-testid="sparql-editor"]').find('textarea')
      .element as HTMLTextAreaElement;
    expect(editor.value).toContain('PREFIX om:');
    const inferenceSelect = wrapper.find('[data-testid="sparql-inference-select"]');
    const selector = inferenceSelect.element.querySelector('.ant-select-selector') as HTMLElement;
    selector.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    selector.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    const options = Array.from(document.body.querySelectorAll('.ant-select-item-option')).map(
      (option) => option.textContent,
    );
    expect(options).toContain('RDFS');
    expect(options).toContain('OWL');
  });

  it('runs a query and renders tabular results', async () => {
    const { wrapper, requests } = await mountPlayground();
    await wrapper.find('[data-testid="sparql-run"]').trigger('click');
    await flushPromises();
    const sparqlCall = requests.find((request) => request.url.includes('/v1/rdf/sparql'));
    expect(sparqlCall).toBeDefined();
    expect(sparqlCall?.init?.headers).toMatchObject({
      Accept: 'application/sparql-results+json',
    });
    expect(wrapper.find('[data-testid="sparql-result"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('https://example.test/a');
  });

  it('saves a query to the personal library', async () => {
    const { wrapper, requests } = await mountPlayground();
    await wrapper.find('[data-testid="sparql-save-query"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="sparql-save-name-input"]').setValue('my query');
    await wrapper.find('.ant-modal-footer .ant-btn-primary').trigger('click');
    await flushPromises();
    const save = requests.find(
      (request) => request.url.includes('/v1/rdf/queries/saved') && request.init?.method === 'PUT',
    );
    expect(save).toBeDefined();
    const body = JSON.parse(String(save?.init?.body)) as Record<string, unknown>;
    const queries = body.queries as Array<Record<string, unknown>>;
    expect(queries).toHaveLength(1);
    expect(queries[0].name).toBe('my query');
  });

  it('hides the save-as-sample action from non-admin users', async () => {
    const { wrapper } = await mountPlayground(false);
    expect(wrapper.find('[data-testid="sparql-save-template"]').exists()).toBe(false);
  });

  it('shows the save-as-sample action to admins', async () => {
    const { wrapper } = await mountPlayground(true);
    expect(wrapper.find('[data-testid="sparql-save-template"]').exists()).toBe(true);
  });
});
