/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import { ApiError } from '@/api/client';
import type { EntityRef } from '@/types/api';
import type { NativeOntologyDataGraphPage } from '@/types/ontologyDataGraph';
import { useNativeOntologyDataGraph } from './useNativeOntologyDataGraph';

const fetchPage = vi.hoisted(() => vi.fn());

vi.mock('@/api/ontology', () => ({
  getNativeOntologyDataGraphPage: fetchPage,
}));

function ref(id: string, name: string): EntityRef {
  return { id, name, displayName: name, type: 'table', fullyQualifiedName: `svc.${name}` };
}

function clustersPage(
  clusters: NonNullable<NativeOntologyDataGraphPage['clusters']>,
  options: { nextClusterOffset?: number; topologyAfter?: string } = {},
): NativeOntologyDataGraphPage {
  return {
    clusters,
    contextFull: false,
    loaded: [{ bindingRevision: 1, conceptId: 'c1' }],
    nextClusterOffset: options.nextClusterOffset,
    topology: { edges: [], lineageEdges: [], after: options.topologyAfter },
  };
}

function cluster(conceptId: string): NonNullable<NativeOntologyDataGraphPage['clusters']>[number] {
  return {
    concept: ref(conceptId, conceptId === 'c1' ? 'Customer' : 'Order'),
    assetCount: 1,
    assets: [{ asset: ref('a1', 'T1'), columnCount: 0 }],
  };
}

const TestComponent = defineComponent({
  setup() {
    return useNativeOntologyDataGraph('o1');
  },
  template: '<div />',
});

async function settle(): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await flushPromises();
  }
}

beforeEach(() => {
  fetchPage.mockReset();
});

describe('useNativeOntologyDataGraph', () => {
  it('loads the first clusters page and drains topology on mount', async () => {
    fetchPage.mockResolvedValueOnce(clustersPage([cluster('c1')]));
    const wrapper = mount(TestComponent);
    await settle();
    expect(fetchPage).toHaveBeenCalledTimes(1);
    const request = fetchPage.mock.calls[0]![1] as { page: { kind: string; offset: number } };
    expect(request.page).toEqual({ kind: 'clusters', limit: 12, offset: 0 });
    expect(wrapper.vm.graph.clusters.map((item) => item.concept.id)).toEqual(['c1']);
    expect(wrapper.vm.isLoading).toBe(false);
    expect(wrapper.vm.failure).toBeUndefined();
    wrapper.unmount();
  });

  it('continues paging while the clusters tail is empty and the offset advances', async () => {
    fetchPage
      .mockResolvedValueOnce(clustersPage([], { nextClusterOffset: 1 }))
      .mockResolvedValueOnce(clustersPage([cluster('c1')]));
    const wrapper = mount(TestComponent);
    await settle();
    expect(fetchPage).toHaveBeenCalledTimes(2);
    const second = fetchPage.mock.calls[1]![1] as { page: { offset: number } };
    expect(second.page.offset).toBe(1);
    expect(wrapper.vm.graph.clusters).toHaveLength(1);
    expect(wrapper.vm.isLoading).toBe(false);
    wrapper.unmount();
  });

  it('drains topology pages by following after until it is empty', async () => {
    fetchPage
      .mockResolvedValueOnce(clustersPage([cluster('c1')], { topologyAfter: 't1' }))
      .mockResolvedValueOnce({
        contextFull: false,
        loaded: [{ bindingRevision: 1, conceptId: 'c1' }],
        topology: {
          edges: [{ fromConceptId: 'c1', toConceptId: 'c2', propertyIri: 'https://x#p' }],
          lineageEdges: [],
        },
      });
    const wrapper = mount(TestComponent);
    await settle();
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(wrapper.vm.graph.topology.conceptEdges).toHaveLength(1);
    expect(wrapper.vm.isLoading).toBe(false);
    wrapper.unmount();
  });

  it('reloads once on a stale page and then fails with a reload retry', async () => {
    fetchPage
      .mockRejectedValueOnce(new ApiError(412, '', 'stale'))
      .mockRejectedValueOnce(new ApiError(412, '', 'stale'));
    const wrapper = mount(TestComponent);
    await settle();
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(wrapper.vm.failure).toEqual({ reason: 'stale', retry: { kind: 'reload' } });
    expect(wrapper.vm.isLoading).toBe(false);
    wrapper.unmount();
  });

  it('fails immediately on an invalid first page', async () => {
    fetchPage.mockRejectedValueOnce(new ApiError(400, '', 'invalid'));
    const wrapper = mount(TestComponent);
    await settle();
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(wrapper.vm.failure).toEqual({ reason: 'invalid', retry: { kind: 'reload' } });
    wrapper.unmount();
  });

  it('recovers through retry after a stale failure', async () => {
    fetchPage
      .mockRejectedValueOnce(new ApiError(412, '', 'stale'))
      .mockRejectedValueOnce(new ApiError(412, '', 'stale'))
      .mockResolvedValueOnce(clustersPage([cluster('c1')]));
    const wrapper = mount(TestComponent);
    await settle();
    expect(wrapper.vm.failure).toBeDefined();
    (wrapper.vm.retry as () => void)();
    await settle();
    expect(wrapper.vm.failure).toBeUndefined();
    expect(wrapper.vm.graph.clusters).toHaveLength(1);
    expect(wrapper.vm.isLoading).toBe(false);
    wrapper.unmount();
  });
});
