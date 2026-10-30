/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { redactConnectionForDisplay } from '@/ingestion/connections';
import { isEnvPlaceholder, isMaskedSecret } from '@/ingestion/secrets';
import type { CatalogService, IngestionPipeline, SupportedServiceType } from '@/types/ingestion';
import { CLI_SOURCE_BY_SERVICE_TYPE } from '@/types/ingestion';

const DEFAULT_PASSWORD_ENV: Record<string, string> = {
  postgres: '${PG_PASSWORD}',
  mysql: '${MYSQL_PASSWORD}',
  snowflake: '${SNOWFLAKE_PASSWORD}',
  kafka: '${KAFKA_REST_PASSWORD}',
  databricks: '${DATABRICKS_TOKEN}',
  unitycatalog: '${DATABRICKS_TOKEN}',
  doris: '${DORIS_PASSWORD}',
  mssql: '${MSSQL_PASSWORD}',
};

function yamlScalar(value: string): string {
  if (value === '') {
    return "''";
  }
  if (/[:#\n'"{}[\],&*?|<>=!%@`]/.test(value) || value.startsWith(' ') || value.endsWith(' ')) {
    return JSON.stringify(value);
  }
  return value;
}

function yamlLine(indent: number, key: string, value: string | number | boolean | undefined): string {
  if (value === undefined || value === '') {
    return '';
  }
  const rendered = typeof value === 'string' ? yamlScalar(value) : String(value);
  return `${' '.repeat(indent)}${key}: ${rendered}\n`;
}

function connectionBlock(service: CatalogService, sourceType: string): string {
  const config = redactConnectionForDisplay(service.connection)?.config ?? {};
  let out = '  connection:\n';
  const write = (key: string, value: unknown) => {
    if (typeof value === 'string' && value && !isMaskedSecret(value)) {
      out += yamlLine(4, key, value);
    }
  };
  write('hostPort', config.hostPort);
  write('username', config.username);
  write('database', config.database);
  write('databaseName', config.databaseName);
  write('databaseSchema', config.databaseSchema);
  write('account', config.account);
  write('warehouse', config.warehouse);
  write('role', config.role);
  write('bootstrapServers', config.bootstrapServers);
  write('schemaRegistryURL', config.schemaRegistryURL);
  write('httpPath', config.httpPath);
  write('catalog', config.catalog);
  write('queryHistoryTable', config.queryHistoryTable);
  write('scheme', config.scheme);
  write('driver', config.driver);
  if (typeof config.includeMetricViews === 'boolean') {
    out += yamlLine(4, 'includeMetricViews', config.includeMetricViews);
  }
  if (typeof config.encrypt === 'boolean') {
    out += yamlLine(4, 'encrypt', config.encrypt);
  }
  if (typeof config.trustServerCertificate === 'boolean') {
    out += yamlLine(4, 'trustServerCertificate', config.trustServerCertificate);
  }
  if (typeof config.ingestAllDatabases === 'boolean') {
    out += yamlLine(4, 'ingestAllDatabases', config.ingestAllDatabases);
  }
  if (typeof config.includeSynonyms === 'boolean') {
    out += yamlLine(4, 'includeSynonyms', config.includeSynonyms);
  }
  if (sourceType === 'kafka') {
    out += yamlLine(4, 'restProxyUrl', '${KAFKA_REST_PROXY_URL:-http://localhost:8082}');
  }
  if (sourceType === 'databricks' || sourceType === 'unitycatalog') {
    const auth = config.authType;
    const tokenStored =
      typeof auth === 'object' && auth && typeof auth.token === 'string' ? auth.token : '';
    const token = isEnvPlaceholder(tokenStored) ? tokenStored : DEFAULT_PASSWORD_ENV[sourceType];
    if (token) {
      out += '    authType:\n';
      out += yamlLine(6, 'token', token);
    }
    return out;
  }
  const stored =
    (typeof config.authType === 'object' && config.authType && 'password' in config.authType
      ? String((config.authType as { password?: string }).password ?? '')
      : '') || (typeof config.password === 'string' ? config.password : '');
  const password = isEnvPlaceholder(stored) ? stored : DEFAULT_PASSWORD_ENV[sourceType];
  if (password) {
    out += yamlLine(4, 'password', password);
  }
  return out;
}

function includeList(values: string[] | undefined, key: string): string {
  if (!values?.length) {
    return '';
  }
  let out = `  ${key}:\n`;
  for (const item of values) {
    out += `    - ${yamlScalar(item)}\n`;
  }
  return out;
}

export function cliSourceType(serviceType: string): string | undefined {
  return CLI_SOURCE_BY_SERVICE_TYPE[serviceType as SupportedServiceType];
}

export function buildCliWorkflowYaml(pipeline: IngestionPipeline, service: CatalogService): string {
  const sourceType = cliSourceType(service.serviceType);
  const config = pipeline.sourceConfig?.config ?? {};
  const header = [
    `# Generated from IngestionPipeline ${pipeline.fullyQualifiedName || pipeline.name}.`,
    '# This catalog entity does not run the job. Deploy/trigger on the server still go through',
    '# the Airflow pipeline-service client (often disabled on a CCL-free dist).',
    '# Run locally:',
    '#   smartmetadata-ingest run --config <this-file.yaml>',
    '# See docs/rebuild/PHASE6.md and docs/rebuild/PHASE7.md.',
    '',
  ].join('\n');

  if (!sourceType) {
    return `${header}# Unsupported serviceType ${service.serviceType} for smartmetadata-ingest.\n`;
  }

  let body = '';
  body += 'workflow:\n';
  body += yamlLine(2, 'name', pipeline.name);
  body += yamlLine(2, 'type', pipeline.pipelineType || 'metadata');
  body += yamlLine(2, 'failFast', false);
  body += '\nserver:\n';
  body += yamlLine(2, 'hostPort', '${OM_API_URL:-http://localhost:8585/api}');
  body += '  auth:\n';
  body += yamlLine(4, 'type', 'jwt');
  body += yamlLine(4, 'jwtToken', '${OM_JWT}');
  body += '\nsource:\n';
  body += yamlLine(2, 'type', sourceType);
  body += yamlLine(2, 'serviceName', service.name);
  body += connectionBlock(service, sourceType);
  if (sourceType !== 'kafka') {
    body += yamlLine(2, 'includeViewLineage', config.includeViews !== false);
    body += includeList(config.schemaFilterPattern?.includes, 'includeSchemas');
  } else {
    body += includeList(config.topicFilterPattern?.includes, 'includeTopics');
  }
  body += yamlLine(2, 'storeConnectionSecrets', false);
  body += '\nsink:\n';
  body += yamlLine(2, 'type', 'metadata-rest');
  return header + body;
}
