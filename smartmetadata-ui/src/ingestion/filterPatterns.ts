/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { SERVICE_FILTER_PATTERN_FIELDS } from '@/ingestion/ingestionSchemas';
import { startCase } from '@/utils/text';

/**
 * Port of official's filter-pattern composer engine
 * (FiltersConfigForm.utils / .types / .constants), pin a3012259ca.
 *
 * A stored FilterPattern is `{includes: string[], excludes: string[]}`
 * of regexes. The composer edits them as operator+value conditions and
 * converts back with conditionToRegex. Ops are assigned by how Python's
 * start-anchored re.match evaluates the pattern, not by how the regex
 * reads — a bare pattern matches as a prefix, a bare `value$` only
 * matches exactly.
 */

export type FilterOperator = 'contains' | 'endsWith' | 'is' | 'regex' | 'startsWith';

export const FILTER_OPERATORS: FilterOperator[] = [
  'contains',
  'endsWith',
  'is',
  'regex',
  'startsWith',
];

export const FILTER_OPERATOR_LABEL_KEYS: Record<FilterOperator, string> = {
  contains: 'forms.filter.operatorContains',
  endsWith: 'forms.filter.operatorEndsWith',
  is: 'forms.filter.operatorIs',
  regex: 'forms.filter.operatorRegex',
  startsWith: 'forms.filter.operatorStartsWith',
};

export interface FilterCondition {
  op: FilterOperator;
  sourceRegex?: string;
  value: string;
}

export interface FilterPatternConfig {
  excludes?: string[];
  includes?: string[];
}

export interface FilterSectionState {
  excludes: FilterCondition[];
  includes: FilterCondition[];
  restrict: boolean;
}

export const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

export const unescapeRegexLiteral = (value: string): string =>
  value.replace(/\\([.*+?^${}()|[\]\\])/g, '$1');

const REGEX_SPECIAL_CHARS = new Set([
  '.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']',
]);

export function hasUnescapedRegexSyntax(value: string): boolean {
  let isEscaped = false;
  for (const character of value) {
    if (isEscaped) {
      isEscaped = false;
      continue;
    }
    if (character === '\\') {
      isEscaped = true;
      continue;
    }
    if (REGEX_SPECIAL_CHARS.has(character)) {
      return true;
    }
  }
  return isEscaped;
}

interface PatternMatcher {
  op: FilterCondition['op'];
  prefix: string;
  suffix: string;
}

const PATTERN_MATCHERS: PatternMatcher[] = [
  { op: 'is', prefix: '^', suffix: '$' },
  { op: 'contains', prefix: '^.*', suffix: '.*$' },
  { op: 'startsWith', prefix: '^', suffix: '.*$' },
  { op: 'endsWith', prefix: '^.*', suffix: '$' },
  { op: 'startsWith', prefix: '^', suffix: '.*' },
  { op: 'startsWith', prefix: '^', suffix: '' },
  { op: 'endsWith', prefix: '.*', suffix: '$' },
  { op: 'is', prefix: '', suffix: '$' },
  { op: 'contains', prefix: '.*', suffix: '.*' },
  { op: 'startsWith', prefix: '', suffix: '' },
];

function tryMatchPattern(
  pattern: string,
  regex: string,
  matcher: PatternMatcher,
): FilterCondition | null {
  const { prefix, suffix, op } = matcher;
  if ((prefix && !pattern.startsWith(prefix)) || (suffix && !pattern.endsWith(suffix))) {
    return null;
  }
  const start = prefix.length;
  const end = suffix.length ? pattern.length - suffix.length : pattern.length;
  const inner = pattern.slice(start, end);
  if (hasUnescapedRegexSyntax(inner)) {
    return null;
  }
  return { op, sourceRegex: regex, value: unescapeRegexLiteral(inner) };
}

export function parseRegexPattern(regex: string): FilterCondition {
  const pattern = regex.trim();
  if (!pattern) {
    return { op: 'regex', sourceRegex: regex, value: regex };
  }
  for (const matcher of PATTERN_MATCHERS) {
    const result = tryMatchPattern(pattern, regex, matcher);
    if (result) {
      return result;
    }
  }
  return { op: 'regex', sourceRegex: regex, value: regex };
}

export function conditionToRegex(condition: FilterCondition): string {
  if (condition.sourceRegex) {
    return condition.sourceRegex;
  }
  switch (condition.op) {
    case 'is':
      return `^${escapeRegex(condition.value)}$`;
    case 'startsWith':
      return `^${escapeRegex(condition.value)}`;
    case 'endsWith':
      return `.*${escapeRegex(condition.value)}$`;
    case 'contains':
      return `.*${escapeRegex(condition.value)}.*`;
    case 'regex':
    default:
      return condition.value;
  }
}

export function conditionKey(condition: FilterCondition): string {
  return `${condition.op}:${conditionToRegex(condition).toLowerCase()}`;
}

function isNonArrayObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isFilterPatternConfig(value: unknown): value is FilterPatternConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return Array.isArray(record.includes) || Array.isArray(record.excludes);
}

export interface FilterSchemaProperty {
  default?: FilterPatternConfig;
  description?: string;
  javaType?: string;
  properties?: Record<string, unknown>;
  title?: string;
  type?: unknown;
}

/**
 * Pin isFilterSchemaProperty: a known enum field, a FilterPattern
 * javaType, or a "Filter Pattern" title over an includes/excludes
 * shape.
 */
export function isFilterSchemaProperty(
  fieldName: string,
  property: unknown,
): property is FilterSchemaProperty {
  if (!isNonArrayObject(property)) {
    return false;
  }
  const record = property as FilterSchemaProperty;
  const nestedProperties = record.properties ?? {};
  const isKnownField = (SERVICE_FILTER_PATTERN_FIELDS as readonly string[]).includes(fieldName);
  const isFilterJavaType = record.javaType?.includes('FilterPattern') ?? false;
  const isFilterTitle = record.title?.includes('Filter Pattern') ?? false;
  const hasFilterShape = Boolean(nestedProperties.includes || nestedProperties.excludes);
  return isKnownField || isFilterJavaType || (isFilterTitle && hasFilterShape);
}

export function cleanSchemaTitle(title: string, fieldName: string): string {
  const cleaned = title
    .replace(/^Default\s+/i, '')
    .replace(/\s+Filter Pattern$/i, '')
    .replace(/\s+filter pattern$/i, '')
    .trim();
  if (cleaned) {
    return cleaned;
  }
  return startCase(fieldName.replace(/FilterPattern$/i, ''));
}

export function pluralizeFallback(label: string): string {
  if (label.endsWith('s')) {
    return label;
  }
  if (label.endsWith('y')) {
    return `${label.slice(0, -1)}ies`;
  }
  return `${label}s`;
}

export function singularizeFallback(label: string): string {
  if (label.endsWith('ies')) {
    return label.slice(0, -3) + 'y';
  }
  if (label.endsWith('s')) {
    return label.slice(0, -1);
  }
  return label;
}

/** Pin FILTER_LABEL_KEYS / FILTER_SINGLE_LABEL_KEYS, as fork i18n keys. The
 * last five fields are unlisted in pin's enum-keyed maps (pin falls back
 * to the EN schema title there); the fork wizard passes translated titles,
 * so the maps carry them explicitly — otherwise the EN pluralizer suffixes
 * the translation (`模型s`). Values are pin's singular/plural `label.*`
 * values in both locales. */
export const FILTER_LABEL_KEYS: Partial<Record<string, string>> = {
  apiCollectionFilterPattern: 'forms.filter.labels.apiCollections',
  chartFilterPattern: 'forms.filter.labels.charts',
  classificationFilterPattern: 'forms.filter.labels.classifications',
  containerFilterPattern: 'forms.filter.labels.containers',
  dashboardFilterPattern: 'forms.filter.labels.dashboards',
  dataModelFilterPattern: 'forms.filter.labels.dataModels',
  databaseFilterPattern: 'forms.filter.labels.databases',
  directoryFilterPattern: 'forms.filter.labels.directories',
  fileFilterPattern: 'forms.filter.labels.files',
  mlModelFilterPattern: 'forms.filter.labels.mlModels',
  pipelineFilterPattern: 'forms.filter.labels.pipelines',
  projectFilterPattern: 'forms.filter.labels.projects',
  schemaFilterPattern: 'forms.filter.labels.schemas',
  searchIndexFilterPattern: 'forms.filter.labels.searchIndexes',
  spreadsheetFilterPattern: 'forms.filter.labels.spreadsheets',
  storedProcedureFilterPattern: 'forms.filter.labels.storedProcedures',
  tableFilterPattern: 'forms.filter.labels.tables',
  topicFilterPattern: 'forms.filter.labels.topics',
  worksheetFilterPattern: 'forms.filter.labels.worksheets',
  apiEndpointFilterPattern: 'forms.filter.labels.apiEndpoints',
  modelFilterPattern: 'forms.filter.labels.models',
  serverFilterPattern: 'forms.filter.labels.servers',
  glossaryFilterPattern: 'forms.filter.labels.glossaries',
  domainFilterPattern: 'forms.filter.labels.domains',
};

export const FILTER_SINGLE_LABEL_KEYS: Partial<Record<string, string>> = {
  apiCollectionFilterPattern: 'forms.filter.labels.apiCollection',
  chartFilterPattern: 'forms.filter.labels.chart',
  classificationFilterPattern: 'forms.filter.labels.classification',
  containerFilterPattern: 'forms.filter.labels.container',
  dashboardFilterPattern: 'forms.filter.labels.dashboard',
  dataModelFilterPattern: 'forms.filter.labels.dataModel',
  databaseFilterPattern: 'forms.filter.labels.database',
  directoryFilterPattern: 'forms.filter.labels.directory',
  fileFilterPattern: 'forms.filter.labels.file',
  mlModelFilterPattern: 'forms.filter.labels.mlModel',
  pipelineFilterPattern: 'forms.filter.labels.pipeline',
  projectFilterPattern: 'forms.filter.labels.project',
  schemaFilterPattern: 'forms.filter.labels.schema',
  searchIndexFilterPattern: 'forms.filter.labels.searchIndex',
  spreadsheetFilterPattern: 'forms.filter.labels.spreadsheet',
  storedProcedureFilterPattern: 'forms.filter.labels.storedProcedure',
  tableFilterPattern: 'forms.filter.labels.table',
  topicFilterPattern: 'forms.filter.labels.topic',
  worksheetFilterPattern: 'forms.filter.labels.worksheet',
  apiEndpointFilterPattern: 'forms.filter.labels.apiEndpoint',
  modelFilterPattern: 'forms.filter.labels.model',
  serverFilterPattern: 'forms.filter.labels.server',
  glossaryFilterPattern: 'forms.filter.labels.glossary',
  domainFilterPattern: 'forms.filter.labels.domain',
};

export interface FilterSectionLabels {
  label: string;
  singleLabel: string;
}

/**
 * Pin FilterPatternField.buildFilterSection: locale labels for known
 * fields, else the cleaned schema title pluralized/singularized.
 */
export function getFilterSectionLabels(
  fieldName: string,
  schemaTitle: string | undefined,
  t: (key: string) => string,
): FilterSectionLabels {
  const labelKey = FILTER_LABEL_KEYS[fieldName];
  const singleLabelKey = FILTER_SINGLE_LABEL_KEYS[fieldName];
  const cleanedTitle = cleanSchemaTitle(schemaTitle ?? '', fieldName);
  const label = labelKey ? t(labelKey) : pluralizeFallback(cleanedTitle || startCase(fieldName));
  const singleLabel = singleLabelKey ? t(singleLabelKey) : singularizeFallback(label);
  return { label, singleLabel };
}

/**
 * Pin getOrderedFilterEntries: filter-pattern properties in enum
 * order; unknown filter fields follow in schema order.
 */
export function getOrderedFilterEntries(
  properties: Record<string, unknown>,
): Array<[string, FilterSchemaProperty]> {
  const entries = Object.entries(properties).filter(
    (entry): entry is [string, FilterSchemaProperty] =>
      isFilterSchemaProperty(entry[0], entry[1]),
  );
  const fieldNames = entries.map(([fieldName]) => fieldName);
  return [...entries].sort(([first], [second]) => {
    const firstKnown = (SERVICE_FILTER_PATTERN_FIELDS as readonly string[]).indexOf(first);
    const secondKnown = (SERVICE_FILTER_PATTERN_FIELDS as readonly string[]).indexOf(second);
    const normalizedFirst =
      firstKnown === -1
        ? SERVICE_FILTER_PATTERN_FIELDS.length + fieldNames.indexOf(first)
        : firstKnown;
    const normalizedSecond =
      secondKnown === -1
        ? SERVICE_FILTER_PATTERN_FIELDS.length + fieldNames.indexOf(second)
        : secondKnown;
    return normalizedFirst - normalizedSecond;
  });
}

export const SNOWFLAKE_SAMPLE_DATA_EXCLUDE = '^snowflake_sample_data$';

/** Pin addSnowflakeSystemExcludes: Snowflake database patterns always exclude the sample DB. */
export function addSnowflakeSystemExcludes(
  serviceType: string,
  fieldName: string,
  excludes: string[],
): string[] {
  if (serviceType.toLowerCase() !== 'snowflake' || fieldName !== 'databaseFilterPattern') {
    return excludes;
  }
  return excludes.some(
    (exclude) => exclude.toLowerCase() === SNOWFLAKE_SAMPLE_DATA_EXCLUDE,
  )
    ? excludes
    : [...excludes, SNOWFLAKE_SAMPLE_DATA_EXCLUDE];
}

/** Pin buildPatternFromState: includes are emitted only in restrict mode. */
export function buildPatternFromState(filter: FilterSectionState): FilterPatternConfig {
  return {
    excludes: filter.excludes.map(conditionToRegex),
    includes: filter.restrict ? filter.includes.map(conditionToRegex) : [],
  };
}

export function buildInitialFilterState(
  formData: FilterPatternConfig | undefined,
): FilterSectionState {
  const includes = (formData?.includes ?? []).map(parseRegexPattern);
  const excludes = (formData?.excludes ?? []).map(parseRegexPattern);
  return { excludes, includes, restrict: includes.length > 0 };
}

export function removeConditionAtIndex(
  conditions: FilterCondition[],
  indexToRemove: number,
): FilterCondition[] {
  return conditions.filter((_, index) => index !== indexToRemove);
}

export function getRuleLabelKey(count: number): string {
  return count === 1 ? 'forms.filter.rule' : 'forms.filter.rules';
}

export interface FilterSummaryPill {
  textKey: string;
  tone: 'success' | 'info';
  values: Record<string, number>;
}

/** Pin getSummaryPill: the header badge for a section's current scope. */
export function getSummaryPill(filter: FilterSectionState): FilterSummaryPill {
  if (!filter.restrict && filter.excludes.length === 0) {
    return { textKey: 'forms.filter.scanningAll', tone: 'success', values: {} };
  }
  if (!filter.restrict) {
    return {
      textKey:
        filter.excludes.length === 1
          ? 'forms.filter.excludeRuleCount'
          : 'forms.filter.excludeRulesCount',
      tone: 'info',
      values: { count: filter.excludes.length },
    };
  }
  return {
    textKey:
      filter.includes.length === 1
        ? 'forms.filter.includeRuleCount'
        : 'forms.filter.includeRulesCount',
    tone: 'info',
    values: { count: filter.includes.length },
  };
}

/** Pin getScopeSummaryKey: the preview paragraph for a section's current scope. */
export function getScopeSummaryKey(filter: FilterSectionState): string {
  if (filter.restrict && filter.excludes.length > 0) {
    return 'forms.filter.includeExcludeSummary';
  }
  if (filter.restrict) {
    return 'forms.filter.includeSummary';
  }
  if (filter.excludes.length > 0) {
    return 'forms.filter.excludeSummary';
  }
  return 'forms.filter.allSummary';
}
