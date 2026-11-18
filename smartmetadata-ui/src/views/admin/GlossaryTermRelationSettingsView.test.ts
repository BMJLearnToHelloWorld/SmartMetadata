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
      { path: '/settings', name: 'admin-settings', component: { template: '<div />' } },
      { path: '/settings/:category', name: 'settings-category', component: { template: '<div />' } },
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

// Server-shaped stored entity: references are objects on the wire, the
// way a PUT response returns them, so the echoed save round-trips.
const serverType = {
  id: 'r2',
  name: 'customRel',
  fullyQualifiedName: 'customRel',
  displayName: 'Custom Rel',
  description: 'd',
  iri: 'http://example.test/customRel',
  rdfPredicate: 'http://example.test/customRel',
  category: 'CUSTOM',
  characteristics: ['TRANSITIVE'],
  cardinality: { sourceMax: 1 },
  crossGlossaryAllowed: true,
  paletteKey: 'VIOLET',
  systemDefined: false,
  inverse: { fullyQualifiedName: ' relatedTo ', name: 'relatedTo', type: 'relationshipType' },
  owners: [{ id: 'u1', name: 'admin', type: 'user' }],
  reviewers: [],
  disjointWith: [{ fullyQualifiedName: 'otherType', name: 'otherType', type: 'relationshipType' }],
  domain: [
    {
      iri: 'http://example.test/Domain',
      term: { id: 't1', name: 'term1', type: 'glossaryTerm' },
    },
  ],
  entityStatus: 'In Review',
  propertyChain: [
    { fullyQualifiedName: 'a', name: 'a', type: 'relationshipType' },
    { name: 'b', type: 'relationshipType' },
  ],
  range: [],
  replacedBy: { fullyQualifiedName: 'newType', name: 'newType', type: 'relationshipType' },
};

function putBodies(): Array<Record<string, unknown>> {
  return vi
    .mocked(fetch)
    .mock.calls.filter(([, init]) => init?.method === 'PUT')
    .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
}

async function editFieldAndSave(
  wrapper: Awaited<ReturnType<typeof mountView>>['wrapper'],
  testId: string,
  value: string,
): Promise<void> {
  await wrapper.find('[data-testid="edit-customRel-btn"]').trigger('click');
  await flushPromises();
  const input = document.querySelector(`[data-testid="${testId}"]`) as HTMLInputElement | null;
  expect(input).not.toBeNull();
  await new DOMWrapper(input!).setValue(value);
  await flushPromises();
  const okButton = document.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement | null;
  expect(okButton).not.toBeNull();
  okButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await flushPromises();
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
    expect(wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Access Denied');
  });

  it('carries every unedited field in the edit PUT body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/v1/glossaryTerms/relationTypes/usage')) {
          return jsonResponse([]);
        }
        if (url.includes('/api/v1/relationshipTypes')) {
          if (init?.method === 'PUT') {
            const body = JSON.parse(String(init.body)) as Record<string, unknown>;
            return jsonResponse({
              ...serverType,
              displayName: body.displayName,
              description: body.description,
            });
          }
          return jsonResponse({ data: [serverType], paging: { total: 1 } });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountView();
    await editFieldAndSave(wrapper, 'relation-type-display-name', 'New Name');
    const bodies = putBodies();
    expect(bodies).toHaveLength(1);
    const body = bodies[0];
    expect(body.displayName).toBe('New Name');
    expect(body.name).toBe('customRel');
    expect(body.disjointWith).toEqual(['otherType']);
    expect(body.domain).toEqual([
      {
        iri: 'http://example.test/Domain',
        term: { id: 't1', name: 'term1', type: 'glossaryTerm' },
      },
    ]);
    expect(body.entityStatus).toBe('In Review');
    expect(body.propertyChain).toEqual(['a', 'b']);
    expect(body.range).toEqual([]);
    expect(body.replacedBy).toBe('newType');
    expect(body.inverse).toBe(' relatedTo ');
    expect(body.iri).toBe('http://example.test/customRel');
    expect(body.owners).toEqual([{ id: 'u1', name: 'admin', type: 'user' }]);
    expect(body.reviewers).toEqual([]);
    const lists = vi
      .mocked(fetch)
      .mock.calls.filter(
        ([input, init]) =>
          String(input).includes('/api/v1/relationshipTypes') && init?.method !== 'PUT',
      );
    expect(lists).toHaveLength(1);
    expect(String(lists[0][0])).toContain('fields=owners%2Creviewers');
  });

  it('keeps every unedited field in a second edit without reloading', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/v1/glossaryTerms/relationTypes/usage')) {
          return jsonResponse([]);
        }
        if (url.includes('/api/v1/relationshipTypes')) {
          if (init?.method === 'PUT') {
            const body = JSON.parse(String(init.body)) as Record<string, unknown>;
            return jsonResponse({
              ...serverType,
              displayName: body.displayName,
              description: body.description,
            });
          }
          return jsonResponse({ data: [serverType], paging: { total: 1 } });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountView();
    await editFieldAndSave(wrapper, 'relation-type-display-name', 'First Name');
    await editFieldAndSave(wrapper, 'relation-type-description', 'second description');
    const bodies = putBodies();
    expect(bodies).toHaveLength(2);
    const second = bodies[1];
    expect(second.displayName).toBe('First Name');
    expect(second.description).toBe('second description');
    expect(second.disjointWith).toEqual(['otherType']);
    expect(second.domain).toEqual([
      {
        iri: 'http://example.test/Domain',
        term: { id: 't1', name: 'term1', type: 'glossaryTerm' },
      },
    ]);
    expect(second.entityStatus).toBe('In Review');
    expect(second.propertyChain).toEqual(['a', 'b']);
    expect(second.range).toEqual([]);
    expect(second.replacedBy).toBe('newType');
    expect(second.inverse).toBe(' relatedTo ');
    expect(second.owners).toEqual([{ id: 'u1', name: 'admin', type: 'user' }]);
    expect(second.reviewers).toEqual([]);
  });

  it('renders empty with an error when the usage endpoint fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/glossaryTerms/relationTypes/usage')) {
          return jsonResponse({ message: 'usage down' }, 500);
        }
        if (url.includes('/api/v1/relationshipTypes')) {
          return jsonResponse({
            data: [
              {
                id: 'r1',
                name: 'isA',
                displayName: 'Is A',
                rdfPredicate: 'http://example.test/isA',
                category: 'CORE',
                characteristics: [],
                systemDefined: false,
              },
              {
                id: 'r2',
                name: 'partOf',
                displayName: 'Part Of',
                rdfPredicate: 'http://example.test/partOf',
                category: 'CUSTOM',
                characteristics: [],
                systemDefined: false,
              },
            ],
            paging: { total: 2 },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountView();
    await flushPromises();
    expect(wrapper.text()).not.toContain('isA');
    expect(wrapper.text()).not.toContain('partOf');
    expect(wrapper.find('.ant-alert-error').exists()).toBe(true);
    expect(wrapper.find('[data-testid="edit-isA-btn"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="delete-isA-btn"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="edit-partOf-btn"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="delete-partOf-btn"]').exists()).toBe(false);
    expect(
      vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === 'DELETE'),
    ).toBe(false);
  });

  it('renders empty with an error when the list endpoint fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/glossaryTerms/relationTypes/usage')) {
          return jsonResponse([{ relationshipType: { name: 'isA' }, count: 2 }]);
        }
        if (url.includes('/api/v1/relationshipTypes')) {
          return jsonResponse({ message: 'list down' }, 500);
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountView();
    await flushPromises();
    expect(wrapper.text()).not.toContain('isA');
    expect(wrapper.find('.ant-alert-error').exists()).toBe(true);
    expect(wrapper.find('[data-testid="edit-isA-btn"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="delete-isA-btn"]').exists()).toBe(false);
  });
});
