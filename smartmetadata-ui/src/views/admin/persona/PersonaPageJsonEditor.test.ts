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
import { createTestI18n } from '@/test/i18n';
import type { Persona, PersonaDocument } from '@/types/persona';
import PersonaPageJsonEditor from './PersonaPageJsonEditor.vue';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const PERSONA: Persona = { id: 'p1', name: 'Analyst', fullyQualifiedName: 'Analyst' };
const DOC: PersonaDocument = {
  id: 'doc1',
  name: 'Analyst-Analyst',
  fullyQualifiedName: 'persona.Analyst',
  entityType: 'Page',
  data: {
    pages: [{ pageType: 'LandingPage', layout: { widgets: [] } }],
    personaPreferences: [],
  },
};

async function mountEditor() {
  setActivePinia(createPinia());
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      return jsonResponse({ ...DOC });
    }),
  );
  const wrapper = mount(PersonaPageJsonEditor, {
    props: { persona: PERSONA, document: DOC, pageType: 'LandingPage' },
    global: { plugins: [Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, requests };
}

describe('PersonaPageJsonEditor', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('saves the edited page with a pages replace PATCH', async () => {
    const { wrapper, requests } = await mountEditor();
    await wrapper
      .find('[data-testid="page-json-textarea"]')
      .setValue(JSON.stringify({ pageType: 'LandingPage', layout: { widgets: ['x'] } }, null, 2));
    await wrapper.find('[data-testid="page-json-save"]').trigger('click');
    await flushPromises();
    const patch = requests.find((req) => req.init?.method === 'PATCH');
    expect(patch).toBeDefined();
    const body = JSON.parse(String(patch?.init?.body)) as Array<Record<string, unknown>>;
    expect(body).toEqual([
      {
        op: 'replace',
        path: '/data/pages',
        value: [{ pageType: 'LandingPage', layout: { widgets: ['x'] } }],
      },
    ]);
  });

  it('refuses invalid JSON without calling the server', async () => {
    const { wrapper, requests } = await mountEditor();
    await wrapper.find('[data-testid="page-json-textarea"]').setValue('{not json');
    await wrapper.find('[data-testid="page-json-save"]').trigger('click');
    await flushPromises();
    expect(requests).toHaveLength(0);
    expect(wrapper.find('[data-testid="page-json-error"]').exists()).toBe(true);
  });

  it('refuses a changed pageType without calling the server', async () => {
    const { wrapper, requests } = await mountEditor();
    await wrapper
      .find('[data-testid="page-json-textarea"]')
      .setValue(JSON.stringify({ pageType: 'DataMarketplace', layout: {} }));
    await wrapper.find('[data-testid="page-json-save"]').trigger('click');
    await flushPromises();
    expect(requests).toHaveLength(0);
    expect(wrapper.find('[data-testid="page-json-error"]').exists()).toBe(true);
  });

  it('resets by removing the page from the document', async () => {
    const { wrapper, requests } = await mountEditor();
    await wrapper.find('[data-testid="page-json-reset"]').trigger('click');
    await flushPromises();
    const patch = requests.find((req) => req.init?.method === 'PATCH');
    expect(patch).toBeDefined();
    const body = JSON.parse(String(patch?.init?.body)) as Array<Record<string, unknown>>;
    expect(body).toEqual([{ op: 'replace', path: '/data/pages', value: [] }]);
  });
});
