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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import { ApiError } from '@/api/client';
import type { Persona, PersonaDocument } from '@/types/persona';
import CustomizePageView from './CustomizePageView.vue';

const persona: Persona = {
  id: 'p1',
  name: 'Analyst',
  fullyQualifiedName: 'Analyst',
  displayName: 'Analyst',
} as Persona;

const storedDoc: PersonaDocument = {
  id: 'doc1',
  name: 'Analyst-Analyst',
  fullyQualifiedName: 'persona.Analyst',
  entityType: 'Page',
  data: {
    pages: [{ pageType: 'LandingPage', layout: [] }],
    personaPreferences: [{ personaId: 'p1', landingPageSettings: { headerColor: '#1570EF' } }],
    personPreferences: [{ personaId: 'p1', landingPageSettings: { headerColor: '#099250' } }],
  },
};

const getPersonaByName = vi.fn(async (..._args: unknown[]) => persona);
const listPersonas = vi.fn(async (..._args: unknown[]) => ({ data: [persona] }));
const getDocumentByFqn = vi.fn(async (..._args: unknown[]) => structuredClone(storedDoc));

vi.mock('@/api/persona', () => ({
  getPersonaByName: (...args: unknown[]) => getPersonaByName(...args),
  listPersonas: (...args: unknown[]) => listPersonas(...args),
}));
vi.mock('@/api/docStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/docStore')>();
  return { ...actual, getDocumentByFqn: (...args: unknown[]) => getDocumentByFqn(...args) };
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn();

const EditorStub = {
  template: `<div data-testid="stub-editor">
    <span data-testid="stub-initial-color">{{ backgroundColor }}</span>
    <button data-testid="stub-save" @click="onSaveLayout({ pageType: 'LandingPage', layout: [{ i: 'KnowledgePanel.Domains', x: 0, y: 0, w: 1, h: 3 }] })">save</button>
    <button data-testid="stub-reset" @click="onSaveLayout()">reset</button>
    <button data-testid="stub-color" @click="onBackgroundColorUpdate('#E04F16')">color</button>
    <button data-testid="stub-color-clear" @click="onBackgroundColorUpdate(undefined)">clear color</button>
  </div>`,
  props: [
    'personaName',
    'personaFqn',
    'initialPageData',
    'backgroundColor',
    'onSaveLayout',
    'onBackgroundColorUpdate',
  ],
};

async function mountShell(pageFqn = 'LandingPage') {
  setActivePinia(createPinia());
  window.localStorage.clear();
  const router: Router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/my-data', name: 'home', component: { template: '<div>home</div>' } },
      {
        path: '/customize-page/:fqn/:pageFqn',
        name: 'customize-page',
        component: CustomizePageView,
      },
    ],
  });
  await router.push({ name: 'customize-page', params: { fqn: 'Analyst', pageFqn } });
  await router.isReady();
  const wrapper = mount(CustomizePageView, {
    global: {
      plugins: [router, Antd, createTestI18n()],
      stubs: { CustomizeMyData: EditorStub },
    },
  });
  await flushPromises();
  return { wrapper, router };
}

function lastFetch(): { url: string; init?: RequestInit } {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] as RequestInit | undefined };
}

describe('CustomizePageView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPersonaByName.mockImplementation(async () => persona);
    listPersonas.mockImplementation(async () => ({ data: [persona] }));
    getDocumentByFqn.mockImplementation(async () => structuredClone(storedDoc));
    fetchMock.mockImplementation(async () => jsonResponse(structuredClone(storedDoc)));
    vi.stubGlobal('fetch', fetchMock);
  });

  it('loads the persona document and resolves the header colour own-first', async () => {
    const { wrapper } = await mountShell();
    expect(wrapper.find('[data-testid="stub-editor"]').exists()).toBe(true);
    // The user's own personPreferences colour wins over the persona
    // admin's personaPreferences colour.
    expect(wrapper.get('[data-testid="stub-initial-color"]').text()).toBe('#099250');
  });

  it('saving with a document id PATCHes the pages subtree', async () => {
    const { wrapper } = await mountShell();
    await wrapper.get('[data-testid="stub-save"]').trigger('click');
    await flushPromises();
    const { url, init } = lastFetch();
    expect(url).toContain('/api/v1/docStore/doc1');
    expect(init?.method).toBe('PATCH');
    const body = JSON.parse(String(init?.body)) as Array<Record<string, unknown>>;
    expect(body).toEqual([
      {
        op: 'replace',
        path: '/data/pages',
        value: [
          {
            pageType: 'LandingPage',
            layout: [{ i: 'KnowledgePanel.Domains', x: 0, y: 0, w: 1, h: 3 }],
          },
        ],
      },
    ]);
  });

  it('saving with no page removes the LandingPage entry (reset path)', async () => {
    const { wrapper } = await mountShell();
    await wrapper.get('[data-testid="stub-reset"]').trigger('click');
    await flushPromises();
    const { init } = lastFetch();
    expect(init?.method).toBe('PATCH');
    const body = JSON.parse(String(init?.body)) as Array<Record<string, unknown>>;
    expect(body).toEqual([{ op: 'replace', path: '/data/pages', value: [] }]);
  });

  it('a colour update PATCHes the personPreferences subtree only', async () => {
    const { wrapper } = await mountShell();
    await wrapper.get('[data-testid="stub-color"]').trigger('click');
    await flushPromises();
    const { init } = lastFetch();
    expect(init?.method).toBe('PATCH');
    const body = JSON.parse(String(init?.body)) as Array<Record<string, unknown>>;
    expect(body).toEqual([
      {
        op: 'replace',
        path: '/data/personPreferences',
        value: [{ personaId: 'p1', landingPageSettings: { headerColor: '#E04F16' } }],
      },
    ]);
  });

  it('creates the document with a POST when the persona has none yet', async () => {
    getDocumentByFqn.mockRejectedValue(new ApiError(404, 'not found'));
    const { wrapper } = await mountShell();
    expect(wrapper.find('[data-testid="stub-editor"]').exists()).toBe(true);
    await wrapper.get('[data-testid="stub-save"]').trigger('click');
    await flushPromises();
    const { url, init } = lastFetch();
    expect(url).toContain('/api/v1/docStore');
    expect(init?.method).toBe('POST');
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect((body.data as Record<string, unknown>).pages).toEqual([
      {
        pageType: 'LandingPage',
        layout: [{ i: 'KnowledgePanel.Domains', x: 0, y: 0, w: 1, h: 3 }],
      },
    ]);
  });

  it('renders the unsupported state for other page types', async () => {
    const { wrapper } = await mountShell('AppLayout');
    expect(wrapper.find('[data-testid="customize-page-unsupported"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="stub-editor"]').exists()).toBe(false);
  });

  it('renders the error state when the persona does not exist', async () => {
    getPersonaByName.mockRejectedValue(new Error('boom'));
    const { wrapper } = await mountShell();
    expect(wrapper.find('[data-testid="customize-page-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="stub-editor"]').exists()).toBe(false);
  });

  it('the homepage alias serves the LandingPage editor', async () => {
    const { wrapper } = await mountShell('homepage');
    expect(wrapper.find('[data-testid="stub-editor"]').exists()).toBe(true);
  });
});
