/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import { ESTATE_CATEGORIES } from '@/catalog/browseEstate';
import { buildQueryBarChips, removeBrowseLevel } from '@/catalog/exploreQueryBar';

const labels = {
  browseIn: 'In',
  categoryTitle: (id: string) => ESTATE_CATEGORIES.find((item) => item.id === id)?.titleKey ?? id,
  fieldLabel: (id: string) => id,
  typeLabel: 'Type',
  entityLabel: (entityType: string) => entityType,
  noEntity: (fieldLabel: string) => `No ${fieldLabel}`,
  schemaLabel: 'Schema',
};

describe('buildQueryBarChips', () => {
  it('puts the official In-category browse chip ahead of path and Type chips', () => {
    const chips = buildQueryBarChips(
      {
        entityType: ['table'],
        serviceType: ['doris'],
        service: ['prod'],
      },
      'databases',
      labels,
    );
    expect(chips.map((chip) => `${chip.label} ${chip.display}`)).toEqual([
      'In explore.estate.databases',
      'serviceType doris',
      'service prod',
      'Type table',
    ]);
  });

  it('does not emit one Type chip per category entity type when the tree root is selected', () => {
    const databases = ESTATE_CATEGORIES.find((item) => item.id === 'databases');
    expect(databases).toBeDefined();
    const chips = buildQueryBarChips({ entityType: [...(databases?.entityTypes ?? [])] }, 'databases', labels);
    expect(chips).toEqual([
      expect.objectContaining({ kind: 'browse', field: 'category', label: 'In' }),
    ]);
    expect(chips.some((chip) => chip.field === 'entityType')).toBe(false);
  });

  it('renders a toolbar-only serviceType pick as a filter chip, not a browse chip', () => {
    const chips = buildQueryBarChips({ serviceType: ['doris'] }, '', labels);
    expect(chips).toEqual([
      expect.objectContaining({ kind: 'filter', field: 'serviceType', value: 'doris' }),
    ]);
  });

  it('labels a toolbar entity-type pick as Type, not entityType', () => {
    const chips = buildQueryBarChips({ entityType: ['tableColumn'] }, '', labels);
    expect(chips).toEqual([
      expect.objectContaining({ kind: 'filter', field: 'entityType', label: 'Type', display: 'tableColumn' }),
    ]);
  });
});

describe('removeBrowseLevel', () => {
  it('drops the selected browse level and every deeper path field', () => {
    const { filters, estateId } = removeBrowseLevel(
      {
        entityType: ['table'],
        serviceType: ['doris'],
        service: ['prod'],
        database: ['analytics'],
        schema: ['marts'],
      },
      'databases',
      'service',
    );
    expect(estateId).toBe('databases');
    expect(filters).toEqual({ entityType: ['table'], serviceType: ['doris'] });
  });

  it('clears estate and entityType when the category chip is removed', () => {
    const { filters, estateId } = removeBrowseLevel(
      { entityType: ['table', 'database'], serviceType: ['doris'] },
      'databases',
      'category',
    );
    expect(estateId).toBe('');
    expect(filters).toEqual({});
  });
});
