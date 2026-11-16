/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import {
  applySchemaDefaults,
  cleanWorkFlowData,
  deref,
  formatAdditionalProperties,
  getDefaultFilterPropertyFieldsFromSchema,
  getDefaultFilterPropertyValues,
  getSchemaByWorkflowType,
  getWorkflowCustomProperties,
  neutralizeUnresolvableRefs,
  resolveRef,
  selectBranch,
  startCase,
  validateOwnerConfigMaps,
  type RjsfSchema,
} from './ingestionSchemas';

/**
 * The default-seeding expectations below are ground truth from running
 * `@rjsf/utils@5.24.13` `getDefaultFormState` (the pin's version)
 * against the vendored schemas — see `/tmp/rjsf-probe/probe*.cjs`.
 * The resolver omits `shardedTables` for non-BigQuery services and the
 * six ElasticSearch-connection fields for `elasticSearchReindex`
 * pipelines, so those keys are absent from the resolved-schema
 * expectations even though the raw-schema probe seeds them.
 */
describe('ingestion schemas', () => {
  it('resolves the metadata schema per service category', async () => {
    const database = await getSchemaByWorkflowType('metadata', 'DATABASE_SERVICES');
    expect(Object.keys(database.properties ?? {})).toHaveLength(27);
    expect(database.properties?.type).toBeDefined();
    const api = await getSchemaByWorkflowType('metadata', 'API_SERVICES');
    expect(Object.keys(api.properties ?? {})).toHaveLength(5);
    expect(api.properties?.apiCollectionFilterPattern).toBeDefined();
    const mlmodel = await getSchemaByWorkflowType('metadata', 'ML_MODEL_SERVICES');
    expect(Object.keys(mlmodel.properties ?? {})).toHaveLength(6);
    const pipeline = await getSchemaByWorkflowType('metadata', 'PIPELINE_SERVICES');
    expect(Object.keys(pipeline.properties ?? {})).toHaveLength(12);
  });

  it('resolves per-type schemas and falls back to {} for unmapped types', async () => {
    const profiler = await getSchemaByWorkflowType('profiler', 'DATABASE_SERVICES');
    expect(Object.keys(profiler.properties ?? {})).toHaveLength(17);
    const dbt = await getSchemaByWorkflowType('dbt', 'DATABASE_SERVICES');
    expect(dbt.required).toEqual(['dbtConfigSource']);
    const usage = await getSchemaByWorkflowType('usage', 'DATABASE_SERVICES');
    expect(Object.keys(usage.properties ?? {})).toHaveLength(7);
    const lineage = await getSchemaByWorkflowType('lineage', 'DATABASE_SERVICES');
    expect(Object.keys(lineage.properties ?? {})).toHaveLength(20);
    const testSuite = await getSchemaByWorkflowType('TestSuite', 'DATABASE_SERVICES');
    expect(Object.keys(testSuite.properties ?? {})).toHaveLength(5);
    const dataInsight = await getSchemaByWorkflowType('dataInsight', 'METADATA_SERVICES');
    expect(dataInsight.required).toEqual(['type']);
    const application = await getSchemaByWorkflowType('application', 'DATABASE_SERVICES');
    expect(application.properties ?? {}).toEqual({});
    const llmMetadata = await getSchemaByWorkflowType('metadata', undefined);
    expect(llmMetadata.properties ?? {}).toEqual({});
  });

  it('resolves the auto-classification schema per service category', async () => {
    const database = await getSchemaByWorkflowType('autoClassification', 'DATABASE_SERVICES');
    expect(Object.keys(database.properties ?? {})).toHaveLength(12);
    const messaging = await getSchemaByWorkflowType('autoClassification', 'MESSAGING_SERVICES');
    expect(Object.keys(messaging.properties ?? {})).toHaveLength(9);
    expect(messaging.properties?.topicFilterPattern).toBeDefined();
    const storage = await getSchemaByWorkflowType('autoClassification', 'STORAGE_SERVICES');
    expect(Object.keys(storage.properties ?? {})).toHaveLength(10);
    expect(storage.properties?.bucketFilterPattern).toBeDefined();
  });

  it('omits shardedTables unless the service type is BigQuery', async () => {
    const plain = await getSchemaByWorkflowType('metadata', 'DATABASE_SERVICES', 'Postgres');
    expect(plain.properties?.shardedTables).toBeUndefined();
    const bigQuery = await getSchemaByWorkflowType('metadata', 'DATABASE_SERVICES', 'BigQuery');
    expect(bigQuery.properties?.shardedTables).toBeDefined();
  });

  it('omits the ElasticSearch-connection fields for elasticSearchReindex', async () => {
    const schema = await getSchemaByWorkflowType(
      'elasticSearchReindex',
      'METADATA_SERVICES',
    );
    for (const field of ['useSSL', 'verifyCerts', 'timeout', 'caCerts', 'useAwsCredentials', 'regionName']) {
      expect(schema.properties?.[field]).toBeUndefined();
    }
    expect(schema.properties?.batchSize).toBeDefined();
  });

  it('seeds database metadata defaults exactly like RJSF (non-BigQuery)', async () => {
    const schema = await getSchemaByWorkflowType('metadata', 'DATABASE_SERVICES');
    expect(applySchemaDefaults(schema, {})).toEqual({
      type: 'DatabaseMetadata',
      markDeletedTables: true,
      markDeletedStoredProcedures: true,
      markDeletedSchemas: false,
      markDeletedDatabases: false,
      includeTables: true,
      includeViews: true,
      includeTags: true,
      includeCustomProperties: false,
      includeOwners: false,
      ownerConfig: { enableInheritance: true },
      includeStoredProcedures: true,
      includeDDL: false,
      overrideMetadata: false,
      queryLogDuration: 1,
      queryParsingTimeoutLimit: 300,
      useFqnForFiltering: false,
      schemaFilterPattern: { includes: [], excludes: [] },
      tableFilterPattern: { includes: [], excludes: [] },
      databaseFilterPattern: { includes: [], excludes: [] },
      storedProcedureFilterPattern: { includes: [], excludes: [] },
      threads: 1,
      incremental: { enabled: false, lookbackDays: 7, safetyMarginDays: 1 },
      extractJsonSchema: false,
      jsonSchemaSampleSize: 10,
    });
  });

  it('seeds shardedTables for BigQuery and fills saved values on edit', async () => {
    const schema = await getSchemaByWorkflowType('metadata', 'DATABASE_SERVICES', 'BigQuery');
    const seeded = applySchemaDefaults(schema, {});
    expect(seeded.shardedTables).toEqual({ enabled: false });
    // A saved config wins over defaults; missing defaults still fill in.
    const edited = applySchemaDefaults(schema, { type: 'DatabaseMetadata', includeViews: true });
    expect(edited.includeViews).toBe(true);
    expect(edited.markDeletedTables).toBe(true);
    expect(edited.shardedTables).toEqual({ enabled: false });
  });

  it('seeds profiler defaults exactly like RJSF', async () => {
    const schema = await getSchemaByWorkflowType('profiler', 'DATABASE_SERVICES');
    expect(applySchemaDefaults(schema, {})).toEqual({
      type: 'Profiler',
      processingEngine: { type: 'Native' },
      classificationFilterPattern: { includes: [], excludes: [] },
      schemaFilterPattern: { includes: [], excludes: [] },
      tableFilterPattern: { includes: [], excludes: [] },
      databaseFilterPattern: { includes: [], excludes: [] },
      includeViews: false,
      useFqnForFiltering: false,
      computeTableMetrics: true,
      computeColumnMetrics: true,
      useStatistics: false,
      enableAutoPartitionDetection: true,
      profileSampleConfig: {
        sampleConfigType: 'DYNAMIC',
        config: { smartSampling: true, thresholds: [] },
      },
      randomizedSample: false,
      timeoutSeconds: 43200,
      metrics: [
        'mean',
        'valuesCount',
        'columnCount',
        'distinctCount',
        'distinctProportion',
        'max',
        'min',
        'nullCount',
        'rowCount',
        'stddev',
        'sum',
        'uniqueCount',
        'uniqueProportion',
        'columnNames',
        'nullProportion',
        'median',
        'firstQuartile',
        'thirdQuartile',
        'interQuartileRange',
        'nonParametricSkew',
      ],
    });
  });

  it('seeds dbt defaults exactly like RJSF (first oneOf branch)', async () => {
    const schema = await getSchemaByWorkflowType('dbt', 'DATABASE_SERVICES');
    expect(applySchemaDefaults(schema, {})).toEqual({
      type: 'DBT',
      dbtConfigSource: { dbtConfigType: 'cloud', dbtCloudIngestAllJobs: false },
      searchAcrossDatabases: false,
      dbtUpdateDescriptions: false,
      dbtUpdateOwners: false,
      includeTags: true,
      overrideLineage: false,
      dbtClassificationName: 'dbtTags',
      schemaFilterPattern: { includes: [], excludes: [] },
      tableFilterPattern: { includes: [], excludes: [] },
      parsingTimeoutLimit: 300,
      databaseFilterPattern: { includes: [], excludes: [] },
      tagFilterPattern: { includes: [], excludes: [] },
      includeMetrics: false,
    });
  });

  it('seeds the remaining schemas exactly like RJSF', async () => {
    const cases: Array<[string, string, Record<string, unknown>]> = [
      [
        'metadata',
        'API_SERVICES',
        {
          type: 'ApiMetadata',
          apiCollectionFilterPattern: { includes: [], excludes: [] },
          apiEndpointFilterPattern: { includes: [], excludes: [] },
          markDeletedApiCollections: true,
          overrideMetadata: false,
        },
      ],
      [
        'lineage',
        'DATABASE_SERVICES',
        {
          type: 'DatabaseLineage',
          queryLogDuration: 1,
          resultLimit: 1000,
          parsingTimeoutLimit: 300,
          queryParserConfig: { type: 'Auto' },
          schemaFilterPattern: { includes: [], excludes: [] },
          tableFilterPattern: { includes: [], excludes: [] },
          databaseFilterPattern: { includes: [], excludes: [] },
          storedProcedureFilterPattern: { includes: [], excludes: [] },
          overrideViewLineage: false,
          processViewLineage: true,
          processQueryLineage: true,
          processStoredProcedureLineage: true,
          threads: 1,
          processCrossDatabaseLineage: false,
          crossDatabaseServiceNames: [],
          enableTempTableLineage: false,
          incrementalLineageProcessing: true,
        },
      ],
      [
        'usage',
        'DATABASE_SERVICES',
        {
          type: 'DatabaseUsage',
          queryLogDuration: 1,
          stageFileLocation: '/tmp/query_log',
          resultLimit: 1000,
          processQueryCostAnalysis: true,
        },
      ],
      ['dataInsight', 'METADATA_SERVICES', { type: 'dataInsight' }],
      [
        'metadata',
        'MESSAGING_SERVICES',
        {
          type: 'MessagingMetadata',
          topicFilterPattern: { includes: [], excludes: [] },
          generateSampleData: false,
          markDeletedTopics: true,
          overrideMetadata: false,
        },
      ],
      [
        'metadata',
        'PIPELINE_SERVICES',
        {
          type: 'PipelineMetadata',
          includeLineage: true,
          includeOwners: true,
          ownershipUpdateMode: 'replace',
          pipelineFilterPattern: { includes: [], excludes: [] },
          lineageInformation: {
            dbServiceNames: [],
            storageServiceNames: [],
            messagingServiceNames: [],
            apiServiceNames: [],
            searchServiceNames: [],
          },
          overrideLineage: false,
          markDeletedPipelines: true,
          includeTags: true,
          includeUnDeployedPipelines: true,
          statusLookbackDays: 1,
          overrideMetadata: false,
        },
      ],
      [
        'TestSuite',
        'DATABASE_SERVICES',
        {
          type: 'TestSuite',
          serviceConnections: [],
          profileSampleConfig: {
            sampleConfigType: 'DYNAMIC',
            config: { smartSampling: true, thresholds: [] },
          },
          testCases: [],
        },
      ],
    ];
    for (const [pipelineType, serviceCategory, expected] of cases) {
      const schema = await getSchemaByWorkflowType(
        pipelineType as never,
        serviceCategory as never,
      );
      expect(applySchemaDefaults(schema, {})).toEqual(expected);
    }
  });

  it('selects oneOf branches by discriminator', async () => {
    const dbt = await getSchemaByWorkflowType('dbt', 'DATABASE_SERVICES');
    const local = selectBranch(
      dbt.properties!.dbtConfigSource!.oneOf!,
      { dbtConfigType: 'local' },
      dbt,
    );
    expect(local.properties?.dbtConfigType?.enum).toEqual(['local']);
    const profiler = await getSchemaByWorkflowType('profiler', 'DATABASE_SERVICES');
    const processingEngine = deref(profiler.properties!.processingEngine!, profiler);
    const spark = selectBranch(
      processingEngine.oneOf ?? [],
      { type: 'Spark' },
      profiler,
    );
    expect(spark.properties?.type?.enum).toEqual(['Spark']);
    expect(spark.required).toContain('remote');
  });

  it('resolves internal $refs including oneOf indices', async () => {
    const schema = await getSchemaByWorkflowType('TestSuite', 'DATABASE_SERVICES');
    expect(
      resolveRef(
        '#/properties/profileSampleConfig/properties/config/oneOf/1/properties/profileSampleType',
        schema,
      ).type,
    ).toBe('string');
    const database = await getSchemaByWorkflowType('metadata', 'DATABASE_SERVICES');
    expect(resolveRef('#/definitions/databaseMetadataConfigType', database).default).toBe(
      'DatabaseMetadata',
    );
  });

  it('drops empty filter patterns and keeps the rest (cleanWorkFlowData)', () => {
    expect(
      cleanWorkFlowData({
        type: 'DatabaseMetadata',
        includeViews: true,
        schemaFilterPattern: { includes: [], excludes: [] },
        tableFilterPattern: { includes: ['fact_*'], excludes: [] },
        databaseFilterPattern: { includes: [], excludes: ['tmp'] },
      }),
    ).toEqual({
      type: 'DatabaseMetadata',
      includeViews: true,
      tableFilterPattern: { includes: ['fact_*'], excludes: [] },
      databaseFilterPattern: { includes: [], excludes: ['tmp'] },
    });
  });

  it('drops unfilled newKey rows (formatAdditionalProperties)', () => {
    expect(
      formatAdditionalProperties({
        ownerConfig: {
          database: { newKey1: {}, sales_db: 'sales-team', newKey2: 'New Value' },
        },
        type: 'DatabaseMetadata',
      }),
    ).toEqual({
      ownerConfig: { database: { sales_db: 'sales-team' } },
      type: 'DatabaseMetadata',
    });
  });

  it('flags ownerConfig map rows with a name but no owner', () => {
    expect(
      validateOwnerConfigMaps({
        ownerConfig: {
          database: { sales_db: {}, analytics_db: 'team-a', newKey1: {} },
          databaseSchema: 'all-schemas-team',
          table: { orders: [] },
        },
      }),
    ).toEqual([
      ['ownerConfig', 'database'],
      ['ownerConfig', 'database', 'sales_db'],
      ['ownerConfig', 'table'],
      ['ownerConfig', 'table', 'orders'],
    ]);
    expect(
      validateOwnerConfigMaps({ ownerConfig: { database: 'team-a' } }),
    ).toEqual([]);
    expect(validateOwnerConfigMaps(undefined)).toEqual([]);
  });

  it('lists the schema filter-pattern fields', async () => {
    const schema = await getSchemaByWorkflowType('metadata', 'DATABASE_SERVICES');
    expect(getDefaultFilterPropertyFieldsFromSchema(schema)).toEqual([
      'schemaFilterPattern',
      'tableFilterPattern',
      'databaseFilterPattern',
      'storedProcedureFilterPattern',
    ]);
  });

  it('prefills create-time values from the service connection (schema fields only)', async () => {
    const schema = await getSchemaByWorkflowType('metadata', 'DATABASE_SERVICES');
    expect(
      getDefaultFilterPropertyValues({
        isEditMode: false,
        serviceData: {
          connection: {
            config: {
              includeViews: false,
              schemaFilterPattern: { includes: ['public'] },
              topicFilterPattern: { includes: ['orders'] },
            },
          },
        },
        schema,
      }),
    ).toEqual({ schemaFilterPattern: { includes: ['public'] } });
    expect(
      getDefaultFilterPropertyValues({ isEditMode: false, serviceData: null, schema }),
    ).toEqual({});
  });

  it('reads edit-time filter values back from the saved sourceConfig', async () => {
    const schema = await getSchemaByWorkflowType('metadata', 'DATABASE_SERVICES');
    // Official's edit branch returns the saved config filtered to
    // filter-pattern fields only (getFilteredSchema(..., false)) — the
    // form itself seeds from the whole saved config, so includeViews and
    // the other schema fields still read back there.
    expect(
      getDefaultFilterPropertyValues({
        isEditMode: true,
        ingestionData: {
          config: {
            type: 'DatabaseMetadata',
            includeViews: false,
            schemaFilterPattern: { includes: ['public'] },
            markDeletedTables: true,
          },
        },
        schema,
      }),
    ).toEqual({
      schemaFilterPattern: { includes: ['public'] },
    });
  });

  it('never emits rootProcessingEngine without a Spark agent field', () => {
    const custom = getWorkflowCustomProperties('profiler');
    expect(custom.displayName).toBeDefined();
    expect(custom.enableDebugLog).toBeDefined();
    expect(custom.rootProcessingEngine).toBeUndefined();
  });

  it('startCase splits camelCase and snake_case keys', () => {
    expect(startCase('dbtConfigSource')).toBe('Dbt Config Source');
    expect(startCase('include_views')).toBe('Include Views');
  });
});

describe('Q-3 layered branch selection (presentation/defaults only)', () => {
  it('selectBranch never picks a string branch for an object value', async () => {
    const schema = await getSchemaByWorkflowType('metadata', 'DATABASE_SERVICES');
    const ownerConfig = deref(schema.properties!.ownerConfig!, schema);
    const database = deref(ownerConfig.properties!.database!, schema);
    // ownerConfig.database is anyOf [string, map]: an object value must
    // select the map branch, not the first (string) branch.
    const branch = selectBranch(database.anyOf!, { sales: {} }, schema);
    expect(branch.type).toBe('object');
    expect(branch.additionalProperties).toBeDefined();
  });

  it('selectBranch picks the static arm for a static-shaped sample config', async () => {
    const schema = await getSchemaByWorkflowType('profiler', 'DATABASE_SERVICES');
    const config = schema.properties!.profileSampleConfig!.properties!.config!;
    // No sampleConfigType is passed: the generic selector must tell the
    // arms apart from the value's keys alone (the discriminator lives
    // on the parent, invisible here by design).
    const branch = selectBranch(
      config.oneOf!,
      { profileSample: 50, profileSampleType: 'ROWS' },
      schema,
    );
    expect(branch.title).toBe('StaticSamplingConfig');
  });

  it('selectBranch picks the dynamic arm for a dynamic-shaped sample config', async () => {
    const schema = await getSchemaByWorkflowType('profiler', 'DATABASE_SERVICES');
    const config = schema.properties!.profileSampleConfig!.properties!.config!;
    const branch = selectBranch(
      config.oneOf!,
      { smartSampling: false, thresholds: [] },
      schema,
    );
    expect(branch.title).toBe('DynamicSamplingConfig');
  });

  it('selectBranch falls back to the first branch for an empty or foreign-keyed value', async () => {
    const schema = await getSchemaByWorkflowType('profiler', 'DATABASE_SERVICES');
    const config = schema.properties!.profileSampleConfig!.properties!.config!;
    expect(selectBranch(config.oneOf!, {}, schema).title).toBe('DynamicSamplingConfig');
    expect(selectBranch(config.oneOf!, { unknownKey: 1 }, schema).title).toBe(
      'DynamicSamplingConfig',
    );
  });

  it('selectBranch prefers the branch covering the most carried keys, earliest on ties', () => {
    const schema: RjsfSchema = {
      type: 'object',
      properties: {
        choice: {
          oneOf: [
            {
              type: 'object',
              properties: { a: { type: 'string' }, b: { type: 'string' } },
              additionalProperties: false,
            },
            {
              type: 'object',
              properties: {
                b: { type: 'string' },
                c: { type: 'string' },
                d: { type: 'string' },
              },
              additionalProperties: false,
            },
          ],
        },
      },
    };
    const branches = schema.properties!.choice!.oneOf!;
    expect(selectBranch(branches, { c: 'x', d: 'y' }, schema).properties).toHaveProperty('d');
    expect(selectBranch(branches, { a: 'x', c: 'y' }, schema).properties).toHaveProperty('a');
    expect(selectBranch(branches, { b: 'x' }, schema).properties).toHaveProperty('a');
  });

  it('seeding a saved static sample config injects no dynamic fields', async () => {
    const schema = await getSchemaByWorkflowType('profiler', 'DATABASE_SERVICES');
    const seeded = applySchemaDefaults(schema, {
      profileSampleConfig: {
        sampleConfigType: 'STATIC',
        config: { profileSample: 50, profileSampleType: 'ROWS', samplingMethodType: 'SYSTEM' },
      },
    });
    expect(seeded.profileSampleConfig).toEqual({
      sampleConfigType: 'STATIC',
      config: { profileSample: 50, profileSampleType: 'ROWS', samplingMethodType: 'SYSTEM' },
    });
  });

  it('seeding a saved dynamic sample config injects no static fields', async () => {
    const schema = await getSchemaByWorkflowType('profiler', 'DATABASE_SERVICES');
    const seeded = applySchemaDefaults(schema, {
      profileSampleConfig: {
        sampleConfigType: 'DYNAMIC',
        config: {
          smartSampling: false,
          thresholds: [{ rowCountThreshold: 500, profileSample: 25 }],
        },
      },
    });
    const sampleConfig = seeded.profileSampleConfig as Record<string, unknown>;
    const config = sampleConfig.config as Record<string, unknown>;
    expect(sampleConfig.sampleConfigType).toBe('DYNAMIC');
    expect(config.smartSampling).toBe(false);
    expect(config).not.toHaveProperty('profileSample');
    expect(config).not.toHaveProperty('profileSampleType');
    expect(config).not.toHaveProperty('samplingMethodType');
    expect(config.thresholds).toMatchObject([{ rowCountThreshold: 500, profileSample: 25 }]);
  });

  it('neutralizeUnresolvableRefs returns clean schemas unchanged', async () => {
    const profiler = await getSchemaByWorkflowType('profiler', 'DATABASE_SERVICES');
    expect(neutralizeUnresolvableRefs(profiler)).toBe(profiler);
    const dbt = await getSchemaByWorkflowType('dbt', 'DATABASE_SERVICES');
    expect(neutralizeUnresolvableRefs(dbt)).toBe(dbt);
  });

  it('neutralizeUnresolvableRefs drops only the dangling TestSuite projectId branches', async () => {
    const schema = await getSchemaByWorkflowType('TestSuite', 'DATABASE_SERVICES');
    const result = neutralizeUnresolvableRefs(schema);
    expect(result).not.toBe(schema);
    // The input schema is never mutated: the original still carries the
    // dangling oneOf branches.
    const gcpConfig = schema.definitions!.serviceConnections!.properties!.serviceConnection!
      .oneOf![3]!.properties!.config!.oneOf![4]!.properties!.gcpConfig!;
    const originalProjectId = gcpConfig.definitions!.gcpADC!.properties!.projectId!;
    expect(originalProjectId.oneOf).toHaveLength(2);
    // The neutralized copy keeps the node's annotations but no
    // constraint: the projectId oneOf had no resolvable branch.
    const cleanedGcpConfig = result.definitions!.serviceConnections!.properties!
      .serviceConnection!.oneOf![3]!.properties!.config!.oneOf![4]!.properties!.gcpConfig!;
    const cleanedProjectId = cleanedGcpConfig.definitions!.gcpADC!.properties!.projectId!;
    expect(cleanedProjectId.oneOf).toBeUndefined();
    expect(cleanedProjectId.$ref).toBeUndefined();
    expect(cleanedProjectId.title).toBe('GCP Project ID');
    // Every $ref left in the copy resolves; the two dangling pointers
    // are gone.
    const refs: string[] = [];
    const collect = (node: unknown): void => {
      if (Array.isArray(node)) {
        node.forEach(collect);
        return;
      }
      if (node !== null && typeof node === 'object') {
        for (const [key, entry] of Object.entries(node as Record<string, unknown>)) {
          if (key === '$ref' && typeof entry === 'string') {
            refs.push(entry);
          }
          collect(entry);
        }
      }
    };
    collect(result);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(ref).not.toContain('/credentials/properties/gcpConfig/');
      expect(() => resolveRef(ref, result)).not.toThrow();
    }
    // A resolvable $ref elsewhere in the file survives untouched.
    const thresholdType = result.properties!.profileSampleConfig!.properties!.config!
      .oneOf![0]!.properties!.thresholds!.items!.properties!.profileSampleType!;
    expect(thresholdType.$ref).toBe(
      '#/properties/profileSampleConfig/properties/config/oneOf/1/properties/profileSampleType',
    );
  });
});
