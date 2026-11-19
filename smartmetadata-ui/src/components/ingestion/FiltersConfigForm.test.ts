/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import SchemaField, { type FilterPatternFieldOptions } from '@/components/ingestion/SchemaField.vue';
import { clearConnectionSchemaCache } from '@/ingestion/connectionSchemaLoader';
import type { FetchConnectionSchema } from '@/ingestion/connectionSchemaLoader';
import FiltersConfigForm from './FiltersConfigForm.vue';

const FILTER_MESSAGES = {
  settings: {
    services: {
      filters: {
        whatShouldWeIngest: 'What should we ingest?',
        whatToIngestDescription: 'Add include / exclude rules to scope what agents bring back.',
        connectedToHost: 'Connected to {host}',
        connectionVerifiedScope: 'Connection verified. Define scope as rules below.',
        noFilterPatternsAvailable: 'No filter patterns are available for this connector.',
      },
    },
  },
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function filterProperty(title: string, defaultExcludes: string[] = []) {
  return {
    title,
    type: 'object',
    properties: {
      includes: { type: 'array', items: { type: 'string' } },
      excludes: { type: 'array', items: { type: 'string' } },
    },
    default: { includes: [], excludes: defaultExcludes },
  };
}

const SCRAMBLED_SCHEMA = {
  type: 'object',
  properties: {
    tableFilterPattern: filterProperty('Table Filter Pattern'),
    hostPort: { type: 'string', title: 'Host and Port' },
    databaseFilterPattern: filterProperty('Database Filter Pattern', ['^template1$']),
    schemaFilterPattern: filterProperty('Schema Filter Pattern'),
  },
};

async function mountForm(options: {
  kind?: string;
  serviceType?: string;
  schema?: unknown;
  fetchSchema?: FetchConnectionSchema;
  extraProps?: Record<string, unknown>;
}): Promise<VueWrapper> {
  const fetchSchema: FetchConnectionSchema =
    options.fetchSchema ?? (async () => jsonResponse(options.schema ?? SCRAMBLED_SCHEMA));
  const i18n = createTestI18n();
  i18n.global.mergeLocaleMessage('en-US', FILTER_MESSAGES);
  const wrapper = mount(FiltersConfigForm, {
    props: {
      kind: (options.kind ?? 'database') as 'database',
      serviceType: options.serviceType ?? 'Postgres',
      fetchSchema,
      ...(options.extraProps ?? {}),
    },
    attachTo: document.body,
    global: { plugins: [Antd, i18n] },
  });
  await flushPromises();
  return wrapper;
}

describe('FiltersConfigForm', () => {
  beforeEach(() => {
    clearConnectionSchemaCache();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    clearConnectionSchemaCache();
  });

  it('renders filter fields in enum order from the schema, skipping non-filter properties', async () => {
    const wrapper = await mountForm({});
    const fields = wrapper.findAllComponents(SchemaField);
    expect(fields.map((field) => field.props('path'))).toEqual([
      ['databaseFilterPattern'],
      ['schemaFilterPattern'],
      ['tableFilterPattern'],
    ]);
    const options = fields.map(
      (field) => field.props('filterPatternOptions') as FilterPatternFieldOptions,
    );
    expect(options[0].defaultOpen).toBe(true);
    expect(options[1].defaultOpen).toBe(true);
    expect(options[2].defaultOpen).toBe(false);
    expect(options[0].systemExcludes).toEqual(['^template1$']);
    expect(wrapper.find('[data-testid="filters-config-form"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('What should we ingest?');
  });

  it('adds the Snowflake sample-database exclude once', async () => {
    const wrapper = await mountForm({ serviceType: 'Snowflake' });
    const fields = wrapper.findAllComponents(SchemaField);
    const database = fields.find((field) =>
      (field.props('path') as string[]).includes('databaseFilterPattern'),
    );
    const options = database?.props('filterPatternOptions') as FilterPatternFieldOptions;
    expect(options.systemExcludes).toEqual(['^template1$', '^snowflake_sample_data$']);
  });

  it('does not duplicate the Snowflake exclude when the schema already declares it', async () => {
    const schema = {
      type: 'object',
      properties: {
        databaseFilterPattern: filterProperty('Database Filter Pattern', [
          '^snowflake_sample_data$',
        ]),
      },
    };
    const wrapper = await mountForm({ serviceType: 'Snowflake', schema });
    const field = wrapper.findAllComponents(SchemaField)[0];
    const options = field.props('filterPatternOptions') as FilterPatternFieldOptions;
    expect(options.systemExcludes).toEqual(['^snowflake_sample_data$']);
  });

  it('shows the no-fields message when the schema declares no filter fields', async () => {
    const wrapper = await mountForm({
      kind: 'security',
      serviceType: 'Ranger',
      schema: { type: 'object', properties: { hostPort: { type: 'string' } } },
    });
    expect(wrapper.findAllComponents(SchemaField).length).toBe(0);
    expect(wrapper.find('[data-testid="no-config-available"]').text()).toContain(
      'No filter patterns are available for this connector.',
    );
  });

  it('shows the no-fields message when the schema load fails', async () => {
    const wrapper = await mountForm({
      fetchSchema: async () => {
        throw new Error('network down');
      },
    });
    expect(wrapper.find('[data-testid="no-config-available"]').exists()).toBe(true);
    expect(wrapper.findAllComponents(SchemaField).length).toBe(0);
  });

  it('shows the connected message only when the connection was verified', async () => {
    const verified = await mountForm({
      extraProps: { showConnectedMessage: true, connectedHost: 'db.internal:5432' },
    });
    expect(verified.find('[data-testid="filters-connected-message"]').exists()).toBe(true);
    expect(verified.text()).toContain('Connected to db.internal:5432');
    const unverified = await mountForm({});
    expect(unverified.find('[data-testid="filters-connected-message"]').exists()).toBe(false);
  });

  it('seeds existing filter configs and drops unset fields on submit', async () => {
    const wrapper = await mountForm({
      extraProps: {
        initialConfig: {
          databaseFilterPattern: { includes: ['^sales$'], excludes: [] },
          hostPort: 'localhost:5432',
        },
      },
    });
    const fields = wrapper.findAllComponents(SchemaField);
    expect(fields[0].props('value')).toEqual({ includes: ['^sales$'], excludes: [] });
    const firstOptions = fields[0]!.props('filterPatternOptions');
    const secondOptions = fields[1]!.props('filterPatternOptions');
    expect(firstOptions?.hasExistingData).toBe(true);
    expect(secondOptions?.hasExistingData).toBe(false);
    const exposed = wrapper.vm as unknown as { submit: () => boolean };
    expect(exposed.submit()).toBe(true);
    const saves = wrapper.emitted('save') as Array<[Record<string, unknown>]> | undefined;
    expect(saves).toHaveLength(1);
    expect(saves?.[0][0]).toEqual({
      databaseFilterPattern: { includes: ['^sales$'], excludes: [] },
    });
  });
});
