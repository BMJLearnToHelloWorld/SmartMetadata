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
import Antd, { Select, Switch } from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import type { AlertSelectionState } from '@/composables/useAlertSelection';
import AlertRuleSection from './AlertRuleSection.vue';
import FQNListSelect from './FQNListSelect.vue';
import RuleArgumentField from './RuleArgumentField.vue';

const hooks = {
  t: ((key: string) => key) as never,
  notifyError: () => {},
  notifyWarning: () => {},
};

const fqnListStub = {
  props: ['value', 'disabled'],
  emits: ['update:value'],
  template: '<div data-testid="fqn-list-stub" />',
};

const argumentFieldStub = {
  props: ['argument', 'inputValue', 'isViewOnly'],
  emits: ['update:input'],
  template: '<div data-testid="argument-field-stub" />',
};

function selection(overrides: Record<string, unknown> = {}): AlertSelectionState {
  return {
    sources: ['table'],
    support: {
      supportedFilters: [
        { name: 'matchAll', effect: 'include', arguments: ['fqnList'] },
        { name: 'matchDomain', effect: 'include', arguments: ['domain'] },
      ],
      supportedTriggers: [{ name: 'entityCreated', effect: 'include' }],
      hasFilters: true,
      hasTriggers: true,
    },
    capabilities: {
      knownSources: [],
      loading: false,
      settled: true,
      retry: () => {},
    },
    loading: false,
    ready: true,
    search: {} as never,
    ...overrides,
  } as AlertSelectionState;
}

function mountSection(props: Record<string, unknown>): VueWrapper {
  return mount(AlertRuleSection, {
    props: {
      field: 'filters',
      title: 'Filters',
      rules: [],
      selection: selection(),
      hooks,
      ...props,
    },
    global: {
      plugins: [Antd, createTestI18n()],
      stubs: { FQNListSelect: fqnListStub, RuleArgumentField: argumentFieldStub },
    },
  });
}

describe('AlertRuleSection', () => {
  it('renders one row per rule with its name select and effect switch', () => {
    const wrapper = mountSection({
      rules: [{ name: 'matchAll', effect: 'include', arguments: [{ name: 'fqnList', input: [] }] }],
    });
    expect(wrapper.find('[data-testid="filters-list"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="filter-0"]').exists()).toBe(true);
    expect(wrapper.findComponent(Select).props('value')).toBe('matchAll');
    expect(wrapper.findComponent(Switch).props('checked')).toBe(true);
  });

  it('renames a rule and resets its argument skeleton', async () => {
    const wrapper = mountSection({
      rules: [{ name: 'matchAll', effect: 'include', arguments: [{ name: 'fqnList', input: ['a'] }] }],
    });
    await wrapper.findComponent(Select).vm.$emit('change', 'matchDomain');
    expect(wrapper.emitted('update:rules')).toEqual([
      [[{ name: 'matchDomain', effect: 'include', arguments: [{ input: [], name: 'domain' }] }]],
    ]);
  });

  it('flips the effect through the switch', async () => {
    const wrapper = mountSection({ rules: [{ name: 'matchAll', effect: 'include' }] });
    await wrapper.findComponent(Switch).vm.$emit('change', false);
    expect(wrapper.emitted('update:rules')).toEqual([
      [[{ name: 'matchAll', effect: 'exclude' }]],
    ]);
  });

  it('removes a row', async () => {
    const wrapper = mountSection({
      rules: [
        { name: 'matchAll', effect: 'include' },
        { name: 'matchDomain', effect: 'include' },
      ],
    });
    await wrapper.find('[data-testid="remove-filter-0"]').trigger('click');
    expect(wrapper.emitted('update:rules')).toEqual([
      [[{ name: 'matchDomain', effect: 'include' }]],
    ]);
  });

  it('adds an empty rule while fewer rules than supported ones exist', async () => {
    const wrapper = mountSection({ rules: [{ name: 'matchAll', effect: 'include' }] });
    const add = wrapper.find('[data-testid="add-filters"]');
    expect(add.exists()).toBe(true);
    await add.trigger('click');
    expect(wrapper.emitted('update:rules')).toEqual([
      [[{ name: 'matchAll', effect: 'include' }, { effect: 'include' }]],
    ]);
  });

  it('hides the Add button once every supported rule is used', () => {
    const wrapper = mountSection({
      rules: [
        { name: 'matchAll', effect: 'include' },
        { name: 'matchDomain', effect: 'include' },
      ],
    });
    expect(wrapper.find('[data-testid="add-filters"]').exists()).toBe(false);
  });

  it('disables the Add button with no sources chosen', () => {
    const wrapper = mountSection({
      rules: [],
      selection: selection({ sources: [] }),
    });
    const add = wrapper.find('[data-testid="add-filters"]');
    expect(add.exists()).toBe(true);
    expect((add.element as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders the fqnList argument through the FQN select and the rest through argument fields', () => {
    const wrapper = mountSection({
      rules: [
        {
          name: 'matchAll',
          effect: 'include',
          arguments: [
            { name: 'fqnList', input: [] },
            { name: 'domain', input: [] },
          ],
        },
      ],
    });
    // The rule's own arguments drive the fields: fqnList first, then
    // the named argument. The supported descriptor is not runtime, so
    // the stored argument names are what render.
    expect(wrapper.findAll('[data-testid="fqn-list-stub"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-testid="argument-field-stub"]')).toHaveLength(1);
  });

  it('plumbs an argument edit into the right rule and index', async () => {
    const wrapper = mountSection({
      rules: [
        {
          name: 'matchAll',
          effect: 'include',
          arguments: [
            { name: 'fqnList', input: [] },
            { name: 'domain', input: [] },
          ],
        },
      ],
    });
    const fields = wrapper.findAllComponents(RuleArgumentField);
    await fields[0]?.vm.$emit('update:input', ['domain-a']);
    expect(wrapper.emitted('update:rules')).toEqual([
      [
        [
          {
            name: 'matchAll',
            effect: 'include',
            arguments: [
              { name: 'fqnList', input: [] },
              { name: 'domain', input: ['domain-a'] },
            ],
          },
        ],
      ],
    ]);
  });

  it('locks the section down in view-only mode', () => {
    const wrapper = mountSection({
      isViewOnly: true,
      rules: [{ name: 'matchAll', effect: 'include', arguments: [{ name: 'fqnList', input: [] }] }],
    });
    expect(wrapper.findComponent(Select).props('disabled')).toBe(true);
    expect(wrapper.findComponent(Switch).props('disabled')).toBe(true);
    expect(wrapper.find('[data-testid="remove-filter-0"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="add-filters"]').exists()).toBe(false);
    expect(wrapper.findComponent(FQNListSelect).props('disabled')).toBe(true);
  });
});
