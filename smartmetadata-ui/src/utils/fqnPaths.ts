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
 * FQN path constructors (PAT-FQN, 00-systemic D1; FQN-2).
 *
 * Ported from official `utils/RouterPaths.ts` (`getSettingPath`,
 * `getTeamAndUserDetailsPath`, `getUserPath`) and `utils/RouterUtils.ts`
 * (entity constructors) at pin a3012259ca, with the segment vocabulary
 * of the final partition route table (t363 staged contract: the settings
 * space lives under `/settings`; user/bot details are top-level bare
 * routes `/users/:fqn` and `/bots/:fqn`). The settings root is a single
 * constant: if the shell registry ever moves the settings space, only
 * SETTINGS_BASE changes — no call site hardcodes a path (FQN-2).
 *
 * Encoding: `getEncodedFqn` is official `utils/StringUtils.ts`
 * `getEncodedFqn` verbatim — `encodeURIComponent`, with the `spaceAsPlus`
 * variant opt-in (default false) and only for call points the partition
 * designs cite. Write paths keep using entity ids (FQN-5); FQN is for
 * routes and reads only.
 */

export function getEncodedFqn(fqn: string, spaceAsPlus = false): string {
  let uri = encodeURIComponent(fqn);
  if (spaceAsPlus) {
    uri = uri.replaceAll('%20', '+');
  }
  return uri;
}

export function getDecodedFqn(fqn: string, plusAsSpace = false): string {
  let uri = decodeURIComponent(fqn);
  if (plusAsSpace) {
    uri = uri.replaceAll('+', ' ');
  }
  return uri;
}

/** Settings-space root (t363 shell contract; single point of change). */
export const SETTINGS_BASE = '/settings';

const PLACEHOLDER_CATEGORY = ':settingCategory';
const PLACEHOLDER_TAB = ':tab';
const PLACEHOLDER_FQN = ':fqn';
const PLACEHOLDER_ACTION = ':action';
const PLACEHOLDER_RULE_NAME = ':ruleName';

/** Route templates, mirroring official `ROUTES` settings entries. */
export const SETTINGS_TEMPLATES = {
  settings: `${SETTINGS_BASE}`,
  withCategory: `${SETTINGS_BASE}/${PLACEHOLDER_CATEGORY}`,
  withCategoryFqn: `${SETTINGS_BASE}/${PLACEHOLDER_CATEGORY}/${PLACEHOLDER_FQN}`,
  withTab: `${SETTINGS_BASE}/${PLACEHOLDER_CATEGORY}/${PLACEHOLDER_TAB}`,
  withTabFqn: `${SETTINGS_BASE}/${PLACEHOLDER_CATEGORY}/${PLACEHOLDER_TAB}/${PLACEHOLDER_FQN}`,
  withTabFqnAction: `${SETTINGS_BASE}/${PLACEHOLDER_CATEGORY}/${PLACEHOLDER_TAB}/${PLACEHOLDER_FQN}/${PLACEHOLDER_ACTION}`,
  addPolicyRule: `${SETTINGS_BASE}/access/policies/${PLACEHOLDER_FQN}/add-rule`,
  editPolicyRule: `${SETTINGS_BASE}/access/policies/${PLACEHOLDER_FQN}/edit-rule/${PLACEHOLDER_RULE_NAME}`,
} as const;

/**
 * Official `getSettingPath(category, tab, withFqn, withAction)`
 * (`RouterPaths.ts:36-64`): template selection only — the `:fqn`
 * placeholder is left for the caller to substitute with an encoded FQN.
 */
export function getSettingPath(
  category?: string,
  tab?: string,
  withFqn = false,
  withAction = false,
): string {
  let path: string = SETTINGS_TEMPLATES.settings;
  if (tab && category) {
    path = withFqn
      ? withAction
        ? SETTINGS_TEMPLATES.withTabFqnAction
        : SETTINGS_TEMPLATES.withTabFqn
      : SETTINGS_TEMPLATES.withTab;
    path = path.replace(PLACEHOLDER_TAB, tab);
    path = path.replace(PLACEHOLDER_CATEGORY, category);
  } else if (category) {
    path = withFqn ? SETTINGS_TEMPLATES.withCategoryFqn : SETTINGS_TEMPLATES.withCategory;
    path = path.replace(PLACEHOLDER_CATEGORY, category);
  }
  return path;
}

/** Official `getSettingPathRelative` (`RouterUtils.ts:233`): strips the settings root. */
export function getSettingPathRelative(
  category?: string,
  tab?: string,
  withFqn = false,
  withAction = false,
): string {
  return getSettingPath(category, tab, withFqn, withAction).replace(SETTINGS_BASE, '');
}

/**
 * Official `getSettingsPathWithFqn` (`RouterUtils.ts:245`): three-level
 * detail path with the FQN substituted, plus an optional `:action` segment.
 */
export function getSettingsPathWithFqn(
  category: string,
  tab: string,
  fqn: string,
  action?: string,
): string {
  let path: string = action ? SETTINGS_TEMPLATES.withTabFqnAction : SETTINGS_TEMPLATES.withTabFqn;
  if (action) {
    path = path.replace(PLACEHOLDER_ACTION, action);
  }
  path = path.replace(PLACEHOLDER_TAB, tab);
  path = path.replace(PLACEHOLDER_CATEGORY, category);
  path = path.replace(PLACEHOLDER_FQN, getEncodedFqn(fqn));
  return path;
}

/** Official `getUserPath` (`RouterPaths.ts:83-97`): top-level bare route. */
export function getUserPath(username: string, tab?: string, subTab?: string): string {
  let path = `/users/${getEncodedFqn(username)}`;
  if (tab) {
    path += `/${tab}`;
    if (subTab) {
      path += `/${subTab}`;
    }
  }
  return path;
}

/** Official `getBotPath` shape: top-level bare route (10-draft S-7). */
export function getBotPath(fqn: string): string {
  return `/bots/${getEncodedFqn(fqn)}`;
}

/**
 * Official `getTeamAndUserDetailsPath` (`RouterPaths.ts:66-81`): empty
 * name returns the list path without an FQN segment.
 */
export function getTeamAndUserDetailsPath(name?: string): string {
  if (!name) {
    return getSettingPath('members', 'teams');
  }
  return getSettingPath('members', 'teams', true).replace(
    PLACEHOLDER_FQN,
    getEncodedFqn(name),
  );
}

/** Official `getTeamsWithFqnPath` (`RouterUtils.ts:282`), incl. `?activeTab=`. */
export function getTeamsWithFqnPath(fqn: string, options?: { activeTab?: string }): string {
  const path = getSettingsPathWithFqn('members', 'teams', fqn);
  const query = options?.activeTab ? `?activeTab=${encodeURIComponent(options.activeTab)}` : '';
  return `${path}${query}`;
}

/** Official `getRoleWithFqnPath` (`RouterUtils.ts:300`). */
export function getRoleWithFqnPath(fqn: string): string {
  return getSettingsPathWithFqn('access', 'roles', fqn);
}

/** Official `getPolicyWithFqnPath` (`RouterUtils.ts:311`). */
export function getPolicyWithFqnPath(fqn: string): string {
  return getSettingsPathWithFqn('access', 'policies', fqn);
}

/** Official `getAddPolicyRulePath` (`RouterUtils.ts:353`): `:fqn/add-rule`. */
export function getAddPolicyRulePath(fqn: string): string {
  return SETTINGS_TEMPLATES.addPolicyRule.replace(PLACEHOLDER_FQN, getEncodedFqn(fqn));
}

/** Official `getEditPolicyRulePath` (`RouterUtils.ts:361`): `:fqn/edit-rule/:ruleName`. */
export function getEditPolicyRulePath(fqn: string, ruleName: string): string {
  return SETTINGS_TEMPLATES.editPolicyRule
    .replace(PLACEHOLDER_FQN, getEncodedFqn(fqn))
    .replace(PLACEHOLDER_RULE_NAME, getEncodedFqn(ruleName));
}

/** Official `getPersonaDetailsPath` (`RouterUtils.ts:599`): two-level settings path. */
export function getPersonaDetailsPath(fqn: string): string {
  return SETTINGS_TEMPLATES.withCategoryFqn
    .replace(PLACEHOLDER_CATEGORY, 'persona')
    .replace(PLACEHOLDER_FQN, getEncodedFqn(fqn));
}

/** Official `getApplicationDetailsPath` (`RouterUtils.ts:206`): two-level settings path. */
export function getApplicationDetailsPath(fqn: string): string {
  return SETTINGS_TEMPLATES.withCategoryFqn
    .replace(PLACEHOLDER_CATEGORY, 'apps')
    .replace(PLACEHOLDER_FQN, getEncodedFqn(fqn));
}

/**
 * Official `getNotificationAlertDetailsPath` (`RouterUtils.ts:639`):
 * `:fqn/:tab`, tab defaulting to `configuration` (AlertDetailTabs).
 */
export function getNotificationAlertDetailsPath(fqn: string, tab?: string): string {
  return `${getSettingsPathWithFqn('notifications', 'alerts', fqn)}/${tab ?? 'configuration'}`;
}

/** Official `getObservabilityAlertDetailsPath` (`RouterUtils.ts:628`): `/observability/alert/:fqn/:tab`. */
export function getObservabilityAlertDetailsPath(fqn: string, tab?: string): string {
  return `/observability/alert/${getEncodedFqn(fqn)}/${tab ?? 'configuration'}`;
}

/** Official EntityTabs values that carry a sub-tab path segment. */
export const ENTITY_TAB_ACTIVITY_FEED = 'activity_feed';
export const ENTITY_TAB_PROFILER = 'profiler';

/** Official TestCasePageTabs default on the test-case detail path. */
export const TEST_CASE_TAB_RESULTS = 'test-case-results';

/**
 * Official `getEntityDetailsPath` (`RouterUtils.ts`):
 *   /{entityType}/{fqn}
 *   /{entityType}/{fqn}/{tab}
 *   /{entityType}/{fqn}/{tab}/{subTab} for ACTIVITY_FEED and PROFILER.
 * ACTIVITY_FEED without a subTab defaults to `all`. PROFILER only
 * adds a sub-tab segment when one is provided.
 */
export function getEntityDetailsPath(
  entityType: string,
  fqn: string,
  tab?: string,
  subTab?: string,
): string {
  let path = tab ? `/${entityType}/${getEncodedFqn(fqn)}/${tab}` : `/${entityType}/${getEncodedFqn(fqn)}`;
  if (tab === ENTITY_TAB_ACTIVITY_FEED || tab === ENTITY_TAB_PROFILER) {
    const resolvedSubTab =
      subTab || (tab === ENTITY_TAB_ACTIVITY_FEED ? 'all' : undefined);
    if (resolvedSubTab) {
      path = `/${entityType}/${getEncodedFqn(fqn)}/${tab}/${resolvedSubTab}`;
    }
  }
  return path;
}

/** Official `getTestCaseDetailPagePath`: /test-case/{fqn}/{tab}, default test-case-results. */
export function getTestCaseDetailPagePath(fqn: string, tab = TEST_CASE_TAB_RESULTS): string {
  return `/test-case/${getEncodedFqn(fqn)}/${tab}`;
}

/** Official `getQueryPath` (RouterUtils.ts): /query-view/{tableFqn}/{queryId}. queryId is not FQN-encoded. */
export function getQueryPath(tableFqn: string, queryId: string): string {
  return `/query-view/${getEncodedFqn(tableFqn)}/${queryId}`;
}

/**
 * Official `getDataQualityPagePath` (RouterUtils.ts):
 *   /data-quality
 *   /data-quality/{tab}
 *   /data-quality/{tab}/{subTab}
 */
export function getDataQualityPagePath(tab?: string, subTab?: string): string {
  if (tab && subTab) {
    return `/data-quality/${tab}/${subTab}`;
  }
  if (tab) {
    return `/data-quality/${tab}`;
  }
  return '/data-quality';
}

/** Official EntityTabs.AGENTS / ServiceAgentSubTabs.METADATA. */
export const SERVICE_TAB_AGENTS = 'agents';
export const SERVICE_AGENT_SUB_TAB_METADATA = 'metadata';
export const SERVICE_CATEGORY_DATABASE_SERVICES = 'databaseServices';

/**
 * Official `getServiceDetailsPath` (RouterUtils.ts):
 *   /service/{serviceCat}/{fqn}
 *   /service/{serviceCat}/{fqn}/{tab}
 *   /service/{serviceCat}/{fqn}/{tab}/{subTab}
 */
export function getServiceDetailsPath(
  serviceFqn: string,
  serviceCat: string,
  tab?: string,
  subTab?: string,
): string {
  let path = `/service/${serviceCat}/${getEncodedFqn(serviceFqn)}`;
  if (tab) {
    path = `/service/${serviceCat}/${getEncodedFqn(serviceFqn)}/${tab}`;
  }
  if (tab && subTab) {
    path = `/service/${serviceCat}/${getEncodedFqn(serviceFqn)}/${tab}/${subTab}`;
  }
  return path;
}

/**
 * Official `getAddServicePath` (RouterUtils.ts): /{serviceCategory}/add-service
 */
export function getAddServicePath(serviceCategory: string): string {
  return `/${serviceCategory}/add-service`;
}

/**
 * Official `getEditConnectionPath` (RouterUtils.ts):
 *   /service/{serviceCat}/{fqn}/connection/edit-connection
 */
export function getEditConnectionPath(serviceCategory: string, serviceFqn: string): string {
  return `/service/${serviceCategory}/${getEncodedFqn(serviceFqn)}/connection/edit-connection`;
}

/**
 * Official `getPathByServiceFQN` (RouterUtils.ts): service connection tab
 *   /service/{serviceCat}/{fqn}/connection
 */
export function getPathByServiceFQN(serviceCategory: string, serviceFqn: string): string {
  return getServiceDetailsPath(serviceFqn, serviceCategory, 'connection');
}

/**
 * Official `getAddIngestionPath` (RouterUtils.ts):
 *   /service/{serviceCat}/{fqn}/add-ingestion/{ingestionType}
 */
export function getAddIngestionPath(
  serviceCategory: string,
  serviceFqn: string,
  ingestionType: string,
): string {
  return `/service/${serviceCategory}/${getEncodedFqn(serviceFqn)}/add-ingestion/${ingestionType}`;
}

/**
 * Official `getEditIngestionPath` (RouterUtils.ts):
 *   /service/{serviceCat}/{fqn}/edit-ingestion/{ingestionFqn}/{ingestionType}
 */
export function getEditIngestionPath(
  serviceCategory: string,
  serviceFqn: string,
  ingestionFqn: string,
  ingestionType: string,
): string {
  return `/service/${serviceCategory}/${getEncodedFqn(serviceFqn)}/edit-ingestion/${getEncodedFqn(ingestionFqn)}/${ingestionType}`;
}

/**
 * Official `getServiceVersionPath` (RouterUtils.ts):
 *   /service/{serviceCat}/{fqn}/versions/{version}
 */
export function getServiceVersionPath(
  serviceCategory: string,
  serviceFqn: string,
  version: string,
): string {
  return `/service/${serviceCategory}/${getEncodedFqn(serviceFqn)}/versions/${version}`;
}

/**
 * Official `getTestSuiteIngestionPath` (RouterUtils.ts):
 *   /test-suites/{fqn}/add-ingestion
 *   /test-suites/{fqn}/edit-ingestion/{ingestionFqn}
 */
export function getTestSuiteIngestionPath(testSuiteFqn: string, ingestionFqn?: string): string {
  if (ingestionFqn) {
    return `/test-suites/${getEncodedFqn(testSuiteFqn)}/edit-ingestion/${getEncodedFqn(ingestionFqn)}`;
  }
  return `/test-suites/${getEncodedFqn(testSuiteFqn)}/add-ingestion`;
}
/**
 * Entity → constructor table (FQN-2). Views, list cells, breadcrumbs and
 * post-create navigation call this table; no path strings are handwritten
 * at call sites. Entities without a detail route in the final table
 * (configuration pages, custom properties, governance) are absent on
 * purpose — do not add invented entries.
 */
export const FQN_PATH_CONSTRUCTORS = {
  user: (fqn: string) => getUserPath(fqn),
  bot: (fqn: string) => getBotPath(fqn),
  team: (fqn: string) => getTeamAndUserDetailsPath(fqn),
  role: (fqn: string) => getRoleWithFqnPath(fqn),
  policy: (fqn: string) => getPolicyWithFqnPath(fqn),
  persona: (fqn: string) => getPersonaDetailsPath(fqn),
  application: (fqn: string) => getApplicationDetailsPath(fqn),
  notificationAlert: (fqn: string) => getNotificationAlertDetailsPath(fqn),
  observabilityAlert: (fqn: string) => getObservabilityAlertDetailsPath(fqn),
} as const;

export type FqnPathEntity = keyof typeof FQN_PATH_CONSTRUCTORS;

export function getFqnPath(entity: FqnPathEntity, fqn: string): string {
  return FQN_PATH_CONSTRUCTORS[entity](fqn);
}
