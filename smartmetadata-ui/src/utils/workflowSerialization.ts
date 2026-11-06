/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { WorkflowDataAssetFilter } from '@/types/governance';

/**
 * Official WorkflowSerializationUtils (pin a3012259ca), ported 1:1: the
 * filter and FQN list helpers shared by the validation service, the node
 * config derivation, and the SetAction form.
 */

// Drops filters whose asset type is no longer selected.
export function reconcileDataAssetFilters(
  filters: WorkflowDataAssetFilter[] | undefined,
  selectedDataAssets: string[] | undefined,
): WorkflowDataAssetFilter[] {
  const assets = selectedDataAssets ?? [];
  return (filters ?? []).filter((filter) => assets.includes(filter.dataAsset));
}

export function serializeDataAssetFilters(
  filters: WorkflowDataAssetFilter[],
): Array<{ dataAsset: string; filters?: string }> {
  return filters.length > 0
    ? filters.map((df) => ({ dataAsset: df.dataAsset, filters: df.filters }))
    : [];
}

export function serializeEventBasedFilters(
  triggerFilter: string,
  dataAssets: string[],
): Record<string, string> {
  if (!triggerFilter || triggerFilter.trim() === '') {
    return {};
  }
  const filterObj: Record<string, string> = {};
  dataAssets.forEach((asset) => {
    filterObj[asset] = triggerFilter;
  });
  return filterObj;
}

export function serializePeriodicBatchFilters(
  dataAssetFilters: WorkflowDataAssetFilter[],
): Record<string, string> {
  const filterObj: Record<string, string> = {};
  dataAssetFilters.forEach((df) => {
    const entityType = df.dataAsset;
    const jsonLogicFilter = df.filters;
    if (jsonLogicFilter && jsonLogicFilter.trim() !== '') {
      filterObj[entityType] = jsonLogicFilter;
    }
  });
  return filterObj;
}

export function deserializePeriodicBatchFilters(
  filters: Record<string, string>,
  entityTypes: string[],
): WorkflowDataAssetFilter[] {
  const dataAssetFilters: WorkflowDataAssetFilter[] = [];
  entityTypes.forEach((entityType, index) => {
    const filterValue = filters[entityType];
    if (filterValue) {
      dataAssetFilters.push({
        id: index,
        dataAsset: entityType,
        filters: filterValue,
      });
    }
  });
  return dataAssetFilters;
}

// Older workflows saved the per-entity-type filter map as a JSON string; the server still reads
// that form, so read it here too.
function toFilterMap(
  filter: Record<string, string> | string | undefined,
): Record<string, string> | undefined {
  if (typeof filter !== 'string') {
    return filter;
  }
  try {
    const parsed: unknown = JSON.parse(filter);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : undefined;
  } catch {
    return undefined;
  }
}

export function deserializeEventBasedFilters(
  filter: Record<string, string> | string | undefined,
  entityTypes: string[],
): string {
  const filterObj = toFilterMap(filter);
  if (!filterObj || typeof filterObj !== 'object') {
    return '';
  }
  if (entityTypes.length === 1) {
    return filterObj[entityTypes[0]] || '';
  }
  for (const entityType of entityTypes) {
    const filterValue = filterObj[entityType];
    if (filterValue && filterValue.trim() !== '') {
      return filterValue;
    }
  }
  const firstKey = Object.keys(filterObj)[0];
  return firstKey ? filterObj[firstKey] || '' : '';
}

// FQNs may contain commas, so multi-value fields are stored as a JSON array.
// ADR:2026-10-13-set-action-multi-fqn-field-values-are-json-arrays
export function serializeFqnList(fqns: string[]): string {
  return fqns.length > 0 ? JSON.stringify(fqns) : '';
}

// Reads the JSON array, or the comma-separated format older workflows were saved with.
export function parseFqnList(value: string): string[] {
  if (!value) {
    return [];
  }
  if (value.trim().startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map(String);
      }
    } catch {
      // not JSON, fall back to the legacy format
    }
  }
  return value.split(',').map((fqn) => fqn.trim());
}
