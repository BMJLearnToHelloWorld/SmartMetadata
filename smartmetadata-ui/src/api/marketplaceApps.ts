/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asBoolean, asRecord, asString } from '@/api/json';
import { apiRequest } from './client';

/**
 * Marketplace application definition, mirroring the official
 * AppMarketPlaceDefinition fields the install flow reads: identity,
 * developer, schedule shape, configuration allowance and the default
 * appConfiguration the install payload carries forward.
 */
export interface MarketplaceApp {
  id?: string;
  name: string;
  displayName?: string;
  description?: string;
  fullyQualifiedName?: string;
  developer?: string;
  developerUrl?: string;
  updatedAt?: number;
  appType?: string;
  scheduleType?: string;
  allowConfiguration?: boolean;
  appConfiguration?: unknown;
  supportsIngestionRunner?: boolean;
}

export function mapMarketplaceApp(raw: Record<string, unknown>): MarketplaceApp | null {
  const name = asString(raw.name);
  if (!name) {
    return null;
  }
  return {
    id: asString(raw.id) || undefined,
    name,
    displayName: asString(raw.displayName) || undefined,
    description: asString(raw.description) || undefined,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || undefined,
    developer: asString(raw.developer) || undefined,
    developerUrl: asString(raw.developerUrl) || undefined,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : undefined,
    appType: asString(raw.appType) || undefined,
    scheduleType: asString(raw.scheduleType) || undefined,
    allowConfiguration: asBoolean(raw.allowConfiguration),
    appConfiguration: raw.appConfiguration,
    supportsIngestionRunner: asBoolean(raw.supportsIngestionRunner),
  };
}

/** Official applicationMarketPlaceAPI: GET /v1/apps/marketplace/name/{fqn}. */
export async function getMarketplaceAppByFqn(
  fqn: string,
  fields?: string,
): Promise<MarketplaceApp> {
  const raw = await apiRequest<unknown>(
    `/v1/apps/marketplace/name/${encodeURIComponent(fqn)}`,
    { query: fields ? { fields } : {} },
  );
  const rec = asRecord(raw);
  const mapped = rec ? mapMarketplaceApp(rec) : null;
  if (!mapped) {
    throw new Error('Marketplace app response was missing its name');
  }
  return mapped;
}

export interface EntityReferenceInput {
  id: string;
  type: string;
  name?: string;
  fullyQualifiedName?: string;
}

export interface InstallAppRequest {
  name: string;
  displayName?: string;
  description?: string;
  appConfiguration?: unknown;
  appSchedule?: {
    scheduleTimeline: 'None' | 'Custom';
    cronExpression?: string;
  };
  ingestionRunner?: EntityReferenceInput;
}

/** Official applicationAPI installApplication: POST /v1/apps. */
export function installApp(payload: InstallAppRequest): Promise<unknown> {
  return apiRequest<unknown>('/v1/apps', { json: payload });
}
