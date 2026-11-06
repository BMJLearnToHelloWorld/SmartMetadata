/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type {
  WorkflowDefinitionFull,
  WorkflowFlowNode,
  WorkflowNodeConfig,
} from '@/types/governance';
import { NATIVE_FIELDS_BY_ENTITY_TYPE } from '@/views/admin/intakeFormDesigner';
import { getEntityLifecycleStages } from '@/api/metadataTypes';

/**
 * Official WorkflowConfigUtils (pin a3012259ca), ported 1:1, plus the
 * lifecycle-status and required-field-label helpers the node forms use
 * (LifecycleStatus.utils, MetadataCompletionTask.utils). The trigger-field
 * label helpers take the product `t` explicitly — the product has no
 * module-level i18n singleton (see src/i18n/index.ts).
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

type EntityTypeValue = string;

function getEntityTypesFromDataAssets(
  config: WorkflowNodeConfig,
): EntityTypeValue | EntityTypeValue[] | undefined {
  if (!config.dataAssets || config.dataAssets.length === 0) {
    return undefined;
  }
  const entityTypes = config.dataAssets.filter(Boolean);
  if (entityTypes.length > 1) {
    return entityTypes;
  } else if (entityTypes.length === 1) {
    return entityTypes[0];
  }
  return undefined;
}

export function getSelectedEntityTypes(
  config: WorkflowNodeConfig,
  workflowDefinition: WorkflowDefinitionFull | null,
): EntityTypeValue | EntityTypeValue[] {
  const dataAssetTypes = getEntityTypesFromDataAssets(config);
  if (dataAssetTypes !== undefined) {
    return dataAssetTypes;
  }
  if (!workflowDefinition) {
    return 'all';
  }
  const trigger = workflowDefinition.trigger;
  const triggerConfig = isPlainObject(trigger) ? trigger.config : undefined;
  const configObj = isPlainObject(triggerConfig) ? triggerConfig : {};
  if (typeof configObj.entityType === 'string') {
    return configObj.entityType;
  }
  if (Array.isArray(configObj.entityTypes) && configObj.entityTypes.length > 0) {
    const mapped = (configObj.entityTypes as string[]).filter(Boolean);
    if (mapped.length > 1) {
      return mapped;
    } else if (mapped.length === 1) {
      return mapped[0];
    }
  }
  return 'all';
}

function hasRequiredBaseFields(config: WorkflowNodeConfig): boolean {
  const hasName = Boolean(config.name && config.name.trim() !== '');
  const hasTriggerType = Boolean(
    config.triggerType && config.triggerType.trim() !== '',
  );
  const hasDataAssets = Boolean(
    config.dataAssets && config.dataAssets.length > 0,
  );
  return hasName && hasTriggerType && hasDataAssets;
}

function validatePeriodicBatchConfig(config: WorkflowNodeConfig): boolean {
  const hasScheduleType = Boolean(
    config.scheduleType && config.scheduleType.trim() !== '',
  );
  if (!hasScheduleType) {
    return false;
  }
  if (config.scheduleType === 'Scheduled') {
    return Boolean(
      config.cronExpression && config.cronExpression.trim() !== '',
    );
  }
  return true;
}

export function validateWorkflowConfig(
  config: WorkflowNodeConfig,
  isStartNode: boolean,
): boolean {
  if (!isStartNode) {
    return true;
  }
  if (!hasRequiredBaseFields(config)) {
    return false;
  }
  const isEventBased = config.triggerType === 'Event Based';
  const isPeriodicBatch = config.triggerType === 'Periodic Batch';
  if (isEventBased) {
    return Boolean(config.eventType && config.eventType.length > 0);
  }
  if (isPeriodicBatch) {
    return validatePeriodicBatchConfig(config);
  }
  return true;
}

export function filterExcludeFields(
  fields: Array<{ name?: string }>,
): Array<{ name?: string }> {
  return fields.filter((field) => {
    if (!field || !field.name) {
      return false;
    }
    if (field.name.startsWith('column.') || field.name.startsWith('columns.')) {
      return true;
    }
    if (field.name.includes('.')) {
      return false;
    }
    return true;
  });
}

export const EXTENSION_FIELD_PREFIX = 'extension.';

// Custom properties are addressed as extension.<name> everywhere in the workflow builder.
export function withExtensionPrefix(name: string): string {
  return `${EXTENSION_FIELD_PREFIX}${name}`;
}

// Inverse of withExtensionPrefix: the bare name shown to the user.
export function getFieldLabel(value: string): string {
  return value.startsWith(EXTENSION_FIELD_PREFIX)
    ? value.slice(EXTENSION_FIELD_PREFIX.length)
    : value;
}

// Display label for a workflow field option: the bare name, with custom properties
// marked so a custom property and a same-named standard field stay distinguishable.
export function getFieldDisplayLabel(
  value: string,
  t: (key: string) => string,
): string {
  return value.startsWith(EXTENSION_FIELD_PREFIX)
    ? `${getFieldLabel(value)} (${t('workflows.builder.customProperty')})`
    : getFieldLabel(value);
}

/**
 * Builds the de-duplicated field-option list for a workflow field picker.
 * Custom properties are stored under `extension.<name>`; the fields API
 * returns them by bare name, so prefix those (and only those).
 * Call this per entity type and merge the results.
 */
export function buildFieldOptions(
  fields: Array<{ name?: string }>,
  customPropertyNames: Set<string>,
): string[] {
  const seen = new Set<string>();
  const options: string[] = [];
  filterExcludeFields(fields).forEach(({ name }) => {
    if (!name) {
      return;
    }
    const value = customPropertyNames.has(name)
      ? withExtensionPrefix(name)
      : name;
    if (!seen.has(value)) {
      seen.add(value);
      options.push(value);
    }
  });
  return options;
}

/**
 * Maps each entity-specific trigger field to the one selected entity type it
 * belongs to, so the field picker can group it under that type. A field
 * shared by several selected types is left ungrouped.
 */
export function buildEntityFieldGroups(
  entitySpecific: Record<string, string[]>,
  selectedEntityTypes: string[],
): Record<string, string> {
  const owners: Record<string, string[]> = {};
  selectedEntityTypes.forEach((entityType) => {
    (entitySpecific[entityType] ?? []).forEach((field) => {
      owners[field] = [...(owners[field] ?? []), entityType];
    });
  });
  return Object.fromEntries(
    Object.entries(owners)
      .filter(([, entityTypes]) => entityTypes.length === 1)
      .map(([field, [entityType]]) => [field, entityType]),
  );
}

/**
 * Whether a builder node writes to a Git sink. The builder's sink form saves every sink as a Git
 * sink, so a sink node not configured yet counts as one.
 */
export function isGitSinkNode(node: WorkflowFlowNode): boolean {
  const config = (node.data?.config ?? {}) as Record<string, unknown>;
  return (
    node.data?.subType === 'sinkTask' &&
    (typeof config.sinkType === 'string' ? config.sinkType : 'git') === 'git'
  );
}

// Query entities are not synced to a Git sink.
function isGitSinkSyncedEntityType(entityType: string): boolean {
  return entityType !== 'query';
}

/**
 * Entity types a workflow's trigger can be defined on. Query entities are not synced to a Git sink,
 * so a workflow with one offers neither them nor an "All" that includes them.
 */
export function getTriggerDataAssets(
  entityTypes: string[],
  hasGitSinkNode: boolean,
): string[] {
  return hasGitSinkNode
    ? entityTypes.filter(isGitSinkSyncedEntityType)
    : entityTypes;
}

/**
 * The trigger's selected data assets and their filters, limited to the entity types a Git sink
 * syncs.
 */
export function getGitSinkTriggerNodeConfig(
  config: WorkflowNodeConfig,
): WorkflowNodeConfig {
  return {
    ...config,
    dataAssets: config.dataAssets.filter(isGitSinkSyncedEntityType),
    dataAssetFilters: config.dataAssetFilters.filter((dataAssetFilter) =>
      isGitSinkSyncedEntityType(dataAssetFilter.dataAsset),
    ),
  };
}

// A trigger filter is a string applied to every entity type, or an object keyed by entity type.
function getGitSinkTriggerFilter(filter: unknown): unknown {
  if (isPlainObject(filter)) {
    const { query: _dropped, ...rest } = filter as Record<string, unknown>;
    return rest;
  }
  return filter;
}

/**
 * A trigger config limited to the entity types a Git sink syncs: in its entity types and in its
 * per-entity-type `filter` (event-based) and `filters` (periodic batch).
 */
export function getGitSinkTriggerConfig(
  triggerConfig: Record<string, unknown>,
): Record<string, unknown> {
  const { entityTypes, filter, filters } = triggerConfig;
  return {
    ...triggerConfig,
    ...(Array.isArray(entityTypes) && {
      entityTypes: entityTypes.filter(isGitSinkSyncedEntityType),
    }),
    ...(filter !== undefined && { filter: getGitSinkTriggerFilter(filter) }),
    ...(filters !== undefined && {
      filters: getGitSinkTriggerFilter(filters),
    }),
  };
}

// ---------------------------------------------------------------------------
// Lifecycle statuses (official LifecycleStatus.utils)
// ---------------------------------------------------------------------------

export interface EntityLifecycleStage {
  entityType: string;
  stages: string[];
}

export interface EntityLifecycleStages {
  entityTypes: EntityLifecycleStage[];
}

export function resolveLifecycleStatuses(
  lifecycle: EntityLifecycleStages,
  entityTypes: readonly string[],
  selection: 'union' | 'intersection' = 'union',
): string[] {
  const scopedTypes = entityTypes.some(
    (type) => type === 'all' || type === 'dataAsset',
  )
    ? lifecycle.entityTypes.map((type) => type.entityType)
    : entityTypes;
  const vocabularies = scopedTypes.map(
    (entityType) =>
      lifecycle.entityTypes.find((type) => type.entityType === entityType)
        ?.stages ?? [],
  );
  const statuses =
    selection === 'intersection'
      ? (vocabularies[0] ?? []).filter((status) =>
          vocabularies.every((stages) => stages.includes(status)),
        )
      : vocabularies.flat();
  return [...new Set(statuses)].sort();
}

export async function fetchLifecycleStatuses(
  entityTypes: readonly string[],
  selection: 'union' | 'intersection' = 'union',
): Promise<string[]> {
  return resolveLifecycleStatuses(
    await getEntityLifecycleStages(
      selection === 'intersection' && !entityTypes.includes('dataAsset')
        ? undefined
        : entityTypes,
    ),
    entityTypes,
    selection,
  );
}

// ---------------------------------------------------------------------------
// Required-field labels (official MetadataCompletionTask.utils)
// ---------------------------------------------------------------------------

const FIELD_LABEL_KEYS: Record<string, string> = {
  ...Object.fromEntries(
    Object.values(NATIVE_FIELDS_BY_ENTITY_TYPE)
      .flat()
      .map(({ path, labelKey }) => [path, labelKey]),
  ),
  description: 'intakeForms.fieldLabels.description',
  owners: 'intakeForms.fieldLabels.owners',
  'metricExpression.code': 'metrics.expression',
};

/** A required field's name as the asset's page shows it; a custom property keeps its own name. */
export function getRequiredFieldLabel(
  path: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const labelKey = FIELD_LABEL_KEYS[path];
  if (labelKey) {
    return t(labelKey);
  }
  return path.startsWith(EXTENSION_FIELD_PREFIX)
    ? path.slice(EXTENSION_FIELD_PREFIX.length)
    : path;
}
