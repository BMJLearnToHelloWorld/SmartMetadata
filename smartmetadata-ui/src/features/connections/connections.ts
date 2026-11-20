/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import type { ServiceHealth } from '@/api/services';
import { KIND_BY_ENTITY_TYPE } from '@/features/home/widgets/usePlatformHealth';
import {
  SERVICE_CATEGORY_ROWS,
  type ServiceCategoryKind,
} from '@/ingestion/serviceCategories';

/**
 * Pure constants and parsers for the Connections page (`/connections`,
 * B-7(c)), mirroring official
 * `components/integration/ConnectionsPage/ConnectionsPage.constants.ts`
 * and `ConnectionsListView.tsx` (pin a3012259ca). No fetching lives
 * here, so every function is unit-testable without a router or API.
 */

export type ConnectionsCategory = ServiceCategoryKind | 'all';

/** The 11 categories, in the same order as pin CATEGORY_CONFIGS. */
export const CONNECTION_CATEGORIES: readonly ServiceCategoryKind[] =
  SERVICE_CATEGORY_ROWS.map((row) => row.kind);

/** The service entity types this page tabs over — deliberately not every
 * service type the server knows (llm/mcp are not listed here). */
export const CONNECTIONS_ENTITY_TYPES: readonly string[] =
  SERVICE_CATEGORY_ROWS.map((row) => row.entityType);

/** Inverse of the entity-type map, derived from the same fact source so
 * the two cannot drift (pin derives CATEGORY_TO_ENTITY_TYPE likewise). */
export const CATEGORY_TO_ENTITY_TYPE: Record<ServiceCategoryKind, string> =
  Object.fromEntries(
    SERVICE_CATEGORY_ROWS.map((row) => [row.kind, row.entityType]),
  ) as Record<ServiceCategoryKind, string>;

/** At or below this many services the whole estate arrives in one
 * request and every interaction is client-side; above it each page is
 * fetched from the server. The mode is derived from the estate
 * response's own `total`, never guessed. */
export const SERVICES_ESTATE_LIMIT = 500;

export const PAGE_SIZE_OPTIONS: readonly number[] = [12, 24, 48];

export function isConnectionsCategory(value: string | null | undefined): value is ServiceCategoryKind {
  return value !== null && value !== undefined && (CONNECTION_CATEGORIES as readonly string[]).includes(value);
}

/** The category a row's entity type tabs under, if it tabs anywhere.
 * Unknown entity types (including llm/mcp) have no tab: the row is
 * dropped, never silently labelled `database`. */
export function categoryOfEntityType(entityType: string): ServiceCategoryKind | undefined {
  const kind = KIND_BY_ENTITY_TYPE[entityType];
  return kind !== undefined && kind !== 'llm' && kind !== 'mcp'
    ? (kind as ServiceCategoryKind)
    : undefined;
}

/** Health states in pin HEALTH_FILTER_ORDER (worst-wins severity). */
export const HEALTH_FILTER_ORDER: readonly ServiceHealth[] = [
  'failed',
  'partialSuccess',
  'notRun',
  'success',
];

/** i18n keys for the four precise health values (pin HEALTH_LABEL_KEYS:
 * label.failed / label.not-ran / label.warning / label.healthy). */
export const HEALTH_LABEL_KEYS: Record<ServiceHealth, string> = {
  failed: 'connections.healthFailed',
  partialSuccess: 'connections.healthPartialSuccess',
  notRun: 'connections.healthNotRun',
  success: 'connections.healthSuccess',
};

/**
 * Legacy single values the Platform Health widget still deep-links
 * (pin LEGACY_HEALTH_ALIASES): `failing` spans failed + partialSuccess,
 * the other two map to one precise state each.
 */
export const LEGACY_HEALTH_ALIASES: Record<string, readonly ServiceHealth[]> = {
  failing: ['failed', 'partialSuccess'],
  healthy: ['success'],
  notRun: ['notRun'],
};

export function parseCsvParam(value: string | string[] | null | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(',') : (value ?? '');
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Parse `?health=`: CSV-split, expand each legacy alias, drop values
 * that are not one of the four precise states (pin parseHealthParam).
 */
export function parseHealthParam(value: string | string[] | null | undefined): ServiceHealth[] {
  const expanded = parseCsvParam(value).flatMap(
    (entry) => LEGACY_HEALTH_ALIASES[entry] ?? [entry as ServiceHealth],
  );
  return expanded.filter((state) => (HEALTH_FILTER_ORDER as readonly string[]).includes(state));
}

/** True when the raw `?health=` value is exactly one legacy alias, so
 * the page rewrites it once to the precise values (pin
 * ConnectionsListView legacy rewrite). */
export function isLegacyHealthParam(value: string | string[] | null | undefined): boolean {
  return (
    typeof value === 'string' && value !== '' && value in LEGACY_HEALTH_ALIASES
  );
}

/**
 * Per-category subtitles (pin CATEGORY_CONFIGS descriptionKey, eight
 * categories; search/drive/security fall back to the generic
 * parameterised message). Values live under `connections.description.*`.
 */
export const CATEGORY_DESCRIPTION_KEYS: Partial<Record<ServiceCategoryKind, string>> = {
  database: 'connections.description.database',
  dashboard: 'connections.description.dashboard',
  messaging: 'connections.description.messaging',
  pipeline: 'connections.description.pipeline',
  storage: 'connections.description.storage',
  api: 'connections.description.api',
  mlmodel: 'connections.description.mlmodel',
  metadata: 'connections.description.metadata',
};
