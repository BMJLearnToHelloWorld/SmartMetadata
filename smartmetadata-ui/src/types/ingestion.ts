/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { EntityRef } from './api';

export const DATABASE_SERVICE_TYPES = ['Postgres', 'Mysql', 'Snowflake'] as const;
export type DatabaseServiceType = (typeof DATABASE_SERVICE_TYPES)[number];

export const MESSAGING_SERVICE_TYPES = ['Kafka'] as const;
export type MessagingServiceType = (typeof MESSAGING_SERVICE_TYPES)[number];

export const SUPPORTED_SERVICE_TYPES = [...DATABASE_SERVICE_TYPES, ...MESSAGING_SERVICE_TYPES] as const;
export type SupportedServiceType = (typeof SUPPORTED_SERVICE_TYPES)[number];

export type ServiceKind = 'database' | 'messaging';

export const CLI_SOURCE_BY_SERVICE_TYPE: Record<SupportedServiceType, string> = {
  Postgres: 'postgres',
  Mysql: 'mysql',
  Snowflake: 'snowflake',
  Kafka: 'kafka',
};

export const SERVICE_TYPE_BY_CLI_SOURCE: Record<string, SupportedServiceType> = {
  postgres: 'Postgres',
  mysql: 'Mysql',
  snowflake: 'Snowflake',
  kafka: 'Kafka',
};

export const PIPELINE_TYPES = ['metadata'] as const;
export type PipelineType = (typeof PIPELINE_TYPES)[number];

export interface ServiceConnectionConfig {
  type?: string;
  hostPort?: string;
  username?: string;
  database?: string;
  databaseName?: string;
  databaseSchema?: string;
  account?: string;
  warehouse?: string;
  role?: string;
  bootstrapServers?: string;
  schemaRegistryURL?: string;
  authType?: { password?: string };
  password?: string;
  [key: string]: unknown;
}

export interface ServiceConnection {
  config?: ServiceConnectionConfig;
}

export interface CatalogService {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  fullyQualifiedName?: string;
  kind: ServiceKind;
  serviceType: string;
  connection?: ServiceConnection;
}

export interface ServiceFormValues {
  name: string;
  displayName?: string;
  description?: string;
  kind: ServiceKind;
  serviceType: string;
  hostPort?: string;
  username?: string;
  database?: string;
  databaseName?: string;
  databaseSchema?: string;
  account?: string;
  warehouse?: string;
  role?: string;
  bootstrapServers?: string;
  schemaRegistryURL?: string;
  password?: string;
  storeConnectionSecrets?: boolean;
}

export interface CreateDatabaseServiceRequest {
  name: string;
  serviceType: string;
  displayName?: string;
  description?: string;
  connection?: ServiceConnection;
}

export interface CreateMessagingServiceRequest {
  name: string;
  serviceType: string;
  displayName?: string;
  description?: string;
  connection?: ServiceConnection;
}

export interface PipelineSourceConfig {
  config?: {
    type?: string;
    includeViews?: boolean;
    includeTables?: boolean;
    schemaFilterPattern?: { includes?: string[]; excludes?: string[] };
    topicFilterPattern?: { includes?: string[]; excludes?: string[] };
    [key: string]: unknown;
  };
}

export interface AirflowConfig {
  pausePipeline?: boolean;
  scheduleInterval?: string;
  pipelineTimezone?: string;
}

export interface IngestionPipeline {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  fullyQualifiedName?: string;
  pipelineType?: string;
  service?: EntityRef;
  sourceConfig?: PipelineSourceConfig;
  airflowConfig?: AirflowConfig;
  deployed?: boolean;
  enabled?: boolean;
  loggerLevel?: string;
}

export interface CreateIngestionPipelineRequest {
  name: string;
  pipelineType: string;
  service: { id: string; type: string };
  sourceConfig: PipelineSourceConfig;
  airflowConfig: AirflowConfig;
  displayName?: string;
  description?: string;
  loggerLevel?: string;
}

export interface PipelineStatus {
  runId?: string;
  pipelineState?: string;
  startDate?: number;
  timestamp?: number;
  endDate?: number;
  triggeredBy?: string;
}

export interface OrchestratorStatus {
  code?: number;
  platform?: string;
  reason?: string;
}

export interface PipelineFormValues {
  name: string;
  displayName?: string;
  description?: string;
  pipelineType: string;
  serviceId: string;
  serviceKind: ServiceKind;
  includeViews: boolean;
  includeSchemas?: string;
  includeTopics?: string;
  scheduleInterval?: string;
}
