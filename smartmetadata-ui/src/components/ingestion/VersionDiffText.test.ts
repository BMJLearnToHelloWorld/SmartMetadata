/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { getDiffValue, getTextDiff } from '@/ingestion/versionDiff';
import VersionDiffText from './VersionDiffText.vue';

describe('VersionDiffText', () => {
  it('renders plain results verbatim', () => {
    const wrapper = mount(VersionDiffText, {
      props: { diff: { type: 'plain', text: 'unchanged text' } },
    });
    expect(wrapper.text()).toBe('unchanged text');
    expect(wrapper.find('[data-testid="diff-added"]').exists()).toBe(false);
  });

  it('renders word diffs with added, removed, and normal spans', () => {
    const wrapper = mount(VersionDiffText, {
      props: { diff: getTextDiff('net sales', 'gross sales') },
    });
    expect(wrapper.find('[data-testid="diff-removed"]').element.textContent).toBe('net');
    expect(wrapper.find('[data-testid="diff-added"]').element.textContent).toBe('gross');
    expect(wrapper.find('[data-testid="diff-normal"]').element.textContent).toBe(' sales');
  });

  it('renders value diffs with the two-way rule, unchanged parts included', () => {
    const wrapper = mount(VersionDiffText, {
      props: { diff: getDiffValue('alpha beta', 'alpha gamma') },
    });
    expect(wrapper.findAll('[data-testid="diff-normal"]').length).toBe(0);
    expect(wrapper.find('[data-testid="diff-added"]').element.textContent).toBe('gamma');
    const removed = wrapper.findAll('[data-testid="diff-removed"]');
    expect(removed.map((node) => node.element.textContent)).toEqual(['alpha ', 'beta']);
  });
});
