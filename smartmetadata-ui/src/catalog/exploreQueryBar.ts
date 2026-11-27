/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { estateCategory } from '@/catalog/browseEstate';
import type { FacetId } from '@/catalog/searchFacets';
import { NULL_OPTION_KEY } from '@/catalog/searchFacets';
import type { SearchFilters } from '@/catalog/searchQuery';

/** Official ExploreTree browse path fields, in depth order. */
export const QUERY_BAR_BROWSE_LEVELS = ['serviceType', 'service', 'database', 'schema'] as const;

export type QueryBarBrowseLevel = (typeof QUERY_BAR_BROWSE_LEVELS)[number] | 'category';

export interface QueryBarChip {
  key: string;
  kind: 'browse' | 'filter';
  field: string;
  value?: string;
  /** Field label shown ahead of the value (官方 类型 / 服务类型 / 在). */
  label: string;
  display: string;
}

export function isCategoryWideEntityType(filters: SearchFilters, estateId: string): boolean {
  const category = estateCategory(estateId);
  const types = filters.entityType ?? [];
  if (!category || !types.length) {
    return false;
  }
  return (
    types.length === category.entityTypes.length &&
    category.entityTypes.every((type) => types.includes(type))
  );
}

/**
 * Official ExploreQueryFilterChips: browse path chips first, then quick-filter
 * chips. Entity-type chips use the Type label; a category-wide entityType set
 * is represented only by the "In {category}" browse chip, not one chip per type.
 */
export function buildQueryBarChips(
  filters: SearchFilters,
  estateId: string,
  labels: {
    browseIn: string;
    categoryTitle: (estateId: string) => string;
    fieldLabel: (id: string) => string;
    typeLabel: string;
    entityLabel: (entityType: string) => string;
    noEntity: (fieldLabel: string) => string;
    schemaLabel: string;
  },
): QueryBarChip[] {
  const chips: QueryBarChip[] = [];
  const categoryWide = isCategoryWideEntityType(filters, estateId);

  if (estateId) {
    const category = estateCategory(estateId);
    chips.push({
      key: 'browse:category',
      kind: 'browse',
      field: 'category',
      label: labels.browseIn,
      display: category ? labels.categoryTitle(estateId) : estateId,
    });
  }

  // Official browseFields chips exist only while a tree/browse path is
  // active. The same fields chosen from a toolbar dropdown (no estate)
  // render as regular query-bar filter chips.
  if (estateId) {
    for (const level of QUERY_BAR_BROWSE_LEVELS) {
      const value = filters[level]?.[0];
      if (!value) {
        continue;
      }
      chips.push({
        key: `browse:${level}:${value}`,
        kind: 'browse',
        field: level,
        value,
        label: level === 'schema' ? labels.schemaLabel : labels.fieldLabel(level),
        display: value === NULL_OPTION_KEY ? labels.noEntity(labels.fieldLabel(level)) : value,
      });
    }
  }

  const skip = new Set<string>(estateId ? QUERY_BAR_BROWSE_LEVELS : []);
  if (categoryWide) {
    skip.add('entityType');
  }

  for (const field of Object.keys(filters) as FacetId[]) {
    if (skip.has(field)) {
      continue;
    }
    const values = filters[field] ?? [];
    for (const value of values) {
      const fieldLabel = field === 'entityType' ? labels.typeLabel : labels.fieldLabel(field);
      const display =
        value === NULL_OPTION_KEY
          ? labels.noEntity(labels.fieldLabel(field))
          : field === 'entityType'
            ? labels.entityLabel(value)
            : value;
      chips.push({
        key: `filter:${field}:${value}`,
        kind: 'filter',
        field,
        value,
        label: fieldLabel,
        display,
      });
    }
  }

  return chips;
}

/**
 * Official handleRemoveBrowseLevel: drop this level and every deeper path
 * field. Removing the category root also clears estate and entityType.
 */
export function removeBrowseLevel(
  filters: SearchFilters,
  estateId: string,
  level: QueryBarBrowseLevel,
): { filters: SearchFilters; estateId: string } {
  const next: SearchFilters = { ...filters };
  const drop: string[] =
    level === 'category'
      ? ['serviceType', 'service', 'database', 'schema', 'entityType']
      : level === 'serviceType'
        ? ['serviceType', 'service', 'database', 'schema']
        : level === 'service'
          ? ['service', 'database', 'schema']
          : level === 'database'
            ? ['database', 'schema']
            : ['schema'];
  for (const field of drop) {
    delete next[field];
  }
  return { filters: next, estateId: level === 'category' ? '' : estateId };
}
