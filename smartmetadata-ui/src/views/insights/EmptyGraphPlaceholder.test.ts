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
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import EmptyGraphPlaceholder from './EmptyGraphPlaceholder.vue';

const DOCS_HREF = 'https://docs.open-metadata.org/latest/how-to-guides/data-insights';

describe('EmptyGraphPlaceholder', () => {
  it('renders pin wording with the docs link (pin EmptyGraphPlaceholder.tsx:27-58)', () => {
    const wrapper = mount(EmptyGraphPlaceholder, {
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(wrapper.text()).toContain('Adding a new Data Insight is easy, just give it a spin!');
    expect(wrapper.text()).toContain('Still need help? Refer to our docs for more information.');
    const link = wrapper.get(`a[href="${DOCS_HREF}"]`);
    expect(link.text()).toBe('docs');
    expect(link.attributes('target')).toBe('_blank');
    expect(link.attributes('rel')).toBe('noreferrer');
  });

  it('renders the Chinese wording in a zh-CN locale', () => {
    const wrapper = mount(EmptyGraphPlaceholder, {
      global: { plugins: [Antd, createTestI18n('zh-CN')] },
    });
    expect(wrapper.text()).toContain('添加新的 Data Insight 很容易，试试吧！');
    expect(wrapper.text()).toContain('还需要帮助？请参考我们的文档了解更多。');
    expect(wrapper.get(`a[href="${DOCS_HREF}"]`).text()).toBe('文档');
  });
});
