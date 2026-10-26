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
        'system',
        'services',
        'policies',
        'custom-properties',
      ]),
    );
  });

  it('does not expose Collate-only or unbuilt Insights surfaces as live routes', () => {
    const liveKeys = liveSettingsItems().map((item) => item.key);
    expect(liveKeys).not.toEqual(expect.arrayContaining(['insights', 'knowledge', 'ontology', 'apps']));
    expect(isDroppedSettingsKey('knowledge')).toBe(true);
    expect(isDroppedSettingsKey('users')).toBe(false);
    expect(SETTINGS_CATEGORIES.some((category) => category.key === 'applications')).toBe(true);
    expect(residualSettingsItems().some((item) => item.key === 'apps')).toBe(true);
  });
});
