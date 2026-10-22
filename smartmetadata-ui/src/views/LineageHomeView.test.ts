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
import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import LineageHomeView from './LineageHomeView.vue';

describe('LineageHomeView', () => {
  it('opens the lineage route for the typed table FQN', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/lineage', name: 'lineage-home', component: LineageHomeView },
        { path: '/lineage/:entityType/:fqn', name: 'lineage', component: { template: '<div>graph</div>' } },
      ],
    });
    await router.push({ name: 'lineage-home' });
    await router.isReady();
    const wrapper = mount(LineageHomeView, {
      global: { plugins: [router, Antd] },
    });
    const fqn = wrapper.get('[data-testid="lineage-home-fqn"]');
    await fqn.setValue('svc.db.schema.orders');
    const input = fqn.find('input');
    if (input.exists()) {
      await input.setValue('svc.db.schema.orders');
    }
    await wrapper.get('[data-testid="lineage-home-open"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('lineage');
    expect(router.currentRoute.value.params).toEqual({
      entityType: 'table',
      fqn: 'svc.db.schema.orders',
    });
  });
});
