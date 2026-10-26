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
 * Settings landing catalog. Official GlobalSettingPage is category cards
 * (Members / Access / Services / Preferences / …). Only items with a
 * product Vue route + already-used REST client are `route`. Everything
 * else is residual text — no fake save forms, no invented APIs.
 */
export type SettingsItemKind = 'route' | 'residual';

export interface SettingsItem {
  key: string;
  titleKey: string;
  kind: SettingsItemKind;
  routeName?: string;
  residualKey?: string;
}

export interface SettingsCategory {
  key: string;
  titleKey: string;
  descriptionKey: string;
  items: SettingsItem[];
}

/** Route names this hub may navigate to. Keep in lockstep with router/index.ts. */
export const SETTINGS_LIVE_ROUTE_NAMES = [
  'admin-users',
  'admin-teams',
  'admin-roles',
  'admin-bots',
  'admin-settings-system',
  'admin-policies',
  'admin-settings-custom-properties',
  'governance-glossaries',
  'governance-classifications',
  'governance-domains',
  'governance-data-products',
  'ingestion-services',
  'ingestion-pipelines',
  'observability-alerts',
  'announcements',
] as const;

export type SettingsLiveRouteName = (typeof SETTINGS_LIVE_ROUTE_NAMES)[number];

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    key: 'members',
    titleKey: 'settings.categories.members.title',
    descriptionKey: 'settings.categories.members.description',
    items: [
      { key: 'users', titleKey: 'nav.users', kind: 'route', routeName: 'admin-users' },
      { key: 'teams', titleKey: 'nav.teams', kind: 'route', routeName: 'admin-teams' },
      { key: 'admins', titleKey: 'settings.items.admins', kind: 'residual', residualKey: 'settings.residual.admins' },
      {
        key: 'online-users',
        titleKey: 'settings.items.onlineUsers',
        kind: 'residual',
        residualKey: 'settings.residual.onlineUsers',
      },
    ],
  },
  {
    key: 'access',
    titleKey: 'settings.categories.access.title',
    descriptionKey: 'settings.categories.access.description',
    items: [
      { key: 'roles', titleKey: 'nav.roles', kind: 'route', routeName: 'admin-roles' },
      { key: 'policies', titleKey: 'settings.items.policies', kind: 'route', routeName: 'admin-policies' },
      {
        key: 'audit-logs',
        titleKey: 'settings.items.auditLogs',
        kind: 'residual',
        residualKey: 'settings.residual.auditLogs',
      },
    ],
  },
  {
    key: 'bots',
    titleKey: 'settings.categories.bots.title',
    descriptionKey: 'settings.categories.bots.description',
    items: [{ key: 'bots', titleKey: 'nav.bots', kind: 'route', routeName: 'admin-bots' }],
  },
  {
    key: 'governance',
    titleKey: 'settings.categories.governance.title',
    descriptionKey: 'settings.categories.governance.description',
    items: [
      { key: 'glossaries', titleKey: 'nav.glossaries', kind: 'route', routeName: 'governance-glossaries' },
      {
        key: 'classifications',
        titleKey: 'nav.classifications',
        kind: 'route',
        routeName: 'governance-classifications',
      },
      { key: 'domains', titleKey: 'nav.domains', kind: 'route', routeName: 'governance-domains' },
      { key: 'data-products', titleKey: 'nav.dataProducts', kind: 'route', routeName: 'governance-data-products' },
    ],
  },
  {
    key: 'services',
    titleKey: 'settings.categories.services.title',
    descriptionKey: 'settings.categories.services.description',
    items: [
      { key: 'services', titleKey: 'nav.services', kind: 'route', routeName: 'ingestion-services' },
      { key: 'pipelines', titleKey: 'nav.pipelines', kind: 'route', routeName: 'ingestion-pipelines' },
    ],
  },
  {
    key: 'preferences',
    titleKey: 'settings.categories.preferences.title',
    descriptionKey: 'settings.categories.preferences.description',
    items: [
      { key: 'system', titleKey: 'settings.items.system', kind: 'route', routeName: 'admin-settings-system' },
      {
        key: 'appearance',
        titleKey: 'settings.items.appearance',
        kind: 'residual',
        residualKey: 'settings.residual.appearance',
      },
      {
        key: 'search-settings',
        titleKey: 'settings.items.searchSettings',
        kind: 'residual',
        residualKey: 'settings.residual.searchSettings',
      },
      {
        key: 'profiler',
        titleKey: 'settings.items.profiler',
        kind: 'residual',
        residualKey: 'settings.residual.profiler',
      },
    ],
  },
  {
    key: 'notifications',
    titleKey: 'settings.categories.notifications.title',
    descriptionKey: 'settings.categories.notifications.description',
    items: [
      { key: 'alerts', titleKey: 'nav.alerts', kind: 'route', routeName: 'observability-alerts' },
      { key: 'announcements', titleKey: 'nav.announcements', kind: 'route', routeName: 'announcements' },
      { key: 'inbox', titleKey: 'settings.items.inbox', kind: 'residual', residualKey: 'settings.residual.inbox' },
    ],
  },
  {
    key: 'applications',
    titleKey: 'settings.categories.applications.title',
    descriptionKey: 'settings.categories.applications.description',
    items: [
      {
        key: 'apps',
        titleKey: 'settings.items.applications',
        kind: 'residual',
        residualKey: 'settings.residual.applications',
      },
    ],
  },
  {
    key: 'sso',
    titleKey: 'settings.categories.sso.title',
    descriptionKey: 'settings.categories.sso.description',
    items: [
      { key: 'sso', titleKey: 'settings.items.sso', kind: 'residual', residualKey: 'settings.residual.sso' },
    ],
  },
  {
    key: 'persona',
    titleKey: 'settings.categories.persona.title',
    descriptionKey: 'settings.categories.persona.description',
    items: [
      {
        key: 'persona',
        titleKey: 'settings.items.persona',
        kind: 'residual',
        residualKey: 'settings.residual.persona',
      },
    ],
  },
  {
    key: 'custom-properties',
    titleKey: 'settings.categories.customProperties.title',
    descriptionKey: 'settings.categories.customProperties.description',
    items: [
      {
        key: 'custom-properties',
        titleKey: 'settings.items.customProperties',
        kind: 'route',
        routeName: 'admin-settings-custom-properties',
      },
    ],
  },
];

const DROP_KEYS = new Set(['insights', 'knowledge', 'ontology', 'marketplace', 'home', 'ai']);

export function liveSettingsItems(): SettingsItem[] {
  return SETTINGS_CATEGORIES.flatMap((category) => category.items.filter((item) => item.kind === 'route'));
}

export function residualSettingsItems(): SettingsItem[] {
  return SETTINGS_CATEGORIES.flatMap((category) => category.items.filter((item) => item.kind === 'residual'));
}

export function isDroppedSettingsKey(key: string): boolean {
  return DROP_KEYS.has(key);
}
