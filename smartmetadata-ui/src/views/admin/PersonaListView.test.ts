/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import Antd, { message } from 'ant-design-vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { defineComponent, nextTick } from 'vue';
import { useAuthStore } from '@/stores/auth';
import PersonaListView from './PersonaListView.vue';

const AddEditPersonaStub = defineComponent({
  props: {
    open: Boolean,
    onSave: { type: Function, required: true },
    onCancel: { type: Function, required: true },
  },
  template:
    '<button v-if="open" data-testid="create-modal-stub" type="button" @click="onSave()">save</button>',
});

const MESSAGES = {
  en: {
    label: {
      'setting-plural': 'Settings',
      persona: 'Persona',
      'persona-plural': 'Personas',
      'add-entity': 'Add {entity}',
      'create-entity': 'Create {entity}',
      add: 'Add',
      entity: 'entity',
      default: 'Default',
      'no-description': 'No description',
    },
    message: {
      'page-sub-header-for-persona': 'Enhance and customize the user experience with Personas.',
      'adding-new-entity-is-easy-just-give-it-a-spin': 'Adding a new {entity} is easy, just give it a spin.',
    },
  },
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface Fixture {
  requests: string[];
  resolveList?: (body: unknown) => void;
  failNext?: boolean;
}

async function mountList(asAdmin: boolean, fixture: Fixture, pages?: Record<string, unknown>) {
  localStorage.clear();
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = asAdmin
    ? { id: 'admin', name: 'admin', isAdmin: true }
    : { id: 'u9', name: 'bob' };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/settings/persona', name: 'admin-settings-persona', component: PersonaListView },
      {
        path: '/admin/settings/persona/:fqn',
        name: 'admin-settings-persona-detail',
        component: { template: '<div>detail</div>' },
      },
      { path: '/admin/settings', name: 'admin-settings', component: { template: '<div>settings</div>' } },
    ],
  });
  await router.push('/admin/settings/persona');
  await router.isReady();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      fixture.requests.push(url);
      if (fixture.failNext) {
        fixture.failNext = false;
        return new Response(JSON.stringify({ message: 'list boom' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (pages) {
        const params = new URL(url, 'http://test').searchParams;
        const key = params.get('after') ?? params.get('before') ?? 'first';
        return jsonResponse(pages[key] ?? pages.first);
      }
      return new Promise<Response>((resolve) => {
        fixture.resolveList = (body: unknown) => resolve(jsonResponse(body));
      });
    }),
  );
  const i18n = createI18n({ legacy: false, locale: 'en', messages: MESSAGES });
  const wrapper = mount(PersonaListView, {
    attachTo: document.body,
    global: {
      plugins: [Antd, router, i18n],
      stubs: { AddEditPersona: AddEditPersonaStub },
    },
  });
  return { wrapper, router };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('PersonaListView', () => {
  it('shows three skeleton cards while loading, with the header and Add button', async () => {
    const fixture: Fixture = { requests: [] };
    const { wrapper } = await mountList(true, fixture);
    await nextTick();
    expect(wrapper.findAll('[data-testid="skeleton-card-loader"]')).toHaveLength(3);
    expect(wrapper.find('[data-testid="add-persona-button"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Personas');
    fixture.resolveList?.({ data: [], paging: { total: 0 } });
    await flushPromises();
    wrapper.unmount();
  });

  it('renders the create placeholder without header or pager when empty, and Add opens the modal', async () => {
    const fixture: Fixture = { requests: [] };
    const { wrapper } = await mountList(true, fixture, {
      first: { data: [], paging: { total: 0 } },
    });
    await flushPromises();
    await nextTick();
    expect(wrapper.find('[data-testid="create-error-placeholder-Persona"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="page-header"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="pagination"]').exists()).toBe(false);
    // No doc link: pin passes no doc prop.
    expect(wrapper.find('[data-testid="create-error-placeholder-Persona"] a').exists()).toBe(false);
    expect(wrapper.find('[data-testid="create-modal-stub"]').exists()).toBe(false);
    await wrapper.find('#add-persona-button').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="create-modal-stub"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('renders the permission-denied placeholder for non-admins with no Add action', async () => {
    const fixture: Fixture = { requests: [] };
    const { wrapper } = await mountList(false, fixture, {
      first: { data: [], paging: { total: 0 } },
    });
    await flushPromises();
    await nextTick();
    expect(wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(true);
    expect(wrapper.find('#add-persona-button').exists()).toBe(false);
    wrapper.unmount();
  });

  it('toasts on fetch failure and lands on the placeholder with no error paragraph', async () => {
    const errorSpy = vi.spyOn(message, 'error');
    const fixture: Fixture = { requests: [], failNext: true };
    const { wrapper } = await mountList(true, fixture, {
      first: { data: [], paging: { total: 0 } },
    });
    await flushPromises();
    await nextTick();
    expect(errorSpy).toHaveBeenCalled();
    expect(wrapper.find('[data-testid="create-error-placeholder-Persona"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('list boom');
    wrapper.unmount();
  });

  it('renders cards with no users count and requests limit 15 by default', async () => {
    const fixture: Fixture = { requests: [] };
    const { wrapper } = await mountList(true, fixture, {
      first: {
        data: [
          { id: 'p1', name: 'Analyst', fullyQualifiedName: 'Analyst', description: 'Sees data.' },
          { id: 'p2', name: 'Auditor', fullyQualifiedName: 'Auditor', default: true },
        ],
        paging: { total: 2 },
      },
    });
    await flushPromises();
    await nextTick();
    expect(wrapper.find('[data-testid="persona-details-card-Analyst"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="persona-details-card-Auditor"]').exists()).toBe(true);
    expect(wrapper.text()).not.toMatch(/\d+\s*users?/i);
    expect(fixture.requests[0]).toContain('limit=15');
    expect(fixture.requests[0]).toContain('fields=users');
    // No page-size selector: pin never passes onShowSizeChange.
    expect(wrapper.find('[data-testid="page-size-selection-dropdown"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('pages with cursors and refetches the current page after a create', async () => {
    const fixture: Fixture = { requests: [] };
    const { wrapper } = await mountList(true, fixture, {
      first: {
        data: [{ id: 'p1', name: 'Analyst', fullyQualifiedName: 'Analyst' }],
        paging: { after: 'c1', total: 2 },
      },
      c1: {
        data: [{ id: 'p2', name: 'Steward', fullyQualifiedName: 'Steward' }],
        paging: { before: 'c0', total: 2 },
      },
      c0: {
        data: [{ id: 'p1', name: 'Analyst', fullyQualifiedName: 'Analyst' }],
        paging: { after: 'c1', total: 2 },
      },
    });
    await flushPromises();
    await nextTick();
    expect(wrapper.find('[data-testid="pagination"]').exists()).toBe(true);
    await wrapper.find('[data-testid="next"]').trigger('click');
    await flushPromises();
    await nextTick();
    expect(fixture.requests.at(-1)).toContain('after=c1');
    expect(wrapper.find('[data-testid="persona-details-card-Steward"]').exists()).toBe(true);

    // Save from the create modal refetches the current (second) page.
    await wrapper.find('[data-testid="add-persona-button"]').trigger('click');
    await nextTick();
    await wrapper.find('[data-testid="create-modal-stub"]').trigger('click');
    await flushPromises();
    await nextTick();
    expect(fixture.requests.at(-1)).toContain('after=c1');
    expect(wrapper.find('[data-testid="persona-details-card-Steward"]').exists()).toBe(true);

    // Walking back to page 1 re-fetches without any cursor (the shared
    // hook walks from the first page; it never issues `before` for page 1).
    await wrapper.find('[data-testid="previous"]').trigger('click');
    await flushPromises();
    await nextTick();
    expect(fixture.requests.at(-1)).not.toContain('after=');
    expect(fixture.requests.at(-1)).not.toContain('before=');
    expect(wrapper.find('[data-testid="persona-details-card-Analyst"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
