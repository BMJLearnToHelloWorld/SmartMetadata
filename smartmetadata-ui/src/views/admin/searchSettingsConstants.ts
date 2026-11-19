/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Data tables and pure helpers for the Search settings pages, ported
 * from the official sources cited per table. No behavior lives here
 * beyond the pure mappings the official utils own.
 */
import { getEncodedFqn } from '@/utils/fqnPaths';
import { escapeESReservedCharacters } from '@/api/search';
import { startCase } from '@/utils/text';
import type {
  SearchFieldValueBoost,
  SearchTermBoost,
} from '@/types/admin';

/**
 * The 23 registry nested items, in registry order (GlobalSettingsClassBase
 * :478-685), with the ENTITY_PATH segment -> entityType mapping
 * (constants.ts :382-419) and the registry label keys. The product has no
 * settings registry yet, so the global page cards and the entity page
 * header read this table; when the shell registry lands, re-source the
 * list from it (see the implementation report).
 */
export interface SearchEntitySegment {
  segment: string;
  entityType: string;
  labelKey: string;
}

export const SEARCH_ENTITY_SEGMENTS: SearchEntitySegment[] = [
  { segment: 'tables', entityType: 'table', labelKey: 'settings.searchPrefs.entityTable' },
  { segment: 'dashboards', entityType: 'dashboard', labelKey: 'settings.searchPrefs.entityDashboard' },
  { segment: 'pipelines', entityType: 'pipeline', labelKey: 'settings.searchPrefs.entityPipeline' },
  { segment: 'topics', entityType: 'topic', labelKey: 'settings.searchPrefs.entityTopic' },
  { segment: 'glossaryTerm', entityType: 'glossaryTerm', labelKey: 'settings.searchPrefs.entityGlossaryTerm' },
  { segment: 'apiEndpoints', entityType: 'apiEndpoint', labelKey: 'settings.searchPrefs.entityApiEndpoint' },
  { segment: 'dashboardDataModels', entityType: 'dashboardDataModel', labelKey: 'settings.searchPrefs.entityDashboardDataModel' },
  { segment: 'storedProcedures', entityType: 'storedProcedure', labelKey: 'settings.searchPrefs.entityStoredProcedure' },
  { segment: 'containers', entityType: 'container', labelKey: 'settings.searchPrefs.entityContainer' },
  { segment: 'mlmodels', entityType: 'mlmodel', labelKey: 'settings.searchPrefs.entityMlModel' },
  { segment: 'dataProducts', entityType: 'dataProduct', labelKey: 'settings.searchPrefs.entityDataProduct' },
  { segment: 'query', entityType: 'query', labelKey: 'settings.searchPrefs.entityQuery' },
  { segment: 'tags', entityType: 'tag', labelKey: 'settings.searchPrefs.entityTag' },
  { segment: 'databases', entityType: 'database', labelKey: 'settings.searchPrefs.entityDatabase' },
  { segment: 'databaseSchemas', entityType: 'databaseSchema', labelKey: 'settings.searchPrefs.entityDatabaseSchema' },
  { segment: 'domains', entityType: 'domain', labelKey: 'settings.searchPrefs.entityDomain' },
  { segment: 'metrics', entityType: 'metric', labelKey: 'settings.searchPrefs.entityMetric' },
  { segment: 'searchIndexes', entityType: 'searchIndex', labelKey: 'settings.searchPrefs.entitySearchIndex' },
  { segment: 'directories', entityType: 'directory', labelKey: 'settings.searchPrefs.entityDirectory' },
  { segment: 'files', entityType: 'file', labelKey: 'settings.searchPrefs.entityFile' },
  { segment: 'spreadsheets', entityType: 'spreadsheet', labelKey: 'settings.searchPrefs.entitySpreadsheet' },
  { segment: 'worksheets', entityType: 'worksheet', labelKey: 'settings.searchPrefs.entityWorksheet' },
  { segment: 'column', entityType: 'tableColumn', labelKey: 'settings.searchPrefs.entityColumn' },
];

export const ENTITY_PATH: Record<string, string> = Object.fromEntries(
  SEARCH_ENTITY_SEGMENTS.map((entry) => [entry.segment, entry.entityType]),
);

/**
 * Resolve a route parameter to an entity type. The designed route carries
 * the segment (`:tab`); the current route carries the entity key. Both
 * resolve through this table; anything else is unknown (shell D-10).
 */
export function resolveSearchEntityType(param: string | undefined): string | undefined {
  if (!param) {
    return undefined;
  }
  if (ENTITY_PATH[param]) {
    return ENTITY_PATH[param];
  }
  if (SEARCH_ENTITY_SEGMENTS.some((entry) => entry.entityType === param)) {
    return param;
  }
  return undefined;
}

export function searchEntitySegment(entityType: string): SearchEntitySegment | undefined {
  return SEARCH_ENTITY_SEGMENTS.find((entry) => entry.entityType === entityType);
}

/**
 * Official ENTITY_PATH_TO_SEARCH_INDEX (SearchSettings.constant.ts
 * :22-49), with SearchIndex enum values (search.enum.ts). Keys outside
 * the 23 (glossary, apiCollection, dataAsset, testCase) are kept because
 * the preview resolves through the same table.
 */
export const ENTITY_PATH_TO_SEARCH_INDEX: Record<string, string> = {
  table: 'table',
  topic: 'topic',
  dashboard: 'dashboard',
  pipeline: 'pipeline',
  mlmodel: 'mlmodel',
  container: 'container',
  tag: 'tag',
  glossary: 'glossary',
  glossaryTerm: 'glossaryTerm',
  database: 'database',
  databaseSchema: 'databaseSchema',
  dashboardDataModel: 'dashboardDataModel',
  apiCollection: 'apiCollection',
  apiEndpoint: 'apiEndpoint',
  dataProduct: 'dataProduct',
  metric: 'metric',
  dataAsset: 'dataAsset',
  query: 'query',
  testCase: 'testCase',
  domain: 'domain',
  searchIndex: 'searchIndex',
  storedProcedure: 'storedProcedure',
  directory: 'directory',
  file: 'file',
  spreadsheet: 'spreadsheet',
  worksheet: 'worksheet',
  tableColumn: 'tableColumn',
};

/** Official `globalSettings` table (SearchSettings.constant.ts :46-65). */
export interface GlobalSettingProperty {
  key: 'maxAggregateSize' | 'maxResultHits' | 'maxAnalyzedOffset';
  labelKey: string;
  min: number;
  max: number;
}

export const GLOBAL_SETTING_PROPERTIES: GlobalSettingProperty[] = [
  { key: 'maxAggregateSize', labelKey: 'settings.searchPrefs.maxAggregateSize', min: 100, max: 10000 },
  { key: 'maxResultHits', labelKey: 'settings.searchPrefs.maxResultHits', min: 100, max: 10000 },
  { key: 'maxAnalyzedOffset', labelKey: 'settings.searchPrefs.maxAnalyzedOffset', min: 1000, max: 1000000 },
];

/** Official generated enums (searchSettings.ts), declaration order. */
export const BOOST_MODE_VALUES = ['avg', 'max', 'min', 'multiply', 'replace', 'sum'] as const;
export const SCORE_MODE_VALUES = ['avg', 'first', 'max', 'min', 'multiply', 'sum'] as const;
export const MODIFIER_VALUES = [
  'ln',
  'ln1p',
  'ln2p',
  'log',
  'log1p',
  'log2p',
  'none',
  'reciprocal',
  'sqrt',
  'square',
] as const;

export const boostModeOptions = BOOST_MODE_VALUES.map((value) => ({
  value,
  label: startCase(value),
}));
export const scoreModeOptions = SCORE_MODE_VALUES.map((value) => ({
  value,
  label: startCase(value),
}));
export const modifierOptions = MODIFIER_VALUES.map((value) => ({
  value,
  label: value,
}));

export const MATCH_TYPE_OPTIONS = [
  { value: 'exact', labelKey: 'settings.searchPrefs.exactMatch' },
  { value: 'phrase', labelKey: 'settings.searchPrefs.phraseMatch' },
  { value: 'fuzzy', labelKey: 'settings.searchPrefs.fuzzyMatch' },
  { value: 'standard', labelKey: 'settings.searchPrefs.standardMatch' },
] as const;

/** Official TermBoostCard MAX_BOOST / BOOST_STEP. */
export const MAX_BOOST = 100;
export const BOOST_STEP = 0.1;

/** Official getTermBoostField (TermBoostCard.tsx :43-48). */
export function getTermBoostField(tagFqn: string): string {
  if (tagFqn.startsWith('Certification.')) {
    return 'certification.tagLabel.tagFQN';
  }
  return tagFqn.startsWith('Tier.') ? 'tier.tagFQN' : 'tags.tagFQN';
}

/**
 * Official tagClassBase.getTags query (TagClassBase.ts :67-112): a
 * wildcard query over the FQN-encoded, ES-escaped text on the TAG index,
 * filtered to enabled tags, page size PAGE_SIZE (10).
 */
export function getTermBoostTagQuery(searchText: string): {
  query: string;
  queryFilter: string;
} {
  const encodedValue = getEncodedFqn(escapeESReservedCharacters(searchText));
  return {
    query: `*${encodedValue}*`,
    queryFilter: JSON.stringify({
      query: { bool: { must: [{ term: { disabled: 'false' } }] } },
    }),
  };
}

export const TAG_SEARCH_PAGE_SIZE = 10;
export const TAG_SEARCH_DEBOUNCE_MS = 300;
export const PREVIEW_DEBOUNCE_MS = 1000;

/** Official FieldValueBoostDialog RANGE_KEYS + form/payload mapping. */
export const RANGE_KEYS = ['gte', 'lte', 'gt', 'lt'] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

export interface FieldValueBoostFormValues {
  field: string | null;
  factor: number;
  modifier: string | null;
  missing: string;
  gte: string;
  lte: string;
  gt: string;
  lt: string;
}

export function toFieldValueBoostFormValues(
  boost?: SearchFieldValueBoost,
): FieldValueBoostFormValues {
  return {
    field: boost?.field ?? null,
    factor: boost?.factor ?? 0,
    modifier: boost?.modifier ?? 'none',
    missing: boost?.missing?.toString() ?? '0',
    gte: boost?.condition?.range?.gte?.toString() ?? '',
    lte: boost?.condition?.range?.lte?.toString() ?? '',
    gt: boost?.condition?.range?.gt?.toString() ?? '',
    lt: boost?.condition?.range?.lt?.toString() ?? '',
  };
}

/** Empty range bounds are left out rather than sent as 0. */
export function toFieldValueBoost(
  values: FieldValueBoostFormValues,
): SearchFieldValueBoost {
  const range: Record<string, number> = {};
  for (const key of RANGE_KEYS) {
    if (values[key] !== '') {
      range[key] = Number(values[key]);
    }
  }
  return {
    field: values.field ?? '',
    factor: values.factor,
    modifier: values.modifier ?? 'none',
    missing: values.missing ? Number(values.missing) : 0,
    condition: { range },
  };
}

/** The term-boost change guard both pages share: empty value or zero boost is dropped. */
export function isCompleteTermBoost(boost: SearchTermBoost): boolean {
  return Boolean(boost.value) && Boolean(boost.boost);
}
