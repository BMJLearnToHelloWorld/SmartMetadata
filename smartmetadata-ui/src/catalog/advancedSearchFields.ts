/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import {
  BOOLEAN_FIELD_OPERATORS,
  LIST_VALUE_OPERATORS,
  MULTISELECT_FIELD_OPERATORS,
  NAME_FIELD_OPERATORS,
  NULL_CHECK_OPERATORS,
  NUMBER_FIELD_OPERATORS,
  SELECT_FIELD_OPERATORS,
  TEXT_DESCRIPTION_OPERATORS,
  TEXT_FIELD_OPERATORS,
  type QueryBuilderFieldDef,
  type QueryFieldOption,
} from './queryBuilder';

/**
 * Advanced-search field config, ported from the official framework
 * (`utils/AdvancedSearchClassBase.getQbConfigs`, pin a3012259ca).
 *
 * Pin builds this config client-side from per-index field tables — there
 * is no server "advanced-search fields" endpoint (see the lane PIN-MEMO) —
 * and adds server-driven custom properties under an `extension` group
 * (`getAllCustomProperties`). This console does the same: the tables below
 * are the pin `getCommonConfig` + per-index maps, and
 * `customPropertyFieldDefs` maps one `GET /v1/metadata/types` custom
 * property the way pin `getCustomPropertiesSubFields` does.
 *
 * Field keys are the ES field strings (`enums/AdvancedSearch.enum.ts`
 * `EntityFields`); labels are `explore.advancedFields.*` i18n keys.
 */
const LABEL_TYPE_VALUES: QueryFieldOption[] = [
  { value: 'Manual', label: 'Manual', labelKey: 'explore.advancedListValues.manual' },
  { value: 'Derived', label: 'Derived', labelKey: 'explore.advancedListValues.derived' },
  { value: 'Propagated', label: 'Propagated', labelKey: 'explore.advancedListValues.propagated' },
  { value: 'Automated', label: 'Automated', labelKey: 'explore.advancedListValues.automated' },
  { value: 'Generated', label: 'Generated', labelKey: 'explore.advancedListValues.generated' },
];

const DESCRIPTION_STATUS_VALUES: QueryFieldOption[] = [
  { value: 'INCOMPLETE', label: 'Incomplete', labelKey: 'explore.advancedListValues.incomplete' },
  { value: 'COMPLETE', label: 'Complete', labelKey: 'explore.advancedListValues.complete' },
];

function select(key: string, label: string, aggregateField?: string): QueryBuilderFieldDef {
  return {
    key,
    labelKey: `explore.advancedFields.${label}`,
    type: 'select',
    operators: [...SELECT_FIELD_OPERATORS],
    aggregateField,
  };
}

function nameSelect(key: string, label: string): QueryBuilderFieldDef {
  return {
    key,
    labelKey: `explore.advancedFields.${label}`,
    type: 'select',
    operators: [...NAME_FIELD_OPERATORS],
  };
}

/** Pin `getCommonConfig` (`AdvancedSearchClassBase.ts:867-1161`). */
const COMMON_FIELDS: readonly QueryBuilderFieldDef[] = [
  nameSelect('displayName.keyword', 'displayName'),
  nameSelect('name.keyword', 'name'),
  {
    key: 'deleted',
    labelKey: 'explore.advancedFields.deleted',
    type: 'boolean',
    operators: [...BOOLEAN_FIELD_OPERATORS],
  },
  select('ownerDisplayName', 'owner'),
  select('domains.displayName.keyword', 'domain'),
  select('dataProducts.displayName.keyword', 'dataProduct'),
  select('serviceType', 'serviceType'),
  select('tags.tagFQN', 'tag'),
  select('glossaryTags', 'glossaryTerm'),
  select('certification.tagLabel.tagFQN', 'certification'),
  select('tier.tagFQN', 'tier'),
  {
    key: 'description',
    labelKey: 'explore.advancedFields.description',
    type: 'text',
    operators: [...TEXT_DESCRIPTION_OPERATORS],
  },
  {
    key: 'descriptionStatus',
    labelKey: 'explore.advancedFields.descriptionStatus',
    type: 'select',
    operators: [...LIST_VALUE_OPERATORS],
    listValues: DESCRIPTION_STATUS_VALUES,
  },
  select('entityType.keyword', 'entityType'),
  {
    key: 'descriptionSources.Suggested',
    labelKey: 'explore.advancedFields.suggestedDescription',
    type: 'select',
    operators: [...NULL_CHECK_OPERATORS],
  },
  {
    key: 'tags.labelType',
    labelKey: 'explore.advancedFields.tagLabelType',
    type: 'select',
    operators: [...LIST_VALUE_OPERATORS],
    listValues: LABEL_TYPE_VALUES,
  },
  {
    key: 'tier.labelType',
    labelKey: 'explore.advancedFields.tierLabelType',
    type: 'select',
    operators: [...LIST_VALUE_OPERATORS],
    listValues: LABEL_TYPE_VALUES,
  },
  select('createdBy', 'createdBy'),
  {
    key: 'entityStatus',
    labelKey: 'explore.advancedFields.entityStatus',
    type: 'select',
    // Pin `getCommonConfig` gives entityStatus the list-value operators
    // only (equals / not-equals), with async lifecycle-status options.
    operators: [...LIST_VALUE_OPERATORS],
  },
];

/** Pin `serviceQueryBuilderFields` — added for the service-bearing indices. */
const SERVICE_FIELD: QueryBuilderFieldDef = select('service.displayName.keyword', 'service');

/** Pin per-index maps (`getEntitySpecificQueryBuilderFields`, `:1213-1294`). */
const ENTITY_SPECIFIC_FIELDS: Readonly<Record<string, readonly QueryBuilderFieldDef[]>> = {
  table: [
    select('database.displayName.keyword', 'database'),
    select('databaseSchema.displayName.keyword', 'databaseSchema'),
    select('tableType', 'tableType'),
    {
      key: 'columnDescriptionStatus',
      labelKey: 'explore.advancedFields.columnDescriptionStatus',
      type: 'select',
      operators: [...LIST_VALUE_OPERATORS],
      listValues: DESCRIPTION_STATUS_VALUES,
    },
  ],
  storedProcedure: [
    select('database.displayName.keyword', 'database'),
    select('databaseSchema.displayName.keyword', 'databaseSchema'),
  ],
  pipeline: [select('tasks.displayName.keyword', 'task')],
  dashboard: [
    select('dataModels.displayName.keyword', 'dataModel'),
    select('charts.displayName.keyword', 'chart'),
    select('project.keyword', 'project'),
  ],
  topic: [select('messageSchema.schemaFields.name.keyword', 'schemaField')],
  mlmodel: [select('mlFeatures.name', 'feature')],
  container: [select('dataModel.columns.name.keyword', 'containerColumn')],
  searchIndex: [select('fields.name.keyword', 'field')],
  dashboardDataModel: [select('dataModelType', 'dataModelType'), select('project.keyword', 'project')],
  apiEndpoint: [
    select('apiCollection.displayName.keyword', 'apiCollection'),
    select('requestSchema.schemaFields.name.keyword', 'requestSchemaField'),
    select('responseSchema.schemaFields.name.keyword', 'responseSchemaField'),
  ],
  glossaryTerm: [select('glossary.name.keyword', 'glossary')],
  databaseSchema: [select('database.displayName.keyword', 'database')],
  directory: [select('parent.displayName.keyword', 'parent')],
  file: [
    select('directory.displayName.keyword', 'directory'),
    select('fileExtension', 'fileExtension'),
    select('fileType', 'fileType'),
  ],
  spreadsheet: [
    select('directory.displayName.keyword', 'directory'),
    select('lastModifiedBy', 'lastModifiedBy'),
  ],
  worksheet: [select('spreadsheet.displayName.keyword', 'spreadsheet')],
};

/** Pin `searchIndexWithServices` (`getQbConfigs`, `:1349-1373`). */
const SERVICE_INDICES = new Set([
  'dataAsset',
  'table',
  'dashboard',
  'pipeline',
  'mlmodel',
  'topic',
  'container',
  'searchIndex',
  'database',
  'databaseSchema',
  'apiEndpoint',
  'apiCollection',
  'dashboardDataModel',
  'storedProcedure',
]);

/** Pin `SEARCH_INDICES_WITH_COLUMNS_FIELD` (TABLE, DASHBOARD_DATA_MODEL, DATA_ASSET, ALL). */
const COLUMN_INDICES = new Set(['dataAsset', 'table', 'dashboardDataModel']);

const COLUMN_FIELDS: readonly QueryBuilderFieldDef[] = [
  select('columns.name.keyword', 'column'),
  select('columns.tags.tagFQN', 'columnTag'),
];

function dedupeByKey(fields: readonly QueryBuilderFieldDef[]): QueryBuilderFieldDef[] {
  const seen = new Set<string>();
  return fields.filter((field) => {
    if (seen.has(field.key)) {
      return false;
    }
    seen.add(field.key);
    return true;
  });
}

/**
 * Field config for one Explore tab index (`dataAsset` for the `all`
 * pseudo-tab, else the tab's `ExploreTab.index`). Pin `DATA_ASSET` is the
 * union of the per-index maps; the other tabs take their own map.
 */
export function fieldsForSearchIndex(tabIndex: string): QueryBuilderFieldDef[] {
  const fields: QueryBuilderFieldDef[] = [...COMMON_FIELDS];
  if (SERVICE_INDICES.has(tabIndex)) {
    fields.push(SERVICE_FIELD);
  }
  if (tabIndex === 'dataAsset') {
    for (const specific of Object.values(ENTITY_SPECIFIC_FIELDS)) {
      fields.push(...specific);
    }
  } else {
    fields.push(...(ENTITY_SPECIFIC_FIELDS[tabIndex] ?? []));
  }
  if (COLUMN_INDICES.has(tabIndex)) {
    fields.push(...COLUMN_FIELDS);
  }
  return dedupeByKey(fields);
}

/**
 * A custom property as returned by `GET /v1/metadata/types`
 * (`CustomPropertyDef`: name, displayName, propertyType name, config).
 * Pin `CustomPropertySummary` carries the same three inputs
 * (`name`, `type`, `customPropertyConfig.config`).
 */
export interface CustomPropertyInput {
  name: string;
  displayName?: string;
  propertyType?: string;
  /** Enum values (`values`), table columns (`columns`), or entity-type names. */
  config?: { values?: string[]; columns?: string[] } | string[] | string;
}

/** Pin `CP_TYPE_WITHOUT_KEYWORD_FIELD = ['number', 'integer', 'timestamp']`. */
const CP_TYPES_WITHOUT_KEYWORD = new Set(['number', 'integer', 'timestamp']);

function customPropertyEsField(name: string, type: string | undefined): string {
  if (type === 'array<entityReference>' || type === 'entityReference') {
    return `${name}.displayName.keyword`;
  }
  if (type !== undefined && CP_TYPES_WITHOUT_KEYWORD.has(type)) {
    return name;
  }
  return `${name}.keyword`;
}

function configValues(config: CustomPropertyInput['config']): string[] | undefined {
  if (Array.isArray(config)) {
    return config;
  }
  if (config && typeof config === 'object') {
    return config.values;
  }
  return undefined;
}

function configColumns(config: CustomPropertyInput['config']): string[] | undefined {
  if (config && typeof config === 'object' && !Array.isArray(config)) {
    return config.columns;
  }
  return undefined;
}

/**
 * Pin `getCustomPropertiesSubFields` (`AdvancedSearchClassBase.ts:1385-1663`):
 * one custom property → one or more `extension.<entityType>.*` field defs,
 * typed by the property type. The label is the property display name (data,
 * not an i18n key), and the option group is the entity type.
 */
export function customPropertyFieldDefs(
  entityType: string,
  property: CustomPropertyInput,
): QueryBuilderFieldDef[] {
  const label = property.displayName || property.name;
  const type = property.propertyType;
  const optGroupKey = `explore.entity.${entityType}`;
  const base = {
    entityType,
    optGroupKey,
  };
  if (type === 'enum') {
    const values = configValues(property.config) ?? [];
    return [
      {
        ...base,
        key: `extension.${entityType}.${customPropertyEsField(property.name, type)}`,
        label,
        type: 'multiselect',
        operators: [...MULTISELECT_FIELD_OPERATORS],
        esField: customPropertyEsField(property.name, type),
        listValues: values.map((value) => ({ value, label: value })),
      },
    ];
  }
  if (type === 'array<entityReference>' || type === 'entityReference') {
    return [
      {
        ...base,
        key: `extension.${entityType}.${customPropertyEsField(property.name, type)}`,
        label,
        type: 'select',
        operators: [...SELECT_FIELD_OPERATORS],
        esField: customPropertyEsField(property.name, type),
        aggregateField: customPropertyEsField(property.name, type),
      },
    ];
  }
  if (type === 'date-cp' || type === 'dateTime-cp') {
    return [
      {
        ...base,
        key: `extension.${entityType}.${customPropertyEsField(property.name, type)}`,
        label,
        type: 'date',
        operators: [...NUMBER_FIELD_OPERATORS],
        esField: customPropertyEsField(property.name, type),
      },
    ];
  }
  if (type === 'timestamp' || type === 'integer' || type === 'number') {
    return [
      {
        ...base,
        key: `extension.${entityType}.${customPropertyEsField(property.name, type)}`,
        label,
        type: 'number',
        operators: [...NUMBER_FIELD_OPERATORS],
        esField: customPropertyEsField(property.name, type),
      },
    ];
  }
  if (type === 'timeInterval') {
    return (['start', 'end'] as const).map((part) => ({
      ...base,
      key: `extension.${entityType}.${property.name}.${part}`,
      label: `${label} (${part})`,
      type: 'number' as const,
      operators: [...NUMBER_FIELD_OPERATORS],
      esField: `${property.name}.${part}`,
    }));
  }
  if (type === 'hyperlink-cp') {
    return (['url', 'displayText'] as const).map((part) => ({
      ...base,
      key: `extension.${entityType}.${property.name}.${part}`,
      label: `${label} ${part}`,
      type: 'text' as const,
      operators: [...TEXT_FIELD_OPERATORS],
      esField: `${property.name}.${part}`,
    }));
  }
  if (type === 'table-cp') {
    const columns = configColumns(property.config) ?? [];
    return columns.map((column) => ({
      ...base,
      key: `extension.${entityType}.${property.name}.rows.${column}`,
      label: `${label} - ${column}`,
      type: 'text' as const,
      operators: [...TEXT_FIELD_OPERATORS],
      esField: `${property.name}.rows.${column}`,
    }));
  }
  return [
    {
      ...base,
      key: `extension.${entityType}.${customPropertyEsField(property.name, type)}`,
      label,
      type: 'text',
      operators: [...TEXT_FIELD_OPERATORS],
      esField: customPropertyEsField(property.name, type),
    },
  ];
}
