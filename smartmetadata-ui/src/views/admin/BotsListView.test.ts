/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import Antd, { message } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import DeleteEntityModal from '@/features/crud/DeleteEntityModal.vue';
import { useAuthStore } from '@/stores/auth';
import { writeGlobalPageSize } from '@/utils/userPageSizePreference';
import NextPrevious from '@/components/shared/NextPrevious.vue';
import BotsListView from './BotsListView.vue';

// Local messages: the view references NEW keys the integration line has
// not written yet. Asserting rendered copy pins the exact key names.
// Interpolation uses vue-i18n `{name}` syntax.
function createListI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    fallbackLocale: 'en',
    missingWarn: false,
    fallbackWarn: false,
    messages: {
      en: {
        label: {
          bot: 'Bot',
          'bot-plural': 'Bots',
          'setting-plural': 'Settings',
          'show-deleted': 'Show Deleted',
          name: 'Name',
          description: 'Description',
          'action-plural': 'Actions',
          delete: 'Delete',
          'add-entity': 'Add {entity}',
          'create-entity': 'Create {entity}',
          'search-for-type': 'Search for {type}',
          page: 'Page',
          of: 'of',
          previous: 'Previous',
          next: 'Next',
          'page-plural': 'Pages',
          add: 'Add',
          entity: 'Entity',
          documentation: 'Documentation',
          'doc-plural-lowercase': 'docs',
          'no-description': 'No description',
          'no-matching-result-plural': 'No matching results',
          resource: 'Resource',
          'entity-detail-plural': '{entity} Details',
        },
        message: {
          'page-sub-header-for-bots': 'Create well-defined bots with scoped access permissions.',
          'admin-only-action': 'Only an Admin can perform this action.',
          'ingestion-bot-cant-be-deleted': 'You cannot delete the ingestion bot.',
          'adding-new-entity-is-easy-just-give-it-a-spin':
            'Adding a new {entity} is easy, just give it a spin!',
          'refer-to-our-doc': 'Still need help? Refer to our <0>{doc}</0> for more information.',
          'no-access-placeholder':
            "You don't have necessary permissions. Please check with the admin to get the <0>{entity}</0> permission.",
          'check-spelling-or-try-shorter-term':
            'Check the spelling, or try a shorter or more general term.',
          'no-data-available': 'No data available.',
        },
        server: {
          'entity-deleted-successfully': '"{entity}" deleted successfully!',
          'delete-entity-error': 'Error while deleting "{entity}".',
          'unexpected-error': 'An unexpected error occurred.',
          entityLimitReached: '{entity} limit reached',
        },
        crud: {
          delete: 'Delete',
          cancel: 'Cancel',
        },
      },
    },
  });
}

interface FetchCall {
  url: string;
  init?: RequestInit;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const BOT_A = {
  id: 'b1',
  name: 'ingest-bot',
  displayName: 'Ingest Bot',
  description: 'Runs ingestion jobs.',
  fullyQualifiedName: 'ingest-bot',
  provider: 'system',
  botUser: { id: 'u1', name: 'ingest-bot', type: 'user' },
};

const BOT_B = {
  id: 'b2',
  name: 'quality-bot',
  displayName: 'Quality Bot',
  description: 'Checks data quality.',
  fullyQualifiedName: 'quality-bot',
  provider: 'user',
  botUser: { id: 'u2', name: 'quality-bot', type: 'user' },
};

const LIMIT_CONFIG = {
  enable: false,
  limits: {
    config: {
      version: '1',
      plan: 'FREE',
      installationType: 'OSS',
      deployment: 'local',
      companyName: '',
      domain: '',
      instances: 1,
      featureLimits: [],
    },
  },
};

let listFixture: { data: unknown[]; paging: Record<string, unknown> };
let deletedFixture: { data: unknown[]; paging: Record<string, unknown> };
let searchHits: unknown[];
let searchShouldFail: boolean;
let listShouldFail: boolean;
let featuresFixture: unknown;
let limitConfigFixture: unknown;
let calls: FetchCall[];


function searchInputEl(wrapper: VueWrapper) {
  const host = wrapper.find('[data-testid="search-input"]');
  return host.element.tagName === 'INPUT' ? host : host.find('input');
}

async function settled(wrapper: VueWrapper): Promise<void> {
  await flushPromises();
  await flushPromises();
  await wrapper.vm.$nextTick();
}

// Fake-timer-safe settle: flushPromises uses setImmediate, which
// Vitest's fake timers intercept, so it would hang while faked.
async function settledFake(wrapper: VueWrapper): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
  await wrapper.vm.$nextTick();
  await wrapper.vm.$nextTick();
}

async function mountList(
  asAdmin = true,
  initialQuery: Record<string, string> = {},
): Promise<{ wrapper: VueWrapper; router: Router }> {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = asAdmin
    ? { id: 'admin', name: 'admin', isAdmin: true }
    : { id: 'u9', name: 'bob' };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/bots', name: 'admin-bots', component: BotsListView },
      { path: '/admin/settings', name: 'admin-settings', component: { template: '<div />' } },
      { path: '/create-user/bot', name: 'create-user-bot', component: { template: '<div />' } },
      { path: '/bots/:fqn', name: 'bot-detail', component: { template: '<div />' } },
    ],
  });
  await router.push({ path: '/admin/bots', query: initialQuery });
  await router.isReady();
  const wrapper = mount(BotsListView, {
    global: {
      plugins: [pinia, router, Antd, createListI18n()],
    },
  });
  await settled(wrapper);
  return { wrapper, router };
}

describe('BotsListView', () => {
  beforeEach(() => {
    localStorage.clear();
    listFixture = { data: [BOT_A, BOT_B], paging: { after: '', before: '', total: 2 } };
    deletedFixture = { data: [], paging: { after: '', before: '', total: 0 } };
    searchHits = [];
    searchShouldFail = false;
    listShouldFail = false;
    featuresFixture = { featureLimitStatuses: [] };
    limitConfigFixture = LIMIT_CONFIG;
    calls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, init });
        if (url.includes('/api/v1/search/query')) {
          if (searchShouldFail) {
            return new Response('boom', { status: 500 });
          }
          return jsonResponse({ hits: { hits: searchHits } });
        }
        if (url.includes('/api/v1/bots/') && init?.method === 'DELETE') {
          return jsonResponse({});
        }
        if (url.includes('/api/v1/bots')) {
          if (listShouldFail) {
            return new Response('boom', { status: 500 });
          }
          const query = new URL(url, 'http://test.local').searchParams;
          return jsonResponse(query.get('include') === 'deleted' ? deletedFixture : listFixture);
        }
        if (url.includes('/api/v1/limits/config')) {
          return jsonResponse(limitConfigFixture);
        }
        if (url.includes('/api/v1/limits/features/bot')) {
          return jsonResponse(featuresFixture);
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('renders exactly 3 columns with FQN links and no Bot User column', async () => {
    const { wrapper } = await mountList();
    const headers = wrapper.findAll('thead th').map((th) => th.text().trim());
    expect(headers).toEqual(['Name', 'Description', 'Actions']);
    expect(wrapper.text()).not.toContain('Bot User');

    const link = wrapper.find('[data-testid="bot-link-Ingest Bot"]');
    expect(link.exists()).toBe(true);
    expect(link.attributes('href')).toBe('/bots/ingest-bot');
    expect(wrapper.find('[data-testid="bot-delete-ingest-bot"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="bot-delete-quality-bot"]').exists()).toBe(true);
    expect(document.title).toBe('Bot Details');
  });

  it('shows the create placeholder when the non-deleted list is empty', async () => {
    listFixture = { data: [], paging: { after: '', before: '', total: 0 } };
    const { wrapper, router } = await mountList();
    expect(wrapper.find('[data-testid="create-error-placeholder-Bot"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Adding a new Bot is easy, just give it a spin!');
    expect(wrapper.find('[data-testid="admin-bots-table"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="switch-deleted"]').exists()).toBe(true);

    await wrapper.find('[data-testid="add-placeholder-button"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/create-user/bot');
  });

  it('shows the permission placeholder for a non-admin when the list is empty', async () => {
    listFixture = { data: [], paging: { after: '', before: '', total: 0 } };
    const { wrapper } = await mountList(false);
    expect(wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="create-error-placeholder-Bot"]').exists()).toBe(false);
  });

  it('toggles Show Deleted and shows the no-search placeholder when empty', async () => {
    const { wrapper } = await mountList();
    await wrapper.find('[data-testid="switch-deleted"]').trigger('click');
    await settled(wrapper);
    const deletedCalls = calls.filter((call) => call.url.includes('include=deleted'));
    expect(deletedCalls.length).toBeGreaterThan(0);
    expect(wrapper.find('[data-testid="search-error-placeholder"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('No matching results');
  });

  it('disables Add and delete for non-admins', async () => {
    const { wrapper } = await mountList(false);
    const add = wrapper.find('[data-testid="add-bot"]');
    expect(add.attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="bot-delete-quality-bot"]').attributes('disabled')).toBeDefined();
  });

  it('disables delete for system-provider bots even for admins', async () => {
    const { wrapper } = await mountList();
    expect(wrapper.find('[data-testid="bot-delete-ingest-bot"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="bot-delete-quality-bot"]').attributes('disabled')).toBeUndefined();
  });

  it('disables Add when the bot limit is reached', async () => {
    // LimitWrapper passes through ungated while the limit config is
    // disabled; the gate only engages with enable: true.
    limitConfigFixture = { ...LIMIT_CONFIG, enable: true };
    featuresFixture = {
      featureLimitStatuses: [
        {
          name: 'bot',
          limitReached: true,
          currentCount: 5,
          configuredLimit: {
            name: 'bot',
            disableFields: [],
            disabledFields: [],
            limits: { softLimit: 1, hardLimit: 5 },
          },
        },
      ],
    };
    const { wrapper } = await mountList();
    expect(wrapper.find('[data-testid="add-bot"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="limit-reached-trigger"]').exists()).toBe(true);
  });

  it('searches with the official query filter and highlights matches', async () => {
    searchHits = [{ _source: { id: 'u1', name: 'ingest-bot', displayName: 'Ingest Bot' } }];
    const { wrapper } = await mountList();
    vi.useFakeTimers();
    const input = searchInputEl(wrapper);
    await input.setValue('ingest');
    await vi.advanceTimersByTimeAsync(600);
    await settledFake(wrapper);

    const searchCalls = calls.filter((call) => call.url.includes('/api/v1/search/query'));
    expect(searchCalls).toHaveLength(1);
    const query = new URL(searchCalls[0].url, 'http://test.local').searchParams;
    expect(query.get('index')).toBe('user');
    expect(query.get('size')).toBe('100');
    const filter = JSON.parse(query.get('query_filter') ?? '{}') as Record<string, unknown>;
    expect(filter).toMatchObject({
      query: { bool: { must: [{ term: { isBot: true } }], minimum_should_match: 1 } },
    });
    const link = wrapper.find('[data-testid="bot-link-Ingest Bot"]');
    expect(link.find('[data-highlight="true"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="bot-link-Quality Bot"]').exists()).toBe(false);
    // Pagination hides while a search term is active.
    expect(wrapper.find('[data-testid="pagination"]').exists()).toBe(false);
  });

  it('caps the search term at 128 characters', async () => {
    const { wrapper } = await mountList();
    vi.useFakeTimers();
    const input = searchInputEl(wrapper);
    await input.setValue('x'.repeat(150));
    await vi.advanceTimersByTimeAsync(600);
    await settledFake(wrapper);
    const searchCalls = calls.filter((call) => call.url.includes('/api/v1/search/query'));
    expect(searchCalls).toHaveLength(1);
    const query = new URL(searchCalls[0].url, 'http://test.local').searchParams;
    const filter = JSON.parse(query.get('query_filter') ?? '{}') as {
      query: { bool: { should: Array<{ wildcard: Record<string, { value: string }> }> } };
    };
    const wildcard = filter.query.bool.should[0].wildcard['name.keyword'].value;
    expect(wildcard).toBe(`*${'x'.repeat(128)}*`);
  });

  it('clears the search and restores the list', async () => {
    searchHits = [{ _source: { id: 'u1', name: 'ingest-bot' } }];
    const { wrapper } = await mountList();
    vi.useFakeTimers();
    const input = searchInputEl(wrapper);
    await input.setValue('ingest');
    await vi.advanceTimersByTimeAsync(600);
    await settledFake(wrapper);
    expect(wrapper.find('[data-testid="bot-link-Quality Bot"]').exists()).toBe(false);
    await input.setValue('');
    await vi.advanceTimersByTimeAsync(600);
    await settledFake(wrapper);
    expect(wrapper.find('[data-testid="bot-link-Quality Bot"]').exists()).toBe(true);
  });

  it('toasts on search failure and shows the empty placeholder', async () => {
    searchShouldFail = true;
    const errorSpy = vi.spyOn(message, 'error');
    const { wrapper } = await mountList();
    vi.useFakeTimers();
    const input = searchInputEl(wrapper);
    await input.setValue('ingest');
    await vi.advanceTimersByTimeAsync(600);
    await settledFake(wrapper);
    expect(errorSpy).toHaveBeenCalled();
    expect(wrapper.find('[data-testid="search-error-placeholder"]').exists()).toBe(true);
  });

  it('toasts on list failure without a persistent error surface', async () => {
    listShouldFail = true;
    const errorSpy = vi.spyOn(message, 'error');
    const { wrapper } = await mountList();
    expect(errorSpy).toHaveBeenCalled();
    expect(wrapper.find('.ant-alert').exists()).toBe(false);
    expect(wrapper.find('[data-testid="search-error-placeholder"]').exists()).toBe(true);
  });

  it('pages with the shared NextPrevious and persists the size choice', async () => {
    listFixture = { data: [BOT_A, BOT_B], paging: { after: 'cursor-after', before: '', total: 30 } };
    const { wrapper } = await mountList();
    const pager = wrapper.findComponent(NextPrevious);
    expect(pager.exists()).toBe(true);
    expect(pager.props('pageSize')).toBe(15);
    expect(pager.props('currentPage')).toBe(1);
    expect(wrapper.find('[data-testid="page-indicator"]').text()).toContain('Page 1 of 2');

    await wrapper.find('[data-testid="next"]').trigger('click');
    await settled(wrapper);
    const paged = calls.filter((call) => call.url.includes('/api/v1/bots') && call.url.includes('after=cursor-after'));
    expect(paged.length).toBeGreaterThan(0);

    pager.props('onShowSizeChange')?.(25);
    await settled(wrapper);
    expect(JSON.parse(localStorage.getItem('sm.userPreferences.v1') ?? '{}')).toMatchObject({
      preferences: { admin: { globalPageSize: 25 } },
    });
    const resized = calls.filter((call) => call.url.includes('/api/v1/bots') && call.url.includes('limit=25'));
    expect(resized.length).toBeGreaterThan(0);
  });

  it('seeds paging state from the URL', async () => {
    await mountList(true, {
      currentPage: '2',
      pageSize: '25',
      cursorType: 'after',
      cursorValue: 'c1',
    });
    expect(
      calls.some((call) => call.url.includes('after=c1') && call.url.includes('limit=25')),
    ).toBe(true);
  });

  it('seeds the page size from the persisted global preference', async () => {
    writeGlobalPageSize(localStorage, 'admin', 50);
    const { wrapper } = await mountList();
    expect(wrapper.findComponent(NextPrevious).props('pageSize')).toBe(50);
  });

  it('deletes via the modal, toasts, and refetches with a fresh limit and map', async () => {
    const successSpy = vi.spyOn(message, 'success');
    const { wrapper } = await mountList();
    const before = calls.length;
    await wrapper.find('[data-testid="bot-delete-quality-bot"]').trigger('click');
    await wrapper.vm.$nextTick();
    const modal = wrapper.findComponent(DeleteEntityModal);
    expect(modal.props('open')).toBe(true);
    expect(modal.props('entityName')).toBe('Quality Bot');
    expect(modal.props('allowSoftDelete')).toBe(true);

    await modal.vm.$emit('confirm', 'soft-delete');
    await settled(wrapper);

    const deletes = calls.slice(before).filter((call) => call.init?.method === 'DELETE');
    expect(deletes).toHaveLength(1);
    expect(deletes[0].url).toContain('/api/v1/bots/b2');
    expect(new URL(deletes[0].url, 'http://test.local').searchParams.get('hardDelete')).toBe('false');
    expect(successSpy).toHaveBeenCalledWith('"Quality Bot" deleted successfully!');
    const refetches = calls
      .slice(before)
      .filter((call) => call.url.includes('/api/v1/bots') && call.init?.method !== 'DELETE');
    expect(refetches.length).toBeGreaterThan(0);
    const limitRefreshes = calls.slice(before).filter((call) => call.url.includes('/api/v1/limits/features/bot'));
    expect(limitRefreshes.length).toBeGreaterThan(0);
  });

  it('navigates to the create-bot path from Add', async () => {
    const { wrapper, router } = await mountList();
    await wrapper.find('[data-testid="add-bot"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/create-user/bot');
  });
});
