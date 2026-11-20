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
import ContainerChildrenWidget from './ContainerChildrenWidget.vue';

const { listContainerChildrenMock } = vi.hoisted(() => ({
  listContainerChildrenMock: vi.fn(),
}));

vi.mock('@/api/containers', () => ({
  listContainerChildren: listContainerChildrenMock,
}));

const ROWS = [
  { id: 'c1', name: 'raw', displayName: 'Raw', fullyQualifiedName: 'svc.cont.raw', description: 'Raw files' },
  { id: 'c2', name: 'processed', fullyQualifiedName: 'svc.cont.processed', description: 'Processed files' },
];

async function mountWidget(containerFqn = 'svc.cont') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/asset/:entityType/:fqn', name: 'asset', component: { template: '<div />' } }],
  });
  await router.push('/asset/container/svc.cont');
  await router.isReady();
  const wrapper = mount(ContainerChildrenWidget, {
    props: { containerFqn },
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('ContainerChildrenWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listContainerChildrenMock.mockResolvedValue({ data: ROWS, total: 2 });
  });

  it('fetches children from the container children endpoint and renders name links', async () => {
    const { wrapper } = await mountWidget();
    expect(listContainerChildrenMock).toHaveBeenCalledWith('svc.cont', {
      limit: 10,
      offset: 0,
      include: 'non-deleted',
      q: undefined,
    });
    expect(wrapper.text()).toContain('Raw');
    expect(wrapper.text()).toContain('Processed files');
    expect(wrapper.find('[data-testid="container-name"]').attributes('href')).toBe('#');
    wrapper.unmount();
  });

  it('navigates to the child container on row click', async () => {
    const { wrapper, router } = await mountWidget();
    await wrapper.find('[data-testid="container-name"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.params).toMatchObject({ entityType: 'container', fqn: 'svc.cont.raw' });
    wrapper.unmount();
  });

  it('shows the load error instead of stale rows when the fetch fails', async () => {
    listContainerChildrenMock.mockRejectedValueOnce(new Error('boom'));
    const { wrapper } = await mountWidget();
    expect(wrapper.text()).toContain('boom');
    expect(wrapper.text()).not.toContain('Raw');
    wrapper.unmount();
  });
});
