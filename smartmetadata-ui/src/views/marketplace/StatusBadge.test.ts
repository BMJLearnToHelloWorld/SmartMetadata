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
import { describe, expect, it } from 'vitest';
import StatusBadge from './StatusBadge.vue';

function mountBadge(props: Record<string, unknown>) {
  return mount(StatusBadge, {
    props: { label: 'Success', status: 'success', ...props },
    global: { plugins: [Antd] },
  });
}

describe('StatusBadge', () => {
  it('renders the label with an icon resolved from the label', () => {
    const wrapper = mountBadge({ label: 'Success', status: 'success' });
    expect(wrapper.text()).toContain('Success');
    expect(wrapper.find('svg').exists()).toBe(true);
    expect(wrapper.classes()).toContain('ant-tag-success');
  });

  it('renders no icon when the label has no icon mapping', () => {
    const wrapper = mountBadge({ label: 'Active With Error', status: 'activeError' });
    expect(wrapper.text()).toContain('Active With Error');
    expect(wrapper.find('svg').exists()).toBe(false);
    expect(wrapper.classes()).toContain('ant-tag-error');
  });

  it('aliases the failed status to the error color', () => {
    const wrapper = mountBadge({ label: 'Failed', status: 'failed' });
    expect(wrapper.classes()).toContain('ant-tag-error');
    expect(wrapper.find('svg').exists()).toBe(true);
  });

  it('falls back to the default color for unknown statuses', () => {
    const wrapper = mountBadge({ label: 'Mystery', status: 'nope' });
    expect(wrapper.find('svg').exists()).toBe(false);
    expect(wrapper.classes()).not.toContain('ant-tag-success');
  });

  it('passes the testid and status class through', () => {
    const wrapper = mountBadge({ dataTestId: 'pipeline-status', status: 'running' });
    const tag = wrapper.find('[data-testid="pipeline-status"]');
    expect(tag.exists()).toBe(true);
    expect(tag.classes()).toContain('running');
  });
});
