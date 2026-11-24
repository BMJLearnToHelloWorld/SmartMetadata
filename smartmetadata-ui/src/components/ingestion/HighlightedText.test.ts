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
import HighlightedText from './HighlightedText.vue';

function highlights(wrapper: ReturnType<typeof mount>): string[] {
  return wrapper.findAll('.text-highlighter').map((node) => node.text());
}

describe('HighlightedText', () => {
  it('highlights a single search text case-insensitively', () => {
    const wrapper = mount(HighlightedText, { props: { text: 'Daily Orders report', searchText: 'orders' } });
    expect(highlights(wrapper)).toEqual(['Orders']);
    expect(wrapper.text()).toBe('Daily Orders report');
  });

  it('highlights several ES-derived terms at once', () => {
    const wrapper = mount(HighlightedText, {
      props: { text: 'Daily orders and shipments report', searchTerms: ['orders', 'shipments'] },
    });
    expect(highlights(wrapper)).toEqual(['orders', 'shipments']);
  });

  it('tries the longest term first so a short term never swallows a longer one', () => {
    const wrapper = mount(HighlightedText, {
      props: { text: 'orders order', searchTerms: ['order', 'orders'] },
    });
    expect(highlights(wrapper)).toEqual(['orders', 'order']);
  });

  it('escapes regex characters in the terms', () => {
    const wrapper = mount(HighlightedText, {
      props: { text: 'price (USD) and price USD', searchTerms: ['(USD)'] },
    });
    expect(highlights(wrapper)).toEqual(['(USD)']);
  });

  it('renders plain text when there is nothing to highlight', () => {
    const wrapper = mount(HighlightedText, { props: { text: 'Daily orders' } });
    expect(highlights(wrapper)).toEqual([]);
    expect(wrapper.text()).toBe('Daily orders');
  });
});
