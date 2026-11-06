/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { defineComponent, h } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowCheckChangeDescConditionPayload } from '@/types/governance';
import ConditionBuilder from './ConditionBuilder.vue';
import { mountWithBuilder } from '../testHarness';

async function mountBuilder(options: {
  value?: WorkflowCheckChangeDescConditionPayload | null;
  showCondition?: boolean;
} = {}) {
  const onChange = vi.fn();
  const Host = defineComponent({
    setup: () =>
      () =>
        h(ConditionBuilder, {
          value: options.value ?? {
            config: { condition: 'AND', rules: { name: ['svc'] } },
          },
          showCondition: options.showCondition ?? true,
          onChange,
        }),
  });
  const mounted = await mountWithBuilder(Host, {
    path: '/workflows/approve-glossary-term/workflow?mode=edit',
  });
  return { ...mounted, onChange };
}

describe('ConditionBuilder', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('renders rows from the payload', { timeout: 15000 }, async () => {
    const { wrapper } = await mountBuilder();
    expect(wrapper.find('[data-testid="condition-builder"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="condition-builder-row-0-field"]').exists()).toBe(
      true,
    );
    const value = wrapper.find('[data-testid="condition-builder-row-0-value"]');
    expect((value.element as HTMLInputElement).value).toBe('svc');
  });

  it('emits the new payload when a row value changes', { timeout: 15000 }, async () => {
    const { wrapper, onChange } = await mountBuilder();
    const value = wrapper.find('[data-testid="condition-builder-row-0-value"]');
    await value.setValue('orders');
    // setValue dispatches both input and change, so antd emits twice;
    // every emission carries the same new payload.
    expect(onChange).toHaveBeenCalled();
    for (const call of onChange.mock.calls) {
      expect(call[0]).toEqual({
        config: { condition: 'AND', rules: { name: ['orders'] } },
      });
    }
  });

  it('emits the new condition when the toggle changes', { timeout: 15000 }, async () => {
    const { wrapper, onChange } = await mountBuilder();
    await wrapper.find('[data-testid="condition-builder-condition-or"]').trigger('click');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual({
      config: { condition: 'OR', rules: { name: ['svc'] } },
    });
  });

  it('adds an empty row', { timeout: 15000 }, async () => {
    const { wrapper } = await mountBuilder();
    await wrapper.find('[data-testid="condition-builder-add-row"]').trigger('click');
    expect(wrapper.find('[data-testid="condition-builder-row-1-field"]').exists()).toBe(
      true,
    );
  });

  it('removes a row', { timeout: 15000 }, async () => {
    const { wrapper, onChange } = await mountBuilder({
      value: {
        config: { condition: 'AND', rules: { name: ['svc'], tags: ['PII'] } },
      },
    });
    await wrapper
      .find('[data-testid="condition-builder-remove-row-1"]')
      .trigger('click');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual({
      config: { condition: 'AND', rules: { name: ['svc'] } },
    });
  });

  it('starts with one blank row for an empty payload', { timeout: 15000 }, async () => {
    const { wrapper } = await mountBuilder({ value: null });
    expect(wrapper.find('[data-testid="condition-builder-row-0-field"]').exists()).toBe(
      true,
    );
    expect(wrapper.find('[data-testid="condition-builder-row-1-field"]').exists()).toBe(
      false,
    );
  });
});
