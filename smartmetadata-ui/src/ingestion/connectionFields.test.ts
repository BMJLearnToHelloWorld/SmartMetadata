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
  hasConnectionForm,
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
    // 18 pre-existing types + the eight kinds' default types (A9).
    expect(types.size).toBe(26);
    for (const type of types) {
      expect(connectionFieldsForType(type).length).toBeGreaterThan(0);
    }
  });

  it('covers the eight previously form-less kinds via their default types, and blocks the rest', () => {
    expect(connectionFieldsForType('Mlflow').map((field) => field.key)).toEqual([
      'trackingUri',
      'registryUri',
      'storeConnectionSecrets',
    ]);
    expect(connectionFieldsForType('OpenMetadata').map((field) => field.key)).toContain('hostPort');
    expect(connectionFieldsForType('GoogleDrive').map((field) => field.key)).toContain('credentialsJson');
    expect(connectionFieldsForType('ElasticSearch').map((field) => field.key)).toContain('hostPort');
    expect(connectionFieldsForType('OpenAI').map((field) => field.key)).toContain('apiKey');
    expect(connectionFieldsForType('Mcp').map((field) => field.key)).toContain('registryUrl');
    expect(connectionFieldsForType('Ranger').map((field) => field.key)).toEqual([
      'hostPort',
      'username',
      'password',
      'storeConnectionSecrets',
    ]);
    expect(connectionFieldsForType('Rest').map((field) => field.key)).toContain('openApiSchemaUrl');
    // Non-default types in those kinds stay form-less: the wizard must
    // block creation for them rather than send an undefined connection.
    for (const type of ['Anthropic', 'Atlas', 'Sftp', 'OpenSearch', 'WEBHOOK', 'SageMaker', 'CustomLLM']) {
      expect(hasConnectionForm(type)).toBe(false);
      expect(connectionFieldsForType(type)).toEqual([]);
    }
    for (const type of ['Mlflow', 'OpenMetadata', 'GoogleDrive', 'ElasticSearch', 'OpenAI', 'Mcp', 'Ranger', 'Rest']) {
      expect(hasConnectionForm(type)).toBe(true);
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

  it('rolls back the UnityCatalog queryHistoryTable invent and mirrors the official field sets', () => {
    // M-Next B3: official unityCatalogConnection.json has no queryHistoryTable
    // (it was copied in from Databricks); official mysqlConnection.json has it.
    const ucKeys = connectionFieldsForType('UnityCatalog').map((field) => field.key);
    expect(ucKeys).not.toContain('queryHistoryTable');
    const mysqlKeys = connectionFieldsForType('Mysql').map((field) => field.key);
    expect(mysqlKeys).toEqual([
      'hostPort',
      'username',
      'databaseName',
      'databaseSchema',
      'queryHistoryTable',
      'password',
      'storeConnectionSecrets',
    ]);
    const databricksKeys = connectionFieldsForType('Databricks').map((field) => field.key);
    expect(databricksKeys).toContain('queryHistoryTable');
    // M-Next B6: official metabaseConnection.json lists password beside apiKey.
    const metabaseKeys = connectionFieldsForType('Metabase').map((field) => field.key);
    expect(metabaseKeys).toEqual(['hostPort', 'username', 'password', 'apiKey']);
    // M-Next B7: Kafka gains the securityProtocol Redpanda already had.
    const kafkaKeys = connectionFieldsForType('Kafka').map((field) => field.key);
    expect(kafkaKeys).toEqual(['bootstrapServers', 'schemaRegistryURL', 'securityProtocol', '']);
    const redpandaKeys = connectionFieldsForType('Redpanda').map((field) => field.key);
    expect(redpandaKeys).toEqual(['bootstrapServers', 'schemaRegistryURL', 'securityProtocol', '']);
    expect(connectionFieldsForType('Kafka').find((field) => field.key === 'securityProtocol')).toEqual(
      connectionFieldsForType('Redpanda').find((field) => field.key === 'securityProtocol'),
    );
  });
});
