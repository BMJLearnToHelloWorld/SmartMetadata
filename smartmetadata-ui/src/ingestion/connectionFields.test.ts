/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import {
  CONNECTION_FIELD_GROUPS,
  connectionFieldsForType,
  isConnectionFieldVisible,
  type ConnectionFieldGroup,
} from './connectionFields';

describe('connectionFields', () => {
  it('returns the Postgres field set in table order with shared trailing fields', () => {
    const keys = connectionFieldsForType('Postgres').map((field) => field.key);
    expect(keys).toEqual(['hostPort', 'username', 'database', 'password', 'storeConnectionSecrets']);
  });

  it('returns an empty table for an unknown service type instead of inventing fields', () => {
    expect(connectionFieldsForType('Oracle')).toEqual([]);
  });

  it('covers every supported service type with at least one field', () => {
    const types = new Set(CONNECTION_FIELD_GROUPS.flatMap((group) => group.types));
    expect(types.size).toBe(18);
    for (const type of types) {
      expect(connectionFieldsForType(type).length).toBeGreaterThan(0);
    }
  });

  it('lets a new service type be added by touching only the data table', () => {
    const synthetic: ConnectionFieldGroup = {
      types: ['SyntheticDb'],
      fields: [
        { key: 'hostPort', control: 'text', labelKey: 'connection.hostPort', testId: 'service-host-port' },
      ],
    };
    const table = [...CONNECTION_FIELD_GROUPS, synthetic];
    const found = table.find((group) => group.types.includes('SyntheticDb'));
    expect(found?.fields.map((field) => field.key)).toEqual(['hostPort']);
    expect(connectionFieldsForType('SyntheticDb')).toEqual([]);
  });

  it('evaluates showWhen with defaults and negation', () => {
    const driver = connectionFieldsForType('Mssql').find((field) => field.key === 'driver');
    expect(driver).toBeDefined();
    expect(isConnectionFieldVisible(driver!, { scheme: 'mssql+pyodbc' })).toBe(true);
    expect(isConnectionFieldVisible(driver!, { scheme: 'mssql+pytds' })).toBe(false);
    const token = connectionFieldsForType('Databricks').find((field) => field.key === 'password');
    expect(token).toBeDefined();
    expect(isConnectionFieldVisible(token!, {})).toBe(true);
    expect(isConnectionFieldVisible(token!, { authMode: 'oauth' })).toBe(false);
    const authString = connectionFieldsForType('Prefect').find((field) => field.key === 'prefectAuthString');
    expect(authString).toBeDefined();
    expect(isConnectionFieldVisible(authString!, { prefectAuthMode: 'server' })).toBe(true);
    expect(isConnectionFieldVisible(authString!, { prefectAuthMode: 'cloud' })).toBe(false);
  });

  it('keeps Redshift and Greenplum on different default ports via the table', () => {
    const redshift = connectionFieldsForType('Redshift').find((field) => field.key === 'hostPort');
    const greenplum = connectionFieldsForType('Greenplum').find((field) => field.key === 'hostPort');
    expect(redshift?.placeholderByType).toMatchObject({ Redshift: 'localhost:5439', '*': 'localhost:5432' });
    expect(greenplum?.placeholderByType).toBe(redshift?.placeholderByType);
  });
});
