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
 *
 * Preferences children follow Apache GlobalSettingsClassBase Preference
 * cards (Appearance, Email, Login, Health, Profiler, DQ, Search, Lineage,
 * Brand URL, Data Asset Rules, Learning, App Mode, Glossary, Time Format).
 * Collate CustomizeAppModeSidebar and SSO/Persona stay residual / out of scope.
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
  'admin-settings-audit-logs',
  'admin-policies',
  'admin-settings-custom-properties',
  'admin-apps',
  'governance-glossaries',
  'governance-classifications',
  'governance-domains',
  'governance-data-products',
  'ingestion-services',
  'ingestion-pipelines',
  'observability-alerts',
  'announcements',
  'settings-preferences-appearance',
  'settings-preferences-email',
  'settings-preferences-login',
  'settings-preferences-health',
  'settings-preferences-profiler',
  'settings-preferences-dq-dimensions',
  'settings-preferences-search',
  'settings-preferences-lineage',
  'settings-preferences-om-url',
  'settings-preferences-entity-rules',
  'settings-preferences-learning',
  'settings-preferences-app-mode',
  'settings-preferences-glossary',
  'settings-preferences-time-format',
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
        kind: 'route',
        routeName: 'admin-settings-audit-logs',
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
      {
        key: 'appearance',
        titleKey: 'settings.items.appearance',
        kind: 'route',
        routeName: 'settings-preferences-appearance',
      },
      {
        key: 'email',
        titleKey: 'settings.items.email',
        kind: 'route',
        routeName: 'settings-preferences-email',
      },
      {
        key: 'login',
        titleKey: 'settings.items.login',
        kind: 'route',
        routeName: 'settings-preferences-login',
      },
      {
        key: 'om-health',
        titleKey: 'settings.items.health',
        kind: 'route',
        routeName: 'settings-preferences-health',
      },
      {
        key: 'profiler',
        titleKey: 'settings.items.profiler',
        kind: 'route',
        routeName: 'settings-preferences-profiler',
      },
      {
        key: 'dq-dimensions',
        titleKey: 'settings.items.dqDimensions',
        kind: 'route',
        routeName: 'settings-preferences-dq-dimensions',
      },
      {
        key: 'search-settings',
        titleKey: 'settings.items.searchSettings',
        kind: 'route',
        routeName: 'settings-preferences-search',
      },
      {
        key: 'lineage-config',
        titleKey: 'settings.items.lineage',
        kind: 'route',
        routeName: 'settings-preferences-lineage',
      },
      {
        key: 'om-url',
        titleKey: 'settings.items.omUrl',
        kind: 'route',
        routeName: 'settings-preferences-om-url',
      },
      {
        key: 'entity-rules',
        titleKey: 'settings.items.entityRules',
        kind: 'route',
        routeName: 'settings-preferences-entity-rules',
      },
      {
        key: 'learning',
        titleKey: 'settings.items.learning',
        kind: 'route',
        routeName: 'settings-preferences-learning',
      },
      {
        key: 'app-mode',
        titleKey: 'settings.items.appMode',
        kind: 'route',
        routeName: 'settings-preferences-app-mode',
      },
      {
        key: 'glossary-prefs',
        titleKey: 'settings.items.glossaryPrefs',
        kind: 'route',
        routeName: 'settings-preferences-glossary',
      },
      {
        key: 'time-format',
        titleKey: 'settings.items.timeFormat',
        kind: 'route',
        routeName: 'settings-preferences-time-format',
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
        kind: 'route',
        routeName: 'admin-apps',
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
