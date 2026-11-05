/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asBoolean, asRecord, asString, parsePaged } from '@/api/json';
import type { Paged } from '@/types/admin';
import { apiRequest } from './client';

/**
 * Marketplace application definition, mirroring the official
 * AppMarketPlaceDefinition fields the detail and install flows read:
 * identity, developer, schedule shape, configuration allowance, the
 * default appConfiguration the install payload carries forward, the
 * enabled flag the detail page gates Install on, the support links,
 * and the screenshot asset names (bundled artwork the product does
 * not ship — carried so the field survives the round trip).
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
  enabled?: boolean;
  supportEmail?: string;
  privacyPolicyUrl?: string;
  appScreenshots?: string[];
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
    // asBoolean preserves undefined, so the detail page's
    // `enabled === false` check matches official: a definition without
    // the flag is not treated as disabled.
    enabled: asBoolean(raw.enabled),
    supportEmail: asString(raw.supportEmail) || undefined,
    privacyPolicyUrl: asString(raw.privacyPolicyUrl) || undefined,
    appScreenshots: Array.isArray(raw.appScreenshots)
      ? raw.appScreenshots.filter((item): item is string => typeof item === 'string')
      : undefined,
  };
}

export interface ListMarketplaceAppsQuery {
  limit?: number;
  after?: string;
  before?: string;
}

/**
 * Official applicationMarketPlaceAPI getMarketPlaceApplicationList:
 * GET /v1/apps/marketplace (AppMarketPlaceResource.list, server-side
 * @Path("/v1/apps/marketplace")). This is the installable-app catalog —
 * distinct from the installed-app list (GET /v1/apps) and from the data
 * marketplace overview the product's /marketplace route already serves.
 */
export function listMarketplaceApps(query: ListMarketplaceAppsQuery = {}): Promise<Paged<MarketplaceApp>> {
  return apiRequest<unknown>('/v1/apps/marketplace', {
    query: {
      limit: query.limit ?? 25,
      after: query.after,
      before: query.before,
    },
  }).then((payload) => parsePaged(payload, mapMarketplaceApp));
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
