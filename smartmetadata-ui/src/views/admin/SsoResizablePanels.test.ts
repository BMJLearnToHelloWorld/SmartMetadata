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
import { describe, expect, it, vi } from 'vitest';
import { h } from 'vue';
import { createTestI18n } from '@/test/i18n';
import SsoResizablePanels from './SsoResizablePanels.vue';

function mountPanels(props: Record<string, unknown> = {}) {
  return mount(SsoResizablePanels, {
    props: {
      firstPanel: { className: 'first-class', minWidth: 400, flex: 0.5 },
      secondPanel: { className: 'second-class', minWidth: 400, flex: 0.5 },
      ...props,
    },
    slots: {
      'first-panel': () => h('div', { id: 'first-content' }, 'first'),
      'second-panel': () => h('div', { id: 'second-content' }, 'second'),
    },
    global: { plugins: [createTestI18n('en-US')] },
  });
}

describe('SsoResizablePanels', () => {
  it('renders both panels wrapped in Cards with the scroll selector shape', () => {
    const wrapper = mountPanels();
    const first = wrapper.find('.resizable-first-panel');
    expect(first.attributes('data-testid')).toBe('first-class');
    const card = first.element.firstElementChild;
    expect(card?.classList.contains('ant-card')).toBe(true);
    expect(card?.classList.contains('overflow-y-auto')).toBe(true);
    expect(wrapper.find('#first-content').exists()).toBe(true);
    expect(wrapper.find('#second-content').exists()).toBe(true);
    expect(wrapper.find('.splitter.right-panel-splitter').exists()).toBe(true);
    expect(wrapper.find('[data-testid="resizable-panels"]').exists()).toBe(
      true,
    );
  });

  it('hides the second panel and splitter and widens the first', () => {
    const wrapper = mountPanels({ hideSecondPanel: true });
    expect(wrapper.find('.resizable-first-panel').classes()).toContain(
      'full-width',
    );
    expect(wrapper.find('.splitter').exists()).toBe(false);
    expect(wrapper.find('#second-content').exists()).toBe(false);
  });

  it('drags the splitter within the min-width clamps', async () => {
    const wrapper = mountPanels();
    const container = wrapper.find('[data-testid="resizable-panels"]')
      .element as HTMLElement;
    const first = wrapper.find('.resizable-first-panel')
      .element as HTMLElement;
    const splitter = wrapper.find('.splitter').element as HTMLElement;
    const rect = (width: number) =>
      ({ width, height: 600, top: 0, left: 0, right: width, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(rect(1200));
    vi.spyOn(first, 'getBoundingClientRect').mockReturnValue(rect(600));
    vi.spyOn(splitter, 'getBoundingClientRect').mockReturnValue(rect(8));

    await splitter.dispatchEvent(new PointerEvent('pointerdown', { clientX: 600, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 700 }));
    window.dispatchEvent(new PointerEvent('pointerup'));
    await wrapper.vm.$nextTick();
    expect((first as HTMLElement).style.flex).toBe('0 0 700px');

    await splitter.dispatchEvent(new PointerEvent('pointerdown', { clientX: 700, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 100 }));
    window.dispatchEvent(new PointerEvent('pointerup'));
    await wrapper.vm.$nextTick();
    expect((first as HTMLElement).style.flex).toBe('0 0 400px');
  });
});
