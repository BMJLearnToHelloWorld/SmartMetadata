/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import { Slider } from 'ant-design-vue';
import { afterEach, describe, expect, it } from 'vitest';
import { createI18n } from 'vue-i18n';
import SearchFieldConfiguration from './SearchFieldConfiguration.vue';

function mountCard(props: {
  fieldName?: string;
  weight?: number;
  matchType?: string;
  highlightFields?: string[];
  entityFields?: { name: string; description?: string; highlight?: boolean }[];
  initialOpen?: boolean;
}) {
  const i18n = createI18n({
    legacy: false,
    locale: 'en-US',
    messages: {
      'en-US': {
        settings: {
          searchPrefs: {
            custom: 'Custom',
            noDescription: 'No description',
            delete: 'Delete',
            highlightFields: 'Highlight Fields',
            fieldCannotBeHighlighted: 'This field cannot be highlighted',
            weight: 'Weight',
            value: 'Value',
            matchType: 'Match Type',
            exactMatch: 'Exact Match',
            phraseMatch: 'Phrase Match',
            fuzzyMatch: 'Fuzzy Match',
            standardMatch: 'Standard Match',
          },
        },
      },
    },
  });
  return mount(SearchFieldConfiguration, {
    attachTo: document.body,
    props: {
      field: {
        fieldName: props.fieldName ?? 'name',
        weight: props.weight ?? 5,
        matchType: props.matchType,
      },
      index: 0,
      highlightFields: props.highlightFields ?? [],
      entityFields: props.entityFields ?? [
        { name: 'name', description: 'The entity name', highlight: true },
      ],
      initialOpen: props.initialOpen,
    },
    global: { plugins: [i18n] },
  });
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('SearchFieldConfiguration', () => {
  it('renders the header with the zero-padded weight badge', () => {
    const wrapper = mountCard({ weight: 5 });
    expect(wrapper.find('[data-testid="field-name"]').text()).toBe('name');
    expect(wrapper.text()).toContain('The entity name');
    expect(wrapper.find('[data-testid="field-weight"]').text()).toContain('05');
    expect(wrapper.find('[data-testid="custom-property-badge"]').exists()).toBe(false);
  });

  it('shows the custom badge for extension fields and no description fallback', () => {
    const wrapper = mountCard({
      fieldName: 'extension.owner',
      weight: 12,
      entityFields: [{ name: 'extension.owner' }],
    });
    expect(wrapper.find('[data-testid="custom-property-badge"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('No description');
    expect(wrapper.find('[data-testid="field-weight"]').text()).toContain('12');
  });

  it('keeps the panel unmounted until opened, then renders its controls', async () => {
    const wrapper = mountCard({});
    expect(wrapper.find('[data-testid="highlight-field-switch"]').exists()).toBe(false);
    await wrapper.find('.ant-collapse-header').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="highlight-field-switch"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="field-weight-value"]').text()).toBe('5');
    expect(wrapper.find('[data-testid="match-type-select"]').exists()).toBe(true);
  });

  it('opens the panel on mount when initialOpen is set', () => {
    const wrapper = mountCard({ initialOpen: true });
    expect(wrapper.find('[data-testid="highlight-field-switch"]').exists()).toBe(true);
  });

  it('emits highlight, weight, match-type, and delete events', async () => {
    const wrapper = mountCard({ initialOpen: true, highlightFields: [] });
    await wrapper.find('[data-testid="highlight-field-switch"]').trigger('click');
    expect(wrapper.emitted('highlightChange')).toEqual([['name']]);
    await wrapper.findComponent(Slider).vm.$emit('update:value', 7.5);
    expect(wrapper.emitted('weightChange')).toEqual([['name', 7.5]]);
    expect(wrapper.find('[data-testid="field-weight"]').text()).toContain('7.5');
    const select = wrapper.find('[data-testid="match-type-select"] .ant-select-selector');
    await select.trigger('mousedown');
    await flushPromises();
    const option = [...document.body.querySelectorAll('.ant-select-item-option')].find(
      (item) => item.textContent === 'Exact Match',
    ) as HTMLElement;
    option.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(wrapper.emitted('matchTypeChange')).toEqual([['name', 'exact']]);
    await wrapper.find('[data-testid="delete-search-field"]').trigger('click');
    expect(wrapper.emitted('delete')).toEqual([['name']]);
  });

  it('disables the highlight switch for fields that cannot be highlighted', () => {
    const wrapper = mountCard({
      initialOpen: true,
      entityFields: [{ name: 'name', description: 'The entity name', highlight: false }],
      highlightFields: ['name'],
    });
    const toggle = wrapper.find('[data-testid="highlight-field-switch"]');
    expect(toggle.classes()).toContain('ant-switch-disabled');
    expect(toggle.classes()).not.toContain('ant-switch-checked');
  });

  it('shows the highlight switch checked when the field is highlighted', () => {
    const wrapper = mountCard({ initialOpen: true, highlightFields: ['name'] });
    expect(wrapper.find('[data-testid="highlight-field-switch"]').classes()).toContain(
      'ant-switch-checked',
    );
  });
});
