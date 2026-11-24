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
import type { ColumnGridItem } from '@/api/columns';
import {
  buildColumnGridRows,
  buildColumnUpdates,
  buildOccurrencePath,
  columnEntityLocation,
  columnLinkTabForEntityType,
  entityLinkLabel,
  expandSelectionToOccurrences,
} from './columnGridRows';

const MULTI_ITEM: ColumnGridItem = {
  columnName: 'email',
  hasVariations: true,
  metadataStatus: 'INCOMPLETE',
  groups: [
    {
      groupId: 'g1',
      displayName: 'Email',
      description: 'Contact email',
      dataType: 'VARCHAR',
      occurrenceCount: 2,
      occurrences: [
        {
          columnFQN: 'svc.db.schema.users.email',
          serviceName: 'svc',
          databaseName: 'db',
          schemaName: 'schema',
          entityFQN: 'svc.db.schema.users',
          entityType: 'table',
          entityDisplayName: 'users',
        },
        {
          columnFQN: 'svc.db.schema.customers.email',
          serviceName: 'svc',
          databaseName: 'db',
          schemaName: 'schema',
          entityFQN: 'svc.db.schema.customers',
          entityType: 'table',
        },
      ],
      tags: [{ tagFQN: 'PII.Email', source: 'Tag' }],
    },
    {
      groupId: 'g2',
      displayName: 'Email Address',
      dataType: 'VARCHAR',
      occurrenceCount: 1,
      occurrences: [
        {
          columnFQN: 'svc.db.schema.orders.email',
          serviceName: 'svc',
          databaseName: 'db',
          schemaName: 'schema',
          entityFQN: 'svc.db.schema.orders',
          entityType: 'table',
        },
      ],
      tags: [],
    },
  ],
};

const SINGLE_ITEM: ColumnGridItem = {
  columnName: 'id',
  hasVariations: false,
  groups: [
    {
      groupId: 'g1',
      displayName: 'Id',
      description: 'Row id',
      dataType: 'INT',
      occurrenceCount: 1,
      occurrences: [
        {
          columnFQN: 'svc.db.schema.users.id',
          serviceName: 'svc',
          databaseName: 'db',
          schemaName: 'schema',
          entityFQN: 'svc.db.schema.users',
          entityType: 'table',
        },
      ],
      tags: [{ tagFQN: 'PII.Id', source: 'Tag' }],
    },
  ],
};

describe('buildColumnGridRows', () => {
  it('renders a single-occurrence column as one flat row', () => {
    const rows = buildColumnGridRows([SINGLE_ITEM]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('id');
    expect(rows[0].kind).toBe('occurrence');
    expect(rows[0].path).toBe('svc / db / schema');
    expect(rows[0].occurrence?.columnFQN).toBe('svc.db.schema.users.id');
  });

  it('renders a parent group row plus one child per occurrence', () => {
    const rows = buildColumnGridRows([MULTI_ITEM]);
    const parent = rows[0];
    expect(parent.kind).toBe('group');
    expect(parent.id).toBe('email');
    expect(parent.occurrenceCount).toBe(3);
    expect(parent.coverageCovered).toBe(2);
    expect(parent.coverageTotal).toBe(3);
    expect(parent.childrenIds).toHaveLength(3);
    const children = rows.slice(1);
    expect(children.every((row) => row.kind === 'occurrence')).toBe(true);
    expect(children.every((row) => row.parentId === 'email')).toBe(true);
    expect(children[0].id).toBe('email-svc.db.schema.users.email');
    expect(children[0].displayName).toBe('Email');
    expect(children[2].displayName).toBe('Email Address');
    expect(children[2].group?.groupId).toBe('g2');
  });

  it('aggregates group tags on the parent row without duplicates', () => {
    const rows = buildColumnGridRows([MULTI_ITEM]);
    expect(rows[0].tags).toEqual([{ tagFQN: 'PII.Email', source: 'Tag' }]);
  });
});

describe('buildOccurrencePath', () => {
  it('skips missing path parts', () => {
    expect(
      buildOccurrencePath({
        columnFQN: 'x.y',
        entityFQN: 'x',
        entityType: 'table',
        serviceName: 'svc',
      }),
    ).toBe('svc');
  });
});

describe('expandSelectionToOccurrences', () => {
  it('expands a group id to its occurrence rows and dedups overlaps', () => {
    const rows = buildColumnGridRows([MULTI_ITEM]);
    const selected = expandSelectionToOccurrences(
      rows,
      new Set(['email', 'email-svc.db.schema.users.email']),
    );
    expect(selected.map((row) => row.id)).toEqual([
      'email-svc.db.schema.users.email',
      'email-svc.db.schema.customers.email',
      'email-svc.db.schema.orders.email',
    ]);
  });
});

describe('buildColumnUpdates', () => {
  it('carries only changed fields, split into tags and glossary terms', () => {
    const rows = buildColumnGridRows([MULTI_ITEM]);
    rows[1].edited = {
      displayName: 'Email Address',
      description: 'New description',
      tags: [
        { tagFQN: 'PII.Email', source: 'Tag' },
        { tagFQN: 'Glossary.Email', source: 'Glossary' },
      ],
    };
    const updates = buildColumnUpdates(rows, new Set([rows[1].id]));
    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual({
      columnFQN: 'svc.db.schema.users.email',
      entityType: 'table',
      displayName: 'Email Address',
      description: 'New description',
      tags: ['PII.Email'],
      glossaryTerms: ['Glossary.Email'],
    });
  });

  it('skips rows whose staged display name equals the current value', () => {
    const rows = buildColumnGridRows([MULTI_ITEM]);
    rows[1].edited = { displayName: 'Email' };
    expect(buildColumnUpdates(rows, new Set([rows[1].id]))).toEqual([]);
  });

  it('skips unedited selected rows', () => {
    const rows = buildColumnGridRows([MULTI_ITEM]);
    expect(buildColumnUpdates(rows, new Set([rows[1].id]))).toEqual([]);
  });
});

describe('column links', () => {
  it('maps entity types to pin detail tabs', () => {
    expect(columnLinkTabForEntityType('table')).toBe('schema');
    expect(columnLinkTabForEntityType('dashboardDataModel')).toBe('model');
    expect(columnLinkTabForEntityType('topic')).toBe('schema');
    expect(columnLinkTabForEntityType('searchIndex')).toBe('fields');
    expect(columnLinkTabForEntityType('unknown')).toBe('schema');
  });

  it('builds the asset location with tab and column hash', () => {
    const occurrence = MULTI_ITEM.groups[0].occurrences[0];
    expect(columnEntityLocation(occurrence)).toEqual({
      name: 'asset',
      params: { entityType: 'table', fqn: 'svc.db.schema.users' },
      query: { tab: 'schema' },
      hash: '#email',
    });
  });

  it('falls back to the FQN last segment for the entity label', () => {
    expect(entityLinkLabel(MULTI_ITEM.groups[0].occurrences[1])).toBe('customers');
    expect(entityLinkLabel(MULTI_ITEM.groups[0].occurrences[0])).toBe('users');
  });
});
