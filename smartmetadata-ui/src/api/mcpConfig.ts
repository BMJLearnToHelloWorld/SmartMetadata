/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { apiRequest } from './client';
import { asNumber, asRecord, asString } from './json';

/**
 * Official generated/configuration/mcpConfiguration.ts (pin a3012259ca).
 * The MCP app entity holds no configuration of its own; everything the MCP
 * server reads lives in the `mcpConfiguration` system setting, served by
 * the dedicated endpoints below (not the generic /system/settings ones).
 */
export interface MCPConfiguration {
  allowedOrigins?: string[];
  baseUrl?: string;
  connectTimeout?: number;
  enabled?: boolean;
  maxResponseChars?: number;
  mcpServerName?: string;
  mcpServerVersion?: string;
  originHeaderUri?: string;
  originValidationEnabled?: boolean;
  path?: string;
  readTimeout?: number;
}

export function mapMCPConfiguration(value: unknown): MCPConfiguration {
  const rec = asRecord(value);
  if (!rec) {
    return {};
  }
  return {
    ...(Array.isArray(rec.allowedOrigins)
      ? {
          allowedOrigins: rec.allowedOrigins.filter(
            (origin): origin is string => typeof origin === 'string',
          ),
        }
      : {}),
    ...(asString(rec.baseUrl) ? { baseUrl: asString(rec.baseUrl) } : {}),
    ...(asNumber(rec.connectTimeout) !== undefined
      ? { connectTimeout: asNumber(rec.connectTimeout) }
      : {}),
    ...(typeof rec.enabled === 'boolean' ? { enabled: rec.enabled } : {}),
    ...(asNumber(rec.maxResponseChars) !== undefined
      ? { maxResponseChars: asNumber(rec.maxResponseChars) }
      : {}),
    ...(asString(rec.mcpServerName) ? { mcpServerName: asString(rec.mcpServerName) } : {}),
    ...(asString(rec.mcpServerVersion)
      ? { mcpServerVersion: asString(rec.mcpServerVersion) }
      : {}),
    ...(asString(rec.originHeaderUri)
      ? { originHeaderUri: asString(rec.originHeaderUri) }
      : {}),
    ...(typeof rec.originValidationEnabled === 'boolean'
      ? { originValidationEnabled: rec.originValidationEnabled }
      : {}),
    ...(asString(rec.path) ? { path: asString(rec.path) } : {}),
    ...(asNumber(rec.readTimeout) !== undefined
      ? { readTimeout: asNumber(rec.readTimeout) }
      : {}),
  };
}

/** Official rest/mcpConfigAPI.ts getMcpConfig: GET /v1/system/mcp/config. */
export async function getMcpConfig(): Promise<MCPConfiguration> {
  const raw = await apiRequest<unknown>('/v1/system/mcp/config');
  return mapMCPConfiguration(raw);
}

/**
 * Official rest/mcpConfigAPI.ts updateMcpConfig: PUT /v1/system/mcp/config.
 * The PUT replaces the whole setting, so callers merge the stored config
 * back under the edited fields before calling (pin useMcpConfiguration).
 */
export async function updateMcpConfig(
  config: MCPConfiguration,
): Promise<MCPConfiguration> {
  const raw = await apiRequest<unknown>('/v1/system/mcp/config', {
    method: 'PUT',
    json: config,
  });
  return mapMCPConfiguration(raw);
}
