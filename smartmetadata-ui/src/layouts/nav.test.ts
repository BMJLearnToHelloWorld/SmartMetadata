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
import {
  NAV_ENTRIES,
  NAV_FOOTER_ENTRIES,
  defaultOpenNavKeys,
  isNavActionKey,
  isNavSectionKey,
  navRouteKeys,
  sectionKeyForRoute,
  selectedNavKey,
} from './nav';

function sectionItems(key: string): string[] {
  const section = NAV_ENTRIES.find((entry) => entry.kind === 'section' && entry.key === key);
  return section?.kind === 'section' ? section.items.map((item) => item.key) : [];
}

describe('nav IA', () => {
  it('follows the reference left-nav group order', () => {
    expect(NAV_ENTRIES.map((entry) => entry.key)).toEqual([
      'home',
      'search',
      'lineage-home',
      'observability',
      'insights',
      'marketplace',
      'governance',
      'context-center',
    ]);
    expect(NAV_FOOTER_ENTRIES.map((entry) => entry.key)).toEqual(['admin-settings', 'logout']);
    expect(NAV_FOOTER_ENTRIES[1]).toMatchObject({ kind: 'action', action: 'logout' });
  });

  it('nests Observability, Marketplace, Govern, and Context Center children', () => {
    expect(sectionItems('observability')).toEqual([
      'quality-test-cases',
      'observability-incidents',
      'observability-alerts',
      'quality-test-definitions',
    ]);
    expect(sectionItems('marketplace')).toEqual([
      'marketplace-overview',
      'governance-domains',
      'governance-data-products',
    ]);
    expect(sectionItems('governance')).toEqual([
      'governance-glossaries',
      'ontology-explorer',
      'governance-classifications',
      'governance-metrics',
      'column-bulk-ops',
      'workflows',
    ]);
    expect(sectionItems('context-center')).toEqual([
      'context-center-overview',
      'context-center-articles',
      'context-center-documents',
      'context-center-memories',
      'context-center-archive',
    ]);
  });

  it('drops extra top-level Ingestion, Collaboration, and Admin groups', () => {
    const keys = navRouteKeys();
    expect(keys).not.toContain('ingestion');
    expect(keys).not.toContain('ingestion-services');
    expect(keys).not.toContain('collaboration');
    expect(keys).not.toContain('activity');
    expect(keys).not.toContain('admin');
    expect(keys).not.toContain('admin-users');
    expect(keys).toContain('admin-settings');
    expect(keys).toContain('marketplace-overview');
    expect(keys).toContain('ontology-explorer');
    expect(keys).not.toContain('logout');
  });

  it('maps detail routes onto their list item and settings leaf', () => {
    expect(selectedNavKey('asset')).toBe('search');
    expect(selectedNavKey('lineage')).toBe('lineage-home');
    expect(selectedNavKey('governance-term')).toBe('governance-glossaries');
    expect(selectedNavKey('quality-test-case')).toBe('quality-test-cases');
    expect(selectedNavKey('quality-test-suite')).toBe('quality-test-cases');
    expect(selectedNavKey('search')).toBe('search');
    expect(selectedNavKey('home')).toBe('home');
    expect(selectedNavKey('admin-settings-system')).toBe('admin-settings');
    expect(selectedNavKey('admin-policy')).toBe('admin-settings');
    expect(selectedNavKey('admin-user')).toBe('admin-settings');
    expect(selectedNavKey('admin-settings-custom-property-type')).toBe('admin-settings');
    expect(selectedNavKey('governance-domain')).toBe('governance-domains');
    expect(selectedNavKey('governance-data-product')).toBe('governance-data-products');
    expect(selectedNavKey('ingestion-services')).toBe('admin-settings');
    expect(selectedNavKey('ingestion-service')).toBe('admin-settings');
    expect(selectedNavKey('ingestion-pipelines')).toBe('admin-settings');
    expect(selectedNavKey('ingestion-pipeline')).toBe('admin-settings');
    expect(selectedNavKey('announcements')).toBe('admin-settings');
    expect(selectedNavKey('activity')).toBe('activity');
    expect(selectedNavKey('tasks')).toBe('tasks');
  });

  it('opens the section that owns the current route', () => {
    expect(sectionKeyForRoute('asset')).toBeNull();
    expect(sectionKeyForRoute('quality-test-case')).toBe('observability');
    expect(sectionKeyForRoute('quality-test-suite')).toBe('observability');
    expect(sectionKeyForRoute('governance-domain')).toBe('marketplace');
    expect(sectionKeyForRoute('governance-glossary')).toBe('governance');
    expect(sectionKeyForRoute('context-center-articles')).toBe('context-center');
    expect(sectionKeyForRoute('admin-user')).toBeNull();
    expect(sectionKeyForRoute('activity')).toBeNull();
    expect(isNavSectionKey('governance')).toBe(true);
    expect(isNavSectionKey('marketplace')).toBe(true);
    expect(isNavSectionKey('search')).toBe(false);
    expect(isNavActionKey('logout')).toBe(true);
    expect(isNavActionKey('admin-settings')).toBe(false);
    expect(defaultOpenNavKeys()).toEqual([
      'observability',
      'marketplace',
      'governance',
      'context-center',
    ]);
  });
});
