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
 * Settings registry: the single source of truth for the settings shell.
 *
 * Data model mirrors official `SettingMenuItem`
 * (`openmetadata-ui/.../utils/GlobalSettingsUtils.tsx:24-35`, pin
 * a3012259ca) and the authored order/values of official
 * `GlobalSettingsClassBase.getGlobalSettingsMenuWithPermission`
 * (`utils/GlobalSettingsClassBase.ts:180-1041`). Design: settings-shell
 * DESIGN.md §3 (frozen, t363 APPROVE_SPEC_BOUNDED).
 *
 * The registry holds no route names (§3.1): navigation targets are derived
 * from the dotted `key` by `resolveSettingsNavigation`, and the
 * segment-to-route-name table lives in the router module. Copy lives in
 * `settings.registry.*` / `settings.shell.*` locale keys (§12); icons
 * resolve through `SmIcon` / `navIcons` via `iconKey` (§13).
 */

/** Pin `ResourceEntity` names the registry's `view` rules evaluate. */
export type SettingsPermissionResource =
  | 'API_SERVICE'
  | 'DATABASE_SERVICE'
  | 'MESSAGING_SERVICE'
  | 'DASHBOARD_SERVICE'
  | 'PIPELINE_SERVICE'
  | 'ML_MODEL_SERVICE'
  | 'STORAGE_SERVICE'
  | 'SEARCH_SERVICE'
  | 'METADATA_SERVICE'
  | 'DRIVE_SERVICE'
  | 'EVENT_SUBSCRIPTION'
  | 'TEAM'
  | 'USER';

/**
 * Permission rule data (§11.1). A rule is data, never a boolean: the
 * live evaluator in `./permissionRules` (`evaluatePermissionRule` /
 * `filterVisibleSettingsItems`) turns it into pin's `isProtected` value
 * at render time. An absent rule means `isProtected` is `undefined`,
 * which §5.2 treats differently from `false`.
 */
export type SettingsPermissionRule =
  | { kind: 'admin' }
  | { kind: 'always' }
  | { kind: 'view'; resource: SettingsPermissionResource }
  | { kind: 'auditOrAdmin' }
  | { kind: 'loginConfig' };

export type SettingsPermissionRuleKind = SettingsPermissionRule['kind'];

export type SettingsIconColor = 'blue' | 'green';

/**
 * Navigation target descriptor (§3.6). Only `members.teams` carries one:
 * the pin target is `/settings/members/teams/Organization`, which needs
 * the D-11 FQN work; until then the navigators route by key segments to
 * the teams list route and ignore this descriptor's kind. The kind is a
 * D-11 marker, consumed only by the dispatch contract test
 * (`registry.test.ts`), recording that the pin target differs from the
 * list route. The descriptor carries no route name — route names belong
 * to the router module.
 */
export interface SettingsRegistryTarget {
  kind: 'teams-list';
  /** Why the target is special and what unblocks the pin target. */
  todo: string;
}

export interface SettingsRegistryItem {
  /** Dotted key, e.g. `services.databases`, `preferences.search-settings.tables`. */
  key: string;
  /**
   * Card title key: pin `category` for categories, pin `label` for items.
   * Cards render `category ?? label` (§7), which collapses to this key.
   */
  titleKey: string;
  /** Card description key. */
  descriptionKey: string;
  /**
   * Entity label key interpolated as `{entity}` into template descriptions
   * (search-settings and custom-properties items). Points at the item's
   * own title key: pin passes `entity: t(same label key)` for every such
   * item, so the singular/plural distribution of §3.3/§3.4 is carried by
   * the title values themselves, never merged into one shared key.
   */
  descriptionEntityKey?: string;
  /** Icon key resolved through `SmIcon` / `navIcons` (§13). */
  iconKey: string;
  /** Tinted tile; only the four pin items carry one. */
  iconColor?: SettingsIconColor;
  /** Beta badge; only `preferences.dataAssetRules` carries one. */
  isBeta?: boolean;
  /**
   * Permission rule. Absent means pin `isProtected` is `undefined`: the
   * item shows iff it has visible children (§5.2). Only the six
   * rule-less categories omit it.
   */
  permissionRule?: SettingsPermissionRule;
  /** Nested items. Only categories and `preferences.search-settings` have them. */
  items?: readonly SettingsRegistryItem[];
  /**
   * Render children sorted by rendered label (`localeCompare`). True only
   * for `preferences.search-settings` (§3.4) and `customProperties`
   * (§3.5): pin sorts both arrays at definition time.
   */
  sortByLabel?: boolean;
  /** Navigation exception descriptor (§3.6). Only `members.teams` has one. */
  target?: SettingsRegistryTarget;
}

const ADMIN: SettingsPermissionRule = { kind: 'admin' };
const ALWAYS: SettingsPermissionRule = { kind: 'always' };

function view(resource: SettingsPermissionResource): SettingsPermissionRule {
  return { kind: 'view', resource };
}

const SEARCH_SETTINGS_DESCRIPTION_KEY =
  'settings.registry.templates.searchSettingsForEntity';
const DEFINE_FOR_ENTITY_KEY =
  'settings.registry.templates.defineCustomPropertyForEntity';
const DEFINE_FOR_COLUMN_KEY =
  'settings.registry.templates.defineCustomPropertyForColumn';

/** Pin authored order for the 23 search-settings nested items (§3.4). */
const SEARCH_SETTINGS_TITLES: ReadonlyArray<{ segment: string; iconKey: string }> = [
  { segment: 'tables', iconKey: 'entity-table' },
  { segment: 'dashboards', iconKey: 'entity-dashboard' },
  { segment: 'pipelines', iconKey: 'entity-pipeline' },
  { segment: 'topics', iconKey: 'entity-topic' },
  { segment: 'glossaryTerm', iconKey: 'entity-glossary-term' },
  { segment: 'apiEndpoints', iconKey: 'entity-api-endpoint' },
  { segment: 'dashboardDataModels', iconKey: 'entity-dashboard-data-model' },
  { segment: 'storedProcedures', iconKey: 'entity-stored-procedure' },
  { segment: 'containers', iconKey: 'entity-container' },
  { segment: 'mlmodels', iconKey: 'entity-mlmodel' },
  { segment: 'dataProducts', iconKey: 'entity-data-product' },
  { segment: 'query', iconKey: 'entity-query' },
  { segment: 'tags', iconKey: 'entity-tag' },
  { segment: 'databases', iconKey: 'entity-database' },
  { segment: 'databaseSchemas', iconKey: 'entity-database-schema' },
  { segment: 'domains', iconKey: 'entity-domain' },
  { segment: 'metrics', iconKey: 'entity-metric' },
  { segment: 'searchIndexes', iconKey: 'entity-search-index' },
  { segment: 'directories', iconKey: 'entity-directory' },
  { segment: 'files', iconKey: 'entity-file' },
  { segment: 'spreadsheets', iconKey: 'entity-spreadsheet' },
  { segment: 'worksheets', iconKey: 'entity-worksheet' },
  { segment: 'column', iconKey: 'entity-column' },
];

function searchSettingsItem(segment: string, iconKey: string): SettingsRegistryItem {
  const titleKey = `settings.registry.preferences.searchSettings.${segment}.title`;
  return {
    key: `preferences.search-settings.${segment}`,
    titleKey,
    descriptionKey: SEARCH_SETTINGS_DESCRIPTION_KEY,
    descriptionEntityKey: titleKey,
    iconKey,
    permissionRule: ADMIN,
  };
}

/** Pin authored order for the 26 custom-properties items (§3.3). */
const CUSTOM_PROPERTIES_TITLES: ReadonlyArray<{
  segment: string;
  iconKey: string;
  iconColor?: SettingsIconColor;
}> = [
  { segment: 'apiCollections', iconKey: 'entity-api-collection' },
  { segment: 'apiEndpoints', iconKey: 'entity-api-endpoint' },
  { segment: 'dataProducts', iconKey: 'entity-data-product' },
  { segment: 'dashboardDataModels', iconKey: 'entity-dashboard-data-model' },
  { segment: 'databases', iconKey: 'entity-database' },
  { segment: 'databaseSchemas', iconKey: 'entity-database-schema' },
  { segment: 'metrics', iconKey: 'entity-metric' },
  { segment: 'tables', iconKey: 'entity-table' },
  { segment: 'storedProcedures', iconKey: 'entity-stored-procedure' },
  { segment: 'dashboards', iconKey: 'entity-dashboard' },
  { segment: 'pipelines', iconKey: 'entity-pipeline' },
  { segment: 'topics', iconKey: 'entity-topic' },
  { segment: 'containers', iconKey: 'entity-container' },
  { segment: 'mlmodels', iconKey: 'entity-mlmodel' },
  { segment: 'searchIndexes', iconKey: 'entity-search-index' },
  { segment: 'column', iconKey: 'entity-column' },
  { segment: 'glossaryTerm', iconKey: 'entity-glossary-term' },
  { segment: 'domains', iconKey: 'entity-domain' },
  { segment: 'charts', iconKey: 'entity-chart' },
  { segment: 'directories', iconKey: 'entity-directory' },
  { segment: 'files', iconKey: 'entity-file' },
  { segment: 'spreadsheets', iconKey: 'entity-spreadsheet' },
  { segment: 'worksheets', iconKey: 'entity-worksheet' },
  { segment: 'articles', iconKey: 'entity-article', iconColor: 'green' },
  { segment: 'teams', iconKey: 'entity-team' },
  { segment: 'users', iconKey: 'entity-user' },
];

function customPropertiesItem(
  segment: string,
  iconKey: string,
  iconColor?: SettingsIconColor,
): SettingsRegistryItem {
  const titleKey = `settings.registry.customProperties.${segment}.title`;
  // `column` uses the dedicated column-level sentence; the other 25 share
  // the `{entity}` template with the item's own title as the entity.
  const isColumn = segment === 'column';
  return {
    key: `customProperties.${segment}`,
    titleKey,
    descriptionKey: isColumn ? DEFINE_FOR_COLUMN_KEY : DEFINE_FOR_ENTITY_KEY,
    ...(isColumn ? {} : { descriptionEntityKey: titleKey }),
    iconKey,
    ...(iconColor ? { iconColor } : {}),
    permissionRule: ADMIN,
  };
}

function item(
  key: string,
  titleKey: string,
  descriptionKey: string,
  iconKey: string,
  permissionRule: SettingsPermissionRule | undefined,
  extra: Partial<SettingsRegistryItem> = {},
): SettingsRegistryItem {
  return {
    key,
    titleKey,
    descriptionKey,
    iconKey,
    ...(permissionRule ? { permissionRule } : {}),
    ...extra,
  };
}

/**
 * The 11 categories in pin order (§3.2). Segments are derived from `key`
 * via `settingsKeySegments` — no item stores a second copy (§3.1).
 */
export const SETTINGS_REGISTRY: readonly SettingsRegistryItem[] = [
  {
    key: 'services',
    titleKey: 'settings.registry.services.title',
    descriptionKey: 'settings.registry.services.description',
    iconKey: 'settings-services',
    items: [
      item(
        'services.apiServices',
        'settings.registry.services.apiServices.title',
        'settings.registry.services.apiServices.description',
        'entity-api-service',
        view('API_SERVICE'),
      ),
      item(
        'services.databases',
        'settings.registry.services.databases.title',
        'settings.registry.services.databases.description',
        'service-database',
        view('DATABASE_SERVICE'),
      ),
      item(
        'services.messaging',
        'settings.registry.services.messaging.title',
        'settings.registry.services.messaging.description',
        'service-messaging',
        view('MESSAGING_SERVICE'),
      ),
      item(
        'services.dashboards',
        'settings.registry.services.dashboards.title',
        'settings.registry.services.dashboards.description',
        'service-dashboard',
        view('DASHBOARD_SERVICE'),
      ),
      item(
        'services.pipelines',
        'settings.registry.services.pipelines.title',
        'settings.registry.services.pipelines.description',
        'service-pipeline',
        view('PIPELINE_SERVICE'),
      ),
      item(
        'services.mlmodels',
        'settings.registry.services.mlmodels.title',
        'settings.registry.services.mlmodels.description',
        'entity-mlmodel',
        view('ML_MODEL_SERVICE'),
      ),
      item(
        'services.storages',
        'settings.registry.services.storages.title',
        'settings.registry.services.storages.description',
        'service-storage',
        view('STORAGE_SERVICE'),
      ),
      item(
        'services.search',
        'settings.registry.services.search.title',
        'settings.registry.services.search.description',
        'entity-search-service',
        view('SEARCH_SERVICE'),
      ),
      item(
        'services.metadata',
        'settings.registry.services.metadata.title',
        'settings.registry.services.metadata.description',
        'entity-metadata-service',
        view('METADATA_SERVICE'),
      ),
      item(
        'services.drives',
        'settings.registry.services.drives.title',
        'settings.registry.services.drives.description',
        'entity-drive-service',
        view('DRIVE_SERVICE'),
      ),
      item(
        'services.dataObservability',
        'settings.registry.services.dataObservability.title',
        'settings.registry.services.dataObservability.description',
        'entity-data-observability',
        ALWAYS,
      ),
    ],
  },
  {
    key: 'apps',
    titleKey: 'settings.registry.apps.title',
    descriptionKey: 'settings.registry.apps.description',
    iconKey: 'settings-apps',
    permissionRule: ADMIN,
  },
  {
    key: 'notifications',
    titleKey: 'settings.registry.notifications.title',
    descriptionKey: 'settings.registry.notifications.description',
    iconKey: 'settings-notifications',
    permissionRule: view('EVENT_SUBSCRIPTION'),
    items: [
      // Pin gives Alerts the same description key as the category.
      item(
        'notifications.alerts',
        'settings.registry.notifications.alerts.title',
        'settings.registry.notifications.description',
        'settings-alerts',
        view('EVENT_SUBSCRIPTION'),
      ),
      item(
        'notifications.announcements',
        'settings.registry.notifications.announcements.title',
        'settings.registry.notifications.announcements.description',
        'settings-announcements',
        ADMIN,
      ),
    ],
  },
  {
    key: 'members',
    titleKey: 'settings.registry.members.title',
    descriptionKey: 'settings.registry.members.description',
    iconKey: 'settings-members',
    items: [
      item(
        'members.teams',
        'settings.registry.members.teams.title',
        'settings.registry.members.teams.description',
        'entity-team',
        view('TEAM'),
        {
          target: {
            kind: 'teams-list',
            todo: 'Pin target is /settings/members/teams/Organization; switch when the D-11 FQN work lands (DESIGN §3.6/D-11).',
          },
        },
      ),
      item(
        'members.users',
        'settings.registry.members.users.title',
        'settings.registry.members.users.description',
        'entity-user',
        view('USER'),
      ),
      item(
        'members.admins',
        'settings.registry.members.admins.title',
        'settings.registry.members.admins.description',
        'entity-admin',
        view('USER'),
      ),
      item(
        'members.online-users',
        'settings.registry.members.onlineUsers.title',
        'settings.registry.members.onlineUsers.description',
        'entity-user',
        ADMIN,
      ),
    ],
  },
  {
    key: 'access',
    titleKey: 'settings.registry.access.title',
    descriptionKey: 'settings.registry.access.description',
    iconKey: 'settings-access',
    items: [
      item(
        'access.roles',
        'settings.registry.access.roles.title',
        'settings.registry.access.roles.description',
        'entity-role',
        ADMIN,
      ),
      item(
        'access.policies',
        'settings.registry.access.policies.title',
        'settings.registry.access.policies.description',
        'entity-policy',
        ADMIN,
      ),
      item(
        'access.permission-debugger',
        'settings.registry.access.permissionDebugger.title',
        'settings.registry.access.permissionDebugger.description',
        'settings-permission-debugger',
        ADMIN,
      ),
      item(
        'access.audit-logs',
        'settings.registry.access.auditLogs.title',
        'settings.registry.access.auditLogs.description',
        'settings-audit-logs',
        { kind: 'auditOrAdmin' },
      ),
    ],
  },
  {
    key: 'preferences',
    titleKey: 'settings.registry.preferences.title',
    descriptionKey: 'settings.registry.preferences.description',
    iconKey: 'settings-preferences',
    items: [
      item(
        'preferences.appearance',
        'settings.registry.preferences.appearance.title',
        'settings.registry.preferences.appearance.description',
        'settings-theme',
        ADMIN,
      ),
      item(
        'preferences.email',
        'settings.registry.preferences.email.title',
        'settings.registry.preferences.email.description',
        'settings-email',
        ADMIN,
      ),
      item(
        'preferences.loginConfiguration',
        'settings.registry.preferences.loginConfiguration.title',
        'settings.registry.preferences.loginConfiguration.description',
        'settings-login',
        { kind: 'loginConfig' },
      ),
      item(
        'preferences.om-health',
        'settings.registry.preferences.omHealth.title',
        'settings.registry.preferences.omHealth.description',
        'settings-health',
        ADMIN,
      ),
      item(
        'preferences.profiler-configuration',
        'settings.registry.preferences.profilerConfiguration.title',
        'settings.registry.preferences.profilerConfiguration.description',
        'settings-profiler',
        ADMIN,
      ),
      item(
        'preferences.data-quality',
        'settings.registry.preferences.dataQuality.title',
        'settings.registry.preferences.dataQuality.description',
        'settings-data-quality',
        ADMIN,
      ),
      {
        key: 'preferences.search-settings',
        titleKey: 'settings.registry.preferences.searchSettings.title',
        descriptionKey: 'settings.registry.preferences.searchSettings.description',
        iconKey: 'settings-search',
        permissionRule: ADMIN,
        sortByLabel: true,
        items: SEARCH_SETTINGS_TITLES.map(({ segment, iconKey }) =>
          searchSettingsItem(segment, iconKey),
        ),
      },
      item(
        'preferences.lineageConfig',
        'settings.registry.preferences.lineageConfig.title',
        'settings.registry.preferences.lineageConfig.description',
        'settings-lineage',
        ADMIN,
      ),
      item(
        'preferences.om-url-config',
        'settings.registry.preferences.omUrlConfig.title',
        'settings.registry.preferences.omUrlConfig.description',
        'settings-url',
        ADMIN,
      ),
      item(
        'preferences.dataAssetRules',
        'settings.registry.preferences.dataAssetRules.title',
        'settings.registry.preferences.dataAssetRules.description',
        'settings-data-asset-rules',
        ADMIN,
        { isBeta: true },
      ),
      item(
        'preferences.learning-resources',
        'settings.registry.preferences.learningResources.title',
        'settings.registry.preferences.learningResources.description',
        'learning',
        ADMIN,
      ),
      item(
        'preferences.appMode',
        'settings.registry.preferences.appMode.title',
        'settings.registry.preferences.appMode.description',
        'settings-app-mode',
        ADMIN,
        { iconColor: 'blue' },
      ),
      item(
        'preferences.glossary',
        'settings.registry.preferences.glossary.title',
        'settings.registry.preferences.glossary.description',
        'settings-glossary',
        ADMIN,
        { iconColor: 'blue' },
      ),
      item(
        'preferences.timeFormat',
        'settings.registry.preferences.timeFormat.title',
        'settings.registry.preferences.timeFormat.description',
        'settings-time-format',
        ADMIN,
        { iconColor: 'blue' },
      ),
    ],
  },
  {
    key: 'customProperties',
    titleKey: 'settings.registry.customProperties.title',
    descriptionKey: 'settings.registry.customProperties.description',
    iconKey: 'settings-custom-properties',
    sortByLabel: true,
    items: CUSTOM_PROPERTIES_TITLES.map(({ segment, iconKey, iconColor }) =>
      customPropertiesItem(segment, iconKey, iconColor),
    ),
  },
  {
    key: 'bots',
    titleKey: 'settings.registry.bots.title',
    descriptionKey: 'settings.registry.bots.description',
    iconKey: 'settings-bots',
    permissionRule: ADMIN,
  },
  {
    key: 'persona',
    titleKey: 'settings.registry.persona.title',
    descriptionKey: 'settings.registry.persona.description',
    iconKey: 'settings-persona',
    permissionRule: ADMIN,
  },
  {
    key: 'sso',
    titleKey: 'settings.registry.sso.title',
    descriptionKey: 'settings.registry.sso.description',
    iconKey: 'settings-sso',
    permissionRule: ADMIN,
  },
  {
    key: 'governance',
    titleKey: 'settings.registry.governance.title',
    descriptionKey: 'settings.registry.governance.description',
    iconKey: 'settings-governance',
    items: [
      item(
        'governance.glossary-term-relations',
        'settings.registry.governance.glossaryTermRelations.title',
        'settings.registry.governance.glossaryTermRelations.description',
        'entity-glossary-term',
        ADMIN,
      ),
      item(
        'governance.workflow-definitions',
        'settings.registry.governance.workflowDefinitions.title',
        'settings.registry.governance.workflowDefinitions.description',
        'workflows',
        ADMIN,
      ),
      item(
        'governance.intake-forms',
        'settings.registry.governance.intakeForms.title',
        'settings.registry.governance.intakeForms.description',
        'settings-intake-forms',
        ADMIN,
      ),
    ],
  },
];

/** URL segments for a dotted registry key, in order. */
export function settingsKeySegments(key: string): string[] {
  return key.split('.');
}

/** The item's own URL segment (the last part of its dotted key). */
export function settingsKeySegment(key: string): string {
  const segments = settingsKeySegments(key);
  return segments[segments.length - 1] ?? '';
}

/** Depth-first lookup by dotted key; `undefined` for unknown keys (no fallback). */
export function findSettingsRegistryItem(key: string): SettingsRegistryItem | undefined {
  const visit = (items: readonly SettingsRegistryItem[]): SettingsRegistryItem | undefined => {
    for (const entry of items) {
      if (entry.key === key) {
        return entry;
      }
      const found = entry.items ? visit(entry.items) : undefined;
      if (found) {
        return found;
      }
    }
    return undefined;
  };
  return visit(SETTINGS_REGISTRY);
}

/** Every registry item, preorder: categories, items, then nested items. */
export function flattenSettingsRegistry(): SettingsRegistryItem[] {
  const out: SettingsRegistryItem[] = [];
  const visit = (items: readonly SettingsRegistryItem[]): void => {
    for (const entry of items) {
      out.push(entry);
      if (entry.items) {
        visit(entry.items);
      }
    }
  };
  visit(SETTINGS_REGISTRY);
  return out;
}

/**
 * Sort a copy of the items by their rendered title; the input is never
 * mutated and the authored order is not the display order. Used for the
 * two `sortByLabel` containers (§3.4/§3.5).
 */
export function sortSettingsItemsByRenderedTitle<T extends { titleKey: string }>(
  items: readonly T[],
  title: (key: string) => string,
): T[] {
  return [...items].sort((a, b) => title(a.titleKey).localeCompare(title(b.titleKey)));
}

export type SettingsTranslator = (
  key: string,
  params?: Record<string, string>,
) => string;

/**
 * Rendered card title. Always supplies `{brandName}` (the `{{brandName}}
 * URL` title needs it); other titles ignore the extra param.
 */
export function registryTitle(
  t: SettingsTranslator,
  entry: SettingsRegistryItem,
): string {
  return t(entry.titleKey, { brandName: t('product.name') });
}

/**
 * Rendered card description. Supplies `{brandName}` and, for template
 * descriptions, `{entity}` resolved through the item's
 * `descriptionEntityKey`. Non-template descriptions ignore extra params.
 */
export function registryDescription(
  t: SettingsTranslator,
  entry: SettingsRegistryItem,
): string {
  return t(entry.descriptionKey, {
    brandName: t('product.name'),
    ...(entry.descriptionEntityKey
      ? { entity: t(entry.descriptionEntityKey, { brandName: t('product.name') }) }
      : {}),
  });
}
// ---------------------------------------------------------------------------
// Navigation dispatch (§3.6)
// ---------------------------------------------------------------------------

export type SettingsNavigationTarget =
  | { kind: 'settings'; key: string; segments: readonly string[] }
  | {
      kind: 'teams-list';
      key: string;
      segments: readonly string[];
      todo: string;
    };

/**
 * Key → navigation target. Single-segment keys land on the category URL,
 * two-segment keys on `/settings/<category>/<segment>`, three-segment
 * keys on the search-settings entity URL — all from the key's segments,
 * with the `members.teams` descriptor as the only data-driven exception.
 * The `teams-list` kind is a marker only: no navigator branches on it;
 * all three navigators route by key segments until the D-11 FQN work
 * lands the pin Organization target. Unknown keys resolve to `undefined` (no fallback). The target carries
 * segments only; the router module maps segments to route names.
 */
export function resolveSettingsNavigation(
  key: string,
): SettingsNavigationTarget | undefined {
  const entry = findSettingsRegistryItem(key);
  if (!entry) {
    return undefined;
  }
  const segments = settingsKeySegments(entry.key);
  if (entry.target) {
    return { kind: 'teams-list', key: entry.key, segments, todo: entry.target.todo };
  }
  return { kind: 'settings', key: entry.key, segments };
}

/** Default settings URL for a key (`/settings/<segments>`); the navigators use it for every target, including the teams-list exception, until the D-11 FQN work lands the pin Organization target. */
export function defaultSettingsPathForKey(key: string): string {
  return `/settings/${settingsKeySegments(key).join('/')}`;
}

// ---------------------------------------------------------------------------
// Breadcrumb category names (§9.2)
// ---------------------------------------------------------------------------

export interface SettingsBreadcrumbName {
  /**
   * Lookup key: the pin enum value — the category segment
   * (`GlobalSettingsMenuCategory`) or, for the two sub-category entries,
   * the option segment (`GlobalSettingOptions`), e.g. `search-settings`.
   * Pin `settingCategories` is keyed exactly this way, and the breadcrumb
   * builder looks categories and sub-categories up by their bare segment.
   */
  key: string;
  /** Breadcrumb name key — a separate key set from card titles (§12.3). */
  nameKey: string;
  /** Settings-space path from `/settings`, e.g. `preferences/search-settings` (pin `url`). */
  path: string;
}

/**
 * Pin `settingCategories` (`GlobalSettingsClassBase.ts:94-147`): 11
 * categories plus the 2 sub-category entries, keyed by bare segment.
 * Same module as the registry, never a second copy (§9.2). Three names
 * differ from the card titles (Members, Persona singular, and the shared
 * Access Control value under a separate key) — pin verbatim.
 */
export const SETTINGS_BREADCRUMB_NAMES: Readonly<
  Record<string, SettingsBreadcrumbName>
> = {
  services: {
    key: 'services',
    nameKey: 'settings.registry.services.breadcrumbName',
    path: 'services',
  },
  notifications: {
    key: 'notifications',
    nameKey: 'settings.registry.notifications.breadcrumbName',
    path: 'notifications',
  },
  members: {
    key: 'members',
    nameKey: 'settings.registry.members.breadcrumbName',
    path: 'members',
  },
  access: {
    key: 'access',
    nameKey: 'settings.registry.access.breadcrumbName',
    path: 'access',
  },
  preferences: {
    key: 'preferences',
    nameKey: 'settings.registry.preferences.breadcrumbName',
    path: 'preferences',
  },
  'search-settings': {
    key: 'search-settings',
    nameKey: 'settings.registry.preferences.searchSettings.breadcrumbName',
    path: 'preferences/search-settings',
  },
  customProperties: {
    key: 'customProperties',
    nameKey: 'settings.registry.customProperties.breadcrumbName',
    path: 'customProperties',
  },
  bots: {
    key: 'bots',
    nameKey: 'settings.registry.bots.breadcrumbName',
    path: 'bots',
  },
  apps: {
    key: 'apps',
    nameKey: 'settings.registry.apps.breadcrumbName',
    path: 'apps',
  },
  persona: {
    key: 'persona',
    nameKey: 'settings.registry.persona.breadcrumbName',
    path: 'persona',
  },
  sso: {
    key: 'sso',
    nameKey: 'settings.registry.sso.breadcrumbName',
    path: 'sso',
  },
  governance: {
    key: 'governance',
    nameKey: 'settings.registry.governance.breadcrumbName',
    path: 'governance',
  },
  'workflow-definitions': {
    key: 'workflow-definitions',
    nameKey: 'settings.registry.governance.workflowDefinitions.breadcrumbName',
    path: 'governance/workflow-definitions',
  },
};

/** Breadcrumb name entry for a category or sub-category segment; `undefined` for unknown segments. */
export function settingsBreadcrumbName(segment: string): SettingsBreadcrumbName | undefined {
  return SETTINGS_BREADCRUMB_NAMES[segment];
}

// ---------------------------------------------------------------------------
// Search-settings segment ↔ entity key (§3.5)
// ---------------------------------------------------------------------------

/**
 * URL segment → server asset-type key for the 23 search-settings entity
 * pages. Values are pin `ENTITY_PATH` (`constants/constants.ts:382-419`)
 * — the same table pin's `EntitySearchSettings` uses to turn the URL
 * segment into the entity type — cross-checked against the product's
 * `assetType` values (`table`, `dashboard`, `tableColumn`, …). A
 * separate table from the custom-properties mapping: the vocabularies
 * differ (`query`/`tags` here, `charts`/`articles` there).
 */
export const SEARCH_SETTINGS_SEGMENT_ENTITIES: readonly {
  segment: string;
  entity: string;
}[] = [
  { segment: 'tables', entity: 'table' },
  { segment: 'dashboards', entity: 'dashboard' },
  { segment: 'pipelines', entity: 'pipeline' },
  { segment: 'topics', entity: 'topic' },
  { segment: 'glossaryTerm', entity: 'glossaryTerm' },
  { segment: 'apiEndpoints', entity: 'apiEndpoint' },
  { segment: 'dashboardDataModels', entity: 'dashboardDataModel' },
  { segment: 'storedProcedures', entity: 'storedProcedure' },
  { segment: 'containers', entity: 'container' },
  { segment: 'mlmodels', entity: 'mlmodel' },
  { segment: 'dataProducts', entity: 'dataProduct' },
  { segment: 'query', entity: 'query' },
  { segment: 'tags', entity: 'tag' },
  { segment: 'databases', entity: 'database' },
  { segment: 'databaseSchemas', entity: 'databaseSchema' },
  { segment: 'domains', entity: 'domain' },
  { segment: 'metrics', entity: 'metric' },
  { segment: 'searchIndexes', entity: 'searchIndex' },
  { segment: 'directories', entity: 'directory' },
  { segment: 'files', entity: 'file' },
  { segment: 'spreadsheets', entity: 'spreadsheet' },
  { segment: 'worksheets', entity: 'worksheet' },
  { segment: 'column', entity: 'tableColumn' },
];

const SEARCH_ENTITY_BY_SEGMENT: Readonly<Record<string, string>> =
  Object.fromEntries(
    SEARCH_SETTINGS_SEGMENT_ENTITIES.map(({ segment, entity }) => [segment, entity]),
  );

const SEARCH_SEGMENT_BY_ENTITY: Readonly<Record<string, string>> =
  Object.fromEntries(
    SEARCH_SETTINGS_SEGMENT_ENTITIES.map(({ segment, entity }) => [entity, segment]),
  );

/** Entity key for a search-settings URL segment; `undefined` for unknown segments (D-10: page error state, no fallback). */
export function searchSettingsEntityForSegment(segment: string): string | undefined {
  return SEARCH_ENTITY_BY_SEGMENT[segment];
}

/** URL segment for a search-settings entity key; `undefined` for unknown entities. */
export function searchSettingsSegmentForEntity(entity: string): string | undefined {
  return SEARCH_SEGMENT_BY_ENTITY[entity];
}
