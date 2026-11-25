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
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { defineComponent, h } from 'vue';
import ResizablePanels from './ResizablePanels.vue';

function mountPanels(props: Record<string, unknown> = {}) {
  const host = defineComponent({
    render() {
      return h(
        ResizablePanels,
        {
          firstPanel: { minWidth: 700, flex: 0.7, className: 'first-panel' },
          secondPanel: { minWidth: 400, flex: 0.3, className: 'second-panel' },
          ...props,
        },
        { first: () => 'FORM', second: () => 'DOCS' },
      );
    },
  });
  return mount(host, {
    global: {
      plugins: [
        Antd,
        createI18n({
          legacy: false,
          locale: 'en',
          messages: { en: { label: { expand: 'Expand', collapse: 'Collapse' } } },
        }),
      ],
    },
    attachTo: document.body,
  });
}

describe('ResizablePanels (pin common/ResizablePanels)', () => {
  it('renders both panels wrapped in cards by default', () => {
    const wrapper = mountPanels();
    expect(wrapper.text()).toContain('FORM');
    expect(wrapper.text()).toContain('DOCS');
    expect(wrapper.findAll('.ant-card')).toHaveLength(2);
    wrapper.unmount();
  });

  it('uses the panel className as the panel testid, per pin', () => {
    const wrapper = mountPanels();
    expect(wrapper.find('[data-testid="first-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="second-panel"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('collapses and expands the right panel from the splitter', async () => {
    const wrapper = mountPanels();
    await wrapper.find('[data-testid="sidebar-collapse"]').trigger('click');
    expect(wrapper.text()).not.toContain('DOCS');
    expect(wrapper.find('[data-testid="sidebar-toggle"]').exists()).toBe(true);
    await wrapper.find('[data-testid="sidebar-toggle"]').trigger('click');
    expect(wrapper.text()).toContain('DOCS');
    wrapper.unmount();
  });

  it('hides the second panel and splitter when hideSecondPanel', () => {
    const wrapper = mountPanels({ hideSecondPanel: true });
    expect(wrapper.text()).not.toContain('DOCS');
    expect(wrapper.find('[data-testid="sidebar-collapse"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('reports the new flex fraction when a drag ends', async () => {
    const onStopResize = vi.fn();
    const wrapper = mountPanels({
      firstPanel: { minWidth: 700, flex: 0.7, className: 'first-panel', onStopResize },
      secondPanel: { minWidth: 400, flex: 0.3, className: 'second-panel' },
    });
    const container = wrapper.find('[data-testid="first-panel"]').element.parentElement as HTMLElement;
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width: 1000,
      top: 0,
      right: 1000,
      bottom: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const splitter = wrapper.find('[data-testid="sidebar-collapse"]').element.parentElement as HTMLElement;
    splitter.dispatchEvent(new MouseEvent('pointerdown', { clientX: 700, bubbles: true }));
    container.dispatchEvent(new MouseEvent('pointermove', { clientX: 500, bubbles: true }));
    container.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
    expect(onStopResize).toHaveBeenCalledTimes(1);
    // 500px of a 1000px container, clamped above the 700px min-width floor
    // (700/992 ≈ 0.706), so the drag lands on the floor.
    expect(onStopResize).toHaveBeenCalledWith(expect.closeTo(700 / 992, 3));
    wrapper.unmount();
  });
});
