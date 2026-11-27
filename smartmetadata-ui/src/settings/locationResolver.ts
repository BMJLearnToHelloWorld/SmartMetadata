/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * Settings-space path → named route location (DESIGN §3.6, R-CRUMB-7).
 * The breadcrumb builder (`./breadcrumbs`) and the exception adapters
 * (`./breadcrumbExceptions`) speak in pin `getSettingPath` paths (`''` is
 * the Hub, `'members'` a category, `'preferences/search-settings'` a
 * sub-category); this table turns each path into the named route location
 * the crumb links to. Route names were read off `router/index.ts`
 * (read-only); this module owns no route record and no label.
 *
 * Two entries are not catalog paths: `'preferences/dataAssetRules'` is the
 * third crumb of the Data Asset Rules self-built array (DESIGN §9.4, pin
 * `DataAssetRulesPage.tsx:46-67`), and `'notifications/alerts'` is the
 * Alerts crumb of the alert-detail self-built array (pin
 * `useAlertDetailsData.ts:152-175`). Both link to their dedicated list
 * routes, not to the generic category page.
 *
 * Single-card categories with dedicated list routes (`bots`, `apps`,
 * `persona`, `sso`) resolve to those routes (DESIGN §6.5); every other
 * category resolves to the generic category page (`settings-category`).
 * An unknown path throws: a missing entry is a wiring bug, and silently
 * linking it to the Hub would mask the gap (D-10 covers unknown URL
 * segments, not resolver gaps).
 */
import type { RouteLocationRaw } from 'vue-router';
import type {
  SettingsLocationResolver,
  SettingsPath,
} from './breadcrumbs';

/** Every settings-space path a breadcrumb crumb may link to. */
export const SETTINGS_LOCATION_TABLE: Readonly<Record<SettingsPath, RouteLocationRaw>> = {
  '': { name: 'admin-settings' },
  services: { name: 'settings-category', params: { category: 'services' } },
  notifications: { name: 'settings-category', params: { category: 'notifications' } },
  members: { name: 'settings-category', params: { category: 'members' } },
  access: { name: 'settings-category', params: { category: 'access' } },
  preferences: { name: 'settings-category', params: { category: 'preferences' } },
  'preferences/search-settings': { name: 'settings-preferences-search' },
  customProperties: { name: 'settings-category', params: { category: 'customProperties' } },
  bots: { name: 'admin-bots' },
  apps: { name: 'admin-apps' },
  persona: { name: 'admin-settings-persona' },
  sso: { name: 'admin-settings-sso' },
  governance: { name: 'settings-category', params: { category: 'governance' } },
  'governance/workflow-definitions': { name: 'workflows' },
  'preferences/dataAssetRules': { name: 'settings-preferences-entity-rules' },
  'notifications/alerts': { name: 'settings-notification-alerts' },
};

/**
 * Resolves a settings-space path to its named route location. Throws on
 * an unknown path instead of falling back to the Hub.
 */
export function resolveSettingsLocation(path: SettingsPath): RouteLocationRaw {
  const location = SETTINGS_LOCATION_TABLE[path];
  if (!location) {
    throw new Error(`Unknown settings path: ${path}`);
  }
  return location;
}

/** The resolver in the shape the breadcrumb builder consumes. */
export const settingsLocationResolver: SettingsLocationResolver = resolveSettingsLocation;
