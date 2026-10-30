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
import { buildServiceConnection, formValuesFromService, redactConnectionForDisplay } from './connections';
import type { CatalogService, ServiceFormValues } from '@/types/ingestion';

function postgresForm(overrides: Partial<ServiceFormValues> = {}): ServiceFormValues {
  return {
    name: 'warehouse',
    kind: 'database',
    serviceType: 'Postgres',
    hostPort: 'localhost:5432',
    username: 'analyst',
    database: 'analytics',
    password: '',
    storeConnectionSecrets: false,
    ...overrides,
  };
}

describe('service connections', () => {
  it('builds the Postgres subset Phase 6 writes (no password by default)', () => {
    expect(buildServiceConnection(postgresForm())).toEqual({
      config: {
        type: 'Postgres',
        hostPort: 'localhost:5432',
        username: 'analyst',
        database: 'analytics',
      },
    });
  });

  it('stores ${ENV} placeholders without enabling storeConnectionSecrets', () => {
    const connection = buildServiceConnection(postgresForm({ password: '${PG_PASSWORD}' }));
    expect(connection?.config?.authType).toEqual({ password: '${PG_PASSWORD}' });
  });

  it('does not persist a typed literal password unless storeConnectionSecrets is on', () => {
    const connection = buildServiceConnection(postgresForm({ password: 'hunter2' }));
    expect(connection?.config?.authType).toBeUndefined();
  });

  it('keeps a masked password on edit so the server can unmask', () => {
    const connection = buildServiceConnection(postgresForm(), {
      config: { type: 'Postgres', authType: { password: '********' } },
    });
    expect(connection?.config?.authType).toEqual({ password: '********' });
  });

  it('builds Snowflake and Kafka catalog subsets', () => {
    expect(
      buildServiceConnection({
        name: 'wh',
        kind: 'database',
        serviceType: 'Snowflake',
        username: 'svc',
        account: 'xy12345',
        warehouse: 'COMPUTE_WH',
        database: 'ANALYTICS',
      }),
    ).toEqual({
      config: {
        type: 'Snowflake',
        username: 'svc',
        account: 'xy12345',
        warehouse: 'COMPUTE_WH',
        database: 'ANALYTICS',
      },
    });
    expect(
      buildServiceConnection({
        name: 'events',
        kind: 'messaging',
        serviceType: 'Kafka',
        bootstrapServers: 'localhost:9092',
        schemaRegistryURL: 'http://localhost:8081',
      }),
    ).toEqual({
      config: {
        type: 'Kafka',
        bootstrapServers: 'localhost:9092',
        schemaRegistryURL: 'http://localhost:8081',
      },
    });
  });

  it('clears password when hydrating a form from a stored service', () => {
    const service: CatalogService = {
      id: 's1',
      name: 'warehouse',
      kind: 'database',
      serviceType: 'Postgres',
      connection: { config: { type: 'Postgres', hostPort: 'db:5432', authType: { password: '********' } } },
    };
    expect(formValuesFromService(service).password).toBe('');
    expect(formValuesFromService(service).hostPort).toBe('db:5432');
  });

  it('redacts secrets for display JSON', () => {
    const redacted = redactConnectionForDisplay({
      config: { type: 'Postgres', authType: { password: 'hunter2' }, password: 'also' },
    });
    expect(redacted?.config?.authType).toEqual({ password: '********' });
    expect(redacted?.config?.password).toBe('********');
  });

  it('builds Databricks PAT and Unity Catalog connection subsets', () => {
    expect(
      buildServiceConnection({
        name: 'lake',
        kind: 'database',
        serviceType: 'Databricks',
        hostPort: 'adb-xxxx.azuredatabricks.net',
        httpPath: '/sql/1.0/warehouses/abc',
        catalog: 'main',
        authMode: 'pat',
        password: '${DATABRICKS_TOKEN}',
      }),
    ).toEqual({
      config: {
        type: 'Databricks',
        hostPort: 'adb-xxxx.azuredatabricks.net',
        httpPath: '/sql/1.0/warehouses/abc',
        catalog: 'main',
        authType: { token: '${DATABRICKS_TOKEN}' },
      },
    });
    expect(
      buildServiceConnection({
        name: 'uc',
        kind: 'database',
        serviceType: 'UnityCatalog',
        hostPort: 'dbc.example.com',
        catalog: 'main',
        includeMetricViews: true,
        authMode: 'pat',
        password: 'dapi-secret',
        storeConnectionSecrets: true,
      }),
    ).toEqual({
      config: {
        type: 'UnityCatalog',
        hostPort: 'dbc.example.com',
        catalog: 'main',
        includeMetricViews: true,
        authType: { token: 'dapi-secret' },
      },
    });
  });

  it('redacts Databricks token for display JSON', () => {
    const redacted = redactConnectionForDisplay({
      config: { type: 'Databricks', authType: { token: 'dapi-secret' } },
    });
    expect(redacted?.config?.authType).toEqual({ token: '********' });
  });

});
