/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import enUS from '../i18n/locales/en-US';
import zhCN from '../i18n/locales/zh-CN';
import { SERVICE_TYPES_BY_KIND } from './connections';
import { getOrderedFilterEntries } from './filterPatterns';
import { serviceFilterFieldsForType } from './serviceFilterFields';
import type { ServiceKind } from '@/types/ingestion';

// Expected field keys per (kind, service type): exactly the
// `*FilterPattern` properties declared in the type's connection schema
// file, in pin `getOrderedFilterEntries` order (known-field enum order,
// unlisted fields last in schema-declaration order). Transcribed from
// the schema files in openmetadata-spec/.../connections/ — every file
// byte-identical to pin a3012259ca — not from the table under test.
const EXPECTED: Record<string, string[]> = {
  'database:Postgres': ['databaseFilterPattern', 'schemaFilterPattern', 'tableFilterPattern', 'storedProcedureFilterPattern'],
  'database:Mysql': ['databaseFilterPattern', 'schemaFilterPattern', 'tableFilterPattern', 'storedProcedureFilterPattern'],
  'database:Snowflake': ['databaseFilterPattern', 'schemaFilterPattern', 'tableFilterPattern', 'storedProcedureFilterPattern'],
  'database:Databricks': ['databaseFilterPattern', 'schemaFilterPattern', 'tableFilterPattern'],
  'database:UnityCatalog': ['databaseFilterPattern', 'schemaFilterPattern', 'tableFilterPattern'],
  'database:Doris': ['databaseFilterPattern', 'schemaFilterPattern', 'tableFilterPattern'],
  'database:Mssql': ['databaseFilterPattern', 'schemaFilterPattern', 'tableFilterPattern', 'storedProcedureFilterPattern'],
  'database:Redshift': ['databaseFilterPattern', 'schemaFilterPattern', 'tableFilterPattern', 'storedProcedureFilterPattern'],
  'database:MariaDB': ['databaseFilterPattern', 'schemaFilterPattern', 'tableFilterPattern', 'storedProcedureFilterPattern'],
  'database:Greenplum': ['databaseFilterPattern', 'schemaFilterPattern', 'tableFilterPattern'],
  'database:Timescale': ['databaseFilterPattern', 'schemaFilterPattern', 'tableFilterPattern'],
  'messaging:Kafka': ['topicFilterPattern'],
  'messaging:Redpanda': ['topicFilterPattern'],
  'dashboard:Superset': ['dashboardFilterPattern', 'chartFilterPattern', 'dataModelFilterPattern', 'projectFilterPattern'],
  'dashboard:Metabase': ['dashboardFilterPattern', 'chartFilterPattern', 'dataModelFilterPattern', 'projectFilterPattern'],
  'storage:S3': ['containerFilterPattern'],
  'pipeline:Prefect': ['pipelineFilterPattern'],
  'pipeline:Dagster': ['pipelineFilterPattern'],
  'api:Rest': ['apiCollectionFilterPattern', 'apiEndpointFilterPattern'],
  'api:WEBHOOK': [],
  'mlmodel:CustomMlModel': ['mlModelFilterPattern'],
  'mlmodel:Mlflow': ['mlModelFilterPattern'],
  'mlmodel:SageMaker': ['mlModelFilterPattern'],
  'mlmodel:Sklearn': ['mlModelFilterPattern'],
  'mlmodel:VertexAI': ['mlModelFilterPattern'],
  'metadata:Alation': ['databaseFilterPattern', 'schemaFilterPattern', 'tableFilterPattern'],
  'metadata:AlationSink': ['databaseFilterPattern', 'schemaFilterPattern', 'tableFilterPattern'],
  'metadata:Amundsen': ['databaseFilterPattern', 'schemaFilterPattern', 'tableFilterPattern'],
  'metadata:Atlas': ['databaseFilterPattern', 'schemaFilterPattern', 'tableFilterPattern'],
  'metadata:Collibra': ['glossaryFilterPattern', 'domainFilterPattern'],
  'metadata:MetadataES': ['databaseFilterPattern', 'schemaFilterPattern', 'tableFilterPattern'],
  'metadata:OpenMetadata': ['databaseFilterPattern', 'schemaFilterPattern', 'tableFilterPattern'],
  'drive:CustomDrive': ['directoryFilterPattern', 'fileFilterPattern', 'spreadsheetFilterPattern', 'worksheetFilterPattern'],
  'drive:GoogleDrive': ['directoryFilterPattern', 'fileFilterPattern', 'spreadsheetFilterPattern', 'worksheetFilterPattern'],
  'drive:Sftp': ['directoryFilterPattern', 'fileFilterPattern'],
  'drive:SharePoint': ['directoryFilterPattern', 'fileFilterPattern', 'spreadsheetFilterPattern', 'worksheetFilterPattern'],
  'search:CustomSearch': ['searchIndexFilterPattern'],
  'search:ElasticSearch': ['searchIndexFilterPattern'],
  'search:OpenSearch': ['searchIndexFilterPattern'],
  'llm:Anthropic': ['modelFilterPattern'],
  'llm:AzureOpenAI': ['modelFilterPattern'],
  'llm:Bedrock': ['modelFilterPattern'],
  'llm:CustomLLM': ['modelFilterPattern'],
  'llm:HuggingFace': ['modelFilterPattern'],
  'llm:Ollama': ['modelFilterPattern'],
  'llm:OpenAI': ['modelFilterPattern'],
  'llm:VertexAI': ['modelFilterPattern'],
  'mcp:Mcp': ['serverFilterPattern'],
  'security:Ranger': [],
};

function keys(kind: ServiceKind, serviceType: string): string[] {
  return serviceFilterFieldsForType(kind, serviceType).map((field) => field.key);
}

function resolveKey(catalog: unknown, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>((node, part) => {
    if (node !== null && typeof node === 'object') {
      return (node as Record<string, unknown>)[part];
    }
    return undefined;
  }, catalog);
}

describe('serviceFilterFields', () => {
  it('covers every service type the wizard lists', () => {
    for (const [kind, types] of Object.entries(SERVICE_TYPES_BY_KIND) as Array<[ServiceKind, readonly string[]]>) {
      for (const type of types) {
        expect(EXPECTED, `missing expectation for ${kind}:${type}`).toHaveProperty(`${kind}:${type}`);
      }
    }
  });

  it('maps each type to exactly its connection schema filter patterns, in pin order', () => {
    for (const [compound, expected] of Object.entries(EXPECTED)) {
      const [kind, type] = compound.split(':') as [ServiceKind, string];
      expect(keys(kind, type), compound).toEqual(expected);
    }
  });

  it('disambiguates VertexAI by kind: mlModel for mlmodel, model for llm', () => {
    expect(keys('mlmodel', 'VertexAI')).toEqual(['mlModelFilterPattern']);
    expect(keys('llm', 'VertexAI')).toEqual(['modelFilterPattern']);
  });

  it('returns no fields for a type with no connection schema or none declared', () => {
    expect(keys('api', 'WEBHOOK')).toEqual([]);
    expect(keys('security', 'Ranger')).toEqual([]);
    expect(keys('database', 'NoSuchType')).toEqual([]);
  });

  it('emits only *FilterPattern keys — never the flat wizard keys', () => {
    for (const compound of Object.keys(EXPECTED)) {
      const [kind, type] = compound.split(':') as [ServiceKind, string];
      for (const key of keys(kind, type)) {
        expect(key.endsWith('FilterPattern')).toBe(true);
      }
    }
    expect(keys('database', 'Postgres')).not.toContain('includeSchemas');
    expect(keys('database', 'Postgres')).not.toContain('includeViews');
    expect(keys('messaging', 'Kafka')).not.toContain('generateSampleData');
  });

  it('agrees with pin getOrderedFilterEntries on every type', () => {
    // Independent cross-check: feed the ported mechanism synthetic
    // schema properties and require the same order the table carries.
    // Known fields match by enum name alone; unlisted fields need the
    // "Filter Pattern" title plus the includes/excludes shape, as in
    // their schema files (titles verified verbatim).
    const titles: Record<string, string> = {
      apiEndpointFilterPattern: 'Default API Endpoint Filter Pattern',
      modelFilterPattern: 'Model Filter Pattern',
      serverFilterPattern: 'Server Filter Pattern',
      glossaryFilterPattern: 'Glossary Filter Pattern',
      domainFilterPattern: 'Domain Filter Pattern',
    };
    for (const [compound, expected] of Object.entries(EXPECTED)) {
      // Reversed input proves the order comes from the mechanism, not
      // the input — except Collibra, whose two unlisted fields keep
      // schema-declaration order by the mechanism's own tie-break.
      const input = compound === 'metadata:Collibra' ? expected : [...expected].reverse();
      const properties: Record<string, unknown> = {};
      for (const key of input) {
        properties[key] =
          key in titles
            ? { title: titles[key], properties: { includes: {}, excludes: {} } }
            : {};
      }
      expect(
        getOrderedFilterEntries(properties).map(([fieldName]) => fieldName),
        compound,
      ).toEqual(expected);
    }
  });

  it('gives every field a unique testId and a resolving label key', () => {
    for (const compound of Object.keys(EXPECTED)) {
      const [kind, type] = compound.split(':') as [ServiceKind, string];
      const fields = serviceFilterFieldsForType(kind, type);
      const testIds = new Set<string>();
      for (const field of fields) {
        expect(field.testId).toBeTruthy();
        expect(testIds.has(field.testId), `duplicate testId ${field.testId} for ${compound}`).toBe(false);
        testIds.add(field.testId);
        // The label key is resolved dynamically (t(field.labelKey)), so
        // the static referenced-keys guard cannot see it — resolve it
        // here, in both catalogs, so no key path ever renders.
        expect(typeof resolveKey(enUS, field.labelKey), `${field.labelKey} in en-US`).toBe('string');
        expect((resolveKey(enUS, field.labelKey) as string).length).toBeGreaterThan(0);
        expect(typeof resolveKey(zhCN, field.labelKey), `${field.labelKey} in zh-CN`).toBe('string');
        expect((resolveKey(zhCN, field.labelKey) as string).length).toBeGreaterThan(0);
      }
    }
  });
});
