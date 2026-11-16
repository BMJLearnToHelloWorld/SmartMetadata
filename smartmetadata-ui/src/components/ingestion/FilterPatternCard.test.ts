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
import Antd, { Switch } from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import FilterPatternCard from './FilterPatternCard.vue';

function mountCard(props: Record<string, unknown> = {}) {
  return mount(FilterPatternCard, {
    props: {
      fieldName: 'tableFilterPattern',
      schemaTitle: 'Default Table Filter Pattern',
      defaultOpen: true,
      ...props,
    },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

function lastEmitted(wrapper: ReturnType<typeof mountCard>) {
  return wrapper.emitted('update:modelValue')?.at(-1)?.[0];
}

describe('FilterPatternCard (official FilterPatternField + FilterSectionCard)', () => {
  it('starts in scan-all with the scanning-all pill and no include composer', () => {
    const wrapper = mountCard();
    expect(wrapper.find('.filter-pattern-title').text()).toBe('Tables');
    expect(wrapper.text()).toContain('Scanning all');
    expect(wrapper.find('[data-testid="tableFilterPattern-scan-all-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="include-filter-input"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="exclude-filter-input"]').exists()).toBe(true);
  });

  it('renders no schema-description paragraph (pin FilterSectionCard never renders one, L-6)', () => {
    const wrapper = mountCard();
    expect(wrapper.find('.filter-pattern-description').exists()).toBe(false);
  });

  it('derives restrict mode from stored includes and renders parsed chips', () => {
    const wrapper = mountCard({
      modelValue: { includes: ['^orders$'], excludes: ['^tmp_'] },
    });
    expect(wrapper.find('[data-testid="include-filter-input"]').exists()).toBe(true);
    const includeChip = wrapper.find('[data-testid^="include-chip-"]');
    expect(includeChip.find('[data-testid="label"]').text()).toBe('is exactly');
    expect(includeChip.find('[data-testid="value"]').text()).toBe('orders');
    expect(wrapper.text()).toContain('Including 1 rule');
  });

  it('clears includes when switching back to scan-all', async () => {
    const wrapper = mountCard({ modelValue: { includes: ['^orders$'], excludes: [] } });
    await wrapper.find('[data-testid="tableFilterPattern-scan-all-button"]').trigger('click');
    expect(lastEmitted(wrapper)).toEqual({ excludes: [], includes: [] });
  });

  it('adds include conditions via the composer and emits regex patterns', async () => {
    const wrapper = mountCard();
    await wrapper.find('[data-testid="tableFilterPattern-only-specific-button"]').trigger('click');
    await wrapper.find('[data-testid="include-filter-input"]').setValue('orders');
    await wrapper.find('[data-testid="include-add-button"]').trigger('click');
    expect(lastEmitted(wrapper)).toEqual({ excludes: [], includes: ['.*orders.*'] });
    expect(wrapper.find('[data-testid^="include-chip-"]').exists()).toBe(true);
  });

  it('adds exclude conditions with the startsWith default and removes chips', async () => {
    const wrapper = mountCard();
    await wrapper.find('[data-testid="exclude-filter-input"]').setValue('TMP_');
    await wrapper.find('[data-testid="exclude-add-button"]').trigger('click');
    expect(lastEmitted(wrapper)).toEqual({ excludes: ['^TMP_'], includes: [] });
    const chip = wrapper.find('[data-testid^="exclude-chip-"]');
    await chip.find('[data-testid="remove-button"]').trigger('click');
    expect(lastEmitted(wrapper)).toEqual({ excludes: [], includes: [] });
  });

  it('shows the scope preview and the equivalent-regex disclosure', async () => {
    const wrapper = mountCard({ modelValue: { includes: ['^orders$'], excludes: ['^tmp_'] } });
    expect(wrapper.text()).toContain('Only tables matching 1 include rule are in scope');
    expect(wrapper.text()).toContain('Show equivalent regex');
    const buttons = wrapper.findAll('button');
    await buttons
      .find((button) => button.text().includes('Show equivalent regex'))!
      .trigger('click');
    expect(wrapper.text()).toContain('includes += ^orders$');
    expect(wrapper.text()).toContain('excludes += ^tmp_');
    expect(wrapper.text()).toContain('Hide equivalent regex');
  });

  it('merges system excludes into a fresh field and toggles them as a group', async () => {
    const wrapper = mountCard({ systemExcludes: ['^snowflake_sample_data$'] });
    expect(wrapper.findComponent(Switch).props('checked')).toBe(true);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    await wrapper.findComponent(Switch).vm.$emit('change', false);
    expect(lastEmitted(wrapper)).toEqual({ excludes: [], includes: [] });
    await wrapper.findComponent(Switch).vm.$emit('change', true);
    expect(lastEmitted(wrapper)).toEqual({
      excludes: ['^snowflake_sample_data$'],
      includes: [],
    });
  });

  it('does not auto-add system excludes when the field has stored data', () => {
    const wrapper = mountCard({
      modelValue: { includes: [], excludes: [] },
      systemExcludes: ['^snowflake_sample_data$'],
      hasExistingData: true,
    });
    expect(wrapper.findComponent(Switch).props('checked')).toBe(false);
    expect(wrapper.find('[data-testid^="exclude-chip-"]').exists()).toBe(false);
  });

  it('focuses the field on header click and toggles open state', async () => {
    const wrapper = mountCard({ defaultOpen: false });
    const bodyDisplay = () =>
      (wrapper.find('.filter-pattern-body').element as HTMLElement).style.display;
    // Assert the inline display v-show controls: jsdom's computed
    // style is stale for detached trees, so isVisible() is unreliable.
    expect(bodyDisplay()).toBe('none');
    await wrapper.find('.filter-pattern-header').trigger('click');
    expect(wrapper.emitted('focus')).toEqual([['tableFilterPattern']]);
    expect(bodyDisplay()).toBe('');
  });

  it('re-derives state when the parent supplies a new value', async () => {
    const wrapper = mountCard({ modelValue: { includes: [], excludes: [] } });
    await wrapper.setProps({ modelValue: { includes: ['^a$'], excludes: [] } });
    expect(wrapper.find('[data-testid="include-filter-input"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid^="include-chip-"]').exists()).toBe(true);
  });
});
