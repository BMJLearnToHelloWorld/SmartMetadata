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
import Antd from 'ant-design-vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import HighlightedText from './HighlightedText.vue';
import ServiceChildOwnersCell from './ServiceChildOwnersCell.vue';
import ServiceChildTagsCell, { type CellTagLabel } from './ServiceChildTagsCell.vue';

afterEach(() => {
  document.body.innerHTML = '';
});

function tag(tagFQN: string, overrides: Partial<CellTagLabel> = {}): CellTagLabel {
  return { tagFQN, source: 'Classification', ...overrides };
}

describe('ServiceChildTagsCell (official TagsViewer, popover display)', () => {
  function mountCell(props: Record<string, unknown> = {}) {
    return mount(ServiceChildTagsCell, {
      props: { tags: [], ...props },
      attachTo: document.body,
      global: { plugins: [Antd, createTestI18n()] },
    });
  }

  it('renders -- when there are no tags', () => {
    expect(mountCell().text()).toBe('--');
  });

  it('dedupes by tagFQN, sorts by source and caps the visible chips', () => {
    const wrapper = mountCell({
      tags: [
        tag('G.Term', { source: 'Glossary' }),
        tag('PII.Sensitive'),
        tag('PII.Sensitive'),
        tag('A.B'),
        tag('C.D'),
      ],
    });
    const chips = wrapper.findAll('[data-testid^="tag-"]');
    expect(chips.map((chip) => chip.attributes('data-testid'))).toEqual([
      'tag-PII.Sensitive',
      'tag-A.B',
      'tag-C.D',
    ]);
    expect(wrapper.find('[data-testid="plus-more-count"]').text()).toBe('+1 more');
  });

  it('shows all tags when the cap is negative', () => {
    const wrapper = mountCell({ tags: [tag('A.B'), tag('C.D')], sizeCap: -1 });
    expect(wrapper.findAll('[data-testid^="tag-"]')).toHaveLength(2);
    expect(wrapper.find('[data-testid="plus-more-count"]').exists()).toBe(false);
  });

  it('renders the overflow tags in the popover', async () => {
    const wrapper = mountCell({ tags: [tag('A.B'), tag('C.D'), tag('E.F'), tag('G.H')] });
    (wrapper.find('[data-testid="plus-more-count"]').element as HTMLElement).click();
    await vi.waitFor(() => {
      const overlay = document.querySelector('.ant-popover:not([style*="display: none"])');
      expect(overlay?.textContent).toContain('G.H');
    });
  });

  it('collapses deep FQNs in chip labels', () => {
    const wrapper = mountCell({ tags: [tag('A.B.C.D')] });
    expect(wrapper.text()).toContain('A...C.D');
  });

  it('prefers displayName, then name, for the chip label', () => {
    const wrapper = mountCell({
      tags: [tag('PII.Sensitive', { displayName: 'Display', name: 'Name' })],
    });
    expect(wrapper.text()).toContain('Display');
    expect(wrapper.text()).not.toContain('PII.Sensitive');
  });
});

describe('ServiceChildOwnersCell (official Owner, non-compact)', () => {
  function mountCell(props: Record<string, unknown> = {}) {
    return mount(ServiceChildOwnersCell, {
      props: { owners: [], ...props },
      attachTo: document.body,
      global: { plugins: [Antd, createTestI18n()] },
    });
  }

  it('renders -- when there are no owners', () => {
    const wrapper = mountCell();
    expect(wrapper.find('[data-testid="owner-label"]').text()).toBe('--');
  });

  it('renders up to four owner names and an overflow count', () => {
    const owners = ['A', 'B', 'C', 'D', 'E'].map((name) => ({ name }));
    const wrapper = mountCell({ owners });
    expect(wrapper.text()).toContain('A');
    expect(wrapper.text()).toContain('D');
    expect(wrapper.text()).not.toContain('E');
    expect(wrapper.find('[data-testid="owner-more-count"]').text()).toBe('+1');
  });

  it('prefers displayName over name', () => {
    const wrapper = mountCell({ owners: [{ name: 'n', displayName: 'D' }] });
    expect(wrapper.text()).toContain('D');
  });
});

describe('HighlightedText (official highlightSearchText)', () => {
  it('renders plain text without a search term', () => {
    const wrapper = mount(HighlightedText, { props: { text: 'orders' } });
    expect(wrapper.find('[data-highlight="true"]').exists()).toBe(false);
    expect(wrapper.text()).toBe('orders');
  });

  it('highlights case-insensitive matches', () => {
    const wrapper = mount(HighlightedText, { props: { text: 'Orders ORDERS', searchText: 'ord' } });
    const marks = wrapper.findAll('[data-highlight="true"]');
    expect(marks).toHaveLength(2);
    expect(marks[0].text()).toBe('Ord');
    expect(marks[1].text()).toBe('ORD');
  });

  it('treats the search text literally', () => {
    const wrapper = mount(HighlightedText, { props: { text: 'a.b aab', searchText: 'a.b' } });
    expect(wrapper.findAll('[data-highlight="true"]')).toHaveLength(1);
  });
});
