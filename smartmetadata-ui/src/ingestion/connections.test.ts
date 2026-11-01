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
    expect(
      buildServiceConnection({
        name: 'rp',
        kind: 'messaging',
        serviceType: 'Redpanda',
        bootstrapServers: 'localhost:9092',
        schemaRegistryURL: 'http://localhost:8081',
        securityProtocol: 'SASL_SSL',
      }),
    ).toEqual({
      config: {
        type: 'Redpanda',
        bootstrapServers: 'localhost:9092',
        schemaRegistryURL: 'http://localhost:8081',
        securityProtocol: 'SASL_SSL',
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

  it('builds Doris and Mssql connection subsets', () => {
    const doris = buildServiceConnection({
      name: 'd1',
      kind: 'database',
      serviceType: 'Doris',
      hostPort: 'localhost:9030',
      username: 'root',
      databaseName: 'default',
      databaseSchema: 'sales',
      password: '${DORIS_PASSWORD}',
      storeConnectionSecrets: true,
    });
    expect(doris?.config).toMatchObject({
      type: 'Doris',
      hostPort: 'localhost:9030',
      username: 'root',
      databaseName: 'default',
      databaseSchema: 'sales',
      scheme: 'doris',
      password: '${DORIS_PASSWORD}',
    });

    const mssql = buildServiceConnection({
      name: 'm1',
      kind: 'database',
      serviceType: 'Mssql',
      hostPort: 'localhost:1433',
      username: 'sa',
      database: 'AdventureWorks',
      scheme: 'mssql+pytds',
      ingestAllDatabases: true,
      includeSynonyms: true,
      encrypt: false,
      trustServerCertificate: true,
      password: '${MSSQL_PASSWORD}',
      storeConnectionSecrets: true,
    });
    expect(mssql?.config).toMatchObject({
      type: 'Mssql',
      hostPort: 'localhost:1433',
      username: 'sa',
      database: 'AdventureWorks',
      scheme: 'mssql+pytds',
      ingestAllDatabases: true,
      includeSynonyms: true,
      encrypt: false,
      trustServerCertificate: true,
      password: '${MSSQL_PASSWORD}',
    });
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


  it('builds Redshift MariaDB Greenplum Timescale connection subsets', () => {
    expect(
      buildServiceConnection({
        name: 'r1',
        kind: 'database',
        serviceType: 'Redshift',
        hostPort: 'localhost:5439',
        username: 'awsuser',
        database: 'dev',
        ingestAllDatabases: true,
        password: '${REDSHIFT_PASSWORD}',
        storeConnectionSecrets: true,
      })?.config,
    ).toMatchObject({
      type: 'Redshift',
      hostPort: 'localhost:5439',
      username: 'awsuser',
      database: 'dev',
      scheme: 'redshift+psycopg2',
      ingestAllDatabases: true,
      authType: { password: '${REDSHIFT_PASSWORD}' },
    });
    expect(
      buildServiceConnection({
        name: 'm1',
        kind: 'database',
        serviceType: 'MariaDB',
        hostPort: 'localhost:3306',
        username: 'root',
        databaseName: 'default',
        password: '${MARIADB_PASSWORD}',
        storeConnectionSecrets: true,
      })?.config,
    ).toMatchObject({
      type: 'MariaDB',
      hostPort: 'localhost:3306',
      username: 'root',
      databaseName: 'default',
      scheme: 'mysql+pymysql',
      password: '${MARIADB_PASSWORD}',
    });
    expect(
      buildServiceConnection({
        name: 'g1',
        kind: 'database',
        serviceType: 'Greenplum',
        hostPort: 'localhost:5432',
        username: 'gpadmin',
        database: 'gpdb',
        password: '${GREENPLUM_PASSWORD}',
        storeConnectionSecrets: true,
      })?.config,
    ).toMatchObject({
      type: 'Greenplum',
      scheme: 'postgresql+psycopg2',
      database: 'gpdb',
      authType: { password: '${GREENPLUM_PASSWORD}' },
    });
    expect(
      buildServiceConnection({
        name: 't1',
        kind: 'database',
        serviceType: 'Timescale',
        hostPort: 'localhost:5432',
        username: 'tsdb',
        database: 'ts',
        password: '${TIMESCALE_PASSWORD}',
        storeConnectionSecrets: true,
      })?.config,
    ).toMatchObject({
      type: 'Timescale',
      scheme: 'postgresql+psycopg2',
      database: 'ts',
      authType: { password: '${TIMESCALE_PASSWORD}' },
    });
  });

});

it('builds Superset API connection 1:1 (hostPort + nested provider/username/password)', () => {
  const connection = buildServiceConnection({
    name: 'bi',
    kind: 'dashboard',
    serviceType: 'Superset',
    hostPort: 'http://localhost:8088',
    username: 'admin',
    provider: 'db',
    password: '${SUPERSET_PASSWORD}',
    storeConnectionSecrets: false,
  });
  expect(connection).toEqual({
    config: {
      type: 'Superset',
      hostPort: 'http://localhost:8088',
      connection: {
        provider: 'db',
        username: 'admin',
        password: '${SUPERSET_PASSWORD}',
      },
    },
  });
});

it('builds Metabase connection with hostPort and apiKey', () => {
  const connection = buildServiceConnection({
    name: 'mb',
    kind: 'dashboard',
    serviceType: 'Metabase',
    hostPort: 'http://localhost:3000',
    apiKey: '${METABASE_API_KEY}',
    storeConnectionSecrets: false,
  });
  expect(connection).toEqual({
    config: {
      type: 'Metabase',
      hostPort: 'http://localhost:3000',
      apiKey: '${METABASE_API_KEY}',
    },
  });
});

it('builds S3 connection with awsConfig + bucketNames 1:1', () => {
  const connection = buildServiceConnection({
    name: 'lake',
    kind: 'storage',
    serviceType: 'S3',
    awsRegion: 'us-east-1',
    awsAccessKeyId: 'AKIA',
    awsSecretAccessKey: '${AWS_SECRET_ACCESS_KEY}',
    bucketNames: 'analytics, raw',
    consoleEndpointURL: 'https://s3.console.aws.amazon.com',
    storeConnectionSecrets: false,
  });
  expect(connection).toEqual({
    config: {
      type: 'S3',
      awsConfig: {
        awsRegion: 'us-east-1',
        awsAccessKeyId: 'AKIA',
        awsSecretAccessKey: '${AWS_SECRET_ACCESS_KEY}',
      },
      bucketNames: ['analytics', 'raw'],
      consoleEndpointURL: 'https://s3.console.aws.amazon.com',
    },
  });
});

it('redacts awsConfig secrets for display', () => {
  const redacted = redactConnectionForDisplay({
    config: {
      type: 'S3',
      awsConfig: {
        awsRegion: 'us-east-1',
        awsSecretAccessKey: 'literal-secret',
        awsSessionToken: 'sess',
      },
    },
  });
  expect(redacted?.config?.awsConfig).toMatchObject({
    awsRegion: 'us-east-1',
    awsSecretAccessKey: '********',
    awsSessionToken: '********',
  });
});

it('builds Prefect cloud connection 1:1 (hostPort + authType cloud)', () => {
  const connection = buildServiceConnection({
    name: 'pf',
    kind: 'pipeline',
    serviceType: 'Prefect',
    hostPort: 'https://api.prefect.cloud',
    prefectAuthMode: 'cloud',
    prefectAccountId: 'acct',
    prefectWorkspaceId: 'ws',
    apiKey: '${PREFECT_API_KEY}',
    numberOfStatus: 10,
    storeConnectionSecrets: false,
  });
  expect(connection).toEqual({
    config: {
      type: 'Prefect',
      hostPort: 'https://api.prefect.cloud',
      authType: {
        accountId: 'acct',
        workspaceId: 'ws',
        apiKey: '${PREFECT_API_KEY}',
      },
      numberOfStatus: 10,
    },
  });
});

it('builds Dagster connection with host + token', () => {
  const connection = buildServiceConnection({
    name: 'dg',
    kind: 'pipeline',
    serviceType: 'Dagster',
    hostPort: 'http://localhost:3000',
    apiKey: '${DAGSTER_TOKEN}',
    dagsterTimeout: 1000,
    stripAssetKeyPrefixLength: 0,
    storeConnectionSecrets: false,
  });
  expect(connection).toEqual({
    config: {
      type: 'Dagster',
      host: 'http://localhost:3000',
      token: '${DAGSTER_TOKEN}',
      timeout: 1000,
      stripAssetKeyPrefixLength: 0,
    },
  });
});

it('reloads Dagster host into form hostPort (edit-reload)', () => {
  const service: CatalogService = {
    id: 'svc-dg',
    name: 'dg',
    kind: 'pipeline',
    serviceType: 'Dagster',
    connection: {
      config: {
        type: 'Dagster',
        host: 'http://localhost:3000',
        token: '********',
        timeout: 1000,
      },
    },
  };
  const form = formValuesFromService(service);
  expect(form.hostPort).toBe('http://localhost:3000');
  expect(form.dagsterTimeout).toBe(1000);
});

it('prefers config.host over config.hostPort when both present', () => {
  const service: CatalogService = {
    id: 'svc-dg2',
    name: 'dg2',
    kind: 'pipeline',
    serviceType: 'Dagster',
    connection: {
      config: {
        type: 'Dagster',
        host: 'http://dagster:3000',
        hostPort: 'should-not-win',
      },
    },
  };
  expect(formValuesFromService(service).hostPort).toBe('http://dagster:3000');
});
