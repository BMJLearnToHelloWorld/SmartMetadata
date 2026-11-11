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
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import SchemaDrivenSourceConfigForm from '@/components/ingestion/SchemaDrivenSourceConfigForm.vue';
import {
  SERVICE_CATEGORY_BY_KIND,
  getSchemaByWorkflowType,
} from '@/ingestion/ingestionSchemas';
import { createTestI18n } from '@/test/i18n';

async function mountForm(
  pipelineType: Parameters<typeof getSchemaByWorkflowType>[0],
  modelValue: Record<string, unknown> = {},
  props: Record<string, unknown> = {},
) {
  const schema = await getSchemaByWorkflowType(
    pipelineType,
    SERVICE_CATEGORY_BY_KIND.database,
  );
  const wrapper = mount(SchemaDrivenSourceConfigForm, {
    props: { schema, modelValue, ...props },
    global: { plugins: [Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

function lastModelValue(wrapper: ReturnType<typeof mount>): Record<string, unknown> {
  const emitted = wrapper.emitted('update:modelValue') ?? [];
  return (emitted[emitted.length - 1]?.[0] ?? {}) as Record<string, unknown>;
}

describe('SchemaDrivenSourceConfigForm', () => {
  it('seeds schema defaults under the incoming value and hides computed fields', async () => {
    const wrapper = await mountForm('metadata', { type: 'DatabaseMetadata' });
    const data = lastModelValue(wrapper);
    expect(data.type).toBe('DatabaseMetadata');
    expect(data.includeViews).toBe(true);
    expect(data.threads).toBe(1);
    expect(data.schemaFilterPattern).toEqual({ includes: [], excludes: [] });
    // Computed / wizard-owned fields never render.
    expect(wrapper.find('[data-testid="schema-field-type"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="schema-field-name"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="schema-field-displayName"]').exists()).toBe(false);
    // Filter-pattern fields render before the other fields.
    const html = wrapper.html();
    expect(html.indexOf('schema-field-schemaFilterPattern')).toBeLessThan(
      html.indexOf('schema-field-includeViews'),
    );
  });

  it('writes excludes for a filter field (P-08(b))', async () => {
    const wrapper = await mountForm('metadata', {});
    const excludes = wrapper.find(
      '[data-testid="schema-field-schemaFilterPattern-excludes"]',
    );
    expect(excludes.exists()).toBe(true);
    await excludes.setValue('^tmp_.*$, ^stg_.*$');
    await flushPromises();
    const data = lastModelValue(wrapper);
    expect((data.schemaFilterPattern as { excludes: string[] }).excludes).toEqual([
      '^tmp_.*$',
      '^stg_.*$',
    ]);
  });

  it('reports the dbt cloud branch required fields and shows the error after validate()', async () => {
    const wrapper = await mountForm('dbt', {});
    const vm = wrapper.vm as unknown as { validate: () => boolean };
    expect(vm.validate()).toBe(false);
    await flushPromises();
    expect(wrapper.emitted('validity-change')?.at(-1)?.[0]).toBe(false);
    // The missing account id is a required field of the selected branch.
    expect(wrapper.text()).toContain('dbt Cloud Account Id is required');
  });

  it('renders the local dbt branch when the saved value selects it', async () => {
    const wrapper = await mountForm('dbt', {
      dbtConfigSource: { dbtConfigType: 'local' },
    });
    expect(
      wrapper.find('[data-testid="schema-field-dbtConfigSource-dbtManifestFilePath"]').exists(),
    ).toBe(true);
    expect(
      wrapper.find('[data-testid="schema-field-dbtConfigSource-dbtCloudAccountId"]').exists(),
    ).toBe(false);
  });

  it('flags an ownerConfig map row with a name but no owner (validateOwnerConfigMaps)', async () => {
    const wrapper = await mountForm('metadata', {
      ownerConfig: { database: { sales: {} } },
    });
    const vm = wrapper.vm as unknown as { validate: () => boolean };
    expect(vm.validate()).toBe(false);
    await flushPromises();
    expect(wrapper.text()).toContain('Owners is required');
  });

  it('is valid for a fully-seeded metadata config', async () => {
    const wrapper = await mountForm('metadata', {});
    const vm = wrapper.vm as unknown as { validate: () => boolean };
    expect(vm.validate()).toBe(true);
    expect(wrapper.emitted('validity-change')?.at(-1)?.[0]).toBe(true);
  });
});
