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
  redpanda: '${REDPANDA_SASL_PASSWORD}',
  superset: '${SUPERSET_PASSWORD}',
  metabase: '${METABASE_PASSWORD}',
  s3: '${AWS_SECRET_ACCESS_KEY}',
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
  if (sourceType === 'redpanda') {
    write('securityProtocol', config.securityProtocol);
  }
  if (sourceType === 'superset') {
    const nested = config.connection;
    if (nested && typeof nested === 'object') {
      out += '    connection:\n';
      const provider = typeof nested.provider === 'string' ? nested.provider : 'db';
      out += yamlLine(6, 'provider', provider);
      if (typeof nested.username === 'string' && nested.username && !isMaskedSecret(nested.username)) {
        out += yamlLine(6, 'username', nested.username);
      }
      const nestedPwd =
        typeof nested.password === 'string' && isEnvPlaceholder(nested.password)
          ? nested.password
          : DEFAULT_PASSWORD_ENV.superset;
      if (nestedPwd) {
        out += yamlLine(6, 'password', nestedPwd);
      }
    }
    return out;
  }
  if (sourceType === 'metabase') {
    const apiKeyStored = typeof config.apiKey === 'string' ? config.apiKey : '';
    if (apiKeyStored && !isMaskedSecret(apiKeyStored)) {
      const apiKey = isEnvPlaceholder(apiKeyStored) ? apiKeyStored : '${METABASE_API_KEY}';
      out += yamlLine(4, 'apiKey', apiKey);
    }
  }
  if (sourceType === 's3') {
    const aws = config.awsConfig;
    if (aws && typeof aws === 'object') {
      out += '    awsConfig:\n';
      if (typeof aws.awsRegion === 'string' && aws.awsRegion) {
        out += yamlLine(6, 'awsRegion', aws.awsRegion);
      }
      if (typeof aws.awsAccessKeyId === 'string' && aws.awsAccessKeyId && !isMaskedSecret(aws.awsAccessKeyId)) {
        out += yamlLine(6, 'awsAccessKeyId', aws.awsAccessKeyId);
      }
      if (typeof aws.endPointURL === 'string' && aws.endPointURL) {
        out += yamlLine(6, 'endPointURL', aws.endPointURL);
      }
      if (typeof aws.profileName === 'string' && aws.profileName) {
        out += yamlLine(6, 'profileName', aws.profileName);
      }
      const secretStored = typeof aws.awsSecretAccessKey === 'string' ? aws.awsSecretAccessKey : '';
      const secret = isEnvPlaceholder(secretStored) ? secretStored : DEFAULT_PASSWORD_ENV.s3;
      if (secret) {
        out += yamlLine(6, 'awsSecretAccessKey', secret);
      }
    }
    if (Array.isArray(config.bucketNames) && config.bucketNames.length) {
      out += '    bucketNames:\n';
      for (const bucket of config.bucketNames) {
        if (typeof bucket === 'string' && bucket) {
          out += `      - ${yamlScalar(bucket)}\n`;
        }
      }
    }
    write('consoleEndpointURL', config.consoleEndpointURL);
    return out;
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
  if (sourceType === 'kafka' || sourceType === 'redpanda') {
    body += includeList(config.topicFilterPattern?.includes, 'includeTopics');
  } else if (sourceType === 'superset' || sourceType === 'metabase') {
    body += includeList(config.dashboardFilterPattern?.includes, 'includeDashboards');
    body += includeList(config.chartFilterPattern?.includes, 'includeCharts');
  } else if (sourceType === 's3') {
    body += includeList(config.containerFilterPattern?.includes, 'includeContainers');
  } else {
    body += yamlLine(2, 'includeViewLineage', config.includeViews !== false);
    body += includeList(config.schemaFilterPattern?.includes, 'includeSchemas');
  }
  body += yamlLine(2, 'storeConnectionSecrets', false);
  body += '\nsink:\n';
  body += yamlLine(2, 'type', 'metadata-rest');
  return header + body;
}
