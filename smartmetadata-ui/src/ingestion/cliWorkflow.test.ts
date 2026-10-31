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
import { buildCliWorkflowYaml, cliSourceType } from './cliWorkflow';
import type { CatalogService, IngestionPipeline } from '@/types/ingestion';

describe('CLI workflow export', () => {
  it('maps catalog service types to smartmetadata-ingest source.type', () => {
    expect(cliSourceType('Postgres')).toBe('postgres');
    expect(cliSourceType('Mysql')).toBe('mysql');
  expect(cliSourceType('Doris')).toBe('doris');
  expect(cliSourceType('Mssql')).toBe('mssql');
    expect(cliSourceType('Redshift')).toBe('redshift');
    expect(cliSourceType('MariaDB')).toBe('mariadb');
    expect(cliSourceType('Greenplum')).toBe('greenplum');
    expect(cliSourceType('Timescale')).toBe('timescale');
    expect(cliSourceType('Snowflake')).toBe('snowflake');
    expect(cliSourceType('Kafka')).toBe('kafka');
    expect(cliSourceType('Redpanda')).toBe('redpanda');
  expect(cliSourceType('Superset')).toBe('superset');
  expect(cliSourceType('Metabase')).toBe('metabase');
  expect(cliSourceType('S3')).toBe('s3');
    expect(cliSourceType('BigQuery')).toBeUndefined();
  });

  it('emits YAML that names the CLI and never dumps a stored password', () => {
    const pipeline: IngestionPipeline = {
      id: 'p1',
      name: 'warehouse-metadata',
      fullyQualifiedName: 'warehouse.warehouse-metadata',
      pipelineType: 'metadata',
      sourceConfig: { config: { type: 'DatabaseMetadata', includeViews: true } },
    };
    const service: CatalogService = {
      id: 's1',
      name: 'warehouse',
      kind: 'database',
      serviceType: 'Postgres',
      connection: {
        config: {
          type: 'Postgres',
          hostPort: 'localhost:5432',
          username: 'analyst',
          database: 'analytics',
          authType: { password: '********' },
        },
      },
    };
    const yaml = buildCliWorkflowYaml(pipeline, service);
    expect(yaml).toContain('smartmetadata-ingest run --config');
    expect(yaml).toContain('source:\n  type: postgres\n  serviceName: warehouse');
    expect(yaml).toContain('password: "${PG_PASSWORD}"');
    expect(yaml).not.toContain('********');
    expect(yaml).toContain('storeConnectionSecrets: false');
  });
});
