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
import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import SchemaField from '@/components/ingestion/SchemaField.vue';
import type { FieldFocusMeta } from '@/ingestion/fieldFocus';
import {
  deref,
  getSchemaByWorkflowType,
  SERVICE_CATEGORY_BY_KIND,
  type RjsfSchema,
} from '@/ingestion/ingestionSchemas';
import { createTestI18n } from '@/test/i18n';
import type { SupportedLocale } from '@/i18n/localePreference';

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

/**
 * i18n key resolution + dropdown alignment: labels, descriptions, focus
 * meta and branch/enum option text resolve against
 * `forms.schemaFields.*` keys when a prefix is given, and fall back to
 * schema text otherwise.
 */
async function mountField(options: {
  schema: RjsfSchema;
  value: unknown;
  path: string[];
  rootSchema: RjsfSchema;
  labelKeyPrefix?: string;
  locale?: SupportedLocale;
  onFieldFocus?: (fieldName: string, meta?: FieldFocusMeta) => void;
  onFieldBlur?: () => void;
}) {
  const i18n = createTestI18n(options.locale ?? 'en-US');
  const wrapper = mount(SchemaField, {
    props: {
      schema: options.schema,
      value: options.value,
      path: options.path,
      rootSchema: options.rootSchema,
      errors: new Map<string, string>(),
      showErrors: false,
      testIdPrefix: 'schema-field',
      labelKeyPrefix: options.labelKeyPrefix,
      onFieldFocus: options.onFieldFocus,
      onFieldBlur: options.onFieldBlur,
    },
    global: { plugins: [Antd, i18n] },
  });
  await flushPromises();
  return { wrapper, i18n };
}

async function openOptions(wrapper: ReturnType<typeof mount>, testId: string): Promise<string[]> {
  const selector = wrapper.find(`[data-testid="${testId}"] .ant-select-selector`);
  expect(selector.exists(), `selector ${testId}`).toBe(true);
  selector.element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  selector.element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await flushPromises();
  return [...document.querySelectorAll('.ant-select-item-option')].map(
    (option) => option.textContent ?? '',
  );
}

function currentOptions(): string[] {
  return [...document.querySelectorAll('.ant-select-item-option')].map(
    (option) => option.textContent ?? '',
  );
}

async function databaseSchema(): Promise<RjsfSchema> {
  return getSchemaByWorkflowType('metadata', SERVICE_CATEGORY_BY_KIND.database, 'BigQuery');
}

async function mountOwnerDatabase(value: unknown, locale?: SupportedLocale) {
  const rootSchema = await databaseSchema();
  const ownerConfig = deref(rootSchema.properties!.ownerConfig!, rootSchema);
  const schema = ownerConfig.properties!.database!;
  return {
    rootSchema,
    ...(await mountField({
      schema,
      value,
      path: ['ownerConfig', 'database'],
      rootSchema,
      labelKeyPrefix: 'forms.schemaFields.database.ownerConfig.database',
      locale,
    })),
  };
}

describe('SchemaField i18n keys and dropdown alignment', () => {
  it('renders String and Object for untitled string/object branches (D1)', async () => {
    const { wrapper, i18n } = await mountOwnerDatabase('owner-name');
    const options = await openOptions(wrapper, 'schema-field-ownerConfig-database-branch');
    expect(options).toEqual(['String', 'Object']);
    i18n.global.locale.value = 'zh-CN';
    await nextTick();
    await flushPromises();
    expect(currentOptions()).toEqual(['字符串', '对象']);
    wrapper.unmount();
  });

  it('renders the selected branch description under the selector', async () => {
    const { wrapper } = await mountOwnerDatabase('owner-name');
    const rowTestId = '[data-testid="schema-field-ownerConfig-database-branch-description"]';
    const row = wrapper.find(rowTestId);
    expect(row.exists()).toBe(true);
    expect(row.text()).toBe('Single owner (user or team) for all databases');
    await wrapper.setProps({ value: { mydb: 'owner1' } });
    await flushPromises();
    expect(wrapper.find(rowTestId).text()).toBe('Map of database names to their owner(s)');
    wrapper.unmount();
  });

  it('shows no branch description for a single-branch selector or a description-less branch', async () => {
    const rootSchema: RjsfSchema = { title: 'Synthetic', type: 'object', properties: {} };
    const single = await mountField({
      schema: {
        title: 'Flag',
        oneOf: [{ title: 'Only Branch', description: 'Only branch description', type: 'string' }],
      },
      value: 'x',
      path: ['field'],
      rootSchema,
    });
    expect(
      single.wrapper.find('[data-testid="schema-field-field-branch-description"]').exists(),
    ).toBe(false);
    single.wrapper.unmount();

    // projectId: two titled branches, neither carrying a description.
    const storageSchema = await getSchemaByWorkflowType('metadata', SERVICE_CATEGORY_BY_KIND.storage);
    const smcs = deref(storageSchema.properties!.storageMetadataConfigSource!, storageSchema);
    const b5 = deref(smcs.oneOf![5]!, storageSchema);
    const securityConfig = deref(b5.properties!.securityConfig!, storageSchema);
    const gcpConfig = deref(securityConfig.properties!.gcpConfig!, storageSchema);
    const gcpB0 = deref(gcpConfig.oneOf![0]!, storageSchema);
    const projectId = gcpB0.properties!.projectId!;
    const mounted = await mountField({
      schema: projectId,
      value: 'my-project',
      path: ['projectId'],
      rootSchema: storageSchema,
      labelKeyPrefix:
        'forms.schemaFields.storage.storageMetadataConfigSource.b5.securityConfig.gcpConfig.b0.projectId',
    });
    expect(
      mounted.wrapper.find('[data-testid="schema-field-projectId-branch-description"]').exists(),
    ).toBe(false);
    mounted.wrapper.unmount();
  });

  it('formats titled branch labels like official getFormDisplayLabel', async () => {
    const rootSchema = await getSchemaByWorkflowType('dbt', undefined);
    const { wrapper } = await mountField({
      schema: rootSchema.properties!.dbtConfigSource!,
      value: {},
      path: ['dbtConfigSource'],
      rootSchema,
    });
    const options = await openOptions(wrapper, 'schema-field-dbtConfigSource-branch');
    expect(options).toContain('dbt Cloud Config');
    expect(options).toContain('dbt S3 Config');
    expect(options.some((option) => option.startsWith('DBT'))).toBe(false);
    wrapper.unmount();
  });

  it('falls back to Option N for a branch with neither title nor string type', async () => {
    const rootSchema: RjsfSchema = { title: 'Synthetic', type: 'object', properties: {} };
    const { wrapper, i18n } = await mountField({
      schema: {
        title: 'Synthetic',
        oneOf: [{ type: ['string', 'null'] }, { type: ['string', 'null'] }],
      },
      value: undefined,
      path: ['field'],
      rootSchema,
    });
    expect(await openOptions(wrapper, 'schema-field-field-branch')).toEqual([
      'Option 1',
      'Option 2',
    ]);
    i18n.global.locale.value = 'zh-CN';
    await nextTick();
    await flushPromises();
    expect(currentOptions()).toEqual(['选项 1', '选项 2']);
    wrapper.unmount();
  });

  it('renders translated labels and descriptions from keys and updates live on locale switch', async () => {
    const rootSchema = await databaseSchema();
    const { wrapper, i18n } = await mountField({
      schema: rootSchema.properties!.markDeletedTables!,
      value: false,
      path: ['markDeletedTables'],
      rootSchema,
      labelKeyPrefix: 'forms.schemaFields.database.markDeletedTables',
    });
    expect(wrapper.find('[data-testid="schema-field-markDeletedTables-label"]').text()).toBe(
      'Mark Deleted Tables',
    );
    expect(wrapper.find('.toggle-field-description').text()).toContain('soft deletion of tables');
    i18n.global.locale.value = 'zh-CN';
    await nextTick();
    await flushPromises();
    expect(wrapper.find('[data-testid="schema-field-markDeletedTables-label"]').text()).toBe(
      '标记已删除的数据表',
    );
    expect(wrapper.find('.toggle-field-description').text()).toContain('软删除');
    wrapper.unmount();
  });

  it('falls back to schema text when no label key prefix is given', async () => {
    const rootSchema = await databaseSchema();
    const { wrapper, i18n } = await mountField({
      schema: rootSchema.properties!.markDeletedTables!,
      value: false,
      path: ['markDeletedTables'],
      rootSchema,
    });
    expect(wrapper.find('[data-testid="schema-field-markDeletedTables-label"]').text()).toBe(
      'Mark Deleted Tables',
    );
    i18n.global.locale.value = 'zh-CN';
    await nextTick();
    await flushPromises();
    expect(wrapper.find('[data-testid="schema-field-markDeletedTables-label"]').text()).toBe(
      'Mark Deleted Tables',
    );
    expect(wrapper.find('.toggle-field-description').text()).toContain('soft deletion of tables');
    wrapper.unmount();
  });

  it('translates enum option display names without changing values', async () => {
    const rootSchema = await getSchemaByWorkflowType('metadata', SERVICE_CATEGORY_BY_KIND.pipeline);
    const { wrapper } = await mountField({
      schema: rootSchema.properties!.ownershipUpdateMode!,
      value: 'replace',
      path: ['ownershipUpdateMode'],
      rootSchema,
      labelKeyPrefix: 'forms.schemaFields.pipeline.ownershipUpdateMode',
      locale: 'zh-CN',
    });
    const options = await openOptions(wrapper, 'schema-field-ownershipUpdateMode');
    expect(options).toEqual(['替换', '追加']);
    const appendOption = [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')].find(
      (option) => option.textContent === '追加',
    );
    expect(appendOption).toBeDefined();
    appendOption!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    appendOption!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(wrapper.emitted('update:value')?.at(-1)).toEqual(['append']);
    wrapper.unmount();
  });

  it('keeps D5 enum values verbatim in both locales', async () => {
    const rootSchema = await getSchemaByWorkflowType('metadata', SERVICE_CATEGORY_BY_KIND.dashboard);
    const queryParserConfig = deref(rootSchema.properties!.queryParserConfig!, rootSchema);
    const typeSchema = queryParserConfig.properties!.type!;
    const mounted = await mountField({
      schema: typeSchema,
      value: 'Auto',
      path: ['queryParserConfig', 'type'],
      rootSchema,
      labelKeyPrefix: 'forms.schemaFields.dashboard.queryParserConfig.type',
      locale: 'zh-CN',
    });
    expect(await openOptions(mounted.wrapper, 'schema-field-queryParserConfig-type')).toEqual([
      'Auto',
      'SqlGlot',
      'SqlFluff',
    ]);
    mounted.wrapper.unmount();
  });

  it('keeps the classificationLanguage capitalisation special case', async () => {
    const rootSchema = await getSchemaByWorkflowType(
      'autoClassification',
      SERVICE_CATEGORY_BY_KIND.database,
    );
    const { wrapper } = await mountField({
      schema: rootSchema.properties!.classificationLanguage!,
      value: 'any',
      path: ['classificationLanguage'],
      rootSchema,
    });
    const selection = wrapper.find(
      '[data-testid="schema-field-classificationLanguage"] .ant-select-selection-item',
    );
    expect(selection.text()).toBe('Any');
    await wrapper.setProps({ value: 'af' });
    await flushPromises();
    expect(
      wrapper.find(
        '[data-testid="schema-field-classificationLanguage"] .ant-select-selection-item',
      ).text(),
    ).toBe('Af');
    wrapper.unmount();
  });

  it('suppresses the inline boolean description when the branch description line renders', async () => {
    const rootSchema: RjsfSchema = { title: 'Synthetic', type: 'object', properties: {} };
    const multi = await mountField({
      schema: {
        title: 'Flag',
        oneOf: [
          { title: 'Yes Branch', description: 'Yes branch description', type: 'boolean' },
          { title: 'No Branch', description: 'No branch description', type: 'boolean' },
        ],
      },
      value: true,
      path: ['field'],
      rootSchema,
    });
    expect(
      multi.wrapper.find('[data-testid="schema-field-field-branch-description"]').text(),
    ).toBe('Yes branch description');
    expect(multi.wrapper.find('.toggle-field-description').exists()).toBe(false);
    multi.wrapper.unmount();

    const single = await mountField({
      schema: {
        title: 'Flag',
        oneOf: [{ title: 'Only Branch', description: 'Only branch description', type: 'boolean' }],
      },
      value: true,
      path: ['field'],
      rootSchema,
    });
    expect(
      single.wrapper.find('[data-testid="schema-field-field-branch-description"]').exists(),
    ).toBe(false);
    expect(single.wrapper.find('.toggle-field-description').text()).toBe(
      'Only branch description',
    );
    single.wrapper.unmount();
  });

  it('reports branch focus meta from branch keys, field focus meta from field keys', async () => {
    const onFieldFocus = vi.fn();
    const rootSchema = await databaseSchema();
    const ownerConfig = deref(rootSchema.properties!.ownerConfig!, rootSchema);
    const { wrapper } = await mountField({
      schema: ownerConfig.properties!.database!,
      value: { mydb: 'owner1' },
      path: ['ownerConfig', 'database'],
      rootSchema,
      labelKeyPrefix: 'forms.schemaFields.database.ownerConfig.database',
      onFieldFocus,
    });
    const select = wrapper
      .findAllComponents(Select)
      .find((candidate) => candidate.attributes('data-testid') === 'schema-field-ownerConfig-database-branch');
    expect(select).toBeTruthy();
    await select!.vm.$emit('focus');
    expect(onFieldFocus).toHaveBeenCalledWith('root/ownerConfig/database', {
      title: 'Database',
      description:
        'Owner for database entities. Can be a single owner for all databases, or a map of database names to owner(s).',
    });
    onFieldFocus.mockClear();
    const mapInput = wrapper.find(
      '[data-testid="schema-field-ownerConfig-database-value-mydb"]',
    );
    expect(mapInput.exists()).toBe(true);
    mapInput.element.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    await flushPromises();
    expect(onFieldFocus).toHaveBeenCalledWith('root/ownerConfig/database', {
      title: undefined,
      description: 'Map of database names to their owner(s)',
    });
    wrapper.unmount();
  });

  it('keeps the focused doc-panel text snapshotted across a locale switch until refocus', async () => {
    const onFieldFocus = vi.fn();
    const rootSchema = await databaseSchema();
    const { wrapper, i18n } = await mountField({
      schema: rootSchema.properties!.markDeletedTables!,
      value: false,
      path: ['markDeletedTables'],
      rootSchema,
      labelKeyPrefix: 'forms.schemaFields.database.markDeletedTables',
      onFieldFocus,
    });
    const toggle = wrapper.findComponent({ name: 'ToggleField' });
    expect(toggle.exists()).toBe(true);
    await toggle.vm.$emit('focus', 'root/markDeletedTables');
    expect(onFieldFocus).toHaveBeenCalledTimes(1);
    expect(onFieldFocus).toHaveBeenCalledWith(
      'root/markDeletedTables',
      expect.objectContaining({ title: 'Mark Deleted Tables' }),
    );
    i18n.global.locale.value = 'zh-CN';
    await nextTick();
    await flushPromises();
    expect(onFieldFocus).toHaveBeenCalledTimes(1);
    await toggle.vm.$emit('focus', 'root/markDeletedTables');
    expect(onFieldFocus).toHaveBeenCalledTimes(2);
    expect(onFieldFocus).toHaveBeenLastCalledWith(
      'root/markDeletedTables',
      expect.objectContaining({ title: '标记已删除的数据表' }),
    );
    wrapper.unmount();
  });

  it('skips key lookup for object-array row nodes (numeric path segment guard)', async () => {
    const rootSchema: RjsfSchema = { title: 'Synthetic', type: 'object', properties: {} };
    const { wrapper } = await mountField({
      schema: {
        title: 'Rows',
        type: 'array',
        items: {
          title: 'Row Item',
          type: 'object',
          properties: { count: { title: 'Count', type: 'integer' } },
        },
      },
      value: [{ count: 1 }],
      path: ['threads'],
      rootSchema,
      labelKeyPrefix: 'forms.schemaFields.database.threads',
    });
    // The row node shares the parent prefix but its numeric path segment
    // skips the lookup: the row title is the schema title, not the key.
    const row = wrapper.find('[data-testid="schema-field-threads-0"]');
    expect(row.exists()).toBe(true);
    expect(row.text()).toContain('Row Item');
    expect(row.text()).not.toContain('Threads');
    expect(row.text()).toContain('Count');
    wrapper.unmount();
  });
});
