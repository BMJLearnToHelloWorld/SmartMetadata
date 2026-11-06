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
  PASSWORD_PLACEHOLDERS,
  SERVICE_ENTITY_TYPE_BY_KIND,
  SERVICE_KIND_BY_ENTITY_TYPE,
  SERVICE_KIND_DEFAULT_TYPE,
  buildServiceConnection,
  createEmptyServiceForm,
  formValuesFromService,
  kindForServiceType,
  redactConnectionForDisplay,
} from './connections';
import type { CatalogService, ServiceFormValues, ServiceKind } from '@/types/ingestion';

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
        // Wave 0 lean-forms: single default scheme is always emitted.
        scheme: 'postgresql+psycopg2',
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

  it('builds the eight previously form-less kinds via their default types (A9)', () => {
    expect(
      buildServiceConnection({
        name: 'ml', kind: 'mlmodel', serviceType: 'Mlflow',
        trackingUri: 'http://localhost:5000', registryUri: 'sqlite:///mlflow.db',
      }),
    ).toEqual({
      config: { type: 'Mlflow', trackingUri: 'http://localhost:5000', registryUri: 'sqlite:///mlflow.db' },
    });
    expect(
      buildServiceConnection({
        name: 'meta', kind: 'metadata', serviceType: 'OpenMetadata', hostPort: 'http://localhost:8585',
      }),
    ).toEqual({ config: { type: 'OpenMetadata', hostPort: 'http://localhost:8585' } });
    expect(
      buildServiceConnection({
        name: 'rest', kind: 'api', serviceType: 'Rest',
        openApiSchemaUrl: 'https://example.com/openapi.json', apiKey: '${REST_TOKEN}',
        storeConnectionSecrets: false,
      }),
    ).toEqual({
      config: {
        type: 'Rest',
        openAPISchemaConnection: { openAPISchemaURL: 'https://example.com/openapi.json' },
        token: '${REST_TOKEN}',
      },
    });
    expect(
      buildServiceConnection({
        name: 'drive', kind: 'drive', serviceType: 'GoogleDrive',
        credentialsJson: '{"type": "service_account"}', delegatedEmail: 'user@example.com',
      }),
    ).toEqual({
      config: {
        type: 'GoogleDrive',
        credentials: { type: 'service_account' },
        delegatedEmail: 'user@example.com',
      },
    });
    expect(() =>
      buildServiceConnection({ name: 'drive', kind: 'drive', serviceType: 'GoogleDrive', credentialsJson: 'not-json' }),
    ).toThrow('valid JSON');
    expect(
      buildServiceConnection({
        name: 'es', kind: 'search', serviceType: 'ElasticSearch',
        hostPort: 'http://localhost:9200', username: 'elastic', password: '${ES_PASSWORD}',
        storeConnectionSecrets: false,
      }),
    ).toEqual({
      config: {
        type: 'ElasticSearch',
        hostPort: 'http://localhost:9200',
        authType: { username: 'elastic', password: '${ES_PASSWORD}' },
      },
    });
    expect(
      buildServiceConnection({
        name: 'llm', kind: 'llm', serviceType: 'OpenAI',
        apiKey: '${OPENAI_API_KEY}', organization: 'org-1', baseUrl: 'https://api.openai.com/v1',
        storeConnectionSecrets: false,
      }),
    ).toEqual({
      config: {
        type: 'OpenAI',
        apiKey: '${OPENAI_API_KEY}',
        organization: 'org-1',
        // Server schema field is baseURL, not the product form key baseUrl.
        baseURL: 'https://api.openai.com/v1',
      },
    });
    expect(
      buildServiceConnection({
        name: 'mcp', kind: 'mcp', serviceType: 'Mcp', registryUrl: 'https://registry.example.com',
        connectionTimeout: 30,
      }),
    ).toEqual({
      config: { type: 'Mcp', registryUrl: 'https://registry.example.com', connectionTimeout: 30 },
    });
    expect(
      buildServiceConnection({
        name: 'ranger', kind: 'security', serviceType: 'Ranger',
        hostPort: 'http://localhost:6080', username: 'admin', password: '${RANGER_PASSWORD}',
        storeConnectionSecrets: false,
      }),
    ).toEqual({
      config: {
        type: 'Ranger',
        hostPort: 'http://localhost:6080',
        authType: { username: 'admin', password: '${RANGER_PASSWORD}' },
      },
    });
  });

  it('still returns undefined for a form-less type instead of inventing a connection', () => {
    expect(
      buildServiceConnection({ name: 'x', kind: 'llm', serviceType: 'Anthropic', apiKey: 'k' }),
    ).toBeUndefined();
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
        // Wave 0 lean-forms: single-option scheme is a builder fixed value;
        // policyAgentConfig is always composed from the spec defaults.
        scheme: 'snowflake',
        policyAgentConfig: {
          enabled: true,
          supportsColumnAccess: false,
          supportsFullAccess: true,
          supportsMaskedAccess: true,
        },
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
        // Wave 0 lean-forms: single-option scheme is a builder fixed value;
        // policyAgentConfig is always composed from the spec defaults.
        scheme: 'databricks',
        policyAgentConfig: {
          enabled: true,
          supportsColumnAccess: false,
          supportsFullAccess: true,
          supportsMaskedAccess: true,
        },
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
        scheme: 'databricks',
        policyAgentConfig: {
          enabled: true,
          supportsColumnAccess: false,
          supportsFullAccess: true,
          supportsMaskedAccess: true,
        },
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

  it('builds the full Postgres de-noised set (Wave 0 lean-forms)', () => {
    const connection = buildServiceConnection(
      postgresForm({
        scheme: 'pgspider+psycopg2',
        ingestAllDatabases: true,
        sslMode: 'require',
        sslCaCertificate: '---CA---',
        sslCertificate: '---CERT---',
        sslKey: '---KEY---',
        classificationName: 'CustomTags',
        queryStatementSource: 'my_schema.custom_pg_stat_statements',
        connectionOptions: '{"connect_timeout": "10"}',
        connectionArguments: '{"ssl": "true"}',
        storeConnectionSecrets: true,
      }),
    );
    expect(connection).toEqual({
      config: {
        type: 'Postgres',
        hostPort: 'localhost:5432',
        username: 'analyst',
        database: 'analytics',
        scheme: 'pgspider+psycopg2',
        ingestAllDatabases: true,
        sslMode: 'require',
        sslConfig: { caCertificate: '---CA---', sslCertificate: '---CERT---', sslKey: '---KEY---' },
        classificationName: 'CustomTags',
        queryStatementSource: 'my_schema.custom_pg_stat_statements',
        connectionOptions: { connect_timeout: '10' },
        connectionArguments: { ssl: 'true' },
      },
    });
  });

  it('builds MySQL slow logs + ssl + JSON maps (Wave 0 lean-forms)', () => {
    const connection = buildServiceConnection({
      name: 'm',
      kind: 'database',
      serviceType: 'Mysql',
      hostPort: 'localhost:3306',
      username: 'root',
      databaseName: 'app',
      useSlowLogs: true,
      sslCaCertificate: '---CA---',
      connectionOptions: '{"charset": "utf8mb4"}',
      storeConnectionSecrets: true,
    });
    expect(connection?.config).toMatchObject({
      type: 'Mysql',
      scheme: 'mysql+pymysql',
      useSlowLogs: true,
      sslConfig: { caCertificate: '---CA---' },
      connectionOptions: { charset: 'utf8mb4' },
    });
  });

  it('throws on invalid JSON connection options/arguments', () => {
    expect(() => buildServiceConnection(postgresForm({ connectionOptions: '{bad json' }))).toThrow(
      'Connection options must be a valid JSON object',
    );
    expect(() => buildServiceConnection(postgresForm({ connectionOptions: '[]' }))).toThrow(
      'Connection options must be a JSON object',
    );
    expect(() =>
      buildServiceConnection(postgresForm({ connectionArguments: '{"a": 1}' })),
    ).toThrow('Connection arguments values must be strings');
  });

  it('keeps Snowflake private key and passphrase under the secret discipline', () => {
    const base = {
      name: 'sf',
      kind: 'database',
      serviceType: 'Snowflake',
      username: 'svc',
      account: 'xy',
      warehouse: 'WH',
    } as const;
    // A typed literal without persist is dropped, like passwords.
    expect(
      buildServiceConnection({ ...base, privateKey: '---KEY---', snowflakePrivatekeyPassphrase: 'pw' })
        ?.config,
    ).not.toHaveProperty('privateKey');
    expect(
      buildServiceConnection({ ...base, privateKey: '---KEY---', snowflakePrivatekeyPassphrase: 'pw' })
        ?.config,
    ).not.toHaveProperty('snowflakePrivatekeyPassphrase');
    // With persist it is sent.
    const kept = buildServiceConnection({
      ...base,
      privateKey: '---KEY---',
      snowflakePrivatekeyPassphrase: 'pw',
      storeConnectionSecrets: true,
    })?.config;
    expect(kept?.privateKey).toBe('---KEY---');
    expect(kept?.snowflakePrivatekeyPassphrase).toBe('pw');
    // Blank + masked previous is preserved.
    const prev = buildServiceConnection(
      { ...base },
      {
        config: {
          type: 'Snowflake',
          privateKey: '********',
          snowflakePrivatekeyPassphrase: '********',
        },
      },
    )?.config;
    expect(prev?.privateKey).toBe('********');
    expect(prev?.snowflakePrivatekeyPassphrase).toBe('********');
  });

  it('builds Redshift identifiers and Timescale classification fields (Wave 0 lean-forms)', () => {
    expect(
      buildServiceConnection({
        name: 'r',
        kind: 'database',
        serviceType: 'Redshift',
        hostPort: 'cluster.xyz.us-east-1.redshift.amazonaws.com:5439',
        username: 'awsuser',
        database: 'dev',
        clusterIdentifier: 'my-cluster',
        workgroupName: 'my-workgroup',
        sslMode: 'verify-full',
        connectionOptions: '{"tcp_keepalive": "true"}',
      })?.config,
    ).toMatchObject({
      type: 'Redshift',
      scheme: 'redshift+psycopg2',
      clusterIdentifier: 'my-cluster',
      workgroupName: 'my-workgroup',
      sslMode: 'verify-full',
      connectionOptions: { tcp_keepalive: 'true' },
    });
    expect(
      buildServiceConnection({
        name: 't',
        kind: 'database',
        serviceType: 'Timescale',
        hostPort: 'localhost:5432',
        username: 'tsdb',
        database: 'ts',
        classificationName: 'CustomTags',
        queryStatementSource: 'my_schema.custom_pg_stat_statements',
      })?.config,
    ).toMatchObject({
      type: 'Timescale',
      classificationName: 'CustomTags',
      queryStatementSource: 'my_schema.custom_pg_stat_statements',
    });
    // Greenplum has neither the Redshift identifiers nor the Timescale fields.
    expect(
      buildServiceConnection({
        name: 'g',
        kind: 'database',
        serviceType: 'Greenplum',
        hostPort: 'localhost:5432',
        username: 'gpadmin',
        database: 'gpdb',
      })?.config,
    ).not.toHaveProperty('clusterIdentifier');
  });

  it('round-trips the new fields from a stored service', () => {
    const service: CatalogService = {
      id: 's1',
      name: 'warehouse',
      kind: 'database',
      serviceType: 'Snowflake',
      connection: {
        config: {
          type: 'Snowflake',
          username: 'svc',
          account: 'xy',
          warehouse: 'WH',
          queryTag: 'billing',
          accountUsageSchema: 'CUSTOM.USAGE',
          systemMetricsBatchSize: 25,
          privateKey: '********',
          snowflakePrivatekeyPassphrase: '********',
          includeStreams: true,
          useAccessHistory: false,
          accessHistoryChunkSize: 7,
          creditCost: 4.5,
          snowflakeSourceHost: 'custom.snowflake.com',
          policyAgentConfig: {
            enabled: false,
            supportsColumnAccess: true,
            supportsFullAccess: false,
            supportsMaskedAccess: false,
          },
          connectionOptions: { warehouse: 'WH' },
          connectionArguments: { a: 'b' },
        },
      },
    };
    const form = formValuesFromService(service);
    expect(form.queryTag).toBe('billing');
    expect(form.accountUsageSchema).toBe('CUSTOM.USAGE');
    expect(form.systemMetricsBatchSize).toBe(25);
    // Secrets are never prefilled into the form.
    expect(form.privateKey).toBe('');
    expect(form.snowflakePrivatekeyPassphrase).toBe('');
    expect(form.includeStreams).toBe(true);
    expect(form.useAccessHistory).toBe(false);
    expect(form.accessHistoryChunkSize).toBe(7);
    expect(form.creditCost).toBe(4.5);
    expect(form.snowflakeSourceHost).toBe('custom.snowflake.com');
    expect(form.policyAgentEnabled).toBe(false);
    expect(form.policyAgentSupportsColumnAccess).toBe(true);
    expect(form.policyAgentSupportsFullAccess).toBe(false);
    expect(form.policyAgentSupportsMaskedAccess).toBe(false);
    expect(form.connectionOptions).toBe('{"warehouse":"WH"}');
    expect(form.connectionArguments).toBe('{"a":"b"}');
    // Spec defaults apply when the stored config omits the field.
    const bare = formValuesFromService({
      id: 's2',
      name: 'wh2',
      kind: 'database',
      serviceType: 'Snowflake',
      connection: { config: { type: 'Snowflake' } },
    });
    expect(bare.useAccessHistory).toBe(true);
    expect(bare.systemMetricsBatchSize).toBe(50);
    expect(bare.accessHistoryChunkSize).toBe(2);
    expect(bare.creditCost).toBe(3.3);
    expect(bare.accountUsageSchema).toBe('SNOWFLAKE.ACCOUNT_USAGE');
    expect(bare.snowflakeSourceHost).toBe('app.snowflake.com');
    expect(bare.policyAgentEnabled).toBe(true);
    expect(bare.policyAgentSupportsFullAccess).toBe(true);
    expect(bare.sslMode).toBe('disable');
    expect(bare.classificationName).toBe('PostgresPolicyTags');
    expect(bare.queryStatementSource).toBe('pg_stat_statements');
  });

  it('redacts the new secret leaves for display JSON', () => {
    const redacted = redactConnectionForDisplay({
      config: {
        type: 'Snowflake',
        privateKey: '---KEY---',
        snowflakePrivatekeyPassphrase: 'pw',
        sslConfig: { caCertificate: '---CA---', sslCertificate: '---CERT---', sslKey: '---KEY---' },
      },
    });
    expect(redacted?.config?.privateKey).toBe('********');
    expect(redacted?.config?.snowflakePrivatekeyPassphrase).toBe('********');
    expect(redacted?.config?.sslConfig).toEqual({
      caCertificate: '********',
      sslCertificate: '********',
      sslKey: '********',
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

it('builds Metabase password auth and Kafka securityProtocol (M-Next B6/B7)', () => {
  // Official metabaseConnection.json lists password beside apiKey.
  expect(
    buildServiceConnection({
      name: 'mb-pw',
      kind: 'dashboard',
      serviceType: 'Metabase',
      hostPort: 'http://localhost:3000',
      username: 'admin',
      password: 'mb-secret',
      storeConnectionSecrets: true,
    }),
  ).toEqual({
    config: {
      type: 'Metabase',
      hostPort: 'http://localhost:3000',
      username: 'admin',
      password: 'mb-secret',
    },
  });
  expect(
    buildServiceConnection({
      name: 'kafka-sec',
      kind: 'messaging',
      serviceType: 'Kafka',
      bootstrapServers: 'localhost:9092',
      schemaRegistryURL: 'http://localhost:8081',
      securityProtocol: 'SASL_SSL',
    }),
  ).toEqual({
    config: {
      type: 'Kafka',
      bootstrapServers: 'localhost:9092',
      schemaRegistryURL: 'http://localhost:8081',
      securityProtocol: 'SASL_SSL',
    },
  });
});

it('emits queryHistoryTable for MySQL and Databricks but never for UnityCatalog (M-Next B3)', () => {
  expect(
    buildServiceConnection({
      name: 'mysql-qht',
      kind: 'database',
      serviceType: 'Mysql',
      hostPort: 'localhost:3306',
      username: 'root',
      databaseName: 'app',
      queryHistoryTable: 'sys.query_history',
    })?.config,
  ).toMatchObject({ type: 'Mysql', queryHistoryTable: 'sys.query_history' });
  expect(
    buildServiceConnection({
      name: 'uc-qht',
      kind: 'database',
      serviceType: 'UnityCatalog',
      hostPort: 'adb-xxxx.azuredatabricks.net',
      queryHistoryTable: 'system.query.history',
    })?.config,
  ).not.toHaveProperty('queryHistoryTable');
  expect(
    buildServiceConnection({
      name: 'dbx-qht',
      kind: 'database',
      serviceType: 'Databricks',
      hostPort: 'adb-xxxx.azuredatabricks.net',
      queryHistoryTable: 'system.query.history',
    })?.config,
  ).toMatchObject({ type: 'Databricks', queryHistoryTable: 'system.query.history' });
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

describe('service kind tables', () => {
  it('maps every kind to its default type and back from its entity type', () => {
    expect(SERVICE_KIND_DEFAULT_TYPE).toEqual({
      database: 'Postgres',
      messaging: 'Kafka',
      dashboard: 'Superset',
      storage: 'S3',
      pipeline: 'Prefect',
      api: 'Rest',
      mlmodel: 'Mlflow',
      metadata: 'OpenMetadata',
      drive: 'GoogleDrive',
      search: 'ElasticSearch',
      llm: 'OpenAI',
      mcp: 'Mcp',
      security: 'Ranger',
    });
    for (const kind of Object.keys(SERVICE_KIND_DEFAULT_TYPE) as ServiceKind[]) {
      expect(kindForServiceType(SERVICE_KIND_DEFAULT_TYPE[kind])).toBe(kind);
      expect(SERVICE_KIND_BY_ENTITY_TYPE[SERVICE_ENTITY_TYPE_BY_KIND[kind]]).toBe(kind);
    }
  });

  it('keeps password placeholders table-driven per type', () => {
    expect(PASSWORD_PLACEHOLDERS.Postgres).toBe('${PG_PASSWORD}');
    expect(PASSWORD_PLACEHOLDERS.S3).toBe('${AWS_SECRET_ACCESS_KEY}');
    expect(PASSWORD_PLACEHOLDERS.UnknownType).toBeUndefined();
  });

  it('creates a blank form with the create-modal defaults', () => {
    const form = createEmptyServiceForm();
    expect(form.kind).toBe('database');
    expect(form.serviceType).toBe('Postgres');
    expect(form.includeMetricViews).toBe(true);
    expect(form.storeConnectionSecrets).toBe(false);
    // Wave 0 lean-forms: spec defaults for the new fields (RULING.md §1.4).
    expect(form.sslMode).toBe('disable');
    expect(form.classificationName).toBe('PostgresPolicyTags');
    expect(form.queryStatementSource).toBe('pg_stat_statements');
    expect(form.useAccessHistory).toBe(true);
    expect(form.systemMetricsBatchSize).toBe(50);
    expect(form.accessHistoryChunkSize).toBe(2);
    expect(form.creditCost).toBe(3.3);
    expect(form.accountUsageSchema).toBe('SNOWFLAKE.ACCOUNT_USAGE');
    expect(form.snowflakeSourceHost).toBe('app.snowflake.com');
    expect(form.policyAgentEnabled).toBe(true);
    expect(form.policyAgentSupportsColumnAccess).toBe(false);
    expect(form.policyAgentSupportsFullAccess).toBe(true);
    expect(form.policyAgentSupportsMaskedAccess).toBe(true);
  });
});
