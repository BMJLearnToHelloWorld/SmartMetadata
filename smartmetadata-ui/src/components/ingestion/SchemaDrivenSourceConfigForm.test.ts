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
import { describe, expect, it, vi } from 'vitest';
import FilterPatternCard from '@/components/ingestion/FilterPatternCard.vue';
import SchemaDrivenSourceConfigForm from '@/components/ingestion/SchemaDrivenSourceConfigForm.vue';
import {
  SERVICE_CATEGORY_BY_KIND,
  getSchemaByWorkflowType,
  type RjsfSchema,
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

/** Mount the form against an explicit schema (Q-3 validity-layer cases). */
async function mountWithSchema(
  schema: RjsfSchema,
  modelValue: Record<string, unknown> = {},
  props: Record<string, unknown> = {},
) {
  const wrapper = mount(SchemaDrivenSourceConfigForm, {
    props: { schema, modelValue, ...props },
    global: { plugins: [Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

async function expandSection(wrapper: ReturnType<typeof mount>, key: string): Promise<void> {
  await wrapper.find(`[data-testid="ingestion-section-${key}-toggle"]`).trigger('click');
  await flushPromises();
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
  });

  it('groups metadata fields into the four pin sections in order', async () => {
    const wrapper = await mountForm('metadata', {});
    const html = wrapper.html();
    const essential = html.indexOf('ingestion-section-essential');
    const filters = html.indexOf('ingestion-section-filters');
    const scope = html.indexOf('ingestion-section-scope');
    const advanced = html.indexOf('ingestion-section-advanced');
    expect(essential).toBeGreaterThan(-1);
    expect(filters).toBeGreaterThan(essential);
    expect(scope).toBeGreaterThan(filters);
    expect(advanced).toBeGreaterThan(scope);
    expect(wrapper.text()).toContain('Agent Setup');
    expect(wrapper.text()).toContain('Filter Patterns');
    expect(wrapper.text()).toContain('Scope & Behaviour');
    expect(wrapper.text()).toContain('Advanced Config');
    // Agent Setup is open; the rest start collapsed.
    expect(wrapper.find('[data-testid="schema-field-threads"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="filter-section-schemaFilterPattern"]').exists()).toBe(false);
    await expandSection(wrapper, 'filters');
    expect(wrapper.find('[data-testid="filter-section-schemaFilterPattern"]').exists()).toBe(true);
    await expandSection(wrapper, 'scope');
    expect(wrapper.find('[data-testid="schema-field-markDeletedTables-switch"]').exists()).toBe(true);
    await expandSection(wrapper, 'advanced');
    expect(wrapper.find('[data-testid="schema-field-includeViews-switch"]').exists()).toBe(true);
  });

  it('renders the debug log first inside Scope & Behaviour when owned', async () => {
    const wrapper = await mountForm('metadata', {}, { debugLog: false });
    await expandSection(wrapper, 'scope');
    const scope = wrapper.find('[data-testid="ingestion-section-scope"]');
    expect(scope.find('[data-testid="schema-field-enableDebugLog-switch"]').exists()).toBe(true);
    const scopeHtml = scope.html();
    expect(scopeHtml.indexOf('schema-field-enableDebugLog')).toBeLessThan(
      scopeHtml.indexOf('schema-field-markDeletedTables'),
    );
    await scope.find('[data-testid="schema-field-enableDebugLog-switch"]').trigger('click');
    expect(wrapper.emitted('update:debugLog')?.at(-1)).toEqual([true]);
    // The debug flag never enters the seeded model data.
    expect(lastModelValue(wrapper)).not.toHaveProperty('enableDebugLog');
  });

  it('renders no debug field when the parent does not own the flag', async () => {
    const wrapper = await mountForm('metadata', {});
    await expandSection(wrapper, 'scope');
    expect(wrapper.find('[data-testid="schema-field-enableDebugLog"]').exists()).toBe(false);
  });

  it('writes excludes through the filter composer card (P-08(b))', async () => {
    const wrapper = await mountForm('metadata', {});
    await expandSection(wrapper, 'filters');
    const card = wrapper.find('[data-testid="filter-section-schemaFilterPattern"]');
    expect(card.exists()).toBe(true);
    const input = card.find('[data-testid="exclude-filter-input"]');
    await input.setValue('TMP_');
    await card.find('[data-testid="exclude-add-button"]').trigger('click');
    await flushPromises();
    const data = lastModelValue(wrapper);
    expect((data.schemaFilterPattern as { excludes: string[] }).excludes).toEqual(['^TMP_']);
  });

  it('gates incremental on the service flag', async () => {
    const hidden = await mountForm('metadata', {});
    expect(hidden.find('[data-testid="schema-field-incremental"]').exists()).toBe(false);
    const shown = await mountForm('metadata', {}, { supportsIncremental: true });
    expect(shown.find('[data-testid="schema-field-incremental"]').exists()).toBe(true);
  });

  it('gates enableAutoPartitionDetection on the service flag (profiler)', async () => {
    const hidden = await mountForm('profiler', {}, { pipelineType: 'profiler' });
    await expandSection(hidden, 'advanced');
    expect(
      hidden.find('[data-testid="schema-field-enableAutoPartitionDetection"]').exists(),
    ).toBe(false);
    const shown = await mountForm(
      'profiler',
      {},
      { pipelineType: 'profiler', supportsAutoPartition: true },
    );
    await expandSection(shown, 'advanced');
    expect(
      shown.find('[data-testid="schema-field-enableAutoPartitionDetection-switch"]').exists(),
    ).toBe(true);
  });

  it('renders the dedicated profile-sample field for profiler pipelines only', async () => {
    const profiler = await mountForm('profiler', {}, { pipelineType: 'profiler' });
    await expandSection(profiler, 'advanced');
    expect(profiler.find('[data-testid="schema-field-profileSampleConfig"]').exists()).toBe(true);
    expect(profiler.find('[data-testid="sample-config-type-select"]').exists()).toBe(true);
    const testSuite = await mountForm('TestSuite', {}, { pipelineType: 'TestSuite' });
    await expandSection(testSuite, 'advanced');
    expect(testSuite.find('[data-testid="sample-config-type-select"]').exists()).toBe(false);
    expect(testSuite.find('[data-testid="schema-field-profileSampleConfig"]').exists()).toBe(true);
  });

  it('renders booleans as toggles', async () => {
    const wrapper = await mountForm('metadata', {});
    await expandSection(wrapper, 'advanced');
    const toggle = wrapper.find('[data-testid="schema-field-includeViews-switch"]');
    expect(toggle.exists()).toBe(true);
    expect(toggle.classes()).toContain('ant-switch-checked');
    await toggle.trigger('click');
    await flushPromises();
    expect(lastModelValue(wrapper).includeViews).toBe(false);
  });

  it('renders no non-boolean schema descriptions inline, but boolean descriptions under toggles (pin BooleanFieldTemplate)', async () => {
    const wrapper = await mountForm('metadata', {});
    await expandSection(wrapper, 'filters');
    await expandSection(wrapper, 'scope');
    await expandSection(wrapper, 'advanced');
    expect(wrapper.findAll('.ant-form-item-extra').length).toBe(0);
    // Non-boolean descriptions stay out of the rendered form.
    expect(wrapper.text()).not.toContain(
      'Number of Threads to use in order to parallelize Table ingestion.',
    );
    // Boolean descriptions render under their toggles.
    expect(wrapper.text()).toContain('Optional configuration to turn off fetching metadata for views.');
    expect(
      wrapper
        .find('[data-testid="schema-field-includeViews"] .toggle-field-description')
        .text(),
    ).toBe('Optional configuration to turn off fetching metadata for views.');
  });

  it('passes no step-2 options to workflow-form filter cards (pin options-less uiSchema)', async () => {
    const wrapper = await mountForm('metadata', {
      schemaFilterPattern: { includes: [], excludes: [] },
    });
    await expandSection(wrapper, 'filters');
    const cards = wrapper.findAllComponents(FilterPatternCard);
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.props('defaultOpen')).toBe(false);
      expect(card.props('systemExcludes')).toEqual([]);
      expect(card.props('hasExistingData')).toBe(false);
    }
    expect(wrapper.find('[data-testid="schemaFilterPattern-exclude-system-filters"]').exists()).toBe(
      false,
    );
  });

  it('forwards field focus with schema metadata for the doc panel', async () => {
    const onFieldFocus = vi.fn();
    const onFieldBlur = vi.fn();
    const wrapper = await mountForm('metadata', {}, { onFieldFocus, onFieldBlur });
    // Antd InputNumber binds the test id to its inner <input>.
    const threads = wrapper.find('input[data-testid="schema-field-threads"]');
    await threads.trigger('focus');
    expect(onFieldFocus).toHaveBeenCalledWith(
      'root/threads',
      expect.objectContaining({ title: 'Number of Threads' }),
    );
    await threads.trigger('blur');
    expect(onFieldBlur).toHaveBeenCalled();
  });

  it('emits ready once mounted', async () => {
    const wrapper = await mountForm('metadata', {});
    expect(wrapper.emitted('ready')).toHaveLength(1);
  });

  it('reports the dbt cloud branch required fields and shows the error after validate()', async () => {
    const wrapper = await mountForm('dbt', {});
    const vm = wrapper.vm as unknown as { validate: () => boolean };
    expect(vm.validate()).toBe(false);
    await flushPromises();
    expect(wrapper.emitted('validity-change')?.at(-1)?.[0]).toBe(false);
    // The missing account id is a required field of the selected branch.
    expect(wrapper.text()).toContain('dbt Cloud Account Id is required');
    // Q-3: the seeded value matches no branch, so the object-level
    // oneOf error stands alongside the branch errors.
    expect(wrapper.text()).toContain('must match exactly one schema in oneOf');
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

  it('propagates edits inside a oneOf branch to the model value', async () => {
    const wrapper = await mountForm('dbt', {});
    const accountId = wrapper.find('[data-testid="schema-field-dbtConfigSource-dbtCloudAccountId"]');
    expect(accountId.exists()).toBe(true);
    await accountId.setValue('acc-1');
    await flushPromises();
    const configSource = lastModelValue(wrapper).dbtConfigSource as Record<string, unknown>;
    expect(configSource?.dbtCloudAccountId).toBe('acc-1');
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

  it('is valid for a fully-seeded profiler config (Q-3: full-schema oneOf validation)', async () => {
    const wrapper = await mountForm('profiler', {}, { pipelineType: 'profiler' });
    const vm = wrapper.vm as unknown as { validate: () => boolean };
    expect(vm.validate()).toBe(true);
    expect(wrapper.emitted('validity-change')?.at(-1)?.[0]).toBe(true);
  });

  it('is valid for a complete dbt cloud config (Q-3: exactly one branch matches)', async () => {
    const wrapper = await mountForm('dbt', {
      dbtConfigSource: {
        dbtConfigType: 'cloud',
        dbtCloudAuthToken: 'token',
        dbtCloudAccountId: 'acc-1',
        dbtCloudUrl: 'https://cloud.getdbt.com',
      },
    });
    const vm = wrapper.vm as unknown as { validate: () => boolean };
    expect(vm.validate()).toBe(true);
    expect(wrapper.emitted('validity-change')?.at(-1)?.[0]).toBe(true);
  });

  it('is valid for a fully-seeded TestSuite config (Q-3: full 954KB schema compiles)', async () => {
    const wrapper = await mountForm('TestSuite', {}, { pipelineType: 'TestSuite' });
    const vm = wrapper.vm as unknown as { validate: () => boolean };
    expect(vm.validate()).toBe(true);
    expect(wrapper.emitted('validity-change')?.at(-1)?.[0]).toBe(true);
  });
});

describe('SchemaDrivenSourceConfigForm Q-3 layered validity', () => {
  it('validates a legal non-empty STATIC echo without injecting dynamic fields', async () => {
    const wrapper = await mountForm(
      'profiler',
      {
        profileSampleConfig: {
          sampleConfigType: 'STATIC',
          config: { profileSample: 50, profileSampleType: 'ROWS', samplingMethodType: 'SYSTEM' },
        },
      },
      { pipelineType: 'profiler' },
    );
    const vm = wrapper.vm as unknown as { validate: () => boolean };
    expect(vm.validate()).toBe(true);
    expect(wrapper.emitted('validity-change')?.at(-1)?.[0]).toBe(true);
    expect(lastModelValue(wrapper).profileSampleConfig).toEqual({
      sampleConfigType: 'STATIC',
      config: { profileSample: 50, profileSampleType: 'ROWS', samplingMethodType: 'SYSTEM' },
    });
    await expandSection(wrapper, 'advanced');
    expect(wrapper.find('[data-testid="profile-sample-input"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="smart-sampling-toggle-switch"]').exists()).toBe(false);
  });

  it('validates a STATIC echo on the generic TestSuite rendering without dynamic fields', async () => {
    const wrapper = await mountForm(
      'TestSuite',
      {
        profileSampleConfig: {
          sampleConfigType: 'STATIC',
          config: { profileSample: 50, profileSampleType: 'ROWS' },
        },
      },
      { pipelineType: 'TestSuite' },
    );
    const vm = wrapper.vm as unknown as { validate: () => boolean };
    expect(vm.validate()).toBe(true);
    expect(lastModelValue(wrapper).profileSampleConfig).toEqual({
      sampleConfigType: 'STATIC',
      config: { profileSample: 50, profileSampleType: 'ROWS' },
    });
  });

  it('does not narrow the ingestion contract: a dynamic-shaped config validates under STATIC', async () => {
    const wrapper = await mountForm(
      'profiler',
      {
        profileSampleConfig: {
          sampleConfigType: 'STATIC',
          config: { smartSampling: true, thresholds: [] },
        },
      },
      { pipelineType: 'profiler' },
    );
    const vm = wrapper.vm as unknown as { validate: () => boolean };
    expect(vm.validate()).toBe(true);
    expect(lastModelValue(wrapper).profileSampleConfig).toEqual({
      sampleConfigType: 'STATIC',
      config: { smartSampling: true, thresholds: [] },
    });
  });

  it('passes a type-only config (Q-3: the frontend must not require a matching arm)', async () => {
    const staticOnly = await mountForm(
      'profiler',
      { profileSampleConfig: { sampleConfigType: 'STATIC' } },
      { pipelineType: 'profiler' },
    );
    const staticVm = staticOnly.vm as unknown as { validate: () => boolean };
    expect(staticVm.validate()).toBe(true);
    // Seeding fills the dynamic defaults; validity accepts the
    // cross-arm shape rather than forcing the config to match the
    // declared type.
    expect(lastModelValue(staticOnly).profileSampleConfig).toEqual({
      sampleConfigType: 'STATIC',
      config: { smartSampling: true, thresholds: [] },
    });
    const dynamicOnly = await mountForm(
      'profiler',
      { profileSampleConfig: { sampleConfigType: 'DYNAMIC' } },
      { pipelineType: 'profiler' },
    );
    const dynamicVm = dynamicOnly.vm as unknown as { validate: () => boolean };
    expect(dynamicVm.validate()).toBe(true);
    const configOnly = await mountForm(
      'profiler',
      { profileSampleConfig: { config: { profileSample: 50 } } },
      { pipelineType: 'profiler' },
    );
    const configVm = configOnly.vm as unknown as { validate: () => boolean };
    expect(configVm.validate()).toBe(true);
    // The seeded profileSampleType is the Static branch's own schema
    // default — branch-own seeding, not cross-arm pollution.
    expect(lastModelValue(configOnly).profileSampleConfig).toEqual({
      sampleConfigType: 'DYNAMIC',
      config: { profileSample: 50, profileSampleType: 'PERCENTAGE' },
    });
  });

  it('keeps object-level errors for a value matching both or neither oneOf branch', async () => {
    // Isomorphic to profileSampleConfig.config: two branches, neither
    // with `required`, both closed, no defaults anywhere — so seeding
    // cannot repair the value before validity sees it.
    const schema: RjsfSchema = {
      type: 'object',
      properties: {
        cfg: {
          title: 'Cfg',
          oneOf: [
            {
              title: 'Dynamic',
              type: 'object',
              properties: {
                smartSampling: { type: 'boolean' },
                thresholds: { type: 'string' },
              },
              additionalProperties: false,
            },
            {
              title: 'Static',
              type: 'object',
              properties: {
                profileSample: { type: 'number' },
                profileSampleType: { type: 'string', enum: ['PERCENTAGE', 'ROWS'] },
              },
              additionalProperties: false,
            },
          ],
        },
      },
      additionalProperties: false,
    };
    const empty = await mountWithSchema(schema, { cfg: {} });
    const emptyVm = empty.vm as unknown as { validate: () => boolean };
    expect(emptyVm.validate()).toBe(false);
    expect(empty.emitted('validity-change')?.at(-1)?.[0]).toBe(false);
    expect(lastModelValue(empty)).toEqual({ cfg: {} });
    expect(empty.text()).toContain('must match exactly one schema in oneOf');
    const mixed = await mountWithSchema(schema, {
      cfg: { profileSample: 50, smartSampling: true },
    });
    const mixedVm = mixed.vm as unknown as { validate: () => boolean };
    expect(mixedVm.validate()).toBe(false);
    expect(mixed.text()).toContain('must match exactly one schema in oneOf');
    const single = await mountWithSchema(schema, { cfg: { profileSample: 50 } });
    const singleVm = single.vm as unknown as { validate: () => boolean };
    expect(singleVm.validate()).toBe(true);
    expect(single.emitted('validity-change')?.at(-1)?.[0]).toBe(true);
  });
});
