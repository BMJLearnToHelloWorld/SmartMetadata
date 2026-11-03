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
import AppLayoutEditor from './AppLayoutEditor.vue';

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
    pages: [],
    personaPreferences: [{ personaId: 'p1', personaName: 'Analyst', appMode: 'classic' }],
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
  const wrapper = mount(AppLayoutEditor, {
    props: { persona: PERSONA, document: DOC },
    global: { plugins: [Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, requests };
}

describe('AppLayoutEditor', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('disables save when nothing changed', async () => {
    const { wrapper } = await mountEditor();
    expect(wrapper.find('[data-testid="app-layout-editor"]').exists()).toBe(true);
    const save = wrapper.find('[data-testid="app-layout-save"]');
    expect(save.attributes('disabled')).toBeDefined();
  });

  it('saves the changed app mode with a personaPreferences replace', async () => {
    const { wrapper, requests } = await mountEditor();
    const aiRadio = wrapper.find('input[value="AI"]');
    expect(aiRadio.exists()).toBe(true);
    await aiRadio.setChecked();
    await flushPromises();
    await wrapper.find('[data-testid="app-layout-save"]').trigger('click');
    await flushPromises();
    const patch = requests.find((req) => req.init?.method === 'PATCH');
    expect(patch).toBeDefined();
    expect(patch?.url).toContain('/v1/docStore/doc1');
    const body = JSON.parse(String(patch?.init?.body)) as Array<Record<string, unknown>>;
    const prefs = body.find((op) => op.path === '/data/personaPreferences');
    expect(prefs).toBeDefined();
    expect(JSON.stringify(prefs?.value)).toContain('"appMode":"AI"');
  });

  it('resets to defaults, clearing the app mode', async () => {
    const { wrapper, requests } = await mountEditor();
    await wrapper.find('[data-testid="app-layout-reset"]').trigger('click');
    await flushPromises();
    const patch = requests.find((req) => req.init?.method === 'PATCH');
    expect(patch).toBeDefined();
    const body = JSON.parse(String(patch?.init?.body)) as Array<Record<string, unknown>>;
    const prefs = body.find((op) => op.path === '/data/personaPreferences');
    expect(prefs).toBeDefined();
    expect(JSON.stringify(prefs?.value)).not.toContain('appMode');
  });
});
