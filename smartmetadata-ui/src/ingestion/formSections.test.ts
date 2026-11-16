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
  getConnectionFieldSection,
  getMissingRequiredFieldsCount,
  groupConnectionSections,
  groupIngestionSections,
  isWideConnectionProperty,
  isWideIngestionProperty,
  orderIngestionWorkflowFields,
  type GroupableField,
} from './formSections';

function field(name: string, schema: Record<string, unknown> = {}, hidden = false): GroupableField {
  return { name, schema, hidden };
}

/** MySQL connection schema, visible subset in schema order (pin mysqlConnection.json). */
function mysqlFields(): GroupableField[] {
  return [
    field('type', { type: 'string' }, true),
    field('scheme', { type: 'string', enum: ['mysql+pymysql'] }),
    field('username', { type: 'string' }),
    field('authType', { oneOf: [{}, {}, {}, {}] }),
    field('hostPort', { type: 'string' }),
    field('databaseName', { type: 'string' }),
    field('databaseSchema', { type: 'string' }),
    field('sslConfig', { oneOf: [{}] }),
    field('connectionOptions', { type: 'object' }),
    field('connectionArguments', { type: 'object' }),
    field('supportsMetadataExtraction', { type: 'boolean' }, true),
    field('useSlowLogs', { type: 'boolean' }),
    field('queryHistoryTable', { type: 'string' }),
  ];
}

describe('groupConnectionSections (pin ConnectionObjectFieldTemplate)', () => {
  it('groups MySQL fields into pin sections in pin order', () => {
    const { sections } = groupConnectionSections(mysqlFields(), ['hostPort', 'username'], {
      hostPort: 'localhost:3306',
      username: 'root',
    });
    expect(sections.map((section) => section.key)).toEqual([
      'connection',
      'authentication',
      'scope',
      'advanced',
    ]);
    const byKey = new Map(sections.map((section) => [section.key, section]));
    expect(byKey.get('connection')?.fields).toEqual(['username', 'hostPort']);
    expect(byKey.get('authentication')?.fields).toEqual(['authType']);
    expect(byKey.get('scope')?.fields).toEqual([
      'databaseName',
      'databaseSchema',
      'queryHistoryTable',
      'useSlowLogs',
    ]);
    expect(byKey.get('advanced')?.fields).toEqual([
      'scheme',
      'sslConfig',
      'connectionOptions',
      'connectionArguments',
    ]);
  });

  it('marks scope and advanced collapsible-closed, connection/auth open, advanced unnumbered', () => {
    const { sections } = groupConnectionSections(mysqlFields(), ['hostPort', 'username'], {});
    const byKey = new Map(sections.map((section) => [section.key, section]));
    expect(byKey.get('connection')).toMatchObject({
      collapsible: false,
      defaultOpen: true,
      index: 1,
      layout: 'grid',
    });
    expect(byKey.get('authentication')).toMatchObject({
      collapsible: false,
      defaultOpen: true,
      index: 2,
      layout: 'stack',
    });
    expect(byKey.get('scope')).toMatchObject({
      collapsible: true,
      defaultOpen: false,
      index: 3,
    });
    expect(byKey.get('advanced')).toMatchObject({
      collapsible: true,
      defaultOpen: false,
      inlineBooleans: true,
    });
    expect(byKey.get('advanced')?.index).toBeUndefined();
  });

  it('shows a required-count badge while required fields are missing, Optional once filled', () => {
    const missing = groupConnectionSections(mysqlFields(), ['hostPort', 'username'], {
      hostPort: 'localhost:3306',
    });
    expect(missing.missingCounts).toEqual({ connection: 1, auth: 0 });
    expect(
      missing.sections.find((section) => section.key === 'connection')?.badge,
    ).toEqual({ kind: 'required', count: 1 });
    expect(
      missing.sections.find((section) => section.key === 'authentication')?.badge,
    ).toEqual({ kind: 'optional' });
    const filled = groupConnectionSections(mysqlFields(), ['hostPort', 'username'], {
      hostPort: 'localhost:3306',
      username: 'root',
    });
    expect(
      filled.sections.find((section) => section.key === 'connection')?.badge,
    ).toEqual({ kind: 'optional' });
  });

  it('counts a present authType object against the auth badge', () => {
    const { missingCounts } = groupConnectionSections(
      mysqlFields(),
      ['hostPort', 'username'],
      { hostPort: 'h:1', username: 'u', authType: { password: 'secret' } },
    );
    expect(missingCounts.auth).toBe(0);
  });

  it('falls back to every non-scope field as connection when no required connection field exists', () => {
    const fields = [
      field('hostPort', { type: 'string' }),
      field('databaseName', { type: 'string' }),
      field('customField', { type: 'string' }),
    ];
    const { sections } = groupConnectionSections(fields, [], {});
    const byKey = new Map(sections.map((section) => [section.key, section]));
    expect(byKey.get('connection')?.fields).toEqual(['hostPort', 'customField']);
    expect(byKey.get('scope')?.fields).toEqual(['databaseName']);
  });

  it('omits sections with no visible field and returns hidden scope fields separately', () => {
    const fields = [
      field('hostPort', { type: 'string' }),
      field('databaseName', { type: 'string' }, true),
    ];
    const { sections, hiddenUnsectioned } = groupConnectionSections(fields, ['hostPort'], {});
    expect(sections.map((section) => section.key)).toEqual(['connection']);
    expect(hiddenUnsectioned).toEqual(['databaseName']);
  });

  it('classifies flat password fields as authentication', () => {
    const fields = [
      field('hostPort', { type: 'string' }),
      field('password', { type: 'string', format: 'password' }),
    ];
    const { sections } = groupConnectionSections(fields, ['hostPort'], {});
    expect(sections.find((section) => section.key === 'authentication')?.fields).toEqual([
      'password',
    ]);
  });

  it('marks object/array/combiner shapes wide', () => {
    expect(isWideConnectionProperty({ type: 'object' })).toBe(true);
    expect(isWideConnectionProperty({ oneOf: [{}] })).toBe(true);
    expect(isWideConnectionProperty({ type: 'string' })).toBe(false);
    expect(isWideIngestionProperty({ uiFieldType: 'code' })).toBe(true);
    expect(isWideIngestionProperty({ oneOf: [{ type: 'null' }, { type: 'object' }] })).toBe(true);
    expect(isWideIngestionProperty({ oneOf: [{ type: 'null' }, { type: 'string' }] })).toBe(false);
  });
});

describe('getMissingRequiredFieldsCount (pin ServiceConnectionUtils)', () => {
  it('counts blank strings, nil and empty arrays as missing; filled objects recurse', () => {
    const schema = {
      properties: {
        a: { type: 'string' },
        b: { type: 'string' },
        c: { type: 'object', properties: { d: { type: 'string' } }, required: ['d'] },
      },
      required: ['a', 'b', 'c'],
    };
    expect(getMissingRequiredFieldsCount(schema, { a: '  ', b: 'x', c: {} })).toBe(2);
    expect(getMissingRequiredFieldsCount(schema, { a: 'x', b: 'y', c: { d: 'z' } })).toBe(0);
  });

  it('picks the oneOf branch covering the data keys, else the minimum', () => {
    const schema = {
      oneOf: [
        { properties: { password: {} }, required: ['password'] },
        { properties: { privateKey: {}, passphrase: {} }, required: ['privateKey'] },
      ],
    };
    expect(getMissingRequiredFieldsCount(schema, { privateKey: 'k' })).toBe(0);
    expect(getMissingRequiredFieldsCount(schema, {})).toBe(1);
  });
});

describe('getConnectionFieldSection', () => {
  const props = {
    hostPort: { type: 'string' },
    username: { type: 'string' },
    authType: { oneOf: [{}] },
    databaseName: { type: 'string' },
    scheme: { type: 'string' },
    password: { type: 'string', format: 'password' },
  };
  it('mirrors the grouping for a field id, including nested paths', () => {
    expect(getConnectionFieldSection(props, ['hostPort', 'username'], 'root/hostPort')).toBe(
      'connection',
    );
    expect(getConnectionFieldSection(props, ['hostPort', 'username'], 'root/authType/password')).toBe(
      'authentication',
    );
    expect(getConnectionFieldSection(props, ['hostPort', 'username'], 'root/databaseName')).toBe(
      'scope',
    );
    expect(getConnectionFieldSection(props, ['hostPort', 'username'], 'root/scheme')).toBe('advanced');
    expect(getConnectionFieldSection(props, ['hostPort', 'username'], 'root/password')).toBe(
      'authentication',
    );
    expect(getConnectionFieldSection(props, ['hostPort', 'username'], 'root')).toBe('connection');
  });
});

describe('orderIngestionWorkflowFields (pin INGESTION_WORKFLOW_UI_SCHEMA)', () => {
  it('puts filter patterns in enum order, then enableDebugLog, then the rest', () => {
    expect(
      orderIngestionWorkflowFields([
        'threads',
        'tableFilterPattern',
        'enableDebugLog',
        'databaseFilterPattern',
        'name',
        'markDeletedTables',
      ]),
    ).toEqual([
      'name',
      'databaseFilterPattern',
      'tableFilterPattern',
      'enableDebugLog',
      'threads',
      'markDeletedTables',
    ]);
  });
});

describe('groupIngestionSections (pin IngestionObjectFieldTemplate)', () => {
  it('groups a metadata pipeline with ADVANCED > FILTER > CONFIG > primary precedence', () => {
    const fields = orderIngestionWorkflowFields([
      'type',
      'name',
      'displayName',
      'tableFilterPattern',
      'databaseFilterPattern',
      'markDeletedTables',
      'includeViews',
      'includeTables',
      'ownerConfig',
      'threads',
      'useFqnForFiltering',
      'enableDebugLog',
      'incremental',
    ]).map((name) =>
      field(
        name,
        name === 'ownerConfig' || name.endsWith('FilterPattern')
          ? { type: 'object' }
          : name === 'threads'
            ? { type: 'integer' }
            : { type: 'boolean' },
        ['type', 'name', 'displayName'].includes(name),
      ),
    );
    const { sections } = groupIngestionSections(fields);
    const byKey = new Map(sections.map((section) => [section.key, section]));
    expect(sections.map((section) => section.key)).toEqual([
      'essential',
      'filters',
      'scope',
      'advanced',
    ]);
    expect(byKey.get('essential')?.fields).toEqual([
      'ownerConfig',
      'threads',
      'incremental',
    ]);
    expect(byKey.get('filters')?.fields).toEqual([
      'databaseFilterPattern',
      'tableFilterPattern',
      'useFqnForFiltering',
    ]);
    expect(byKey.get('scope')?.fields).toEqual([
      'enableDebugLog',
      'markDeletedTables',
      'includeTables',
    ]);
    // includeViews is in BOTH the advanced and config sets; advanced wins.
    expect(byKey.get('advanced')?.fields).toEqual(['includeViews']);
    expect(byKey.get('essential')).toMatchObject({
      collapsible: false,
      defaultOpen: true,
      index: 1,
    });
    expect(byKey.get('filters')).toMatchObject({
      collapsible: true,
      defaultOpen: false,
      index: 2,
    });
    expect(byKey.get('advanced')).toMatchObject({ badge: null });
    expect(byKey.get('advanced')?.index).toBeUndefined();
  });

  it('omits empty sections and renumbers the survivors', () => {
    const { sections } = groupIngestionSections([field('threads', { type: 'integer' })]);
    expect(sections.map((section) => section.key)).toEqual(['essential']);
    expect(sections[0]?.index).toBe(1);
  });

  it('marks the advanced section compact only when asked', () => {
    const fields = [field('includeViews', { type: 'boolean' })];
    expect(groupIngestionSections(fields).sections[0]?.compact).toBe(false);
    expect(
      groupIngestionSections(fields, { compactAdvanced: true }).sections[0]?.compact,
    ).toBe(true);
  });
});
