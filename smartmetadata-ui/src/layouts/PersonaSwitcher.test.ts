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
import { usePersonaStore } from '@/stores/persona';
import { createTestI18n } from '@/test/i18n';
import PersonaSwitcher from './PersonaSwitcher.vue';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('PersonaSwitcher', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('renders nothing when no personas exist', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: [], paging: { total: 0 } })));
    const wrapper = mount(PersonaSwitcher, {
      global: { plugins: [pinia, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="persona-switcher"]').exists()).toBe(false);
  });

  it('renders the personas and switches the selection', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/v1/personas')) {
        return jsonResponse({
          data: [
            { id: 'p1', name: 'Analyst', fullyQualifiedName: 'Analyst' },
            { id: 'p2', name: 'Steward', fullyQualifiedName: 'Steward' },
          ],
          paging: { total: 2 },
        });
      }
      return jsonResponse({});
    }));
    const wrapper = mount(PersonaSwitcher, {
      global: { plugins: [pinia, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="persona-switcher"]').exists()).toBe(true);
    const store = usePersonaStore();
    await store.selectPersona('p2');
    await flushPromises();
    expect(store.selectedPersonaId).toBe('p2');
    expect(localStorage.getItem('sm.persona.v1')).toBe('p2');
  });
});
