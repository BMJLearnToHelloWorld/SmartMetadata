/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import EntityNameLink from './EntityNameLink.vue';

async function createTestRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/settings/access/policies/:fqn', component: defineComponent({ render: () => h('div') }) },
      { path: '/:pathMatch(.*)*', component: defineComponent({ render: () => h('div') }) },
    ],
  });
  router.push('/');
  await router.isReady();
  return router;
}

describe('EntityNameLink (official name link cell)', () => {
  it('links to the caller-supplied path with the display name', async () => {
    const router = await createTestRouter();
    const wrapper = mount(EntityNameLink, {
      props: {
        record: { displayName: 'Display Name', name: 'nm' },
        to: '/settings/access/policies/abc',
        testId: 'policy-name',
      },
      global: { plugins: [router] },
    });
    const link = wrapper.find('[data-testid="policy-name"]');
    expect(link.text()).toBe('Display Name');
    expect(link.attributes('href')).toBe('/settings/access/policies/abc');
  });

  it('falls back to name, then to empty text, per getEntityName', async () => {
    const router = await createTestRouter();
    const nameOnly = mount(EntityNameLink, {
      props: { record: { name: 'nm' }, to: '/x' },
      global: { plugins: [router] },
    });
    expect(nameOnly.text()).toBe('nm');
    const empty = mount(EntityNameLink, {
      props: { record: {}, to: '/x' },
      global: { plugins: [router] },
    });
    expect(empty.text()).toBe('');
  });
});
