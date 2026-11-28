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
  resolveSettingsLocation,
  SETTINGS_LOCATION_TABLE,
  settingsLocationResolver,
} from './locationResolver';
import { SETTINGS_BREADCRUMB_NAMES } from './registry';

describe('resolveSettingsLocation', () => {
  it('resolves the Hub to the Hub route', () => {
    expect(resolveSettingsLocation('')).toEqual({ name: 'admin-settings' });
  });

  it('resolves generic categories to the category page with the category param', () => {
    expect(resolveSettingsLocation('services')).toEqual({
      name: 'settings-category',
      params: { category: 'services' },
    });
    expect(resolveSettingsLocation('notifications')).toEqual({
      name: 'settings-category',
      params: { category: 'notifications' },
    });
    expect(resolveSettingsLocation('members')).toEqual({
      name: 'settings-category',
      params: { category: 'members' },
    });
    expect(resolveSettingsLocation('access')).toEqual({
      name: 'settings-category',
      params: { category: 'access' },
    });
    expect(resolveSettingsLocation('preferences')).toEqual({
      name: 'settings-category',
      params: { category: 'preferences' },
    });
    expect(resolveSettingsLocation('customProperties')).toEqual({
      name: 'settings-category',
      params: { category: 'customProperties' },
    });
    expect(resolveSettingsLocation('governance')).toEqual({
      name: 'settings-category',
      params: { category: 'governance' },
    });
  });

  it('resolves single-card categories to their dedicated list routes', () => {
    expect(resolveSettingsLocation('bots')).toEqual({ name: 'admin-bots' });
    expect(resolveSettingsLocation('apps')).toEqual({ name: 'admin-apps' });
    expect(resolveSettingsLocation('persona')).toEqual({ name: 'admin-settings-persona' });
    expect(resolveSettingsLocation('sso')).toEqual({ name: 'admin-settings-sso' });
  });

  it('resolves sub-categories to their dedicated routes', () => {
    expect(resolveSettingsLocation('preferences/search-settings')).toEqual({
      name: 'settings-preferences-search',
    });
    expect(resolveSettingsLocation('governance/workflow-definitions')).toEqual({
      name: 'workflows',
    });
  });

  it('resolves the exception-array paths to their dedicated routes', () => {
    expect(resolveSettingsLocation('preferences/dataAssetRules')).toEqual({
      name: 'settings-preferences-entity-rules',
    });
    expect(resolveSettingsLocation('notifications/alerts')).toEqual({
      name: 'settings-notification-alerts',
    });
  });

  it('covers every catalog path, so the builder never hits an unknown path', () => {
    for (const entry of Object.values(SETTINGS_BREADCRUMB_NAMES)) {
      expect(() => resolveSettingsLocation(entry.path)).not.toThrow();
    }
    expect(() => resolveSettingsLocation('')).not.toThrow();
  });

  it('throws on an unknown path instead of falling back to the Hub', () => {
    expect(() => resolveSettingsLocation('no-such-category')).toThrow(
      'Unknown settings path: no-such-category',
    );
    expect(() => resolveSettingsLocation('preferences/task-forms')).toThrow(
      'Unknown settings path: preferences/task-forms',
    );
  });

  it('exposes the same resolver under the builder-consumed name', () => {
    expect(settingsLocationResolver).toBe(resolveSettingsLocation);
    expect(Object.keys(SETTINGS_LOCATION_TABLE)).toHaveLength(16);
  });
});
