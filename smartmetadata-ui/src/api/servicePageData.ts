/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asRecord, asString, mapEntityRefs } from '@/api/json';
import { mapUsageSummary } from '@/catalog/usagePercentile';
import type { EntityRef, UsageDetails } from '@/types/api';
import type { ServiceTagLabel } from '@/types/ingestion';
import { mapServiceTags } from './serviceCommon';

/**
 * Pin `ServicePageData` (interface/platform/service.interface.ts): the
 * union of the child entities a service main tab can list — database,
 * topic, dashboard, pipeline, mlmodel, container, search index, API
 * collection, data model, and the four drive assets. The tab reads
 * one shared shape from every kind: identity, the facet references,
 * and the per-kind extras the columns show (pipeline
 * scheduleInterval, database usageSummary, data-model type).
 */
export interface ServicePageData {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  fullyQualifiedName?: string;
  owners: EntityRef[];
  domains: EntityRef[];
  dataProducts: EntityRef[];
  tags: ServiceTagLabel[];
  certification?: { tagLabel?: ServiceTagLabel };
  usageSummary?: UsageDetails;
  scheduleInterval?: string;
  dataModelType?: string;
  state?: string;
  deleted?: boolean;
}

/**
 * Maps the entity's `certification.tagLabel` through the same label
 * mapper as `tags`. A missing or FQN-less label maps to undefined;
 * the table cells fall back to the `Certification.*` label in `tags`
 * (pin ServiceMainTabContentUtils certification column).
 */
function mapCertification(
  raw: Record<string, unknown> | null,
): ServicePageData['certification'] {
  const tagLabel = raw ? mapServiceTags([raw.tagLabel])[0] : undefined;
  return tagLabel ? { tagLabel } : undefined;
}

/**
 * Maps a list response item — or a search hit `_source` — onto the
 * shared page shape. Rows with neither id nor name are dropped by
 * parsePaged, matching the service mapper contract.
 */
export function mapServicePageData(raw: Record<string, unknown>): ServicePageData | null {
  const id = asString(raw.id) || '';
  const name = asString(raw.name) || id;
  if (!id && !name) {
    return null;
  }
  return {
    id,
    name,
    displayName: asString(raw.displayName) || undefined,
    description: asString(raw.description) || undefined,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || undefined,
    owners: mapEntityRefs(raw.owners),
    domains: mapEntityRefs(raw.domains),
    dataProducts: mapEntityRefs(raw.dataProducts),
    tags: mapServiceTags(raw.tags),
    certification: mapCertification(asRecord(raw.certification)),
    usageSummary: mapUsageSummary(asRecord(raw.usageSummary)),
    scheduleInterval: asString(raw.scheduleInterval) || undefined,
    dataModelType: asString(raw.dataModelType) || undefined,
    state: asString(raw.state) || undefined,
    deleted: raw.deleted === true ? true : undefined,
  };
}
