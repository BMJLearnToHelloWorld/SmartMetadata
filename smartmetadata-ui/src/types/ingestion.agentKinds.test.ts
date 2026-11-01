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
  AGENT_KINDS_BY_SERVICE,
  PIPELINE_TYPES,
  agentKindsForService,
} from './ingestion';

describe('AGENT_KINDS_BY_SERVICE (OM service_spec mapping)', () => {
  it('exposes the OM PipelineType enum surface used by Agents UX', () => {
    expect(PIPELINE_TYPES).toEqual(['metadata', 'usage', 'lineage', 'profiler', 'TestSuite']);
  });

  it('gives DefaultDB services metadata+lineage+usage+profiler+TestSuite where OM declares usage', () => {
    expect(agentKindsForService('Postgres')).toEqual([
      'metadata',
      'lineage',
      'usage',
      'profiler',
      'TestSuite',
    ]);
    expect(agentKindsForService('Mysql')).toEqual(AGENT_KINDS_BY_SERVICE.Mysql);
    expect(agentKindsForService('Snowflake')).toEqual([
      'metadata',
      'lineage',
      'usage',
      'profiler',
      'TestSuite',
    ]);
  });

  it('keeps messaging/dashboard/storage metadata-only (no invent)', () => {
    expect(agentKindsForService('Kafka')).toEqual(['metadata']);
    expect(agentKindsForService('Redpanda')).toEqual(['metadata']);
    expect(agentKindsForService('S3')).toEqual(['metadata']);
    expect(agentKindsForService('Superset')).toEqual(['metadata']);
  });

  it('omits usage for MariaDB/Doris/Greenplum when OM service_spec has no usage_source_class', () => {
    expect(agentKindsForService('MariaDB')).toEqual([
      'metadata',
      'lineage',
      'profiler',
      'TestSuite',
    ]);
    expect(agentKindsForService('Doris')).not.toContain('usage');
    expect(agentKindsForService('Greenplum')).not.toContain('usage');
  });

  it('falls back to metadata for unknown serviceType', () => {
    expect(agentKindsForService('BigQuery')).toEqual(['metadata']);
  });
});
