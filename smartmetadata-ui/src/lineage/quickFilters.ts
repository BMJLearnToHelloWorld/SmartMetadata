/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */

/**
 * Lineage quick filters → `query_filter` JSON, mirroring the official
 * provider (openmetadata-ui components/Lineage/Lineage/Lineage.tsx:618-657
 * + utils/ExplorePureUtils.ts:142-168 `getQuickFilterQuery`).
 *
 * Pin's default quick filters (`constants/Lineage.constants.ts`:
 * `LINEAGE_DEFAULT_QUICK_FILTERS`) are domains / owners / tag / column, with
 * the Elasticsearch field keys from `enums/AdvancedSearch.enum.ts`
 * (`EntityFields`): domains → `domains.displayName.keyword`,
 * owners → `ownerDisplayName`, tag → `tags.tagFQN`,
 * column → `columns.name.keyword`. Each selected filter contributes one
 * `must` clause of `{ bool: { should: [{ term: { [field]: value } }] } }`;
 * no selected values means no filter (the empty string, like pin's
 * `JSON.stringify(undefined) ?? ''`).
 *
 * The pin provider additionally appends a domain-restriction `should` clause
 * (`domains.fullyQualifiedName` term/prefix) when the user is domain
 * restricted; the product has no domain-restriction concept, so that clause
 * is not built here.
 */

export type LineageQuickFilterKey = 'domains' | 'owners' | 'tag' | 'column';

export interface LineageQuickFilterField {
  key: LineageQuickFilterKey;
  labelKey: string;
  /** Elasticsearch term field, per pin `EntityFields`. */
  field: string;
}

export const LINEAGE_QUICK_FILTER_FIELDS: LineageQuickFilterField[] = [
  { key: 'domains', labelKey: 'lineage.filterDomains', field: 'domains.displayName.keyword' },
  { key: 'owners', labelKey: 'lineage.filterOwners', field: 'ownerDisplayName' },
  { key: 'tag', labelKey: 'lineage.filterTag', field: 'tags.tagFQN' },
  { key: 'column', labelKey: 'lineage.filterColumn', field: 'columns.name.keyword' },
];

export interface LineageQuickFilterSelection {
  key: LineageQuickFilterKey;
  values: string[];
}

export const EMPTY_LINEAGE_QUICK_FILTERS: LineageQuickFilterSelection[] = [];

function cleanValues(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      cleaned.push(trimmed);
    }
  }
  return cleaned;
}

/** Normalize raw selections: drop empty/duplicate values and unknown keys. */
export function normalizeLineageQuickFilters(value: unknown): LineageQuickFilterSelection[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: LineageQuickFilterSelection[] = [];
  for (const item of value) {
    const rec = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const field = LINEAGE_QUICK_FILTER_FIELDS.find((entry) => entry.key === rec.key);
    if (!field) {
      continue;
    }
    const values = cleanValues(rec.values);
    if (values.length > 0) {
      out.push({ key: field.key, values });
    }
  }
  return out;
}

/**
 * Build the `query_filter` JSON for a set of quick-filter selections.
 * Returns '' when nothing is selected (no filter is sent).
 */
export function buildLineageQueryFilter(selections: readonly LineageQuickFilterSelection[]): string {
  const normalized = normalizeLineageQuickFilters(selections);
  if (normalized.length === 0) {
    return '';
  }
  const must = normalized.map((selection) => {
    const field = LINEAGE_QUICK_FILTER_FIELDS.find((entry) => entry.key === selection.key);
    return {
      bool: {
        should: selection.values.map((value) => ({ term: { [field?.field ?? selection.key]: value } })),
      },
    };
  });
  return JSON.stringify({ query: { bool: { must } } });
}

/** True when at least one filter carries a value (the fetch should refetch). */
export function hasLineageQuickFilters(selections: readonly LineageQuickFilterSelection[]): boolean {
  return normalizeLineageQuickFilters(selections).length > 0;
}
