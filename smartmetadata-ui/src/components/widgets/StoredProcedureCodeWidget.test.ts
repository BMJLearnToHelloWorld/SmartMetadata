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
import StoredProcedureCodeWidget from './StoredProcedureCodeWidget.vue';

function mountWidget(code?: { language?: string; code?: string }) {
  return mount(StoredProcedureCodeWidget, {
    props: { code },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('StoredProcedureCodeWidget (pin StoredProcedureCodeCard)', () => {
  it('renders the code read-only in a SQL editor', () => {
    const wrapper = mountWidget({ language: 'SQL', code: 'SELECT 1' });
    expect(wrapper.find('[data-testid="asset-code-block"]').exists()).toBe(true);
    expect(wrapper.find('.cm-editor').exists()).toBe(true);
    expect(wrapper.find('.cm-content').text()).toContain('SELECT 1');
    // The pin card has no edit action: no copy button, no edit affordance.
    expect(wrapper.find('[data-testid="query-copy-button"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders the empty state when the procedure has no code', () => {
    const wrapper = mountWidget({ language: 'SQL' });
    expect(wrapper.find('[data-testid="asset-code-empty"]').exists()).toBe(true);
    expect(wrapper.find('.cm-editor').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders the empty state when no code object is given', () => {
    const wrapper = mountWidget(undefined);
    expect(wrapper.find('[data-testid="asset-code-empty"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('No code on this asset.');
    wrapper.unmount();
  });
});
