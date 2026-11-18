/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the Apache License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mount, type VueWrapper } from '@vue/test-utils';
import Antd, { Select } from 'ant-design-vue';
import { describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import type { AlertSelectionState } from '@/composables/useAlertSelection';
import AlertSourcePicker from './AlertSourcePicker.vue';

function capabilities(overrides: Record<string, unknown> = {}): AlertSelectionState['capabilities'] {
  return {
    selection: {
      alertType: 'Observability',
      filters: [],
      triggers: [],
      sources: [
        { name: 'table', kind: 'entity' },
        { name: 'dashboard', kind: 'entity' },
        { name: 'all', kind: 'all' },
      ],
    },
    answeredFor: [],
    knownSources: [
      { name: 'table', kind: 'entity' },
      { name: 'dashboard', kind: 'entity' },
      { name: 'all', kind: 'all' },
    ],
    loading: false,
    settled: true,
    retry: vi.fn(),
    ...overrides,
  } as unknown as AlertSelectionState['capabilities'];
}

function mountPicker(props: Record<string, unknown>): VueWrapper {
  return mount(AlertSourcePicker, {
    props: { value: [], capabilities: capabilities(), ...props },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('AlertSourcePicker', () => {
  it('groups options by kind with disabled headers, in All/Entity/Activity order', () => {
    const wrapper = mountPicker({});
    const options = wrapper.findComponent(Select).props('options') as Array<{
      value: string;
      disabled: boolean;
    }>;
    expect(options.map((option) => option.value)).toEqual([
      'header-all',
      'all',
      'header-entity',
      'table',
      'dashboard',
    ]);
    expect(options[0]?.disabled).toBe(true);
    expect(options[2]?.disabled).toBe(true);
    expect(options[1]?.disabled).toBe(false);
  });

  it('excludes chosen sources from the dropdown, and drops emptied group headers', () => {
    const wrapper = mountPicker({ value: ['all'] });
    const options = wrapper.findComponent(Select).props('options') as Array<{ value: string }>;
    expect(options.map((option) => option.value)).toEqual(['header-entity', 'table', 'dashboard']);
  });

  it('strips header values from the change payload', async () => {
    const wrapper = mountPicker({});
    await wrapper.findComponent(Select).vm.$emit('change', ['header-entity', 'table']);
    expect(wrapper.emitted('update:value')).toEqual([[['table']]]);
  });

  it('shows the failure alert with a retry while the answer is missing', async () => {
    const retry = vi.fn();
    const wrapper = mountPicker({ capabilities: capabilities({ selection: undefined, retry }) });
    expect(wrapper.find('[data-testid="source-select-error"]').exists()).toBe(true);
    await wrapper.find('[data-testid="source-select-retry"]').trigger('click');
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('shows no failure while the first answer is still loading', () => {
    const wrapper = mountPicker({
      capabilities: capabilities({ selection: undefined, loading: true, settled: false }),
    });
    expect(wrapper.find('[data-testid="source-select-error"]').exists()).toBe(false);
  });

  it('switches the placeholder between empty, filled and disabled states', () => {
    const empty = mountPicker({});
    expect(empty.findComponent(Select).props('placeholder')).toContain('Select Sources');
    const filled = mountPicker({ value: ['table'] });
    expect(filled.findComponent(Select).props('placeholder')).toContain('Add another…');
    const disabled = mountPicker({ value: ['table'], disabled: true });
    expect(disabled.findComponent(Select).props('placeholder')).toBe('');
  });
});
