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
import Antd, { Select } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { createTestI18n } from '@/test/i18n';
import ContextCenterArticlesView from './ContextCenterArticlesView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function buildRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/context-center/articles', name: 'context-center-articles', component: ContextCenterArticlesView },
      { path: '/context-center/articles/:fqn', name: 'context-center-article', component: ContextCenterArticlesView },
      { path: '/context-center/articles/:fqn/:tab', name: 'context-center-article-tab', component: ContextCenterArticlesView },
      { path: '/context-center/articles/:fqn/:tab/:subTab', name: 'context-center-article-subtab', component: ContextCenterArticlesView },
      { path: '/context-center', name: 'context-center-overview', component: { template: '<div />' } },
      { path: '/context-center/documents', name: 'context-center-documents', component: { template: '<div />' } },
      { path: '/context-center/memories', name: 'context-center-memories', component: { template: '<div />' } },
      { path: '/context-center/filter', name: 'context-center-filter', component: { template: '<div />' } },
      { path: '/context-center/integrations', name: 'context-center-integrations', component: { template: '<div />' } },
      { path: '/context-center/ai-context', name: 'context-center-ai-context', component: { template: '<div />' } },
      { path: '/context-center/ai-context/:fqn', name: 'context-center-ai-context-detail', component: { template: '<div />' } },
      { path: '/context-center/archive', name: 'context-center-archive', component: { template: '<div />' } },
    ],
  });
}

function allowPermissions(resource: string): Response {
  return jsonResponse({
    resource,
    permissions: [
      { operation: 'Create', access: 'allow' },
      { operation: 'EditAll', access: 'allow' },
      { operation: 'Delete', access: 'allow' },
    ],
  });
}

describe('ContextCenterArticlesView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/permissions/')) {
          return allowPermissions('page');
        }
        if (url.includes('/contextCenter/pages/name/')) {
          return jsonResponse({
            id: 'p1',
            name: 'getting-started',
            fullyQualifiedName: 'getting-started',
            displayName: 'Getting Started',
            description: 'Intro.',
            pageType: 'Article',
            page: {},
            updatedBy: 'admin',
          });
        }
        if (url.includes('/contextCenter/pages')) {
          return jsonResponse({
            data: [
              { id: 'p1', name: 'getting-started', fullyQualifiedName: 'getting-started', displayName: 'Getting Started', pageType: 'Article', page: {}, updatedBy: 'admin' },
            ],
            paging: { total: 1 },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders the article list', { timeout: 15000 }, async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = buildRouter();
    await router.push('/context-center/articles');
    await router.isReady();
    const wrapper = mount(ContextCenterArticlesView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="articles-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Getting Started');
  });

  it('renders article detail for the fqn route', { timeout: 15000 }, async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = buildRouter();
    await router.push('/context-center/articles/getting-started');
    await router.isReady();
    const wrapper = mount(ContextCenterArticlesView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.text()).toContain('Getting Started');
    expect(wrapper.text()).toContain('Intro.');
  });

  it('deep-links the activity tab from the :tab route segment', { timeout: 15000 }, async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/permissions/')) {
          return allowPermissions('page');
        }
        if (url.includes('/contextCenter/pages/name/')) {
          return jsonResponse({
            id: 'p1',
            name: 'getting-started',
            fullyQualifiedName: 'getting-started',
            displayName: 'Getting Started',
            description: 'Intro.',
            pageType: 'Article',
            page: {},
            updatedBy: 'admin',
          });
        }
        if (url.includes('/api/v1/activity/entity/page/name/')) {
          return jsonResponse({
            data: [{ id: 'e1', eventType: 'create', summary: 'Article created', timestamp: 1762051200000 }],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/conversations')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/metadata/types/name/page/customProperties')) {
          return jsonResponse([]);
        }
        if (url.includes('/contextCenter/pages')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = buildRouter();
    await router.push('/context-center/articles/getting-started/activity_feed');
    await router.isReady();
    const wrapper = mount(ContextCenterArticlesView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="article-detail-tabs"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="asset-activity-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Article created');
  });

  it('accepts a :subTab segment and keeps the detail on the routed tab', { timeout: 15000 }, async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = buildRouter();
    await router.push('/context-center/articles/getting-started/overview/notes');
    await router.isReady();
    const wrapper = mount(ContextCenterArticlesView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(router.currentRoute.value.params.subTab).toBe('notes');
    expect(wrapper.find('[data-testid="article-detail-tabs"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Getting Started');
    expect(wrapper.text()).toContain('Intro.');
  });

  it('falls back to overview for an unknown tab segment', { timeout: 15000 }, async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = buildRouter();
    await router.push('/context-center/articles/getting-started/bogus');
    await router.isReady();
    const wrapper = mount(ContextCenterArticlesView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="article-detail-tabs"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Intro.');
  });

  it('shows extension values on the custom properties tab and saves edits as one /extension patch (M-Next A17)', { timeout: 15000 }, async () => {
    let savedExtension: Record<string, unknown> = { sensitivity: 'high', retentionDays: 30 };
    let patchBody: unknown;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/v1/permissions/')) {
          return allowPermissions('page');
        }
        if (url.includes('/contextCenter/pages/name/')) {
          return jsonResponse({
            id: 'p1',
            name: 'getting-started',
            fullyQualifiedName: 'getting-started',
            displayName: 'Getting Started',
            description: 'Intro.',
            pageType: 'Article',
            page: {},
            updatedBy: 'admin',
            extension: savedExtension,
          });
        }
        if (url.includes('/api/v1/metadata/types/name/page/customProperties')) {
          return jsonResponse([
            { name: 'sensitivity', displayName: 'Sensitivity', propertyType: { name: 'string' } },
            { name: 'retentionDays', displayName: 'Retention days', propertyType: { name: 'integer' } },
          ]);
        }
        if (url.includes('/api/v1/contextCenter/pages/p1') && init?.method === 'PATCH') {
          patchBody = JSON.parse(String(init?.body)) as unknown;
          savedExtension = (patchBody as Array<{ value: Record<string, unknown> }>)?.[0]?.value ?? {};
          return jsonResponse({
            id: 'p1',
            name: 'getting-started',
            fullyQualifiedName: 'getting-started',
            pageType: 'Article',
            extension: savedExtension,
          });
        }
        if (url.includes('/api/v1/activity/entity/page/name/')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/conversations')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/contextCenter/pages')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = buildRouter();
    await router.push('/context-center/articles/getting-started/custom_properties');
    await router.isReady();
    const wrapper = mount(ContextCenterArticlesView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="asset-custom-properties-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('high');
    expect(wrapper.text()).toContain('30');
    const editButton = wrapper.find('[data-testid="article-edit-custom-properties"]');
    expect(editButton.exists()).toBe(true);
    await editButton.trigger('click');
    await flushPromises();
    const sensitivity = document.querySelector(
      '[data-testid="custom-prop-sensitivity"]',
    ) as HTMLInputElement | null;
    expect(sensitivity?.value).toBe('high');
    if (sensitivity) {
      sensitivity.value = 'low';
      sensitivity.dispatchEvent(new Event('input', { bubbles: true }));
    }
    // Let the controlled input's v-model settle before closing the
    // modal: antd's Input reads its ref in a nextTick after an input
    // event, and closing the modal first leaves it null.
    await flushPromises();
    const okButton = document.querySelector(
      '.ant-modal-footer .ant-btn-primary',
    ) as HTMLElement | null;
    expect(okButton).not.toBeNull();
    okButton?.click();
    for (let i = 0; i < 10 && patchBody === undefined; i++) {
      await flushPromises();
    }
    // One whole-extension op: the page already has an extension, so the
    // patch replaces it — never a per-field add /extension/<name>.
    expect(patchBody).toEqual([
      { op: 'replace', path: '/extension', value: { sensitivity: 'low', retentionDays: 30 } },
    ]);
    for (let i = 0; i < 10 && !wrapper.text().includes('low'); i++) {
      await flushPromises();
    }
    expect(wrapper.text()).toContain('low');
    wrapper.unmount();
    document.body.innerHTML = '';
  });

  it('records an article view when opening it from the list', { timeout: 15000 }, async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.user = { id: 'u-alice', name: 'alice' };
    const router = buildRouter();
    await router.push('/context-center/articles');
    await router.isReady();
    const wrapper = mount(ContextCenterArticlesView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    const openButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Getting Started'));
    expect(openButton?.exists()).toBe(true);
    await openButton?.trigger('click');
    await flushPromises();
    const stored = JSON.parse(
      localStorage.getItem('sm.contextCenter.recentlyViewed.v1:alice') ?? '[]',
    ) as Array<{ id: string; title: string }>;
    expect(stored.map((item) => item.id)).toEqual(['p1']);
    expect(stored[0]?.title).toBe('Getting Started');
    expect(router.currentRoute.value.name).toBe('context-center-article');
  });

  it('records a quick-link view and opens its URL in a new tab', { timeout: 15000 }, async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/permissions/')) {
          return allowPermissions('page');
        }
        if (url.includes('/contextCenter/pages')) {
          return jsonResponse({
            data: [
              { id: 'q1', name: 'handbook-link', fullyQualifiedName: 'handbook-link', displayName: 'Handbook', pageType: 'QuickLink', page: { url: 'https://example.com/handbook' }, updatedBy: 'admin' },
            ],
            paging: { total: 1 },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.user = { id: 'u-alice', name: 'alice' };
    const router = buildRouter();
    await router.push('/context-center/articles');
    await router.isReady();
    const wrapper = mount(ContextCenterArticlesView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    const openButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Handbook'));
    await openButton?.trigger('click');
    await flushPromises();
    const stored = JSON.parse(
      localStorage.getItem('sm.contextCenter.recentlyViewed.v1:alice') ?? '[]',
    ) as Array<{ id: string; pageType: string }>;
    expect(stored.map((item) => item.id)).toEqual(['q1']);
    expect(stored[0]?.pageType).toBe('QuickLink');
    expect(openSpy).toHaveBeenCalledWith(
      'https://example.com/handbook',
      '_blank',
      'noopener,noreferrer',
    );
    expect(router.currentRoute.value.name).toBe('context-center-articles');
    openSpy.mockRestore();
  });
});

describe('ContextCenterArticlesView G-19', () => {
  function recordedUrls(): string[] {
    return vi.mocked(fetch).mock.calls.map((call) => String(call[0]));
  }

  function stubBase(
    handle: (input: RequestInfo | URL, init?: RequestInit) => Response | undefined,
  ): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/v1/permissions/')) {
          return allowPermissions('page');
        }
        if (url.includes('/v1/users/') && url.includes('fields=follows')) {
          return jsonResponse({ id: 'u-alice', name: 'alice', follows: [] });
        }
        if (url.includes('/v1/metadata/tags')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return handle(input, init) ?? new Response('not found', { status: 404 });
      }),
    );
  }

  async function mountList() {
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.user = { id: 'u-alice', name: 'alice' };
    const router = buildRouter();
    await router.push('/context-center/articles');
    await router.isReady();
    const wrapper = mount(ContextCenterArticlesView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    return { wrapper, router };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('loads the REST default path with the official field list and load-more appends page 2', { timeout: 15000 }, async () => {
    stubBase((input) => {
      const url = String(input);
      if (url.includes('/contextCenter/pages')) {
        const offset = Number(new URL(url).searchParams.get('offset') ?? 0);
        const count = offset === 0 ? 25 : 5;
        const data = Array.from({ length: count }, (_, index) => {
          const n = offset + index;
          return {
            id: `p${n}`,
            name: `page-${n}`,
            fullyQualifiedName: `page-${n}`,
            displayName: `Page ${n}`,
            pageType: 'Article',
            page: {},
            updatedBy: 'admin',
          };
        });
        return jsonResponse({ data, paging: { total: 30 } });
      }
      return undefined;
    });
    const { wrapper } = await mountList();
    const listUrl = recordedUrls().find((url) => url.includes('/contextCenter/pages?'));
    expect(listUrl).toContain('fields=owners%2Cvotes%2Cfollowers%2Ctags%2Cdomains%2CrelatedEntities%2CdataProducts%2Creviewers');
    expect(listUrl).toContain('sortBy=updatedAt');
    expect(listUrl).toContain('limit=25');
    expect(listUrl).toContain('offset=0');
    expect(wrapper.find('[data-testid="entity-list-load-more"]').exists()).toBe(true);
    await wrapper.find('[data-testid="entity-list-load-more"]').trigger('click');
    await flushPromises();
    expect(recordedUrls().some((url) => url.includes('offset=25'))).toBe(true);
    expect(wrapper.text()).toContain('Page 29');
    expect(wrapper.text()).toContain('30');
  });

  it('switches to the ES path on search with index=page and the page-type term', { timeout: 15000 }, async () => {
    stubBase((input) => {
      const url = String(input);
      if (url.includes('/v1/search/query')) {
        return jsonResponse({
          hits: {
            total: { value: 1 },
            hits: [
              {
                _source: {
                  id: 'p1',
                  name: 'getting-started',
                  fullyQualifiedName: 'getting-started',
                  displayName: 'Getting Started',
                  pageType: 'Article',
                  page: { publicationDate: '2026-09-01' },
                  totalVotes: 3,
                },
              },
            ],
          },
          aggregations: {
            'tags.tagFQN': { buckets: [{ key: 'KnowledgeCenter.Guides', doc_count: 1 }] },
          },
        });
      }
      if (url.includes('/contextCenter/pages')) {
        return jsonResponse({ data: [], paging: { total: 0 } });
      }
      return undefined;
    });
    const { wrapper } = await mountList();
    const searchInput = wrapper.find('[data-testid="entity-list-search"]');
    await searchInput.setValue('guide');
    await new Promise((resolve) => setTimeout(resolve, 350));
    await flushPromises();
    const searchUrl = recordedUrls().find((url) => url.includes('/v1/search/query'));
    expect(searchUrl).toBeDefined();
    expect(searchUrl).toContain('index=page');
    expect(searchUrl).toContain('q=guide');
    expect(searchUrl).toContain('sort_field=updatedAt');
    expect(searchUrl).toContain('include_aggregations=true');
    expect(wrapper.text()).toContain('Getting Started');
    expect(wrapper.find('[data-testid="explore-chip-tagFqn"]').exists()).toBe(true);
  });

  it('forces the ES path for the popularity sort', { timeout: 15000 }, async () => {
    stubBase((input) => {
      const url = String(input);
      if (url.includes('/v1/search/query')) {
        return jsonResponse({ hits: { total: { value: 0 }, hits: [] } });
      }
      if (url.includes('/contextCenter/pages')) {
        return jsonResponse({ data: [], paging: { total: 0 } });
      }
      return undefined;
    });
    const { wrapper } = await mountList();
    const sort = wrapper
      .findAllComponents(Select)
      .find((component) => component.attributes('data-testid') === 'articles-sort');
    expect(sort?.exists()).toBe(true);
    await sort?.vm.$emit('change', 'popularity');
    await flushPromises();
    const searchUrl = recordedUrls().find((url) => url.includes('/v1/search/query'));
    expect(searchUrl).toContain('sort_field=totalVotes');
    expect(searchUrl).toContain('sort_order=desc');
  });

  it('toggles follow on the article detail with PUT then DELETE', { timeout: 15000 }, async () => {
    let followed = false;
    stubBase((input, init) => {
      const url = String(input);
      if (url.includes('/contextCenter/pages/p1/followers')) {
        followed = init?.method === 'PUT';
        return jsonResponse({
          changeDescription: {
            fieldsAdded: [{ newValue: [{ id: 'u-alice', type: 'user', name: 'alice' }] }],
            fieldsDeleted: [{ oldValue: [{ id: 'u-alice', type: 'user', name: 'alice' }] }],
          },
        });
      }
      if (url.includes('/contextCenter/pages/name/')) {
        return jsonResponse({
          id: 'p1',
          name: 'getting-started',
          fullyQualifiedName: 'getting-started',
          displayName: 'Getting Started',
          description: 'Intro.',
          pageType: 'Article',
          page: {},
          updatedBy: 'admin',
          followers: followed ? [{ id: 'u-alice', type: 'user', name: 'alice' }] : [],
        });
      }
      if (url.includes('/contextCenter/pages')) {
        return jsonResponse({ data: [], paging: { total: 0 } });
      }
      return undefined;
    });
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.user = { id: 'u-alice', name: 'alice' };
    const router = buildRouter();
    await router.push('/context-center/articles/getting-started');
    await router.isReady();
    const wrapper = mount(ContextCenterArticlesView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    const followButton = wrapper.find('[data-testid="article-follow"]');
    expect(followButton.exists()).toBe(true);
    expect(followButton.text()).toBe('Follow');
    await followButton.trigger('click');
    await flushPromises();
    expect(recordedUrls().some((url) => url.includes('/contextCenter/pages/p1/followers'))).toBe(true);
    expect(wrapper.find('[data-testid="article-follow"]').text()).toBe('Unfollow');
    await wrapper.find('[data-testid="article-follow"]').trigger('click');
    await flushPromises();
    expect(
      recordedUrls().filter((url) => url.includes('/contextCenter/pages/p1/followers')).length,
    ).toBe(2);
    expect(wrapper.find('[data-testid="article-follow"]').text()).toBe('Follow');
  });

  it('toggles follow from the list row overflow menu', { timeout: 15000 }, async () => {
    stubBase((input, init) => {
      const url = String(input);
      if (url.includes('/contextCenter/pages/p1/followers')) {
        expect(init?.method).toBe('PUT');
        return jsonResponse({
          changeDescription: {
            fieldsAdded: [{ newValue: [{ id: 'u-alice', type: 'user', name: 'alice' }] }],
          },
        });
      }
      if (url.includes('/contextCenter/pages')) {
        return jsonResponse({
          data: [
            {
              id: 'p1',
              name: 'getting-started',
              fullyQualifiedName: 'getting-started',
              displayName: 'Getting Started',
              pageType: 'Article',
              page: {},
              updatedBy: 'admin',
              followers: [],
            },
          ],
          paging: { total: 1 },
        });
      }
      return undefined;
    });
    const { wrapper } = await mountList();
    const overflow = wrapper.find('[data-testid="row-overflow-p1"]');
    expect(overflow.exists()).toBe(true);
    await overflow.trigger('click');
    await flushPromises();
    const followItem = document.querySelector(
      '[data-testid="article-row-follow-p1"]',
    ) as HTMLElement | null;
    expect(followItem).not.toBeNull();
    followItem?.click();
    await flushPromises();
    expect(
      recordedUrls().some((url) => url.includes('/contextCenter/pages/p1/followers')),
    ).toBe(true);
  });
});
