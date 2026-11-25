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
import Antd, { Menu } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { usePersonaStore } from '@/stores/persona';
import { createTestI18n } from '@/test/i18n';
import PersonaSwitcher from './PersonaSwitcher.vue';

const PERSONAS = [
  { id: 'p1', name: 'Analyst', fullyQualifiedName: 'Analyst', displayName: 'Analyst' },
  { id: 'p2', name: 'Steward', fullyQualifiedName: 'Steward', displayName: 'Steward' },
  { id: 'p3', name: 'Zebra', fullyQualifiedName: 'Zebra', displayName: 'Zebra' },
  { id: 'p4', name: 'Mango', fullyQualifiedName: 'Mango', displayName: 'Mango' },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('PersonaSwitcher (user-menu "Switch persona" section, pin UserProfileIcon)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  function stubPersonas(personas: typeof PERSONAS) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/personas')) {
          return jsonResponse({ data: personas, paging: { total: personas.length } });
        }
        if (url.includes('/v1/docStore/name/')) {
          return new Response('not found', { status: 404 });
        }
        return jsonResponse({});
      }),
    );
  }

  async function mountSection() {
    const pinia = createPinia();
    setActivePinia(pinia);
    useAuthStore().user = {
      id: 'u1',
      name: 'alice',
      displayName: 'Alice',
      defaultPersona: { id: 'p1', name: 'Analyst', type: 'persona' },
    };
    // The section renders as menu items, so it mounts inside a Menu —
    // the same nesting the shell's user menu provides.
    const host = defineComponent({
      render: () => h(Menu, null, { default: () => h(PersonaSwitcher) }),
    });
    const wrapper = mount(host, {
      global: { plugins: [pinia, Antd, createTestI18n()] },
    });
    await flushPromises();
    await flushPromises();
    return wrapper;
  }

  it('renders nothing when no personas exist', async () => {
    stubPersonas([]);
    const wrapper = await mountSection();
    expect(wrapper.text()).not.toContain('Switch persona');
    expect(wrapper.find('[data-testid="user-menu-persona-more"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('orders default first, selected second, the rest alphabetically — 2 shown + more', async () => {
    sessionStorage.setItem('sm.persona.v1', 'p2');
    stubPersonas(PERSONAS);
    const wrapper = await mountSection();
    expect(wrapper.text()).toContain('Switch persona');
    const items = wrapper.findAll('.ant-menu-item');
    const labels = items.map((item) => item.text());
    // Default (Analyst) first with the Default badge, selected
    // (Steward) second; Mango and Zebra wait behind "more".
    expect(labels[0]).toContain('Analyst');
    expect(labels[0]).toContain('Default');
    expect(labels[1]).toContain('Steward');
    expect(labels).toHaveLength(3);
    expect(labels[2]).toContain('2 More');
    expect(wrapper.text()).not.toContain('Mango');
    expect(wrapper.text()).not.toContain('Zebra');
    await wrapper.find('[data-testid="user-menu-persona-more"]').trigger('click');
    await flushPromises();
    const expanded = wrapper.findAll('.ant-menu-item').map((item) => item.text());
    expect(expanded).toHaveLength(4);
    expect(expanded[2]).toContain('Mango');
    expect(expanded[3]).toContain('Zebra');
    wrapper.unmount();
  });

  it('switches the selection and persists it in sessionStorage', async () => {
    stubPersonas(PERSONAS);
    const wrapper = await mountSection();
    await wrapper.find('[data-testid="user-menu-persona-p4"]').trigger('click');
    await flushPromises();
    const store = usePersonaStore();
    expect(store.selectedPersonaId).toBe('p4');
    expect(sessionStorage.getItem('sm.persona.v1')).toBe('p4');
    expect(localStorage.getItem('sm.persona.v1')).toBeNull();
    wrapper.unmount();
  });

  it('adopts a legacy localStorage selection once and clears the legacy key', async () => {
    localStorage.setItem('sm.persona.v1', 'p2');
    stubPersonas(PERSONAS);
    const wrapper = await mountSection();
    const store = usePersonaStore();
    expect(store.selectedPersonaId).toBe('p2');
    expect(sessionStorage.getItem('sm.persona.v1')).toBe('p2');
    expect(localStorage.getItem('sm.persona.v1')).toBeNull();
    wrapper.unmount();
  });
});
