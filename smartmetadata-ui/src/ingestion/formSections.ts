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

/**
 * Port of official's section grouping for the connection form
 * (ConnectionObjectFieldTemplate.getPropertySections / buildRawSections)
 * and the ingestion workflow form
 * (IngestionObjectFieldTemplate.groupProperties), pin a3012259ca.
 *
 * The grouping RULES are pin's; the rendering is the caller's. Each
 * helper takes the form's fields in display order and returns sections
 * in pin's section order with pin's collapsible/default-open/index
 * metadata, so both form leaves render identical structure.
 *
 * A field the caller marks hidden still participates in grouping (pin
 * renders hidden fields inside their section); a section with no
 * visible field is omitted, except that hidden scope fields of the
 * connection form are returned separately so the caller can keep them
 * mounted.
 */

/** Official ADVANCED_PROPERTIES (ServiceType.constant.ts). */
export const ADVANCED_PROPERTIES = [
  'connectionArguments',
  'connectionOptions',
  'useAccessHistory',
  'accessHistoryChunkSize',
  'systemMetricsBatchSize',
  'scheme',
  'computeTableMetrics',
  'computeColumnMetrics',
  'includeViews',
  'useStatistics',
  'enableAutoPartitionDetection',
  'confidence',
  'profileSampleConfig',
  'randomizedSample',
  'sampleDataCount',
  'threadCount',
  'timeoutSeconds',
  'metrics',
  'sslConfig',
  'sslMode',
  'schemaRegistrySSL',
  'consumerConfigSSL',
  'verify',
  'useNonce',
  'disablePkce',
  'maxClockSkew',
  'tokenValidity',
  'maxAge',
] as const;

/** Official OPTIONAL_CONNECTION_PROPERTIES (ServiceType.constant.ts). */
export const OPTIONAL_CONNECTION_PROPERTIES = new Set([
  'billingProjectId',
  'hostPort',
  'username',
  'clientId',
]);

/** Official OPTIONAL_SCOPE_PROPERTIES (ServiceType.constant.ts). */
export const OPTIONAL_SCOPE_PROPERTIES = new Set([
  'apiCollectionFilterPattern',
  'apiEndpointFilterPattern',
  'chartFilterPattern',
  'containerFilterPattern',
  'dashboardFilterPattern',
  'dataModelFilterPattern',
  'databaseFilterPattern',
  'databaseName',
  'directoryFilterPattern',
  'domainFilterPattern',
  'fileFilterPattern',
  'glossaryFilterPattern',
  'mlModelFilterPattern',
  'modelFilterPattern',
  'pipelineFilterPattern',
  'projectFilterPattern',
  'schemaFilterPattern',
  'searchIndexFilterPattern',
  'serverFilterPattern',
  'sobjectNames',
  'spreadsheetFilterPattern',
  'storedProcedureFilterPattern',
  'supportsMetadataExtraction',
  'tableFilterPattern',
  'topicFilterPattern',
  'worksheetFilterPattern',
]);

/** Official INGESTION_BOOLEAN_CONFIG_FIELDS (ServiceType.constant.ts). */
export const INGESTION_BOOLEAN_CONFIG_FIELDS = [
  'shardedTables',
  'includeTables',
  'includeViews',
  'includeTags',
  'includeCustomProperties',
  'includeOwners',
  'includeStoredProcedures',
  'includeDDL',
  'markDeletedTables',
  'markDeletedStoredProcedures',
  'markDeletedSchemas',
  'markDeletedDatabases',
  'overrideMetadata',
  'enableDebugLog',
  'dbtUpdateDescriptions',
  'dbtUpdateOwners',
  'overrideLineage',
  'searchAcrossDatabases',
] as const;

/** Official ADVANCED_PRIMARY_PROPERTY_ORDER (ConnectionObjectFieldTemplate). */
export const ADVANCED_PRIMARY_PROPERTY_ORDER = [
  'scheme',
  'useAccessHistory',
  'accessHistoryChunkSize',
] as const;

export const CONNECTION_AUTH_PROPERTY = 'authType';
export const CONNECTION_SERVICE_TYPE_PROPERTY = 'type';

const ADVANCED_SET = new Set<string>(ADVANCED_PROPERTIES);
const CONFIG_SET = new Set<string>(INGESTION_BOOLEAN_CONFIG_FIELDS);
const FILTER_SET = new Set<string>([...SERVICE_FILTER_PATTERN_FIELDS, 'useFqnForFiltering']);

/**
 * The schema fragment a grouping decision reads. The full JSON-schema
 * property object may be passed; only these members are consulted.
 * `properties`/`required`/`oneOf` also feed the missing-required count.
 */
export interface GroupableSchema {
  format?: string;
  type?: string | string[];
  oneOf?: unknown[];
  anyOf?: unknown[];
  uiFieldType?: string;
  properties?: Record<string, unknown>;
  required?: unknown;
  [key: string]: unknown;
}

export interface GroupableField {
  name: string;
  schema: GroupableSchema;
  /** Pin's uiSchema-hidden fields (DEF_UI_SCHEMA, workflow uiSchema). */
  hidden?: boolean;
}

export type SectionBadge =
  | { kind: 'required'; count: number }
  | { kind: 'optional' }
  | null;

export interface FormSection {
  key: string;
  titleKey: string;
  descriptionKey: string;
  collapsible: boolean;
  defaultOpen: boolean;
  /** Numbered badge; the advanced section has none (pin). */
  index?: number;
  layout: 'grid' | 'stack';
  /** Visible field names in pin's render order within the section. */
  fields: string[];
  /** Hidden field names grouped here; values live in form state, not DOM. */
  hiddenFields: string[];
  /** Fields rendering full-row (object/array/oneOf/anyOf shapes). */
  wideFields: string[];
  /** Boolean fields; rendered after the rest unless inlineBooleans. */
  booleanFields: string[];
  /** Advanced connection section renders booleans inline (pin). */
  inlineBooleans: boolean;
  /** Compact 2-column advanced grid (auto-classification, pin). */
  compact?: boolean;
  badge: SectionBadge;
  /** First visible field, or pin's section fallback; drives doc focus. */
  focusName?: string;
}

function isAdvanced(name: string): boolean {
  return ADVANCED_SET.has(name);
}

function isAuth(name: string, schema: GroupableSchema): boolean {
  return name === CONNECTION_AUTH_PROPERTY || schema.format === 'password';
}

/** Pin ConnectionObjectFieldTemplate.isWide: object/array/combiner shapes. */
export function isWideConnectionProperty(schema: GroupableSchema): boolean {
  return (
    schema.type === 'object' ||
    schema.type === 'array' ||
    Boolean(schema.oneOf?.length) ||
    Boolean(schema.anyOf?.length)
  );
}

/**
 * Pin IngestionObjectFieldTemplate.isWide: `uiFieldType: code` counts too,
 * and a combiner counts only when a non-null variant is object/array or
 * typeless.
 */
export function isWideIngestionProperty(schema: GroupableSchema): boolean {
  if (schema.uiFieldType === 'code') {
    return true;
  }
  if (schema.type === 'object' || schema.type === 'array') {
    return true;
  }
  const variants = [...(schema.oneOf ?? []), ...(schema.anyOf ?? [])] as Array<{
    type?: string;
  }>;
  return variants
    .filter((variant) => variant.type !== 'null')
    .some(
      (variant) =>
        variant.type === 'object' || variant.type === 'array' || variant.type === undefined,
    );
}

function isBooleanField(schema: GroupableSchema): boolean {
  return schema.type === 'boolean';
}

function firstVisibleName(fields: GroupableField[], fallback: string): string {
  return fields.find((field) => !field.hidden)?.name ?? fields[0]?.name ?? fallback;
}

function sectionMeta(
  fields: GroupableField[],
  isWide: (schema: GroupableSchema) => boolean,
  inlineBooleans: boolean,
): { ordered: string[]; hidden: string[]; wide: string[]; booleans: string[] } {
  const visible = fields.filter((field) => !field.hidden);
  const hidden = fields.filter((field) => field.hidden).map((field) => field.name);
  const wide = visible.filter((field) => isWide(field.schema)).map((field) => field.name);
  const booleans = visible
    .filter((field) => isBooleanField(field.schema))
    .map((field) => field.name);
  if (inlineBooleans) {
    return { ordered: visible.map((field) => field.name), hidden, wide, booleans };
  }
  const ordered = [
    ...visible.filter((field) => !isBooleanField(field.schema)).map((field) => field.name),
    ...booleans,
  ];
  return { ordered, hidden, wide, booleans };
}

function assignIndexes(sections: FormSection[]): void {
  let counter = 0;
  for (const section of sections) {
    if (section.key !== 'advanced') {
      counter += 1;
      section.index = counter;
    }
  }
}

function hasVisible(fields: GroupableField[]): boolean {
  return fields.some((field) => !field.hidden);
}

/**
 * Pin getMissingSchemaRequiredFieldsCountForSelectedBranch
 * (ServiceConnectionUtils): a filled value is non-nil, a non-blank
 * string, or a non-empty array; objects recurse into their own
 * required keys plus any nested object values present in the data; a
 * oneOf counts the branch whose properties cover the data keys, else
 * the minimum over branches.
 */
export function getMissingRequiredFieldsCount(
  schema: Record<string, unknown>,
  formData?: Record<string, unknown>,
): number {
  const oneOf = schema.oneOf;
  if (Array.isArray(oneOf)) {
    const branches = oneOf.filter(
      (branch): branch is Record<string, unknown> =>
        Boolean(branch) && typeof branch === 'object',
    );
    const dataKeys = Object.keys(formData ?? {}).filter(
      (key) => (formData as Record<string, unknown>)[key] !== undefined,
    );
    if (dataKeys.length > 0) {
      const matching = branches.find((branch) => {
        const props = new Set(
          Object.keys((branch.properties ?? {}) as Record<string, unknown>),
        );
        return dataKeys.every((key) => props.has(key));
      });
      if (matching) {
        return getMissingRequiredFieldsCount(matching, formData);
      }
    }
    const counts = branches.map((branch) =>
      getMissingRequiredFieldsCount(branch, formData),
    );
    return counts.length > 0 ? Math.min(...counts) : 0;
  }

  const properties = (schema.properties ?? {}) as Record<string, unknown>;
  const required = Array.isArray(schema.required)
    ? schema.required.filter((field): field is string => typeof field === 'string')
    : [];
  const isFilled = (value: unknown): boolean => {
    if (value === null || value === undefined) {
      return false;
    }
    if (typeof value === 'string') {
      return value.trim() !== '';
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return true;
  };

  let count = 0;
  for (const key of required) {
    const value = formData?.[key];
    const propertySchema = properties[key];
    if (!isFilled(value)) {
      count += 1;
      continue;
    }
    if (
      propertySchema &&
      typeof propertySchema === 'object' &&
      !Array.isArray(value) &&
      typeof value === 'object'
    ) {
      count += getMissingRequiredFieldsCount(
        propertySchema as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    }
  }
  for (const key of Object.keys(formData ?? {})) {
    if (required.includes(key)) {
      continue;
    }
    const value = (formData as Record<string, unknown>)[key];
    const propertySchema = properties[key];
    if (
      value !== null &&
      value !== undefined &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      propertySchema &&
      typeof propertySchema === 'object'
    ) {
      count += getMissingRequiredFieldsCount(
        propertySchema as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    }
  }
  return count;
}

export interface ConnectionSectionsResult {
  sections: FormSection[];
  /** Hidden scope fields when the scope section itself is not rendered. */
  hiddenUnsectioned: string[];
  missingCounts: { connection: number; auth: number };
}

/**
 * Pin getPropertySections + buildRawSections, verbatim rules:
 * auth = `authType` or `format: password`; advanced = ADVANCED_PROPERTIES;
 * connection = required (non-auth, non-advanced) fields plus optional
 * identity fields when any explicit required connection field exists,
 * else every non-auth/non-advanced field outside OPTIONAL_SCOPE_PROPERTIES;
 * scope = the remainder. Section order: connection, authentication,
 * scope (collapsible, closed), advanced (collapsible, closed).
 * The advanced section renders its primary properties first, then the
 * remaining scalar fields, then wide fields.
 */
export function groupConnectionSections(
  fields: GroupableField[],
  requiredKeys: string[],
  formData: Record<string, unknown> = {},
): ConnectionSectionsResult {
  const schemaByName = new Map(fields.map((field) => [field.name, field.schema]));
  const authFields = fields.filter((field) => isAuth(field.name, field.schema));
  const advancedFields = fields.filter((field) => isAdvanced(field.name));
  const explicitConnection = fields.filter(
    (field) =>
      !isAuth(field.name, field.schema) &&
      !isAdvanced(field.name) &&
      requiredKeys.includes(field.name),
  );
  const optionalConnection = fields.filter(
    (field) =>
      !isAuth(field.name, field.schema) &&
      !isAdvanced(field.name) &&
      !requiredKeys.includes(field.name) &&
      OPTIONAL_CONNECTION_PROPERTIES.has(field.name),
  );
  const fallbackConnection = fields.filter(
    (field) =>
      !isAuth(field.name, field.schema) &&
      !isAdvanced(field.name) &&
      !OPTIONAL_SCOPE_PROPERTIES.has(field.name),
  );
  const connectionFields =
    explicitConnection.length > 0
      ? [...explicitConnection, ...optionalConnection]
      : fallbackConnection;
  const connectionNames = new Set(connectionFields.map((field) => field.name));
  const scopeFields = fields.filter(
    (field) =>
      !isAuth(field.name, field.schema) &&
      !isAdvanced(field.name) &&
      !connectionNames.has(field.name),
  );
  const shouldRenderScope = hasVisible(scopeFields);
  const hiddenUnsectioned = (shouldRenderScope ? [] : scopeFields)
    .filter((field) => field.hidden)
    .map((field) => field.name);
  const authRequiredKeys = requiredKeys.filter((key) =>
    isAuth(key, schemaByName.get(key) ?? {}),
  );

  const explicitVisible = explicitConnection
    .filter((field) => !field.hidden && field.name !== CONNECTION_SERVICE_TYPE_PROPERTY)
    .map((field) => field.name);
  const connectionMissingCount = getMissingRequiredFieldsCount(
    {
      type: 'object',
      properties: Object.fromEntries(
        explicitVisible.map((name) => [name, schemaByName.get(name) ?? {}]),
      ),
      required: explicitVisible,
    },
    formData,
  );
  const effectiveAuthRequired = [
    ...authRequiredKeys,
    ...(formData[CONNECTION_AUTH_PROPERTY] !== undefined &&
    !authRequiredKeys.includes(CONNECTION_AUTH_PROPERTY)
      ? [CONNECTION_AUTH_PROPERTY]
      : []),
  ];
  const authMissingCount = getMissingRequiredFieldsCount(
    {
      type: 'object',
      properties: Object.fromEntries(
        authFields.map((field) => [field.name, field.schema]),
      ),
      required: effectiveAuthRequired,
    },
    formData,
  );

  const sections: FormSection[] = [];
  if (hasVisible(connectionFields)) {
    const meta = sectionMeta(connectionFields, isWideConnectionProperty, false);
    sections.push({
      key: 'connection',
      titleKey: 'forms.sections.connection',
      descriptionKey: 'forms.sections.connectionDescription',
      collapsible: false,
      defaultOpen: true,
      layout: 'grid',
      fields: meta.ordered,
      hiddenFields: meta.hidden,
      wideFields: meta.wide,
      booleanFields: meta.booleans,
      inlineBooleans: false,
      badge:
        connectionMissingCount > 0
          ? { kind: 'required', count: connectionMissingCount }
          : { kind: 'optional' },
      focusName: firstVisibleName(connectionFields, 'connection'),
    });
  }
  if (hasVisible(authFields)) {
    const meta = sectionMeta(authFields, isWideConnectionProperty, false);
    sections.push({
      key: 'authentication',
      titleKey: 'forms.sections.authentication',
      descriptionKey: 'forms.sections.authenticationDescription',
      collapsible: false,
      defaultOpen: true,
      layout: 'stack',
      fields: meta.ordered,
      hiddenFields: meta.hidden,
      wideFields: meta.wide,
      booleanFields: meta.booleans,
      inlineBooleans: false,
      badge:
        authMissingCount > 0
          ? { kind: 'required', count: authMissingCount }
          : { kind: 'optional' },
      focusName: authFields.some((field) => field.name === CONNECTION_AUTH_PROPERTY)
        ? CONNECTION_AUTH_PROPERTY
        : firstVisibleName(authFields, CONNECTION_AUTH_PROPERTY),
    });
  }
  if (shouldRenderScope) {
    const meta = sectionMeta(scopeFields, isWideConnectionProperty, false);
    sections.push({
      key: 'scope',
      titleKey: 'forms.sections.scopeOptions',
      descriptionKey: 'forms.sections.scopeDescription',
      collapsible: true,
      defaultOpen: false,
      layout: 'grid',
      fields: meta.ordered,
      hiddenFields: meta.hidden,
      wideFields: meta.wide,
      booleanFields: meta.booleans,
      inlineBooleans: false,
      badge: { kind: 'optional' },
      focusName: firstVisibleName(scopeFields, 'scopeOptions'),
    });
  }
  if (hasVisible(advancedFields)) {
    const visibleAdvanced = advancedFields.filter((field) => !field.hidden);
    const byName = new Map(visibleAdvanced.map((field) => [field.name, field]));
    const primary = ADVANCED_PRIMARY_PROPERTY_ORDER.flatMap((name) => {
      const field = byName.get(name);
      return field ? [field] : [];
    });
    const primaryNames = new Set(primary.map((field) => field.name));
    const remaining = visibleAdvanced.filter((field) => !primaryNames.has(field.name));
    const scalars = remaining.filter((field) => !isWideConnectionProperty(field.schema));
    const wide = remaining.filter((field) => isWideConnectionProperty(field.schema));
    const ordered = [...primary, ...scalars, ...wide];
    sections.push({
      key: 'advanced',
      titleKey: 'forms.sections.advancedConfig',
      descriptionKey: 'forms.sections.advancedDescription',
      collapsible: true,
      defaultOpen: false,
      layout: 'grid',
      fields: ordered.map((field) => field.name),
      hiddenFields: advancedFields
        .filter((field) => field.hidden)
        .map((field) => field.name),
      wideFields: visibleAdvanced
        .filter((field) => isWideConnectionProperty(field.schema))
        .map((field) => field.name),
      booleanFields: visibleAdvanced
        .filter((field) => isBooleanField(field.schema))
        .map((field) => field.name),
      inlineBooleans: true,
      badge: null,
      focusName: firstVisibleName(advancedFields, 'advancedConfig'),
    });
  }
  assignIndexes(sections);
  return {
    sections,
    hiddenUnsectioned,
    missingCounts: { connection: connectionMissingCount, auth: authMissingCount },
  };
}

/**
 * Official INGESTION_WORKFLOW_UI_SCHEMA `ui:order`: rootProcessingEngine,
 * name, displayName, the filter-pattern fields in enum order,
 * enableDebugLog, then everything else in schema order. RJSF applies
 * this order before IngestionObjectFieldTemplate groups the fields,
 * so callers pass the ordered names into groupIngestionSections.
 */
export function orderIngestionWorkflowFields(fieldNames: string[]): string[] {
  const ordered: string[] = [];
  const remaining = [...fieldNames];
  const take = (name: string): void => {
    const index = remaining.indexOf(name);
    if (index !== -1) {
      ordered.push(name);
      remaining.splice(index, 1);
    }
  };
  take('rootProcessingEngine');
  take('name');
  take('displayName');
  for (const field of SERVICE_FILTER_PATTERN_FIELDS) {
    take(field);
  }
  take('enableDebugLog');
  return [...ordered, ...remaining];
}

export interface IngestionSectionsResult {
  sections: FormSection[];
}

/**
 * Pin groupProperties + rawSections, verbatim precedence: ADVANCED →
 * FILTER (filter patterns + useFqnForFiltering) → CONFIG (boolean
 * config fields) → primary. Section order: Agent Setup (open),
 * Filter Patterns (collapsible, closed), Scope & Behaviour
 * (collapsible, closed), Advanced Config (collapsible, closed).
 * Within a section, booleans render after the other fields.
 */
export function groupIngestionSections(
  fields: GroupableField[],
  options: { compactAdvanced?: boolean } = {},
): IngestionSectionsResult {
  const groups = {
    advanced: [] as GroupableField[],
    filter: [] as GroupableField[],
    config: [] as GroupableField[],
    primary: [] as GroupableField[],
  };
  for (const field of fields) {
    if (ADVANCED_SET.has(field.name)) {
      groups.advanced.push(field);
    } else if (FILTER_SET.has(field.name)) {
      groups.filter.push(field);
    } else if (CONFIG_SET.has(field.name)) {
      groups.config.push(field);
    } else {
      groups.primary.push(field);
    }
  }
  const build = (
    key: string,
    titleKey: string,
    descriptionKey: string,
    group: GroupableField[],
    collapsible: boolean,
  ): FormSection | null => {
    if (!hasVisible(group)) {
      return null;
    }
    const meta = sectionMeta(group, isWideIngestionProperty, false);
    return {
      key,
      titleKey,
      descriptionKey,
      collapsible,
      defaultOpen: !collapsible,
      layout: 'grid',
      fields: meta.ordered,
      hiddenFields: meta.hidden,
      wideFields: meta.wide,
      booleanFields: meta.booleans,
      inlineBooleans: false,
      compact: key === 'advanced' ? Boolean(options.compactAdvanced) : undefined,
      badge: null,
    };
  };
  const sections = [
    build('essential', 'forms.sections.agentSetup', 'forms.sections.agentSetupDescription', groups.primary, false),
    build('filters', 'forms.sections.filterPatterns', 'forms.sections.filterPatternDescription', groups.filter, true),
    build('scope', 'forms.sections.scopeBehaviour', 'forms.sections.ingestionConfigurationDescription', groups.config, true),
    build('advanced', 'forms.sections.advancedConfig', 'forms.sections.advancedDescription', groups.advanced, true),
  ].filter((section): section is FormSection => section !== null);
  assignIndexes(sections);
  return { sections };
}

/** Classify one connection field into its section (pin getConnectionFieldSection). */
export function getConnectionFieldSection(
  schemaProperties: Record<string, GroupableSchema>,
  requiredKeys: string[],
  fieldId: string,
): 'connection' | 'authentication' | 'scope' | 'advanced' {
  const cleanId = fieldId.replace(/__(oneof|anyof|allof)_select$/, '');
  const topLevelName = cleanId.split('/').filter((part) => part && part !== 'root')[0];
  const isAdvanced = (name: string): boolean => ADVANCED_SET.has(name);
  const isAuthName = (name: string): boolean =>
    name === CONNECTION_AUTH_PROPERTY || schemaProperties[name]?.format === 'password';
  if (!topLevelName) {
    return 'connection';
  }
  if (isAdvanced(topLevelName)) {
    return 'advanced';
  }
  if (isAuthName(topLevelName)) {
    return 'authentication';
  }
  const hasExplicitRequiredConnectionField = requiredKeys.some(
    (name) => !isAdvanced(name) && !isAuthName(name),
  );
  const isConnection = hasExplicitRequiredConnectionField
    ? requiredKeys.includes(topLevelName) ||
      OPTIONAL_CONNECTION_PROPERTIES.has(topLevelName)
    : !OPTIONAL_SCOPE_PROPERTIES.has(topLevelName);
  return isConnection ? 'connection' : 'scope';
}
