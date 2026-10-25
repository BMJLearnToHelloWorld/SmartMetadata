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
import { isNavSectionKey, NAV_ENTRIES, sectionKeyForRoute, selectedNavKey } from './nav';

describe('nav IA', () => {
  it('puts Explore and Lineage at the top and nests quality under Observability', () => {
    expect(NAV_ENTRIES[0]).toMatchObject({ kind: 'item', key: 'search' });
    expect(NAV_ENTRIES[1]).toMatchObject({ kind: 'item', key: 'lineage-home' });
    const observability = NAV_ENTRIES.find((entry) => entry.kind === 'section' && entry.key === 'observability');
    expect(observability?.kind === 'section' && observability.items.map((item) => item.key)).toEqual([
      'quality-test-definitions',
      'quality-test-cases',
      'quality-test-suites',
      'observability-incidents',
      'observability-alerts',
    ]);
  });

  it('does not list Collate-only or unbuilt official surfaces', () => {
    const keys = NAV_ENTRIES.flatMap((entry) =>
      entry.kind === 'item' ? [entry.key] : [entry.key, ...entry.items.map((item) => item.key)],
    );
    expect(keys).not.toContain('insights');
    expect(keys).not.toContain('knowledge');
    expect(keys).not.toContain('ontology');
    expect(keys).not.toContain('marketplace');
    expect(keys).not.toContain('home');
  });

  it('maps detail routes onto their list item', () => {
    expect(selectedNavKey('asset')).toBe('search');
    expect(selectedNavKey('lineage')).toBe('lineage-home');
    expect(selectedNavKey('governance-term')).toBe('governance-glossaries');
    expect(selectedNavKey('quality-test-case')).toBe('quality-test-cases');
    expect(selectedNavKey('task')).toBe('tasks');
    expect(selectedNavKey('search')).toBe('search');
  });

  it('opens the section that owns the current route', () => {
    expect(sectionKeyForRoute('asset')).toBeNull();
    expect(sectionKeyForRoute('quality-test-case')).toBe('observability');
    expect(sectionKeyForRoute('admin-user')).toBe('admin');
    expect(sectionKeyForRoute('activity')).toBe('collaboration');
    expect(isNavSectionKey('governance')).toBe(true);
    expect(isNavSectionKey('search')).toBe(false);
  });
});
