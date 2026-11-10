/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { useRailPager } from './useRailPager';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useRailPager', () => {
  it('reads scrollability off the element and pages by a fraction of its width', async () => {
    const scrollBy = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollBy', {
      value: scrollBy,
      configurable: true,
    });
    const count = ref(3);
    const Harness = defineComponent({
      setup() {
        const pager = useRailPager(count);
        return { ...pager, count };
      },
      template: `<ul ref="railRef"><li>a</li><li>b</li><li>c</li></ul>`,
    });
    const wrapper = mount(Harness);
    await nextTick();
    const rail = wrapper.find('ul').element as HTMLElement;
    Object.defineProperty(rail, 'clientWidth', { value: 100, configurable: true });
    Object.defineProperty(rail, 'scrollWidth', { value: 300, configurable: true });
    Object.defineProperty(rail, 'scrollLeft', { value: 0, configurable: true });
    const pager = wrapper.vm as unknown as {
      canScroll: { next: boolean; previous: boolean };
      pageIndex: number;
      syncScrollState: () => void;
      goToNext: () => void;
    };
    pager.syncScrollState();
    expect(pager.canScroll).toEqual({ next: true, previous: false });
    pager.goToNext();
    expect(scrollBy).toHaveBeenCalledWith({ behavior: 'smooth', left: 90 });
    Object.defineProperty(rail, 'scrollLeft', { value: 200, configurable: true });
    pager.syncScrollState();
    expect(pager.canScroll).toEqual({ next: false, previous: true });
    expect(pager.pageIndex).toBe(2);
  });
});
