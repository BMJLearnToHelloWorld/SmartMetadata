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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import ApiEndpointsWidget from './ApiEndpointsWidget.vue';

const { listApiEndpointsMock, searchAssetsMock } = vi.hoisted(() => ({
  listApiEndpointsMock: vi.fn(),
  searchAssetsMock: vi.fn(),
}));

vi.mock('@/api/apiCollections', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/apiCollections')>();
  return { ...actual, listApiEndpoints: listApiEndpointsMock };
});

vi.mock('@/api/search', () => ({
  searchAssets: searchAssetsMock,
}));

const ENDPOINTS = [
  { id: 'e1', name: 'getPet', displayName: 'Get Pet', fullyQualifiedName: 'svc.petstore.getPet', requestMethod: 'GET', description: 'Fetch a pet' },
  { id: 'e2', name: 'addPet', fullyQualifiedName: 'svc.petstore.addPet', requestMethod: 'POST' },
];

async function mountWidget() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/asset/:entityType/:fqn', name: 'asset', component: { template: '<div />' } }],
  });
  await router.push('/asset/apiCollection/svc.petstore');
  await router.isReady();
  const wrapper = mount(ApiEndpointsWidget, {
    props: { apiCollectionFqn: 'svc.petstore', serviceFqn: 'svc' },
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('ApiEndpointsWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    listApiEndpointsMock.mockResolvedValue({ data: ENDPOINTS, total: 2 });
    searchAssetsMock.mockResolvedValue({ total: 0, hits: [] });
  });

  it('lists the collection endpoints with method and description', async () => {
    const { wrapper } = await mountWidget();
    expect(listApiEndpointsMock).toHaveBeenCalledWith({
      apiCollection: 'svc.petstore',
      service: 'svc',
      limit: 10,
      include: 'non-deleted',
    });
    expect(wrapper.text()).toContain('Get Pet');
    expect(wrapper.text()).toContain('GET');
    expect(wrapper.text()).toContain('Fetch a pet');
    wrapper.unmount();
  });

  it('navigates to the endpoint detail on row click', async () => {
    const { wrapper, router } = await mountWidget();
    await wrapper.find('[data-testid="getPet"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.params).toMatchObject({ entityType: 'apiEndpoint', fqn: 'svc.petstore.getPet' });
    wrapper.unmount();
  });

  it('searches the api_endpoint index with the collection FQN filter (no .keyword)', async () => {
    vi.useFakeTimers();
    const { wrapper } = await mountWidget();
    searchAssetsMock.mockResolvedValue({
      total: 1,
      hits: [
        {
          id: 'e1',
          name: 'getPet',
          displayName: 'Get Pet',
          fullyQualifiedName: 'svc.petstore.getPet',
          entityType: 'apiEndpoint',
          description: 'Fetch a pet',
          owners: [],
          tags: [],
          requestMethod: 'GET',
        },
      ],
    });
    const input = wrapper.find('[data-testid="search-api-endpoints-input"]');
    await input.setValue('getPet');
    await vi.advanceTimersByTimeAsync(600);
    await flushPromises();
    expect(searchAssetsMock).toHaveBeenCalledWith(
      '',
      0,
      10,
      expect.objectContaining({ index: 'api_endpoint' }),
    );
    const filter = JSON.parse(searchAssetsMock.mock.calls[0][3].query_filter as string);
    expect(filter).toEqual({
      bool: {
        must: [
          { term: { 'apiCollection.fullyQualifiedName': 'svc.petstore' } },
          {
            bool: {
              should: [
                { wildcard: { 'displayName.keyword': '*getPet*' } },
                { wildcard: { 'name.keyword': '*getPet*' } },
              ],
              minimum_should_match: 1,
            },
          },
        ],
      },
    });
    expect(wrapper.text()).toContain('Get Pet');
    expect(wrapper.text()).toContain('GET');
    wrapper.unmount();
    vi.useRealTimers();
  });
});
