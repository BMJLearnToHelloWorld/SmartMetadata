/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asRecord, asString } from '@/api/json';
import type { WorkflowTriggerFieldsConfig } from '@/types/governance';
import type { EntityLifecycleStages } from '@/utils/workflowConfig';
import { apiRequest } from './client';

/**
 * Official metadataTypeAPI surface used by the WorkflowBuilder
 * (pin a3012259ca): trigger fields, per-entity fields, custom properties,
 * and entity lifecycle stages. The product's customProperties.ts already
 * covers per-entity custom properties; the remaining three calls live here.
 */

export async function getWorkflowTriggerFields(): Promise<WorkflowTriggerFieldsConfig> {
  const payload = await apiRequest<unknown>(
    '/v1/metadata/types/fields/workflowTriggerFields',
  );
  const rec = asRecord(payload) ?? {};
  const common = Array.isArray(rec.common)
    ? (rec.common as unknown[]).map(String)
    : [];
  const entitySpecific: Record<string, string[]> = {};
  const rawSpecific = asRecord(rec.entitySpecific) ?? {};
  for (const [key, value] of Object.entries(rawSpecific)) {
    entitySpecific[key] = Array.isArray(value)
      ? (value as unknown[]).map(String)
      : [];
  }
  return { common, entitySpecific };
}

export interface MetadataFieldData {
  name: string;
  type: string;
}

export async function getFieldsForEntity(
  entityType: string,
): Promise<MetadataFieldData[]> {
  const payload = await apiRequest<unknown>(
    `/v1/metadata/types/fields/${encodeURIComponent(entityType)}`,
  );
  const rows = Array.isArray(payload) ? payload : [];
  return rows.flatMap((item) => {
    const rec = asRecord(item);
    const name = rec ? asString(rec.name) : '';
    if (!name) {
      return [];
    }
    return [{ name, type: rec ? asString(rec.type) : '' }];
  });
}

export async function getAllCustomProperties(): Promise<
  Record<string, Array<{ name: string }>>
> {
  const payload = await apiRequest<unknown>('/v1/metadata/types/customProperties');
  const rec = asRecord(payload) ?? {};
  const out: Record<string, Array<{ name: string }>> = {};
  for (const [key, value] of Object.entries(rec)) {
    out[key] = Array.isArray(value)
      ? (value as unknown[]).flatMap((item) => {
          const itemRec = asRecord(item);
          const name = itemRec ? asString(itemRec.name) : '';
          return name ? [{ name }] : [];
        })
      : [];
  }
  return out;
}

export async function getEntityLifecycleStages(
  indices?: readonly string[],
): Promise<EntityLifecycleStages> {
  const payload = await apiRequest<unknown>('/v1/metadata/types/lifecycleStages', {
    query: indices?.length ? { index: indices.join(',') } : undefined,
  });
  const rec = asRecord(payload) ?? {};
  const rows = Array.isArray(rec.entityTypes) ? rec.entityTypes : [];
  return {
    entityTypes: rows.flatMap((item) => {
      const itemRec = asRecord(item);
      const entityType = itemRec ? asString(itemRec.entityType) : '';
      if (!entityType) {
        return [];
      }
      const stages = Array.isArray(itemRec?.stages)
        ? (itemRec.stages as unknown[]).map(String)
        : [];
      return [{ entityType, stages }];
    }),
  };
}
