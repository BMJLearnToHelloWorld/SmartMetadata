/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { DeleteOutlined } from '@ant-design/icons-vue';
import Antd from 'ant-design-vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import AppManageMenu from './AppManageMenu.vue';

describe('AppManageMenu', () => {
  it('renders the trigger label and menu items with descriptions', async () => {
    const onClick = vi.fn();
    const wrapper = mount(AppManageMenu, {
      props: {
        label: 'Manage Application',
        open: true,
        items: [
          {
            key: 'uninstall-button',
            id: 'uninstall-button',
            name: 'Uninstall',
            description: 'Uninstall Search Indexing',
            icon: DeleteOutlined,
            onClick,
          },
        ],
      },
      global: { plugins: [Antd] },
      attachTo: document.body,
    });
    await nextTick();
    expect(wrapper.text()).toContain('Manage Application');
    const item = document.body.querySelector('[data-testid="uninstall-button"]');
    expect(item?.textContent).toContain('Uninstall');
    expect(item?.textContent).toContain('Uninstall Search Indexing');
    (item as HTMLElement).click();
    await nextTick();
    expect(onClick).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});
