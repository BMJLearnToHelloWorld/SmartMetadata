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
import SchemaField from '@/components/ingestion/SchemaField.vue';
import {
  SERVICE_CATEGORY_BY_KIND,
  deref,
  getSchemaByWorkflowType,
  type RjsfSchema,
} from '@/ingestion/ingestionSchemas';
import { createTestI18n } from '@/test/i18n';
import type { SupportedLocale } from '@/i18n/localePreference';

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

/**
 * i18n key resolution at the form level (§6.3): the form passes a
 * label-key prefix per top-level field, resolves filter-card focus
 * meta and required-error titles against the keys, and leaves
 * non-metadata pipeline types untouched.
 */
async function mountI18nForm(options: {
  pipelineType: Parameters<typeof getSchemaByWorkflowType>[0];
  category?: Parameters<typeof getSchemaByWorkflowType>[1];
  serviceType?: string;
  schema?: RjsfSchema;
  modelValue?: Record<string, unknown>;
  props?: Record<string, unknown>;
  locale?: SupportedLocale;
}) {
  const schema =
    options.schema ??
    (await getSchemaByWorkflowType(
      options.pipelineType,
      options.category ?? SERVICE_CATEGORY_BY_KIND.database,
      options.serviceType,
    ));
  const i18n = createTestI18n(options.locale ?? 'en-US');
  const wrapper = mount(SchemaDrivenSourceConfigForm, {
    props: { schema, modelValue: options.modelValue ?? {}, ...(options.props ?? {}) },
    global: { plugins: [Antd, i18n] },
  });
  await flushPromises();
  return { wrapper, i18n };
}

async function openFormOptions(
  wrapper: ReturnType<typeof mount>,
  testId: string,
): Promise<string[]> {
  const selector = wrapper.find(`[data-testid="${testId}"] .ant-select-selector`);
  expect(selector.exists(), `selector ${testId}`).toBe(true);
  selector.element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  selector.element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await flushPromises();
  return [...document.querySelectorAll('.ant-select-item-option')].map(
    (option) => (option.textContent ?? '').trim(),
  );
}

/** The Antd Form.Item label text for the field carrying `testId`. */
function formItemLabel(wrapper: ReturnType<typeof mount>, testId: string): string {
  const element = wrapper.find(`[data-testid="${testId}"]`).element;
  const item = element.closest('.ant-form-item');
  expect(item, `form item for ${testId}`).not.toBeNull();
  return (item!.querySelector('.ant-form-item-label')?.textContent ?? '').trim();
}

describe('SchemaDrivenSourceConfigForm i18n keys', () => {
  it('renders database metadata fields in Chinese with keys', async () => {
    const zh = await mountI18nForm({
      pipelineType: 'metadata',
      props: { supportsIncremental: true },
      locale: 'zh-CN',
    });
    expect(zh.wrapper.find('[data-testid="schema-field-ownerConfig"]').text()).toContain(
      '分层所有者配置',
    );
    expect(formItemLabel(zh.wrapper, 'schema-field-threads')).toBe('线程数');
    expect(zh.wrapper.find('[data-testid="schema-field-incremental"]').text()).toContain(
      '增量元数据提取配置',
    );
    await expandSection(zh.wrapper, 'scope');
    expect(zh.wrapper.find('[data-testid="schema-field-includeTables-label"]').text()).toBe(
      '包含数据表',
    );
    zh.wrapper.unmount();

    const en = await mountI18nForm({
      pipelineType: 'metadata',
      props: { supportsIncremental: true },
    });
    expect(en.wrapper.find('[data-testid="schema-field-ownerConfig"]').text()).toContain(
      'Hierarchical Owner Configuration',
    );
    expect(formItemLabel(en.wrapper, 'schema-field-threads')).toBe('Number of Threads');
    await expandSection(en.wrapper, 'scope');
    expect(en.wrapper.find('[data-testid="schema-field-includeTables-label"]').text()).toBe(
      'Include Tables',
    );
    en.wrapper.unmount();
  });

  it('renders shardedTables in Chinese for BigQuery only', async () => {
    const bigQuery = await mountI18nForm({
      pipelineType: 'metadata',
      serviceType: 'BigQuery',
      locale: 'zh-CN',
    });
    await expandSection(bigQuery.wrapper, 'scope');
    const group = bigQuery.wrapper.find('[data-testid="schema-field-shardedTables"]');
    expect(group.exists()).toBe(true);
    expect(group.text()).toContain('分片表');
    expect(group.text()).toContain('分片表分组');
    bigQuery.wrapper.unmount();

    const bigQueryEn = await mountI18nForm({
      pipelineType: 'metadata',
      serviceType: 'BigQuery',
    });
    await expandSection(bigQueryEn.wrapper, 'scope');
    const groupEn = bigQueryEn.wrapper.find('[data-testid="schema-field-shardedTables"]');
    expect(groupEn.text()).toContain('Sharded Tables');
    expect(groupEn.text()).toContain('Group Sharded Tables');
    bigQueryEn.wrapper.unmount();

    const mysql = await mountI18nForm({ pipelineType: 'metadata', locale: 'zh-CN' });
    expect(mysql.wrapper.find('[data-testid="schema-field-shardedTables"]').exists()).toBe(false);
    mysql.wrapper.unmount();
  });

  it('renders the debug log label from the shared key', async () => {
    const zh = await mountI18nForm({
      pipelineType: 'metadata',
      props: { debugLog: false },
      locale: 'zh-CN',
    });
    await expandSection(zh.wrapper, 'scope');
    expect(zh.wrapper.find('[data-testid="schema-field-enableDebugLog-label"]').text()).toBe(
      '启用调试日志',
    );
    zh.wrapper.unmount();

    const en = await mountI18nForm({ pipelineType: 'metadata', props: { debugLog: false } });
    await expandSection(en.wrapper, 'scope');
    expect(en.wrapper.find('[data-testid="schema-field-enableDebugLog-label"]').text()).toBe(
      'Enable Debug Log',
    );
    en.wrapper.unmount();
  });

  it('forwards translated filter titles and descriptions to the doc panel', async () => {
    const onFieldFocusZh = vi.fn();
    const zh = await mountI18nForm({
      pipelineType: 'metadata',
      category: SERVICE_CATEGORY_BY_KIND.storage,
      props: { onFieldFocus: onFieldFocusZh },
      locale: 'zh-CN',
    });
    await expandSection(zh.wrapper, 'filters');
    const cardZh = zh.wrapper.find('[data-testid="filter-section-containerFilterPattern"]');
    expect(cardZh.exists()).toBe(true);
    expect(cardZh.find('.filter-pattern-title').text()).toBe('存储容器');
    await cardZh.find('.filter-pattern-header').trigger('click');
    expect(onFieldFocusZh).toHaveBeenCalledWith('containerFilterPattern', {
      title: '存储容器',
      description: '仅获取与该模式匹配的存储容器的正则表达式。',
    });
    zh.wrapper.unmount();

    const onFieldFocusEn = vi.fn();
    const en = await mountI18nForm({
      pipelineType: 'metadata',
      category: SERVICE_CATEGORY_BY_KIND.storage,
      props: { onFieldFocus: onFieldFocusEn },
    });
    await expandSection(en.wrapper, 'filters');
    const cardEn = en.wrapper.find('[data-testid="filter-section-containerFilterPattern"]');
    expect(cardEn.find('.filter-pattern-title').text()).toBe('Containers');
    await cardEn.find('.filter-pattern-header').trigger('click');
    expect(onFieldFocusEn).toHaveBeenCalledWith('containerFilterPattern', {
      title: 'Containers',
      description: 'Regex to only fetch containers that matches the pattern.',
    });
    en.wrapper.unmount();
  });

  it('uses the translated label in the required error for incremental.enabled', async () => {
    // Production seeding always fills `enabled` (default: false), so the
    // missing-required state is unreachable with the pristine schema.
    // The clone strips only that default; shape, titles and the
    // `required` constraint are unchanged, exposing the AJV path the
    // error-message lookup must handle.
    const pristine = await getSchemaByWorkflowType(
      'metadata',
      SERVICE_CATEGORY_BY_KIND.database,
    );
    const schema = JSON.parse(JSON.stringify(pristine)) as RjsfSchema & {
      definitions: Record<string, RjsfSchema>;
    };
    const incremental = schema.definitions.incremental;
    const enabled = (incremental.properties as Record<string, RjsfSchema>).enabled;
    delete (enabled as Record<string, unknown>).default;

    const zh = await mountI18nForm({
      pipelineType: 'metadata',
      schema,
      modelValue: { incremental: {} },
      props: { supportsIncremental: true },
      locale: 'zh-CN',
    });
    const zhVm = zh.wrapper.vm as unknown as { validate: () => boolean };
    expect(zhVm.validate()).toBe(false);
    await flushPromises();
    expect(zh.wrapper.emitted('validity-change')?.at(-1)?.[0]).toBe(false);
    expect(zh.wrapper.text()).toContain('已启用');
    zh.wrapper.unmount();

    const en = await mountI18nForm({
      pipelineType: 'metadata',
      schema,
      modelValue: { incremental: {} },
      props: { supportsIncremental: true },
    });
    const enVm = en.wrapper.vm as unknown as { validate: () => boolean };
    expect(enVm.validate()).toBe(false);
    await flushPromises();
    expect(en.wrapper.text()).toContain('Enabled is required');
    en.wrapper.unmount();
  });

  it('keeps submitted values identical with keys enabled', async () => {
    async function scripted(locale: SupportedLocale) {
      const { wrapper } = await mountI18nForm({ pipelineType: 'metadata', locale });
      await expandSection(wrapper, 'advanced');
      await wrapper.find('[data-testid="schema-field-includeViews-switch"]').trigger('click');
      await wrapper
        .find('[data-testid="schema-field-ownerConfig-default"]')
        .setValue('owner-x');
      await flushPromises();
      await openFormOptions(wrapper, 'schema-field-ownerConfig-database-branch');
      const options = [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')];
      expect(options).toHaveLength(2);
      options[1]!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      options[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushPromises();
      const data = lastModelValue(wrapper);
      wrapper.unmount();
      return data;
    }
    const enData = await scripted('en-US');
    const zhData = await scripted('zh-CN');
    expect(zhData).toEqual(enData);
    expect(enData.includeViews).toBe(false);
    expect((enData.ownerConfig as Record<string, unknown>).default).toBe('owner-x');
    expect((enData.ownerConfig as Record<string, unknown>).database).toEqual({});
  });

  it('renders profiler, usage, lineage, dbt and TestSuite forms without key regressions', async () => {
    const profiler = await mountI18nForm({
      pipelineType: 'profiler',
      props: { pipelineType: 'profiler' },
      locale: 'zh-CN',
    });
    await expandSection(profiler.wrapper, 'advanced');
    expect(profiler.wrapper.text()).toContain('Timeout (in sec.)');
    profiler.wrapper.unmount();

    const usage = await mountI18nForm({
      pipelineType: 'usage',
      props: { pipelineType: 'usage' },
      locale: 'zh-CN',
    });
    expect(usage.wrapper.text()).toContain('Query Log Duration');
    usage.wrapper.unmount();

    const lineage = await mountI18nForm({
      pipelineType: 'lineage',
      props: { pipelineType: 'lineage' },
      locale: 'zh-CN',
    });
    expect(lineage.wrapper.text()).toContain('Query Log File Path');
    lineage.wrapper.unmount();

    const dbt = await mountI18nForm({
      pipelineType: 'dbt',
      props: { pipelineType: 'dbt' },
      locale: 'zh-CN',
    });
    const dbtOptions = await openFormOptions(dbt.wrapper, 'schema-field-dbtConfigSource-branch');
    expect(dbtOptions).toContain('dbt Cloud Config');
    expect(dbtOptions.some((option) => option.startsWith('DBT'))).toBe(false);
    dbt.wrapper.unmount();

    const testSuite = await mountI18nForm({
      pipelineType: 'TestSuite',
      props: { pipelineType: 'TestSuite' },
      locale: 'zh-CN',
    });
    const vm = testSuite.wrapper.vm as unknown as { validate: () => boolean };
    expect(vm.validate()).toBe(true);
    expect(testSuite.wrapper.emitted('ready')).toHaveLength(1);
    testSuite.wrapper.unmount();
  });

  it('shows the branch description line for storage config source branches', async () => {
    // Branch selection is value-driven (selectBranch): a branch is
    // reached by seeding a value that selects it, not by clicking the
    // selector (a click resets to branch defaults, which select b0).
    const row = '[data-testid="schema-field-storageMetadataConfigSource-branch-description"]';
    const en0 = await mountI18nForm({
      pipelineType: 'metadata',
      category: SERVICE_CATEGORY_BY_KIND.storage,
    });
    expect(en0.wrapper.find(row).text()).toBe(
      'No manifest file available. Ingestion would look for bucket-level metadata file instead',
    );
    en0.wrapper.unmount();

    const en1 = await mountI18nForm({
      pipelineType: 'metadata',
      category: SERVICE_CATEGORY_BY_KIND.storage,
      modelValue: { storageMetadataConfigSource: { manifestFilePath: '/manifest.json' } },
    });
    expect(en1.wrapper.find(row).text()).toBe('Storage Metadata Manifest file path config.');
    en1.wrapper.unmount();

    const en3 = await mountI18nForm({
      pipelineType: 'metadata',
      category: SERVICE_CATEGORY_BY_KIND.storage,
      modelValue: { storageMetadataConfigSource: { prefixConfig: { containerName: 'c' } } },
    });
    expect(en3.wrapper.find(row).text()).toBe('Storage Metadata Manifest file S3 path config.');
    en3.wrapper.unmount();

    const zh1 = await mountI18nForm({
      pipelineType: 'metadata',
      category: SERVICE_CATEGORY_BY_KIND.storage,
      modelValue: { storageMetadataConfigSource: { manifestFilePath: '/manifest.json' } },
      locale: 'zh-CN',
    });
    expect(zh1.wrapper.find(row).text()).toBe('存储元数据清单文件路径配置。');
    zh1.wrapper.unmount();
  });

  it('disambiguates same-named fields across storage branches (securityConfig)', async () => {
    const group = '[data-testid="schema-field-storageMetadataConfigSource-securityConfig"]';
    const zh3 = await mountI18nForm({
      pipelineType: 'metadata',
      category: SERVICE_CATEGORY_BY_KIND.storage,
      modelValue: { storageMetadataConfigSource: { prefixConfig: { containerName: 'c' } } },
      locale: 'zh-CN',
    });
    const zh3Text = zh3.wrapper.find(group).text();
    expect(zh3Text).toContain('S3 安全配置');
    expect(zh3Text).not.toContain('ADLS 安全配置');
    expect(zh3Text).not.toContain('GCS 安全配置');
    zh3.wrapper.unmount();

    const en3 = await mountI18nForm({
      pipelineType: 'metadata',
      category: SERVICE_CATEGORY_BY_KIND.storage,
      modelValue: { storageMetadataConfigSource: { prefixConfig: { containerName: 'c' } } },
    });
    const en3Text = en3.wrapper.find(group).text();
    expect(en3Text).toContain('S3 Security Config');
    expect(en3Text).not.toContain('ADLS Security Config');
    expect(en3Text).not.toContain('GCS Security Config');
    en3.wrapper.unmount();

    // b4/b5 are unreachable through the form: value-driven branch
    // selection cannot distinguish them from b3 (identical direct
    // props, same required key). The branch-child key resolution is
    // verified by mounting the branch content directly with the
    // prefix the form would pass — the same pattern the SchemaField
    // projectId test uses for unreachable nesting.
    const storageSchema = await getSchemaByWorkflowType(
      'metadata',
      SERVICE_CATEGORY_BY_KIND.storage,
    );
    const smcs = deref(storageSchema.properties!.storageMetadataConfigSource!, storageSchema);
    for (const [index, expected] of [
      [4, 'ADLS 安全配置'],
      [5, 'GCS 安全配置'],
    ] as const) {
      const branch = deref(smcs.oneOf![index]!, storageSchema);
      const securityConfig = deref(branch.properties!.securityConfig!, storageSchema);
      const i18n = createTestI18n('zh-CN');
      const field = mount(SchemaField, {
        props: {
          schema: securityConfig,
          value: {},
          path: ['storageMetadataConfigSource', 'securityConfig'],
          rootSchema: storageSchema,
          errors: new Map<string, string>(),
          showErrors: false,
          testIdPrefix: 'schema-field',
          labelKeyPrefix: `forms.schemaFields.storage.storageMetadataConfigSource.b${index}.securityConfig`,
        },
        global: { plugins: [Antd, i18n] },
      });
      await flushPromises();
      expect(field.find(group).text()).toContain(expected);
      field.unmount();
    }
  });

  it('disambiguates projectId labels across gcpConfig branches', async () => {
    // gcpConfig lives under the unreachable b5 branch, so the field is
    // mounted directly per branch with the prefix the form would pass.
    const storageSchema = await getSchemaByWorkflowType(
      'metadata',
      SERVICE_CATEGORY_BY_KIND.storage,
    );
    const smcs = deref(storageSchema.properties!.storageMetadataConfigSource!, storageSchema);
    const b5 = deref(smcs.oneOf![5]!, storageSchema);
    const securityConfig = deref(b5.properties!.securityConfig!, storageSchema);
    const gcpConfig = deref(securityConfig.properties!.gcpConfig!, storageSchema);
    const cases: Array<[number, string, string]> = [
      [0, '项目 ID', 'Project ID'],
      [1, 'GCP 项目 ID', 'GCP Project ID'],
      [3, 'GCP 项目 ID', 'GCP Project ID'],
    ];
    for (const [index, zhLabel, enLabel] of cases) {
      const branch = deref(gcpConfig.oneOf![index]!, storageSchema);
      const projectId = branch.properties!.projectId!;
      for (const [locale, expected] of [
        ['zh-CN', zhLabel],
        ['en-US', enLabel],
      ] as const) {
        const i18n = createTestI18n(locale);
        const field = mount(SchemaField, {
          props: {
            schema: projectId,
            value: 'my-project',
            path: ['storageMetadataConfigSource', 'securityConfig', 'gcpConfig', 'projectId'],
            rootSchema: storageSchema,
            errors: new Map<string, string>(),
            showErrors: false,
            testIdPrefix: 'schema-field',
            labelKeyPrefix: `forms.schemaFields.storage.storageMetadataConfigSource.b5.securityConfig.gcpConfig.b${index}.projectId`,
          },
          global: { plugins: [Antd, i18n] },
        });
        await flushPromises();
        expect(
          formItemLabel(
            field,
            'schema-field-storageMetadataConfigSource-securityConfig-gcpConfig-projectId-branch',
          ),
        ).toBe(expected);
        field.unmount();
      }
    }
  });

  it('disambiguates gcpConfig type descriptions across branches', async () => {
    const storageSchema = await getSchemaByWorkflowType(
      'metadata',
      SERVICE_CATEGORY_BY_KIND.storage,
    );
    const smcs = deref(storageSchema.properties!.storageMetadataConfigSource!, storageSchema);
    const b5 = deref(smcs.oneOf![5]!, storageSchema);
    const securityConfig = deref(b5.properties!.securityConfig!, storageSchema);
    const gcpConfig = deref(securityConfig.properties!.gcpConfig!, storageSchema);
    const cases: Array<[number, string, string]> = [
      [0, 'Google Cloud Platform 帐户类型。', 'Google Cloud Platform account type.'],
      [3, 'Google Cloud Platform ADC（应用默认凭证）。', 'Google Cloud Platform ADC ( Application Default Credentials )'],
    ];
    for (const [index, zhDescription, enDescription] of cases) {
      const branch = deref(gcpConfig.oneOf![index]!, storageSchema);
      const typeSchema = branch.properties!.type!;
      for (const [locale, expected] of [
        ['zh-CN', zhDescription],
        ['en-US', enDescription],
      ] as const) {
        const onFieldFocus = vi.fn();
        const i18n = createTestI18n(locale);
        const field = mount(SchemaField, {
          props: {
            schema: typeSchema,
            value: 'gcp_adc',
            path: ['storageMetadataConfigSource', 'securityConfig', 'gcpConfig', 'type'],
            rootSchema: storageSchema,
            errors: new Map<string, string>(),
            showErrors: false,
            testIdPrefix: 'schema-field',
            labelKeyPrefix: `forms.schemaFields.storage.storageMetadataConfigSource.b5.securityConfig.gcpConfig.b${index}.type`,
            onFieldFocus,
          },
          global: { plugins: [Antd, i18n] },
        });
        await flushPromises();
        await field
          .find('[data-testid="schema-field-storageMetadataConfigSource-securityConfig-gcpConfig-type"]')
          .trigger('focus');
        expect(onFieldFocus).toHaveBeenCalledWith(
          'root/storageMetadataConfigSource/securityConfig/gcpConfig/type',
          expect.objectContaining({ description: expected }),
        );
        field.unmount();
      }
    }
  });

  it('falls back to the English schema title for a branch-internal required field', async () => {
    // The b1/manifestFilePath state the design names is unreachable:
    // selecting b1 requires manifestFilePath present, which satisfies
    // the constraint. The prefixConfig/containerName state exercises
    // the identical code path (branch-less key lookup misses the
    // `.b<i>.`-segmented key, so the English schema title is used).
    const zh = await mountI18nForm({
      pipelineType: 'metadata',
      category: SERVICE_CATEGORY_BY_KIND.storage,
      modelValue: { storageMetadataConfigSource: { prefixConfig: {} } },
      locale: 'zh-CN',
    });
    const vm = zh.wrapper.vm as unknown as { validate: () => boolean };
    expect(vm.validate()).toBe(false);
    await flushPromises();
    expect(zh.wrapper.emitted('validity-change')?.at(-1)?.[0]).toBe(false);
    expect(zh.wrapper.text()).toContain('Storage Metadata Container Name');
    zh.wrapper.unmount();
  });
});
