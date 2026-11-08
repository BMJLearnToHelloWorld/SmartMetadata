/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { apiRequest } from './client';
import { asBoolean, asNumber, asRecord, asString } from './json';

/**
 * Limit client mirroring official rest/limitsAPI.ts against the product
 * LimitsResource (@Path /v1/limits — GET /config + GET /features/{name}).
 * The server paths are the yardstick: official UI calls /limits/*, the
 * product server mounts the same resource under /v1/limits.
 *
 * ADR:2026-11-07-metrics-list-permissions-and-limits — limit failures
 * are fail-open (a failed fetch renders the wrapped entry, never blocks
 * it), the opposite of permission failures, which are fail-closed. The
 * two must never be confused: a limit is a quota hint, a permission is
 * an access decision.
 */

export interface LimitFeatureConfig {
  name: string;
  maxVersions: number;
  versionHistory: number;
  limits: { softLimit: number; hardLimit: number };
  disableFields: string[];
  pipelineSchedules?: string[];
}

export interface LimitConfig {
  enable: boolean;
  limits: {
    config: {
      version: string;
      plan: string;
      installationType: string;
      deployment: string;
      companyName: string;
      domain: string;
      instances: number;
      featureLimits: LimitFeatureConfig[];
    };
  };
}

export interface ResourceLimitStatus {
  name: string;
  limitReached: boolean;
  currentCount: number;
  configuredLimit: {
    name: string;
    maxVersions?: number;
    disableFields?: string[];
    disabledFields?: string[];
    limits: { softLimit: number; hardLimit: number };
  };
}

export interface ResourceLimit {
  featureLimitStatuses: ResourceLimitStatus[];
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function mapLimitPair(raw: unknown): { softLimit: number; hardLimit: number } {
  const rec = asRecord(raw) ?? {};
  return {
    softLimit: asNumber(rec.softLimit) ?? 0,
    hardLimit: asNumber(rec.hardLimit) ?? 0,
  };
}

function mapLimitConfig(raw: unknown): LimitConfig {
  const rec = asRecord(raw) ?? {};
  const limits = asRecord(rec.limits) ?? {};
  const config = asRecord(limits.config) ?? {};
  return {
    enable: asBoolean(rec.enable) ?? false,
    limits: {
      config: {
        version: asString(config.version),
        plan: asString(config.plan),
        installationType: asString(config.installationType),
        deployment: asString(config.deployment),
        companyName: asString(config.companyName),
        domain: asString(config.domain),
        instances: asNumber(config.instances) ?? 0,
        featureLimits: Array.isArray(config.featureLimits)
          ? config.featureLimits.flatMap((item) => {
              const f = asRecord(item);
              if (!f) {
                return [];
              }
              return [
                {
                  name: asString(f.name),
                  maxVersions: asNumber(f.maxVersions) ?? 0,
                  versionHistory: asNumber(f.versionHistory) ?? 0,
                  limits: mapLimitPair(f.limits),
                  disableFields: asStringList(f.disableFields),
                  pipelineSchedules: Array.isArray(f.pipelineSchedules)
                    ? asStringList(f.pipelineSchedules)
                    : undefined,
                },
              ];
            })
          : [],
      },
    },
  };
}

function mapResourceLimit(raw: unknown): ResourceLimit {
  const rec = asRecord(raw) ?? {};
  return {
    featureLimitStatuses: Array.isArray(rec.featureLimitStatuses)
      ? rec.featureLimitStatuses.flatMap((item) => {
          const s = asRecord(item);
          if (!s) {
            return [];
          }
          const configured = asRecord(s.configuredLimit) ?? {};
          return [
            {
              name: asString(s.name),
              limitReached: s.limitReached === true,
              currentCount: asNumber(s.currentCount) ?? 0,
              configuredLimit: {
                name: asString(configured.name),
                maxVersions: asNumber(configured.maxVersions),
                disableFields: Array.isArray(configured.disableFields)
                  ? asStringList(configured.disableFields)
                  : undefined,
                disabledFields: Array.isArray(configured.disabledFields)
                  ? asStringList(configured.disabledFields)
                  : undefined,
                limits: mapLimitPair(configured.limits),
              },
            },
          ];
        })
      : [],
  };
}

/** Official getLimitConfig: GET /limits/config. */
export async function getLimitConfig(): Promise<LimitConfig> {
  const payload = await apiRequest<unknown>('/v1/limits/config');
  return mapLimitConfig(payload);
}

/** Official getLimitByResource: GET /limits/features/{resource}. */
export async function getLimitByResource(resource: string): Promise<ResourceLimit> {
  const payload = await apiRequest<unknown>(
    `/v1/limits/features/${encodeURIComponent(resource)}`,
  );
  return mapResourceLimit(payload);
}
