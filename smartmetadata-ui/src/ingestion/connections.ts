/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { isMaskedSecret, shouldPersistSecret } from '@/ingestion/secrets';
import type {
  CatalogService,
  ServiceConnection,
  ServiceConnectionConfig,
  ServiceFormValues,
  ServiceKind,
} from '@/types/ingestion';
import { DATABASE_SERVICE_TYPES, MESSAGING_SERVICE_TYPES } from '@/types/ingestion';

export function kindForServiceType(serviceType: string): ServiceKind | undefined {
  if ((DATABASE_SERVICE_TYPES as readonly string[]).includes(serviceType)) {
    return 'database';
  }
  if ((MESSAGING_SERVICE_TYPES as readonly string[]).includes(serviceType)) {
    return 'messaging';
  }
  return undefined;
}

export function entityTypeForKind(kind: ServiceKind): string {
  return kind === 'database' ? 'databaseService' : 'messagingService';
}

function pickPassword(config: ServiceConnectionConfig | undefined): string | undefined {
  if (!config) {
    return undefined;
  }
  const auth = config.authType;
  if (auth && typeof auth === 'object' && typeof auth.password === 'string') {
    return auth.password;
  }
  if (typeof config.password === 'string') {
    return config.password;
  }
  return undefined;
}

export function formValuesFromService(service: CatalogService): ServiceFormValues {
  const config = service.connection?.config ?? {};
  return {
    name: service.name,
    displayName: service.displayName,
    description: service.description,
    kind: service.kind,
    serviceType: service.serviceType,
    hostPort: typeof config.hostPort === 'string' ? config.hostPort : '',
    username: typeof config.username === 'string' ? config.username : '',
    database: typeof config.database === 'string' ? config.database : '',
    databaseName: typeof config.databaseName === 'string' ? config.databaseName : '',
    databaseSchema: typeof config.databaseSchema === 'string' ? config.databaseSchema : '',
    account: typeof config.account === 'string' ? config.account : '',
    warehouse: typeof config.warehouse === 'string' ? config.warehouse : '',
    role: typeof config.role === 'string' ? config.role : '',
    bootstrapServers: typeof config.bootstrapServers === 'string' ? config.bootstrapServers : '',
    schemaRegistryURL: typeof config.schemaRegistryURL === 'string' ? config.schemaRegistryURL : '',
    password: '',
    storeConnectionSecrets: false,
  };
}

function applyPassword(
  config: ServiceConnectionConfig,
  form: ServiceFormValues,
  existing?: ServiceConnectionConfig,
): void {
  const typed = form.password?.trim() ?? '';
  if (shouldPersistSecret(typed, Boolean(form.storeConnectionSecrets))) {
    if (form.serviceType === 'Snowflake' || form.serviceType === 'Kafka') {
      config.password = typed;
    } else {
      config.authType = { password: typed };
    }
    return;
  }
  if (typed) {
    return;
  }
  const previous = pickPassword(existing);
  if (previous && isMaskedSecret(previous)) {
    if (form.serviceType === 'Snowflake' || form.serviceType === 'Kafka') {
      config.password = previous;
    } else {
      config.authType = { password: previous };
    }
  }
}

export function buildServiceConnection(
  form: ServiceFormValues,
  existing?: ServiceConnection,
): ServiceConnection | undefined {
  const type = form.serviceType;
  const config: ServiceConnectionConfig = { type };

  if (type === 'Postgres') {
    if (form.hostPort?.trim()) {
      config.hostPort = form.hostPort.trim();
    }
    if (form.username?.trim()) {
      config.username = form.username.trim();
    }
    if (form.database?.trim()) {
      config.database = form.database.trim();
    }
  } else if (type === 'Mysql') {
    if (form.hostPort?.trim()) {
      config.hostPort = form.hostPort.trim();
    }
    if (form.username?.trim()) {
      config.username = form.username.trim();
    }
    if (form.databaseName?.trim()) {
      config.databaseName = form.databaseName.trim();
    }
    if (form.databaseSchema?.trim()) {
      config.databaseSchema = form.databaseSchema.trim();
    }
  } else if (type === 'Snowflake') {
    if (form.username?.trim()) {
      config.username = form.username.trim();
    }
    if (form.account?.trim()) {
      config.account = form.account.trim();
    }
    if (form.warehouse?.trim()) {
      config.warehouse = form.warehouse.trim();
    }
    if (form.database?.trim()) {
      config.database = form.database.trim();
    }
    if (form.role?.trim()) {
      config.role = form.role.trim();
    }
  } else if (type === 'Kafka') {
    if (form.bootstrapServers?.trim()) {
      config.bootstrapServers = form.bootstrapServers.trim();
    }
    if (form.schemaRegistryURL?.trim()) {
      config.schemaRegistryURL = form.schemaRegistryURL.trim();
    }
  } else {
    return existing;
  }

  applyPassword(config, form, existing?.config);
  if (Object.keys(config).length <= 1) {
    return undefined;
  }
  return { config };
}

export function redactConnectionForDisplay(connection?: ServiceConnection): ServiceConnection | undefined {
  if (!connection?.config) {
    return connection;
  }
  const config = { ...connection.config };
  if (config.authType && typeof config.authType === 'object') {
    const auth = { ...config.authType };
    if (typeof auth.password === 'string') {
      auth.password = '********';
    }
    config.authType = auth;
  }
  if (typeof config.password === 'string') {
    config.password = '********';
  }
  if (typeof config.saslPassword === 'string') {
    config.saslPassword = '********';
  }
  if (typeof config.basicAuthUserInfo === 'string') {
    config.basicAuthUserInfo = '********';
  }
  return { config };
}
