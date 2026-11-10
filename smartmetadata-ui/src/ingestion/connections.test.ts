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
        // W3-3A (J-Q3): credentials take the gcpConfig wrapper — the bare
        // service-account JSON is schema-invalid (gcpCredentials.json
        // requires gcpConfig, additionalProperties: false).
        credentials: { gcpConfig: { type: 'service_account' } },
        delegatedEmail: 'user@example.com',
      },
    });
    expect(() =>
      buildServiceConnection({ name: 'drive', kind: 'drive', serviceType: 'GoogleDrive', credentialsJson: 'not-json' }),
    ).toThrow('valid JSON');
    expect(
      buildServiceConnection({
        name: 'es', kind: 'search', serviceType: 'ElasticSearch',
        hostPort: 'http://localhost:9200', elasticSearchAuthMode: 'basicAuth',
        username: 'elastic', password: '${ES_PASSWORD}',
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

it('builds the full Kafka de-noised set (W2-5 lean-forms tier 2)', () => {
  const connection = buildServiceConnection({
    name: 'events',
    kind: 'messaging',
    serviceType: 'Kafka',
    bootstrapServers: 'localhost:9092',
    schemaRegistryURL: 'http://localhost:8081',
    saslUsername: 'kafka-user',
    saslPassword: 'kafka-secret',
    securityProtocol: 'SASL_SSL',
    saslMechanism: 'SCRAM-SHA-512',
    basicAuthUserInfo: 'registry-user:registry-secret',
    consumerConfig: '{"retries": 3, "enable.auto.commit": false, "headers": {"a": 1}}',
    schemaRegistryConfig: '{"timeout": 30}',
    schemaRegistryTopicSuffixName: '-key',
    consumerConfigSSLCaCertificate: '---CONSUMER-CA---',
    consumerConfigSSLCertificate: '---CONSUMER-CERT---',
    consumerConfigSSLKey: '---CONSUMER-KEY---',
    schemaRegistrySSLCaCertificate: '---REGISTRY-CA---',
    schemaRegistrySSLCertificate: '---REGISTRY-CERT---',
    schemaRegistrySSLKey: '---REGISTRY-KEY---',
    storeConnectionSecrets: true,
  });
  expect(connection).toEqual({
    config: {
      type: 'Kafka',
      bootstrapServers: 'localhost:9092',
      schemaRegistryURL: 'http://localhost:8081',
      saslUsername: 'kafka-user',
      saslPassword: 'kafka-secret',
      securityProtocol: 'SASL_SSL',
      saslMechanism: 'SCRAM-SHA-512',
      basicAuthUserInfo: 'registry-user:registry-secret',
      consumerConfig: { retries: 3, 'enable.auto.commit': false, headers: { a: 1 } },
      schemaRegistryConfig: { timeout: 30 },
      schemaRegistryTopicSuffixName: '-key',
      consumerConfigSSL: {
        caCertificate: '---CONSUMER-CA---',
        sslCertificate: '---CONSUMER-CERT---',
        sslKey: '---CONSUMER-KEY---',
      },
      schemaRegistrySSL: {
        caCertificate: '---REGISTRY-CA---',
        sslCertificate: '---REGISTRY-CERT---',
        sslKey: '---REGISTRY-KEY---',
      },
    },
  });
  // Full payload: only spec attributes, no extra keys
  // (additionalProperties: false).
  expect(Object.keys(connection?.config ?? {}).sort()).toEqual([
    'basicAuthUserInfo',
    'bootstrapServers',
    'consumerConfig',
    'consumerConfigSSL',
    'saslMechanism',
    'saslPassword',
    'saslUsername',
    'schemaRegistryConfig',
    'schemaRegistrySSL',
    'schemaRegistryTopicSuffixName',
    'schemaRegistryURL',
    'securityProtocol',
    'type',
  ]);
});

it('throws on invalid Kafka consumer/schema-registry config JSON (W2-5)', () => {
  expect(() =>
    buildServiceConnection({
      name: 'events',
      kind: 'messaging',
      serviceType: 'Kafka',
      bootstrapServers: 'localhost:9092',
      consumerConfig: '{bad json',
    }),
  ).toThrow('Consumer config must be a valid JSON object');
  expect(() =>
    buildServiceConnection({
      name: 'events',
      kind: 'messaging',
      serviceType: 'Kafka',
      bootstrapServers: 'localhost:9092',
      consumerConfig: '[]',
    }),
  ).toThrow('Consumer config must be a JSON object');
  expect(() =>
    buildServiceConnection({
      name: 'events',
      kind: 'messaging',
      serviceType: 'Kafka',
      bootstrapServers: 'localhost:9092',
      schemaRegistryConfig: '{"a": 1',
    }),
  ).toThrow('Schema Registry config must be a valid JSON object');
});

it('keeps masked Kafka SASL secrets and SSL leaves on edit (W2-5)', () => {
  const connection = buildServiceConnection(
    {
      name: 'events',
      kind: 'messaging',
      serviceType: 'Kafka',
      bootstrapServers: 'localhost:9092',
      saslPassword: '',
      basicAuthUserInfo: '',
      consumerConfigSSLCaCertificate: '',
      schemaRegistrySSLKey: '',
    },
    {
      config: {
        type: 'Kafka',
        bootstrapServers: 'localhost:9092',
        saslPassword: '********',
        basicAuthUserInfo: '********',
        consumerConfigSSL: { caCertificate: '********' },
        schemaRegistrySSL: { sslKey: '********' },
      },
    },
  );
  expect(connection?.config).toMatchObject({
    saslPassword: '********',
    basicAuthUserInfo: '********',
    consumerConfigSSL: { caCertificate: '********' },
    schemaRegistrySSL: { sslKey: '********' },
  });
});

it('builds the full Redpanda de-noised set without SSL groups (W2-5)', () => {
  const connection = buildServiceConnection({
    name: 'rp',
    kind: 'messaging',
    serviceType: 'Redpanda',
    bootstrapServers: 'localhost:9092',
    schemaRegistryURL: 'http://localhost:8081',
    saslUsername: 'rp-user',
    saslPassword: 'rp-secret',
    schemaRegistryTopicSuffixName: '-value',
    securityProtocol: 'SASL_PLAINTEXT',
    saslMechanism: 'PLAIN',
    basicAuthUserInfo: 'reg:secret',
    consumerConfig: '{"group.id": "console"}',
    schemaRegistryConfig: '{"timeout": 5}',
    storeConnectionSecrets: true,
  });
  expect(connection).toEqual({
    config: {
      type: 'Redpanda',
      bootstrapServers: 'localhost:9092',
      schemaRegistryURL: 'http://localhost:8081',
      saslUsername: 'rp-user',
      saslPassword: 'rp-secret',
      schemaRegistryTopicSuffixName: '-value',
      securityProtocol: 'SASL_PLAINTEXT',
      saslMechanism: 'PLAIN',
      basicAuthUserInfo: 'reg:secret',
      consumerConfig: { 'group.id': 'console' },
      schemaRegistryConfig: { timeout: 5 },
    },
  });
  expect(connection?.config).not.toHaveProperty('consumerConfigSSL');
  expect(connection?.config).not.toHaveProperty('schemaRegistrySSL');
});

it('keeps a masked Superset password on edit without retyping (W2-5 condition 6)', () => {
  const connection = buildServiceConnection(
    {
      name: 'bi',
      kind: 'dashboard',
      serviceType: 'Superset',
      hostPort: 'http://localhost:8088',
      username: 'admin',
      provider: 'db',
      password: '',
    },
    {
      config: {
        type: 'Superset',
        hostPort: 'http://localhost:8088',
        connection: { provider: 'db', username: 'admin', password: '********' },
      },
    },
  );
  expect(connection?.config?.connection).toEqual({
    provider: 'db',
    username: 'admin',
    password: '********',
  });
});

it('emits a retyped Superset password on edit (W2-5 condition 6)', () => {
  const connection = buildServiceConnection(
    {
      name: 'bi',
      kind: 'dashboard',
      serviceType: 'Superset',
      hostPort: 'http://localhost:8088',
      username: 'admin',
      provider: 'db',
      password: 'new-secret',
      storeConnectionSecrets: true,
    },
    {
      config: {
        type: 'Superset',
        hostPort: 'http://localhost:8088',
        connection: { provider: 'db', username: 'admin', password: '********' },
      },
    },
  );
  expect(connection?.config?.connection?.password).toBe('new-secret');
});

it('builds Superset verifySSL + nested sslConfig (W2-5)', () => {
  const connection = buildServiceConnection({
    name: 'bi',
    kind: 'dashboard',
    serviceType: 'Superset',
    hostPort: 'http://localhost:8088',
    username: 'admin',
    provider: 'db',
    password: '${SUPERSET_PASSWORD}',
    verifySSL: 'validate',
    supersetSSLCaCertificate: '---SUPERSET-CA---',
    supersetSSLCertificate: '---SUPERSET-CERT---',
    supersetSSLKey: '---SUPERSET-KEY---',
    storeConnectionSecrets: true,
  });
  expect(connection).toEqual({
    config: {
      type: 'Superset',
      hostPort: 'http://localhost:8088',
      connection: {
        provider: 'db',
        username: 'admin',
        password: '${SUPERSET_PASSWORD}',
        verifySSL: 'validate',
        sslConfig: {
          caCertificate: '---SUPERSET-CA---',
          sslCertificate: '---SUPERSET-CERT---',
          sslKey: '---SUPERSET-KEY---',
        },
      },
    },
  });
});

it('builds Prefect server auth + top-level verifySSL/sslConfig (W2-5)', () => {
  const connection = buildServiceConnection({
    name: 'pf',
    kind: 'pipeline',
    serviceType: 'Prefect',
    hostPort: 'http://localhost:4200',
    prefectAuthMode: 'server',
    prefectAuthString: 'user:secret',
    numberOfStatus: 5,
    verifySSL: 'ignore',
    sslCaCertificate: '---PREFECT-CA---',
    storeConnectionSecrets: true,
  });
  expect(connection).toEqual({
    config: {
      type: 'Prefect',
      hostPort: 'http://localhost:4200',
      authType: { authString: 'user:secret' },
      numberOfStatus: 5,
      verifySSL: 'ignore',
      sslConfig: { caCertificate: '---PREFECT-CA---' },
    },
  });
});

it('keeps a masked Prefect cloud apiKey on edit (W2-5)', () => {
  const connection = buildServiceConnection(
    {
      name: 'pf',
      kind: 'pipeline',
      serviceType: 'Prefect',
      hostPort: 'https://api.prefect.cloud',
      prefectAuthMode: 'cloud',
      prefectAccountId: 'acct',
      prefectWorkspaceId: 'ws',
      apiKey: '',
      numberOfStatus: 10,
    },
    {
      config: {
        type: 'Prefect',
        authType: { accountId: 'acct', workspaceId: 'ws', apiKey: '********' },
      },
    },
  );
  expect(connection?.config?.authType).toEqual({
    accountId: 'acct',
    workspaceId: 'ws',
    apiKey: '********',
  });
});

it('builds S3 connectionOptions/connectionArguments as string maps (W2-5)', () => {
  const connection = buildServiceConnection({
    name: 'lake',
    kind: 'storage',
    serviceType: 'S3',
    awsRegion: 'us-east-1',
    bucketNames: 'analytics',
    connectionOptions: '{"endpoint": "https://s3.example.com"}',
    connectionArguments: '{"retries": "3"}',
  });
  expect(connection?.config).toMatchObject({
    type: 'S3',
    connectionOptions: { endpoint: 'https://s3.example.com' },
    connectionArguments: { retries: '3' },
  });
  expect(() =>
    buildServiceConnection({
      name: 'lake',
      kind: 'storage',
      serviceType: 'S3',
      connectionOptions: '{"retries": 3}',
    }),
  ).toThrow('Connection options values must be strings');
  expect(() =>
    buildServiceConnection({
      name: 'lake',
      kind: 'storage',
      serviceType: 'S3',
      connectionArguments: '{bad json',
    }),
  ).toThrow('Connection arguments must be a valid JSON object');
});

it('redacts the tier 2 SSL groups and nested Superset sslConfig for display (W2-5)', () => {
  const kafka = redactConnectionForDisplay({
    config: {
      type: 'Kafka',
      consumerConfigSSL: { caCertificate: '---CA---', sslCertificate: '---CERT---', sslKey: '---KEY---' },
      schemaRegistrySSL: { caCertificate: '---CA2---' },
    },
  });
  expect(kafka?.config?.consumerConfigSSL).toEqual({
    caCertificate: '********',
    sslCertificate: '********',
    sslKey: '********',
  });
  expect(kafka?.config?.schemaRegistrySSL).toEqual({ caCertificate: '********' });
  const superset = redactConnectionForDisplay({
    config: {
      type: 'Superset',
      connection: {
        provider: 'db',
        username: 'admin',
        password: 'secret',
        verifySSL: 'validate',
        sslConfig: { caCertificate: '---CA---', sslKey: '---KEY---' },
      },
    },
  });
  expect(superset?.config?.connection).toEqual({
    provider: 'db',
    username: 'admin',
    password: '********',
    verifySSL: 'validate',
    sslConfig: { caCertificate: '********', sslKey: '********' },
  });
  const prefect = redactConnectionForDisplay({
    config: { type: 'Prefect', verifySSL: 'validate', sslConfig: { caCertificate: '---CA---' } },
  });
  expect(prefect?.config?.sslConfig).toEqual({ caCertificate: '********' });
  expect(prefect?.config?.verifySSL).toBe('validate');
});

it('round-trips the tier 2 fields from a stored service (W2-5)', () => {
  const kafka: CatalogService = {
    id: 'k1',
    name: 'events',
    kind: 'messaging',
    serviceType: 'Kafka',
    connection: {
      config: {
        type: 'Kafka',
        bootstrapServers: 'localhost:9092',
        saslUsername: 'kafka-user',
        saslPassword: '********',
        saslMechanism: 'SCRAM-SHA-512',
        basicAuthUserInfo: '********',
        consumerConfig: { retries: 3, 'enable.auto.commit': false },
        schemaRegistryTopicSuffixName: '-key',
        consumerConfigSSL: { caCertificate: '********' },
      },
    },
  };
  const form = formValuesFromService(kafka);
  expect(form.saslUsername).toBe('kafka-user');
  // Secrets are never prefilled into the form.
  expect(form.saslPassword).toBe('');
  expect(form.basicAuthUserInfo).toBe('');
  expect(form.saslMechanism).toBe('SCRAM-SHA-512');
  expect(form.consumerConfig).toBe('{"retries":3,"enable.auto.commit":false}');
  expect(form.schemaRegistryTopicSuffixName).toBe('-key');
  expect(form.consumerConfigSSLCaCertificate).toBe('');
  // Spec defaults apply when the stored config omits the field.
  const bare = formValuesFromService({
    id: 'k2',
    name: 'events2',
    kind: 'messaging',
    serviceType: 'Kafka',
    connection: { config: { type: 'Kafka' } },
  });
  expect(bare.saslMechanism).toBe('PLAIN');
  expect(bare.schemaRegistryTopicSuffixName).toBe('-value');
  expect(bare.verifySSL).toBe('no-ssl');
  // Superset verifySSL round-trips from the nested connection.
  const superset = formValuesFromService({
    id: 's1',
    name: 'bi',
    kind: 'dashboard',
    serviceType: 'Superset',
    connection: { config: { type: 'Superset', connection: { provider: 'db', verifySSL: 'validate' } } },
  });
  expect(superset.verifySSL).toBe('validate');
  expect(superset.supersetSSLCaCertificate).toBe('');
  const prefect = formValuesFromService({
    id: 'p1',
    name: 'pf',
    kind: 'pipeline',
    serviceType: 'Prefect',
    connection: { config: { type: 'Prefect', verifySSL: 'ignore' } },
  });
  expect(prefect.verifySSL).toBe('ignore');
});

it('ignores a stray Dagster form.password instead of sending it as the token (W2-5 condition 10)', () => {
  const connection = buildServiceConnection({
    name: 'dg',
    kind: 'pipeline',
    serviceType: 'Dagster',
    hostPort: 'http://localhost:3000',
    password: 'should-be-ignored',
    dagsterTimeout: 1000,
    storeConnectionSecrets: true,
  });
  expect(connection?.config).not.toHaveProperty('token');
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
    // W2-5 lean-forms tier 2: spec defaults
    // (ADR:2026-11-08-leanforms-tier2-form-defaults).
    expect(form.saslMechanism).toBe('PLAIN');
    expect(form.verifySSL).toBe('no-ssl');
    expect(form.schemaRegistryTopicSuffixName).toBe('-value');
  });
});

describe('lean-forms tier 3A (W3-3A)', () => {
  function tier3AForm(overrides: Partial<ServiceFormValues>): ServiceFormValues {
    return { ...createEmptyServiceForm(), ...overrides };
  }

  it('prefills the tier 3A spec defaults (W3-3A)', () => {
    const form = createEmptyServiceForm();
    expect(form.clusterName).toBe('openmetadata');
    expect(form.authProvider).toBe('basic');
    expect(form.secretsManagerProvider).toBe('db');
    expect(form.secretsManagerLoader).toBe('noop');
    expect(form.apiVersion).toBe('v1');
    expect(form.enableVersionValidation).toBe(true);
    expect(form.omStoreServiceConnection).toBe(true);
    expect(form.gcpConfigType).toBe('gcpValues');
    expect(form.impersonateLifetime).toBe(3600);
    expect(form.includeTeamDrives).toBe(true);
    expect(form.includeGoogleSheets).toBe(false);
    expect(form.elasticSearchAuthMode).toBe('basicAuth');
    expect(form.sslCertMode).toBe('paths');
    expect(form.sslStagingDir).toBe('/tmp/openmetadata-certs');
    expect(form.connectionTimeoutSecs).toBe(30);
    expect(form.openAITimeout).toBe(60);
    expect(form.openAIMaxRetries).toBe(3);
    expect(form.discoveryMethod).toBe('ConfigFile');
    expect(form.initializationTimeout).toBe(60);
    expect(form.fetchTools).toBe(true);
    expect(form.fetchResources).toBe(true);
    expect(form.fetchPrompts).toBe(true);
    // The Mcp connectionTimeout default (30) is NOT prefilled: the form key
    // is shared with Databricks (spec default 120) — the Mcp default
    // applies on the read side and via the server default on create.
    expect(form.connectionTimeout).toBeUndefined();
  });

  it('builds the Rest A-group payload 1:1 (docURL + verifySSL + sslConfig)', () => {
    expect(
      buildServiceConnection(
        tier3AForm({
          kind: 'api',
          serviceType: 'Rest',
          openApiSchemaUrl: 'https://example.com/openapi.json',
          apiKey: '${REST_TOKEN}',
          docURL: 'https://example.com/docs',
          storeConnectionSecrets: true,
          restSSLCaCertificate: '---CA---',
          restSSLCertificate: '---CERT---',
          restSSLKey: '---KEY---',
        }),
      ),
    ).toEqual({
      config: {
        type: 'Rest',
        openAPISchemaConnection: { openAPISchemaURL: 'https://example.com/openapi.json' },
        token: '${REST_TOKEN}',
        docURL: 'https://example.com/docs',
        verifySSL: 'no-ssl',
        sslConfig: { caCertificate: '---CA---', sslCertificate: '---CERT---', sslKey: '---KEY---' },
      },
    });
  });

  it('builds the OpenMetadata A-group payload 1:1 (12 items, spec order)', () => {
    expect(
      buildServiceConnection(
        tier3AForm({
          kind: 'metadata',
          serviceType: 'OpenMetadata',
          hostPort: 'http://localhost:8585/api',
          storeConnectionSecrets: true,
          jwtToken: 'om-jwt',
          extraHeaders: '{"X-Tenant": "acme"}',
          openMetadataSSLCaCertificate: '---CA---',
          openMetadataSSLCertificate: '---CERT---',
          openMetadataSSLKey: '---KEY---',
        }),
      ),
    ).toEqual({
      config: {
        type: 'OpenMetadata',
        clusterName: 'openmetadata',
        hostPort: 'http://localhost:8585/api',
        authProvider: 'basic',
        verifySSL: 'no-ssl',
        sslConfig: { caCertificate: '---CA---', sslCertificate: '---CERT---', sslKey: '---KEY---' },
        securityConfig: { jwtToken: 'om-jwt' },
        secretsManagerProvider: 'db',
        secretsManagerLoader: 'noop',
        apiVersion: 'v1',
        enableVersionValidation: true,
        storeServiceConnection: true,
        extraHeaders: { 'X-Tenant': 'acme' },
      },
    });
  });

  it('builds the GoogleDrive payload 1:1 with the gcpConfig wrapper + impersonate block', () => {
    expect(
      buildServiceConnection(
        tier3AForm({
          kind: 'drive',
          serviceType: 'GoogleDrive',
          credentialsJson:
            '{"type": "service_account", "project_id": "p1", "private_key": "---KEY---", "client_email": "svc@p1.iam.gserviceaccount.com"}',
          impersonateServiceAccount: 'target@example.com',
          impersonateLifetime: 1800,
          delegatedEmail: 'user@example.com',
          driveId: 'drive-1',
          connectionOptions: '{"opt": "v"}',
          connectionArguments: '{"arg": "w"}',
        }),
      ),
    ).toEqual({
      config: {
        type: 'GoogleDrive',
        credentials: {
          gcpConfig: {
            type: 'service_account',
            project_id: 'p1',
            private_key: '---KEY---',
            client_email: 'svc@p1.iam.gserviceaccount.com',
          },
          gcpImpersonateServiceAccount: {
            impersonateServiceAccount: 'target@example.com',
            lifetime: 1800,
          },
        },
        delegatedEmail: 'user@example.com',
        driveId: 'drive-1',
        includeTeamDrives: true,
        includeGoogleSheets: false,
        connectionOptions: { opt: 'v' },
        connectionArguments: { arg: 'w' },
      },
    });
    // Path and ADC branches emit only their branch object.
    expect(
      buildServiceConnection(
        tier3AForm({
          kind: 'drive',
          serviceType: 'GoogleDrive',
          gcpConfigType: 'gcpCredentialsPath',
          gcpCredentialsPath: '/etc/gcp/creds.json',
        }),
      )?.config?.credentials,
    ).toEqual({ gcpConfig: { type: 'gcp_credential_path', path: '/etc/gcp/creds.json' } });
    expect(
      buildServiceConnection(
        tier3AForm({ kind: 'drive', serviceType: 'GoogleDrive', gcpConfigType: 'gcpADC' }),
      )?.config?.credentials,
    ).toEqual({ gcpConfig: { type: 'gcp_adc' } });
    expect(
      buildServiceConnection(
        tier3AForm({
          kind: 'drive',
          serviceType: 'GoogleDrive',
          gcpConfigType: 'gcpExternalAccount',
          gcpExternalAccountJson: '{"type": "external_account", "audience": "//iam.googleapis.com/projects/1/locations/global/workloadIdentityPools/p/providers/p"}',
        }),
      )?.config?.credentials,
    ).toEqual({
      gcpConfig: {
        type: 'external_account',
        audience: '//iam.googleapis.com/projects/1/locations/global/workloadIdentityPools/p/providers/p',
      },
    });
  });

  it('builds the ElasticSearch apiAuth + ssl values payload 1:1', () => {
    expect(
      buildServiceConnection(
        tier3AForm({
          kind: 'search',
          serviceType: 'ElasticSearch',
          hostPort: 'http://localhost:9200',
          elasticSearchAuthMode: 'apiAuth',
          apiKey: '${ES_API_KEY}',
          apiKeyId: 'key-1',
          sslCertMode: 'values',
          sslCaCertValue: '---CA---',
          sslClientCertValue: '---CERT---',
          sslPrivateKeyValue: '---KEY---',
          connectionArguments: '{"a": "b"}',
          // Literal secret leaves persist only with storeConnectionSecrets.
          storeConnectionSecrets: true,
        }),
      ),
    ).toEqual({
      config: {
        type: 'ElasticSearch',
        hostPort: 'http://localhost:9200',
        authType: { apiKey: '${ES_API_KEY}', apiKeyId: 'key-1' },
        sslConfig: {
          certificates: {
            caCertValue: '---CA---',
            clientCertValue: '---CERT---',
            privateKeyValue: '---KEY---',
            stagingDir: '/tmp/openmetadata-certs',
          },
        },
        connectionTimeoutSecs: 30,
        connectionArguments: { a: 'b' },
      },
    });
  });

  it('builds the ElasticSearch basicAuth + ssl paths payload 1:1', () => {
    expect(
      buildServiceConnection(
        tier3AForm({
          kind: 'search',
          serviceType: 'ElasticSearch',
          hostPort: 'http://localhost:9200',
          elasticSearchAuthMode: 'basicAuth',
          username: 'elastic',
          password: '${ES_PASSWORD}',
          sslCaCertPath: '/certs/ca.pem',
          sslClientCertPath: '/certs/client.pem',
          sslPrivateKeyPath: '/certs/key.pem',
        }),
      ),
    ).toEqual({
      config: {
        type: 'ElasticSearch',
        hostPort: 'http://localhost:9200',
        authType: { username: 'elastic', password: '${ES_PASSWORD}' },
        sslConfig: {
          certificates: {
            caCertPath: '/certs/ca.pem',
            clientCertPath: '/certs/client.pem',
            privateKeyPath: '/certs/key.pem',
          },
        },
        connectionTimeoutSecs: 30,
      },
    });
  });

  it('builds the OpenAI payload 1:1 (timeout + maxRetries)', () => {
    expect(
      buildServiceConnection(
        tier3AForm({
          kind: 'llm',
          serviceType: 'OpenAI',
          apiKey: '${OPENAI_API_KEY}',
          organization: 'org-1',
          baseUrl: 'https://api.openai.com/v1',
        }),
      ),
    ).toEqual({
      config: {
        type: 'OpenAI',
        apiKey: '${OPENAI_API_KEY}',
        organization: 'org-1',
        baseURL: 'https://api.openai.com/v1',
        timeout: 60,
        maxRetries: 3,
      },
    });
  });

  it('builds the Mcp payload 1:1 (no connectionTimeout on create — server default 30 applies)', () => {
    expect(
      buildServiceConnection(
        tier3AForm({
          kind: 'mcp',
          serviceType: 'Mcp',
          configFilePaths: '["/etc/mcp/claude.json", "/etc/mcp/vscode.json"]',
          servers:
            '[{"name": "s1", "url": "https://s1.example.com", "apiKey": "k1"}, {"name": "s2", "url": "https://s2.example.com"}]',
          registryUrl: 'https://registry.example.com',
          storeConnectionSecrets: true,
        }),
      ),
    ).toEqual({
      config: {
        type: 'Mcp',
        discoveryMethod: 'ConfigFile',
        configFilePaths: ['/etc/mcp/claude.json', '/etc/mcp/vscode.json'],
        servers: [
          { name: 's1', url: 'https://s1.example.com', apiKey: 'k1' },
          { name: 's2', url: 'https://s2.example.com' },
        ],
        registryUrl: 'https://registry.example.com',
        initializationTimeout: 60,
        fetchTools: true,
        fetchResources: true,
        fetchPrompts: true,
      },
    });
  });

  it('round-trips the tier 3A fields from stored services', () => {
    const om = formValuesFromService({
      id: 'om1',
      name: 'meta',
      kind: 'metadata',
      serviceType: 'OpenMetadata',
      connection: {
        config: {
          type: 'OpenMetadata',
          hostPort: 'http://localhost:8585/api',
          clusterName: 'prod',
          authProvider: 'azure',
          verifySSL: 'validate',
          securityConfig: { jwtToken: '********' },
          secretsManagerProvider: 'aws',
          secretsManagerLoader: 'env',
          apiVersion: 'v2',
          enableVersionValidation: false,
          storeServiceConnection: false,
          extraHeaders: { 'X-Tenant': 'acme' },
          sslConfig: { caCertificate: '********', sslCertificate: '********', sslKey: '********' },
        },
      },
    });
    expect(om.clusterName).toBe('prod');
    expect(om.authProvider).toBe('azure');
    expect(om.verifySSL).toBe('validate');
    expect(om.jwtToken).toBe('');
    expect(om.secretsManagerProvider).toBe('aws');
    expect(om.secretsManagerLoader).toBe('env');
    expect(om.apiVersion).toBe('v2');
    expect(om.enableVersionValidation).toBe(false);
    expect(om.omStoreServiceConnection).toBe(false);
    expect(om.extraHeaders).toBe('{"X-Tenant":"acme"}');
    expect(om.openMetadataSSLCaCertificate).toBe('');
    // Spec defaults apply when the stored config omits the field.
    const bareOm = formValuesFromService({
      id: 'om2',
      name: 'meta2',
      kind: 'metadata',
      serviceType: 'OpenMetadata',
      connection: { config: { type: 'OpenMetadata' } },
    });
    expect(bareOm.clusterName).toBe('openmetadata');
    expect(bareOm.authProvider).toBe('basic');
    expect(bareOm.verifySSL).toBe('no-ssl');
    expect(bareOm.secretsManagerProvider).toBe('db');
    expect(bareOm.secretsManagerLoader).toBe('noop');
    expect(bareOm.apiVersion).toBe('v1');
    expect(bareOm.enableVersionValidation).toBe(true);
    expect(bareOm.omStoreServiceConnection).toBe(true);

    const es = formValuesFromService({
      id: 'es1',
      name: 'es',
      kind: 'search',
      serviceType: 'ElasticSearch',
      connection: {
        config: {
          type: 'ElasticSearch',
          hostPort: 'http://localhost:9200',
          authType: { apiKey: '********', apiKeyId: 'key-1' },
          sslConfig: {
            certificates: {
              caCertValue: '********',
              clientCertValue: '********',
              privateKeyValue: '********',
              stagingDir: '/certs',
            },
          },
          connectionTimeoutSecs: 45,
          connectionArguments: { a: 'b' },
        },
      },
    });
    expect(es.elasticSearchAuthMode).toBe('apiAuth');
    expect(es.apiKey).toBe('');
    expect(es.apiKeyId).toBe('key-1');
    expect(es.sslCertMode).toBe('values');
    expect(es.sslCaCertValue).toBe('');
    expect(es.sslStagingDir).toBe('/certs');
    expect(es.connectionTimeoutSecs).toBe(45);
    expect(es.connectionArguments).toBe('{"a":"b"}');

    const mcp = formValuesFromService({
      id: 'mcp1',
      name: 'mcp',
      kind: 'mcp',
      serviceType: 'Mcp',
      connection: {
        config: {
          type: 'Mcp',
          discoveryMethod: 'DirectConnection',
          configFilePaths: ['/etc/mcp/a.json'],
          servers: [
            { name: 's1', url: 'https://s1.example.com', apiKey: '********' },
            { name: 's2', url: 'https://s2.example.com', apiKey: '********' },
          ],
          registryUrl: 'https://registry.example.com',
          connectionTimeout: 45,
          initializationTimeout: 90,
          fetchTools: false,
          fetchResources: true,
          fetchPrompts: false,
        },
      },
    });
    expect(mcp.discoveryMethod).toBe('DirectConnection');
    expect(mcp.configFilePaths).toBe('["/etc/mcp/a.json"]');
    expect(mcp.servers).toBe(
      '[{"name":"s1","url":"https://s1.example.com","apiKey":"********"},{"name":"s2","url":"https://s2.example.com","apiKey":"********"}]',
    );
    expect(mcp.connectionTimeout).toBe(45);
    expect(mcp.initializationTimeout).toBe(90);
    expect(mcp.fetchTools).toBe(false);
    expect(mcp.fetchResources).toBe(true);
    expect(mcp.fetchPrompts).toBe(false);
    const bareMcp = formValuesFromService({
      id: 'mcp2',
      name: 'mcp2',
      kind: 'mcp',
      serviceType: 'Mcp',
      connection: { config: { type: 'Mcp' } },
    });
    expect(bareMcp.discoveryMethod).toBe('ConfigFile');
    expect(bareMcp.connectionTimeout).toBe(30);
    expect(bareMcp.initializationTimeout).toBe(60);
    expect(bareMcp.fetchTools).toBe(true);
    expect(bareMcp.fetchResources).toBe(true);
    expect(bareMcp.fetchPrompts).toBe(true);
    // The shared connectionTimeout key keeps Databricks behaviour: no Mcp
    // default leaks into a Databricks refill.
    const bareDatabricks = formValuesFromService({
      id: 'dbx1',
      name: 'dbx',
      kind: 'database',
      serviceType: 'Databricks',
      connection: { config: { type: 'Databricks' } },
    });
    expect(bareDatabricks.connectionTimeout).toBeUndefined();

    const drive = formValuesFromService({
      id: 'd1',
      name: 'drive',
      kind: 'drive',
      serviceType: 'GoogleDrive',
      connection: {
        config: {
          type: 'GoogleDrive',
          credentials: {
            gcpConfig: { type: 'gcp_credential_path', path: '/etc/gcp/creds.json' },
            gcpImpersonateServiceAccount: {
              impersonateServiceAccount: 'target@example.com',
              lifetime: 1800,
            },
          },
          delegatedEmail: 'user@example.com',
          driveId: 'drive-1',
          includeTeamDrives: false,
          includeGoogleSheets: true,
        },
      },
    });
    expect(drive.gcpConfigType).toBe('gcpCredentialsPath');
    expect(drive.gcpCredentialsPath).toBe('/etc/gcp/creds.json');
    expect(drive.credentialsJson).toBe('');
    expect(drive.impersonateServiceAccount).toBe('target@example.com');
    expect(drive.impersonateLifetime).toBe(1800);
    expect(drive.includeTeamDrives).toBe(false);
    expect(drive.includeGoogleSheets).toBe(true);
    // Legacy bare credentials infer the values branch; the JSON stays blank.
    const legacy = formValuesFromService({
      id: 'd2',
      name: 'drive2',
      kind: 'drive',
      serviceType: 'GoogleDrive',
      connection: {
        config: {
          type: 'GoogleDrive',
          credentials: { type: 'service_account', project_id: 'p1', private_key: '---KEY---' },
        },
      },
    });
    expect(legacy.gcpConfigType).toBe('gcpValues');
    expect(legacy.credentialsJson).toBe('');

    const rest = formValuesFromService({
      id: 'r1',
      name: 'rest',
      kind: 'api',
      serviceType: 'Rest',
      connection: {
        config: {
          type: 'Rest',
          openAPISchemaConnection: { openAPISchemaURL: 'https://example.com/openapi.json' },
          token: '********',
          docURL: 'https://example.com/docs',
          verifySSL: 'validate',
          sslConfig: { caCertificate: '********' },
        },
      },
    });
    expect(rest.openApiSchemaUrl).toBe('https://example.com/openapi.json');
    expect(rest.apiKey).toBe('');
    expect(rest.docURL).toBe('https://example.com/docs');
    expect(rest.verifySSL).toBe('validate');
    expect(rest.restSSLCaCertificate).toBe('');

    const openai = formValuesFromService({
      id: 'o1',
      name: 'llm',
      kind: 'llm',
      serviceType: 'OpenAI',
      connection: {
        config: {
          type: 'OpenAI',
          apiKey: '********',
          organization: 'org-1',
          baseURL: 'https://x.example.com/v1',
          timeout: 120,
          maxRetries: 5,
        },
      },
    });
    expect(openai.apiKey).toBe('');
    expect(openai.organization).toBe('org-1');
    expect(openai.baseUrl).toBe('https://x.example.com/v1');
    expect(openai.openAITimeout).toBe(120);
    expect(openai.openAIMaxRetries).toBe(5);
    const bareOpenai = formValuesFromService({
      id: 'o2',
      name: 'llm2',
      kind: 'llm',
      serviceType: 'OpenAI',
      connection: { config: { type: 'OpenAI' } },
    });
    expect(bareOpenai.openAITimeout).toBe(60);
    expect(bareOpenai.openAIMaxRetries).toBe(3);

    // Mlflow registryUri refills in plaintext: it is the registry address,
    // not a pure secret.
    const mlflow = formValuesFromService({
      id: 'm1',
      name: 'ml',
      kind: 'mlmodel',
      serviceType: 'Mlflow',
      connection: {
        config: {
          type: 'Mlflow',
          trackingUri: 'http://localhost:5000',
          registryUri: 'mysql+pymysql://mlflow:password@localhost:3306/mlflow',
        },
      },
    });
    expect(mlflow.trackingUri).toBe('http://localhost:5000');
    expect(mlflow.registryUri).toBe('mysql+pymysql://mlflow:password@localhost:3306/mlflow');
  });

  it('redacts the tier 3A secrets for display JSON', () => {
    const om = redactConnectionForDisplay({
      config: {
        type: 'OpenMetadata',
        securityConfig: { jwtToken: 'om-jwt' },
        sslConfig: { caCertificate: '---CA---', sslCertificate: '---CERT---', sslKey: '---KEY---' },
      },
    });
    expect(om?.config?.securityConfig).toEqual({ jwtToken: '********' });
    expect(om?.config?.sslConfig).toEqual({
      caCertificate: '********',
      sslCertificate: '********',
      sslKey: '********',
    });
    const drive = redactConnectionForDisplay({
      config: {
        type: 'GoogleDrive',
        credentials: { gcpConfig: { type: 'service_account', private_key: '---KEY---' } },
      },
    });
    expect(drive?.config?.credentials).toBe('********');
    const mcp = redactConnectionForDisplay({
      config: {
        type: 'Mcp',
        servers: [
          { name: 's1', url: 'https://s1.example.com', apiKey: 'k1' },
          { name: 's2', url: 'https://s2.example.com', apiKey: 'k2' },
        ],
      },
    });
    expect(mcp?.config?.servers).toEqual([
      { name: 's1', url: 'https://s1.example.com', apiKey: '********' },
      { name: 's2', url: 'https://s2.example.com', apiKey: '********' },
    ]);
    const es = redactConnectionForDisplay({
      config: {
        type: 'ElasticSearch',
        authType: { apiKey: 'es-key', apiKeyId: 'key-1' },
        sslConfig: {
          certificates: {
            caCertValue: '---CA---',
            clientCertValue: '---CERT---',
            privateKeyValue: '---KEY---',
            stagingDir: '/tmp/openmetadata-certs',
          },
        },
      },
    });
    expect(es?.config?.authType).toEqual({ apiKey: '********', apiKeyId: 'key-1' });
    expect(es?.config?.sslConfig).toEqual({
      certificates: {
        caCertValue: '********',
        clientCertValue: '********',
        privateKeyValue: '********',
        stagingDir: '/tmp/openmetadata-certs',
      },
    });
    // Certificate paths are not secrets and stay visible.
    const esPaths = redactConnectionForDisplay({
      config: {
        type: 'ElasticSearch',
        sslConfig: { certificates: { caCertPath: '/certs/ca.pem' } },
      },
    });
    expect(esPaths?.config?.sslConfig).toEqual({ certificates: { caCertPath: '/certs/ca.pem' } });
  });

  it('keeps an OpenMetadata JWT on edit-save without retyping it', () => {
    const kept = buildServiceConnection(
      tier3AForm({ kind: 'metadata', serviceType: 'OpenMetadata', hostPort: 'http://localhost:8585/api' }),
      {
        config: {
          type: 'OpenMetadata',
          hostPort: 'http://localhost:8585/api',
          securityConfig: { jwtToken: '********' },
        },
      },
    );
    expect(kept?.config?.securityConfig).toEqual({ jwtToken: '********' });
  });

  it('keeps Mcp server apiKeys on edit-save without retyping them, and drops a renamed one', () => {
    const kept = buildServiceConnection(
      tier3AForm({
        kind: 'mcp',
        serviceType: 'Mcp',
        servers:
          '[{"name": "s1", "url": "https://s1.example.com", "apiKey": "********"}, {"name": "s2", "url": "https://s2.example.com", "apiKey": "********"}]',
      }),
      {
        config: {
          type: 'Mcp',
          servers: [
            { name: 's1', url: 'https://s1.example.com', apiKey: '********' },
            { name: 's2', url: 'https://s2.example.com', apiKey: '********' },
          ],
        },
      },
    );
    expect(kept?.config?.servers).toEqual([
      { name: 's1', url: 'https://s1.example.com', apiKey: '********' },
      { name: 's2', url: 'https://s2.example.com', apiKey: '********' },
    ]);
    // Rename: the masked apiKey has no name match, so it is omitted —
    // never stored as the literal mask.
    const renamed = buildServiceConnection(
      tier3AForm({
        kind: 'mcp',
        serviceType: 'Mcp',
        servers: '[{"name": "s1-renamed", "url": "https://s1.example.com", "apiKey": "********"}]',
      }),
      {
        config: {
          type: 'Mcp',
          servers: [{ name: 's1', url: 'https://s1.example.com', apiKey: '********' }],
        },
      },
    );
    expect(renamed?.config?.servers).toEqual([
      { name: 's1-renamed', url: 'https://s1.example.com' },
    ]);
    // Retype: a fresh literal with storeConnectionSecrets replaces the old one.
    const retyped = buildServiceConnection(
      tier3AForm({
        kind: 'mcp',
        serviceType: 'Mcp',
        servers: '[{"name": "s1", "url": "https://s1.example.com", "apiKey": "new-key"}]',
        storeConnectionSecrets: true,
      }),
      {
        config: {
          type: 'Mcp',
          servers: [{ name: 's1', url: 'https://s1.example.com', apiKey: '********' }],
        },
      },
    );
    expect(retyped?.config?.servers).toEqual([
      { name: 's1', url: 'https://s1.example.com', apiKey: 'new-key' },
    ]);
  });

  it('keeps an ElasticSearch apiKey on edit-save without retyping it', () => {
    const kept = buildServiceConnection(
      tier3AForm({
        kind: 'search',
        serviceType: 'ElasticSearch',
        hostPort: 'http://localhost:9200',
        elasticSearchAuthMode: 'apiAuth',
        apiKeyId: 'key-1',
      }),
      {
        config: {
          type: 'ElasticSearch',
          hostPort: 'http://localhost:9200',
          authType: { apiKey: '********', apiKeyId: 'key-1' },
        },
      },
    );
    expect(kept?.config?.authType).toEqual({ apiKey: '********', apiKeyId: 'key-1' });
    const retyped = buildServiceConnection(
      tier3AForm({
        kind: 'search',
        serviceType: 'ElasticSearch',
        hostPort: 'http://localhost:9200',
        elasticSearchAuthMode: 'apiAuth',
        apiKey: 'new-es-key',
        storeConnectionSecrets: true,
      }),
      { config: { type: 'ElasticSearch', authType: { apiKey: '********' } } },
    );
    expect(retyped?.config?.authType).toEqual({ apiKey: 'new-es-key' });
    // basicAuth password retention still works after the ES/Ranger split.
    const basicKept = buildServiceConnection(
      tier3AForm({
        kind: 'search',
        serviceType: 'ElasticSearch',
        hostPort: 'http://localhost:9200',
        elasticSearchAuthMode: 'basicAuth',
        username: 'elastic',
      }),
      {
        config: {
          type: 'ElasticSearch',
          authType: { username: 'elastic', password: '********' },
        },
      },
    );
    expect(basicKept?.config?.authType).toEqual({ username: 'elastic', password: '********' });
  });

  it('keeps GoogleDrive credentials on edit-save with a blank textarea, and re-wraps legacy bare JSON', () => {
    const kept = buildServiceConnection(tier3AForm({ kind: 'drive', serviceType: 'GoogleDrive' }), {
      config: {
        type: 'GoogleDrive',
        credentials: { gcpConfig: { type: 'service_account', project_id: 'p1' } },
      },
    });
    expect(kept?.config?.credentials).toEqual({
      gcpConfig: { type: 'service_account', project_id: 'p1' },
    });
    const rewrapped = buildServiceConnection(tier3AForm({ kind: 'drive', serviceType: 'GoogleDrive' }), {
      config: {
        type: 'GoogleDrive',
        credentials: { type: 'service_account', project_id: 'p1', private_key: '---KEY---' },
      },
    });
    expect(rewrapped?.config?.credentials).toEqual({
      gcpConfig: { type: 'service_account', project_id: 'p1', private_key: '---KEY---' },
    });
    // A stored path-branch projectId survives an edit-save (opaque: the
    // form has no projectId field for the path/ADC branches).
    const pathKept = buildServiceConnection(
      tier3AForm({
        kind: 'drive',
        serviceType: 'GoogleDrive',
        gcpConfigType: 'gcpCredentialsPath',
        gcpCredentialsPath: '/etc/gcp/creds.json',
      }),
      {
        config: {
          type: 'GoogleDrive',
          credentials: {
            gcpConfig: { type: 'gcp_credential_path', path: '/old/path.json', projectId: 'p1' },
          },
        },
      },
    );
    expect(pathKept?.config?.credentials).toEqual({
      gcpConfig: { type: 'gcp_credential_path', path: '/etc/gcp/creds.json', projectId: 'p1' },
    });
  });

  it('throws on invalid JSON in the tier 3A textarea fields', () => {
    expect(() =>
      buildServiceConnection(
        tier3AForm({
          kind: 'metadata',
          serviceType: 'OpenMetadata',
          hostPort: 'http://localhost:8585/api',
          extraHeaders: 'not-json',
        }),
      ),
    ).toThrow('valid JSON');
    expect(() =>
      buildServiceConnection(
        tier3AForm({
          kind: 'metadata',
          serviceType: 'OpenMetadata',
          hostPort: 'http://localhost:8585/api',
          extraHeaders: '{"a": 1}',
        }),
      ),
    ).toThrow('values must be strings');
    expect(() =>
      buildServiceConnection(
        tier3AForm({ kind: 'mcp', serviceType: 'Mcp', servers: 'not-json' }),
      ),
    ).toThrow('valid JSON');
    expect(() =>
      buildServiceConnection(tier3AForm({ kind: 'mcp', serviceType: 'Mcp', servers: '["s1"]' })),
    ).toThrow('objects');
    expect(() =>
      buildServiceConnection(
        tier3AForm({ kind: 'mcp', serviceType: 'Mcp', configFilePaths: '{"a": 1}' }),
      ),
    ).toThrow('must be a JSON array');
    expect(() =>
      buildServiceConnection(
        tier3AForm({ kind: 'mcp', serviceType: 'Mcp', configFilePaths: '[1, 2]' }),
      ),
    ).toThrow('strings');
    expect(() =>
      buildServiceConnection(
        tier3AForm({
          kind: 'drive',
          serviceType: 'GoogleDrive',
          gcpConfigType: 'gcpExternalAccount',
          gcpExternalAccountJson: 'not-json',
        }),
      ),
    ).toThrow('valid JSON');
    expect(() =>
      buildServiceConnection(
        tier3AForm({
          kind: 'drive',
          serviceType: 'GoogleDrive',
          connectionOptions: '{"a": 1}',
        }),
      ),
    ).toThrow('values must be strings');
    expect(() =>
      buildServiceConnection(
        tier3AForm({
          kind: 'search',
          serviceType: 'ElasticSearch',
          hostPort: 'http://localhost:9200',
          connectionArguments: 'not-json',
        }),
      ),
    ).toThrow('valid JSON');
  });
});
