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
import Antd, { Select } from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import SchemaField from '@/components/ingestion/SchemaField.vue';
import { getSchemaByWorkflowType } from '@/ingestion/ingestionSchemas';
import { createTestI18n } from '@/test/i18n';

/**
 * Presentation-layer tests (Q-3): the generic oneOf renderer selects
 * the branch to DISPLAY from the value's keys. Validity is separate —
 * the form validates against the full schema — so these tests assert
 * only what renders and what a branch switch emits.
 */
async function mountConfigField(value: unknown) {
  const schema = await getSchemaByWorkflowType('profiler', 'DATABASE_SERVICES');
  const configSchema = schema.properties!.profileSampleConfig!.properties!.config!;
  const wrapper = mount(SchemaField, {
    props: {
      schema: configSchema,
      value,
      path: ['config'],
      rootSchema: schema,
      errors: new Map<string, string>(),
      showErrors: false,
      testIdPrefix: 'schema-field',
    },
    global: { plugins: [Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

function branchSelect(wrapper: ReturnType<typeof mount>) {
  const found = wrapper
    .findAllComponents(Select)
    .find((candidate) => candidate.attributes('data-testid') === 'schema-field-config-branch');
  expect(found, 'branch select').toBeTruthy();
  return found!;
}

describe('SchemaField oneOf presentation (Q-3)', () => {
  it('renders the static branch for a static-shaped config value', async () => {
    const wrapper = await mountConfigField({ profileSample: 50, profileSampleType: 'ROWS' });
    expect(branchSelect(wrapper).props('value')).toBe(1);
    expect(wrapper.find('[data-testid="schema-field-config-profileSample"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="schema-field-config-profileSampleType"]').exists()).toBe(
      true,
    );
    expect(wrapper.find('[data-testid="schema-field-config-smartSampling-switch"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('[data-testid="schema-field-config-thresholds"]').exists()).toBe(false);
  });

  it('renders the dynamic branch for a dynamic-shaped config value', async () => {
    const wrapper = await mountConfigField({
      smartSampling: false,
      thresholds: [{ rowCountThreshold: 5, profileSample: 25 }],
    });
    expect(branchSelect(wrapper).props('value')).toBe(0);
    expect(wrapper.find('[data-testid="schema-field-config-smartSampling-switch"]').exists()).toBe(
      true,
    );
    expect(wrapper.find('[data-testid="schema-field-config-thresholds"]').exists()).toBe(true);
    // The threshold row resolves the cross-branch $refs for its enum
    // fields against the full root schema.
    expect(
      wrapper.find('[data-testid="schema-field-config-thresholds-0-rowCountThreshold"]').exists(),
    ).toBe(true);
    expect(wrapper.find('[data-testid="schema-field-config-profileSample"]').exists()).toBe(false);
  });

  it('falls back to the first branch for an empty value', async () => {
    const wrapper = await mountConfigField({});
    expect(branchSelect(wrapper).props('value')).toBe(0);
    expect(wrapper.find('[data-testid="schema-field-config-smartSampling-switch"]').exists()).toBe(
      true,
    );
  });

  it('resets the value to the new branch defaults on a branch switch', async () => {
    const wrapper = await mountConfigField({});
    await branchSelect(wrapper).vm.$emit('update:value', 1);
    await flushPromises();
    // The static branch seeds only its own schema default.
    expect(wrapper.emitted('update:value')?.at(-1)).toEqual([
      { profileSampleType: 'PERCENTAGE' },
    ]);
  });
});
