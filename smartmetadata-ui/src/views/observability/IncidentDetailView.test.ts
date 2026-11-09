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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import IncidentDetailView from './IncidentDetailView.vue';

const getTestIncident = vi.fn();

vi.mock('@/api/testIncidents', () => ({
  getTestIncident: (...args: unknown[]) => getTestIncident(...args),
}));

async function mountView(id: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/observability/incidents', name: 'observability-incidents', component: { template: '<div>list</div>' } },
      { path: '/observability/incidents/:id', name: 'observability-incident', component: IncidentDetailView, props: true },
      { path: '/test-case/:fqn/:tab?', name: 'quality-test-case-alias', component: { template: '<div>tc</div>' } },
      { path: '/quality/test-cases/:id', name: 'quality-test-case', component: { template: '<div>tc</div>' } },
    ],
  });
  await router.push({ name: 'observability-incident', params: { id } });
  await router.isReady();
  const wrapper = mount(IncidentDetailView, {
    props: { id },
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  await flushPromises();
  return { wrapper, router };
}

describe('IncidentDetailView redirect shell (F-D-2)', () => {
  beforeEach(() => {
    getTestIncident.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('redirects to the test-case alias path when the incident has a test-case FQN', async () => {
    getTestIncident.mockResolvedValue({
      id: 'inc1',
      testCaseReference: { id: 'tc-1', name: 'row_count', fullyQualifiedName: 'svc.db.schema.orders.row_count' },
    });
    const { router } = await mountView('inc1');
    expect(getTestIncident).toHaveBeenCalledWith('inc1');
    expect(router.currentRoute.value.path).toBe('/test-case/svc.db.schema.orders.row_count');
    expect(router.currentRoute.value.name).toBe('quality-test-case-alias');
  });

  it('redirects to the product test-case route by id when there is no FQN', async () => {
    getTestIncident.mockResolvedValue({
      id: 'inc1',
      testCaseReference: { id: 'tc-1', name: 'row_count' },
    });
    const { router } = await mountView('inc1');
    expect(router.currentRoute.value.name).toBe('quality-test-case');
    expect(router.currentRoute.value.params).toMatchObject({ id: 'tc-1' });
  });

  it('shows the no-test-case error when the incident names no test case', async () => {
    getTestIncident.mockResolvedValue({ id: 'inc1' });
    const { wrapper, router } = await mountView('inc1');
    expect(router.currentRoute.value.name).toBe('observability-incident');
    expect(wrapper.text()).toContain('no test case');
  });

  it('shows the load error when the incident fetch fails', async () => {
    getTestIncident.mockRejectedValue(new Error('gone'));
    const { wrapper } = await mountView('inc1');
    expect(wrapper.text()).toContain('gone');
  });

  it('reloads and redirects when the id prop changes', async () => {
    getTestIncident.mockResolvedValueOnce({
      id: 'inc1',
      testCaseReference: { fullyQualifiedName: 'svc.db.schema.orders.row_count' },
    });
    getTestIncident.mockResolvedValueOnce({
      id: 'inc2',
      testCaseReference: { fullyQualifiedName: 'svc.db.schema.orders.null_check' },
    });
    const { wrapper, router } = await mountView('inc1');
    expect(router.currentRoute.value.path).toBe('/test-case/svc.db.schema.orders.row_count');
    await wrapper.setProps({ id: 'inc2' });
    await flushPromises();
    await flushPromises();
    expect(getTestIncident).toHaveBeenCalledWith('inc2');
    expect(router.currentRoute.value.path).toBe('/test-case/svc.db.schema.orders.null_check');
  });
});
