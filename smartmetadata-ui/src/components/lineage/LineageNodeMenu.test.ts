/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import LineageNodeMenu from './LineageNodeMenu.vue';

async function openMenu(props: Record<string, unknown>) {
  const wrapper = mount(LineageNodeMenu, {
    props,
    global: { plugins: [Antd, createTestI18n()] },
    attachTo: document.body,
  });
  await wrapper.find('[data-testid="lineage-node-menu"], [data-testid="lineage-column-menu"]').trigger('click');
  await flushPromises();
  return wrapper;
}

describe('LineageNodeMenu', () => {
  it('node variant offers edit upstream/downstream + delete when canDelete', async () => {
    const wrapper = await openMenu({ canDelete: true });
    expect(document.body.innerHTML).toContain('Edit upstream');
    expect(document.body.innerHTML).toContain('Edit downstream');
    const items = [...document.body.querySelectorAll('[data-testid^="lineage-menu-"]')];
    expect(items.map((item) => item.getAttribute('data-testid'))).toEqual([
      'lineage-menu-edit-upstream',
      'lineage-menu-edit-downstream',
      'lineage-menu-delete',
    ]);
    (items[0] as HTMLElement).click();
    await flushPromises();
    expect(wrapper.emitted('edit')).toEqual([['upstream']]);
    (items[2] as HTMLElement).click();
    await flushPromises();
    expect(wrapper.emitted('delete')).toHaveLength(1);
    wrapper.unmount();
  });

  it('node variant hides delete when canDelete is false', async () => {
    const wrapper = await openMenu({ canDelete: false });
    expect(document.body.querySelector('[data-testid="lineage-menu-delete"]')).toBeNull();
    expect(document.body.querySelector('[data-testid="lineage-menu-edit-upstream"]')).not.toBeNull();
    wrapper.unmount();
  });

  it('column variant offers only the two edit items, never delete', async () => {
    const wrapper = await openMenu({ columnFqn: 'svc.db.schema.orders.id', canDelete: true });
    expect(wrapper.find('[data-testid="lineage-column-menu"]').exists()).toBe(true);
    expect(document.body.querySelector('[data-testid="lineage-menu-delete"]')).toBeNull();
    const downstream = document.body.querySelector(
      '[data-testid="lineage-menu-edit-downstream"]',
    ) as HTMLElement;
    downstream.click();
    await flushPromises();
    expect(wrapper.emitted('edit')).toEqual([['downstream']]);
    wrapper.unmount();
  });
});
