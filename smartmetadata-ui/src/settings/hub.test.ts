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
  SETTINGS_CATEGORIES,
  SETTINGS_LIVE_ROUTE_NAMES,
  isDroppedSettingsKey,
  liveSettingsItems,
  residualSettingsItems,
} from './hub';

describe('settings hub catalog', () => {
  it('only links live items to product routes that already exist', () => {
    const allowed = new Set<string>(SETTINGS_LIVE_ROUTE_NAMES);
    for (const item of liveSettingsItems()) {
      expect(item.routeName, item.key).toBeTruthy();
      expect(allowed.has(item.routeName ?? ''), item.routeName).toBe(true);
    }
  });

  it('keeps residual items off navigation (no fake save routes)', () => {
    for (const item of residualSettingsItems()) {
      expect(item.routeName, item.key).toBeUndefined();
      expect(item.residualKey, item.key).toBeTruthy();
    }
  });

  it('covers official landing groups that the product can honestly host', () => {
    const keys = SETTINGS_CATEGORIES.map((category) => category.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'members',
        'access',
        'bots',
        'governance',
        'services',
        'preferences',
        'notifications',
      ]),
    );
    expect(liveSettingsItems().map((item) => item.key)).toEqual(
      expect.arrayContaining([
        'users',
        'teams',
        'roles',
        'bots',
        'glossaries',
        'classifications',
        'services',
        'policies',
        'custom-properties-apiCollection',
        'custom-properties-apiEndpoint',
        'custom-properties-page',
        'custom-properties-chart',
        'custom-properties-tableColumn',
        'custom-properties-container',
        'custom-properties-dashboardDataModel',
        'custom-properties-dashboard',
        'custom-properties-dataProduct',
        'custom-properties-databaseSchema',
        'custom-properties-database',
        'custom-properties-directory',
        'custom-properties-domain',
        'custom-properties-file',
        'custom-properties-glossaryTerm',
        'custom-properties-metric',
        'custom-properties-mlmodel',
        'custom-properties-pipeline',
        'custom-properties-searchIndex',
        'custom-properties-spreadsheet',
        'custom-properties-storedProcedure',
        'custom-properties-table',
        'custom-properties-team',
        'custom-properties-topic',
        'custom-properties-user',
        'custom-properties-worksheet',
        'apps',
        'appearance',
        'email',
        'login',
        'profiler',
        'search-settings',
      ]),
    );
  });

  it('expands custom-properties into 26 rows to the detail route, one per official type', () => {
    const category = SETTINGS_CATEGORIES.find((c) => c.key === 'custom-properties');
    expect(category).toBeTruthy();
    const items = category?.items ?? [];
    expect(items).toHaveLength(26);
    const types = new Set<string>();
    for (const item of items) {
      expect(item.kind).toBe('route');
      expect(item.routeName).toBe('admin-settings-custom-property-type');
      const entityType = item.routeParams?.entityType;
      expect(entityType, item.key).toBeTruthy();
      expect(types.has(entityType ?? ''), entityType).toBe(false);
      types.add(entityType ?? '');
      expect(item.icon, item.key).toBeTruthy();
      expect(item.descriptionKey, item.key).toBeTruthy();
    }
    expect(types.size).toBe(26);
  });

  it('wires Apache Preferences children as live routes (not residual)', () => {
    const prefs = SETTINGS_CATEGORIES.find((c) => c.key === 'preferences');
    expect(prefs).toBeTruthy();
    const liveKeys = (prefs?.items ?? []).filter((i) => i.kind === 'route').map((i) => i.key);
    expect(liveKeys).toEqual(
      expect.arrayContaining([
        'appearance',
        'email',
        'login',
        'om-health',
        'profiler',
        'dq-dimensions',
        'search-settings',
        'lineage-config',
        'om-url',
        'entity-rules',
        'learning',
        'app-mode',
        'glossary-prefs',
        'time-format',
      ]),
    );
    expect(liveKeys).not.toEqual(expect.arrayContaining(['system']));
  });

  it('does not expose Collate-only or unbuilt Insights surfaces as live routes', () => {
    const liveKeys = liveSettingsItems().map((item) => item.key);
    expect(liveKeys).not.toEqual(expect.arrayContaining(['insights', 'knowledge', 'ontology']));
    expect(liveKeys).toEqual(expect.arrayContaining(['apps']));
    expect(isDroppedSettingsKey('knowledge')).toBe(true);
    expect(isDroppedSettingsKey('users')).toBe(false);
    expect(SETTINGS_CATEGORIES.some((category) => category.key === 'applications')).toBe(true);
    expect(residualSettingsItems().some((item) => item.key === 'apps')).toBe(false);
    // P2 B5: Persona flipped residual → route on the Persona track, and
    // SSO, Inbox, Admins, OnlineUsers flipped on the non-Persona track,
    // so no residual items remain in this set.
    expect(residualSettingsItems().map((item) => item.key)).toEqual([]);
    expect(residualSettingsItems().some((item) => item.key === 'persona')).toBe(false);
    expect(residualSettingsItems().some((item) => item.key === 'sso')).toBe(false);
    expect(residualSettingsItems().some((item) => item.key === 'inbox')).toBe(false);
    expect(residualSettingsItems().some((item) => item.key === 'admins')).toBe(false);
    expect(residualSettingsItems().some((item) => item.key === 'online-users')).toBe(false);
    expect(residualSettingsItems().map((item) => item.key)).not.toEqual(
      expect.arrayContaining(['appearance', 'search-settings', 'profiler']),
    );
  });
});
