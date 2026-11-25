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

describe('EmptyGraphPlaceholder', () => {
  it('renders the pin empty copy with a Data Insight docs link, never "residual"', () => {
    const wrapper = mount(EmptyGraphPlaceholder, { global: { plugins: [Antd, createTestI18n()] } });
    expect(wrapper.find('[data-testid="no-data-placeholder"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Adding a new Data Insight is easy, just give it a spin!');
    expect(wrapper.text()).not.toContain('residual');
    const link = wrapper.find('a[href="https://docs.open-metadata.org/latest/how-to-guides/data-insights"]');
    expect(link.exists()).toBe(true);
    expect(link.text()).toBe('docs');
  });
});
