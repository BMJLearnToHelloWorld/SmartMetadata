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
import type { AssetDetail } from '@/types/api';
import { buildPreviewSchemaSections } from './previewSchema';

function detailWith(overrides: Partial<AssetDetail>): AssetDetail {
  return {
    entityType: 'table',
    name: 'orders',
    fullyQualifiedName: 'svc.db.schema.orders',
    owners: [],
    tags: [],
    domains: [],
    schemaRows: [],
    schemaLabel: 'Columns',
    ...overrides,
  };
}

describe('buildPreviewSchemaSections (pin getChildComponentDetails)', () => {
  it('table renders its columns as a paginated rows section', () => {
    const sections = buildPreviewSchemaSections(
      'table',
      detailWith({
        schemaRows: [
          { key: 'a', name: 'a', dataType: 'int', description: 'first' },
          { key: 'b', name: 'b', dataType: 'varchar(50)' },
        ],
      }),
    );
    expect(sections).toHaveLength(1);
    const [section] = sections;
    expect(section.kind).toBe('rows');
    expect(section.headingKey).toBe('asset.tabs.schema');
    if (section.kind === 'rows') {
      expect(section.pageSize).toBe(50);
      expect(section.rows.map((row) => row.name)).toEqual(['a', 'b']);
      expect(section.rows[0]?.dataType).toBe('int');
      expect(section.rows[0]?.description).toBe('first');
    }
  });

  it('dashboardDataModel and topic and container and searchIndex read schemaRows with pin headings', () => {
    const rows = [{ key: 'a', name: 'a', dataType: 'int' }];
    expect(
      buildPreviewSchemaSections('dashboardDataModel', detailWith({ entityType: 'dashboardDataModel', schemaRows: rows }))[0]?.headingKey,
    ).toBe('label.column-plural');
    expect(
      buildPreviewSchemaSections('topic', detailWith({ entityType: 'topic', schemaRows: rows }))[0]?.headingKey,
    ).toBe('asset.tabs.schema');
    expect(
      buildPreviewSchemaSections('container', detailWith({ entityType: 'container', schemaRows: rows }))[0]?.headingKey,
    ).toBe('asset.tabs.schema');
    expect(
      buildPreviewSchemaSections('searchIndex', detailWith({ entityType: 'searchIndex', schemaRows: rows }))[0]?.headingKey,
    ).toBe('asset.tabs.fields');
  });

  it('pipeline renders its tasks', () => {
    const sections = buildPreviewSchemaSections(
      'pipeline',
      detailWith({
        entityType: 'pipeline',
        tasks: [
          {
            name: 'extract',
            displayName: 'Extract',
            taskType: 'Airflow',
            description: 'pulls rows',
            downstreamTasks: [],
          },
        ],
      }),
    );
    expect(sections).toHaveLength(1);
    const [section] = sections;
    expect(section.kind).toBe('tasks');
    expect(section.headingKey).toBe('asset.tabs.tasks');
    if (section.kind === 'tasks') {
      expect(section.tasks).toEqual([
        { key: 'extract', name: 'Extract', dataType: 'Airflow', description: 'pulls rows' },
      ]);
    }
  });

  it('database renders its schemas as refs', () => {
    const sections = buildPreviewSchemaSections(
      'database',
      detailWith({
        entityType: 'database',
        children: [{ name: 'marts', displayName: 'Marts', type: 'databaseSchema', fullyQualifiedName: 'svc.analytics.marts' }],
      }),
    );
    expect(sections).toHaveLength(1);
    const [section] = sections;
    expect(section.kind).toBe('refs');
    if (section.kind === 'refs') {
      expect(section.refs).toEqual([
        { key: 'svc.analytics.marts', name: 'Marts', type: 'databaseSchema', fqn: 'svc.analytics.marts' },
      ]);
    }
  });

  it('dashboard renders charts then data models', () => {
    const sections = buildPreviewSchemaSections(
      'dashboard',
      detailWith({
        entityType: 'dashboard',
        charts: [{ name: 'c1', displayName: 'Chart 1', type: 'chart', fullyQualifiedName: 'svc.c1' }],
        dataModels: [{ name: 'm1', displayName: 'Model 1', type: 'dashboardDataModel', fullyQualifiedName: 'svc.m1' }],
      }),
    );
    expect(sections).toHaveLength(2);
    expect(sections[0]?.headingKey).toBe('label.chart-plural');
    expect(sections[1]?.headingKey).toBe('label.dashboard-data-model-plural');
  });

  it('apiEndpoint renders schema fields as rows when present, else raw JSON', () => {
    const withFields = buildPreviewSchemaSections(
      'apiEndpoint',
      detailWith({
        entityType: 'apiEndpoint',
        apiRequestSchema: {
          schemaFields: [{ name: 'id', dataType: 'string', description: 'row id' }],
        },
      }),
    );
    expect(withFields).toHaveLength(1);
    expect(withFields[0]?.kind).toBe('rows');
    expect(withFields[0]?.headingKey).toBe('asset.fields.apiRequestSchema');

    const raw = buildPreviewSchemaSections(
      'apiEndpoint',
      detailWith({
        entityType: 'apiEndpoint',
        apiResponseSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
      }),
    );
    expect(raw).toHaveLength(1);
    expect(raw[0]?.kind).toBe('json');
    if (raw[0]?.kind === 'json') {
      expect(raw[0].json).toContain('"type": "object"');
    }
  });

  it('apiCollection and databaseSchema render nothing (pin nullSummary)', () => {
    expect(buildPreviewSchemaSections('apiCollection', detailWith({ entityType: 'apiCollection' }))).toEqual([]);
    expect(buildPreviewSchemaSections('databaseSchema', detailWith({ entityType: 'databaseSchema' }))).toEqual([]);
  });

  it('returns nothing without a fetched detail', () => {
    expect(buildPreviewSchemaSections('table', null)).toEqual([]);
  });
});
