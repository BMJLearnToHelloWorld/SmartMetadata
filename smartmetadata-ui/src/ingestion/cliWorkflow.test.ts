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
    expect(cliSourceType('Snowflake')).toBe('snowflake');
    expect(cliSourceType('Kafka')).toBe('kafka');
    expect(cliSourceType('Redshift')).toBeUndefined();
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
