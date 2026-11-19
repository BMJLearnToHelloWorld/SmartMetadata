/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import Antd from 'ant-design-vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { ColumnEntityReference } from '@/utils/columns';
import ReferenceListCell from './ReferenceListCell.vue';

async function createTestRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/:pathMatch(.*)*', component: defineComponent({ render: () => h('div') }) },
    ],
  });
  router.push('/');
  await router.isReady();
  return router;
}

function createCellI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        message: {
          'no-permission-to-view': 'You do not have the necessary permissions to view this data.',
        },
      },
    },
  });
}

const refs: ColumnEntityReference[] = [
  { name: 'first', displayName: 'First', fullyQualifiedName: 'first' },
  { name: 'second', fullyQualifiedName: 'second' },
  { name: 'third', fullyQualifiedName: 'third' },
];

async function mountCell(props: Record<string, unknown> = {}) {
  const router = await createTestRouter();
  return mount(ReferenceListCell, {
    props: {
      references: refs,
      hasViewPermission: true,
      pathFor: (ref: ColumnEntityReference) => `/settings/access/policies/${ref.fullyQualifiedName ?? ''}`,
      testId: 'policy-link',
      ...props,
    },
    global: { plugins: [Antd, createCellI18n(), router] },
  });
}

describe('ReferenceListCell (official Roles/Policies reference columns)', () => {
  afterEach(() => {
    document.querySelectorAll('.ant-popover, .ant-tooltip').forEach((el) => el.remove());
  });

  it("renders '-- ' for an empty list", async () => {
    const wrapper = await mountCell({ references: [] });
    expect(wrapper.element.textContent).toBe('-- ');
    expect(wrapper.find('[data-testid="policy-link"]').exists()).toBe(false);
  });

  it('renders the first reference as a link and the overflow count as a literal +N more badge', async () => {
    const wrapper = await mountCell();
    const container = wrapper.find('[data-testid="policy-link"]');
    expect(container.exists()).toBe(true);
    const links = container.findAll('a');
    expect(links).toHaveLength(1);
    expect(links[0].text()).toBe('First');
    expect(links[0].attributes('href')).toBe('/settings/access/policies/first');
    expect(wrapper.find('[data-testid="plus-more-count"]').text()).toBe('+2 more');
  });

  it('renders no badge when the list fits within LIST_CAP', async () => {
    const wrapper = await mountCell({ references: [refs[0]] });
    expect(wrapper.find('[data-testid="plus-more-count"]').exists()).toBe(false);
  });

  it('degrades to plain text with the no-permission-to-view tooltip without view permission', async () => {
    const wrapper = await mountCell({ hasViewPermission: false });
    expect(wrapper.find('[data-testid="policy-link"]').findAll('a')).toHaveLength(0);
    expect(wrapper.find('[data-testid="policy-link"]').text()).toContain('First');
    const tooltip = wrapper.findComponent({ name: 'ATooltip' });
    expect(tooltip.props('title')).toBe(
      'You do not have the necessary permissions to view this data.',
    );
  });

  it('shows the overflow references in the popover with the same permission branches', async () => {
    const wrapper = await mountCell();
    await wrapper.find('[data-testid="plus-more-count"]').trigger('click');
    await flushPromises();
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('second');
      expect(document.body.textContent).toContain('third');
    });
    wrapper.unmount();
  });
});
