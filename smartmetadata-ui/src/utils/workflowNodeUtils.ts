/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { CONNECTION_MODAL_RULES, NODE_TYPE_MAPPINGS } from '@/constants/workflowBuilder';
import type {
  WorkflowBackendEdge,
  WorkflowDefinitionFull,
  WorkflowFlowEdge,
  WorkflowFlowNode,
  WorkflowMetadata,
  WorkflowNodeConfig,
  WorkflowNodeConfiguration,
  WorkflowNodeDataWithMetadata,
  WorkflowNodeSubType,
  WorkflowNodeType,
} from '@/types/governance';
import {
  deserializeEventBasedFilters,
  deserializePeriodicBatchFilters,
} from './workflowSerialization';

/**
 * Official NodeUtils + WorkflowNodeConfigUtils (pin a3012259ca), ported 1:1.
 * Covers the palette label/type lookups, the connection-modal rule, the
 * start-node config derivation (getInitialNodeConfig's three branches), and
 * the save-path node configuration (getNodeConfiguration: IO, branches,
 * per-subtype config handlers, input-namespace resolution).
 */

export function getLabelFromSubType(subType: WorkflowNodeSubType): string {
  const mapping = NODE_TYPE_MAPPINGS[subType];
  return mapping?.label || subType;
}

export function getDisplayLabelFromSubType(
  subType: WorkflowNodeSubType | undefined,
): string {
  if (!subType) {
    return 'TASK';
  }
  const mapping = NODE_TYPE_MAPPINGS[subType];
  return mapping?.displayLabel || subType.toUpperCase() || 'TASK';
}

export function getTypeFromSubType(subType: WorkflowNodeSubType): WorkflowNodeType {
  const mapping = NODE_TYPE_MAPPINGS[subType];
  return mapping?.type || 'automatedTask';
}

export function getSubTypeFromLabel(label: string): WorkflowNodeSubType {
  const mapping = Object.entries(NODE_TYPE_MAPPINGS).find(
    ([, value]) => value.label === label,
  );
  return (mapping?.[0] as WorkflowNodeSubType) || 'checkEntityAttributesTask';
}

export function createNodeData(
  label: string,
  _type: string,
  nodeId: string,
): WorkflowNodeDataWithMetadata {
  const subType = getSubTypeFromLabel(label);
  const nodeType = getTypeFromSubType(subType);
  return {
    id: nodeId,
    label,
    type: nodeType,
    name: nodeId, // This will be replaced by getNodeName in the workflow logic
    displayName: label,
    subType,
  };
}

// Counter for generating unique node IDs
let nodeIdCounter = 1;

export function generateNodeId(type: string): string {
  return `${type}_${nodeIdCounter++}`;
}

export function resetNodeIdCounter(): void {
  nodeIdCounter = 1;
}

export function shouldUseConfigSidebar(nodeType: string): boolean {
  return nodeType !== '';
}

export function shouldShowForm(nodeType: string): boolean {
  return nodeType !== '';
}

export function shouldShowConnectionModal(
  sourceNode: WorkflowFlowNode | undefined,
  targetNode: WorkflowFlowNode | undefined,
): boolean {
  if (!sourceNode || !targetNode) {
    return false;
  }
  if (sourceNode.type === 'startEvent') {
    return false;
  }
  if (
    sourceNode.data?.subType &&
    (
      CONNECTION_MODAL_RULES.NEVER_SHOW_SOURCES as readonly string[]
    ).includes(sourceNode.data.subType)
  ) {
    return false;
  }
  if (
    sourceNode.data?.subType &&
    (
      CONNECTION_MODAL_RULES.ALWAYS_SHOW_SOURCES as readonly string[]
    ).includes(sourceNode.data.subType)
  ) {
    return true;
  }
  return false;
}

export function isStartNode(node: WorkflowFlowNode | null): boolean {
  if (!node) {
    return false;
  }
  return (
    node.type === 'startEvent' || node.data?.subType === 'startEvent'
  );
}

export function getNodeTitle(node: WorkflowFlowNode | null): string {
  if (!node) {
    return 'Node Configuration';
  }
  if (isStartNode(node)) {
    return 'Start Node Configuration';
  }
  const subType = node.data?.subType;
  return subType
    ? `${getLabelFromSubType(subType)} Configuration`
    : 'Node Configuration';
}

const EVENT_BASED_TRIGGER_TYPE = 'Event Based';

export function convertDisplayToBackendTriggerType(displayType: string): string {
  switch (displayType) {
    case EVENT_BASED_TRIGGER_TYPE:
      return 'eventBasedEntity';
    case 'Periodic Batch':
      return 'periodicBatchEntity';
    default:
      return displayType;
  }
}

export function convertBackendToDisplayTriggerType(backendType: string): string {
  switch (backendType) {
    case 'eventBasedEntity':
      return EVENT_BASED_TRIGGER_TYPE;
    case 'periodicBatchEntity':
      return 'Periodic Batch';
    default:
      return backendType;
  }
}

// --- getInitialNodeConfig: three branches ---------------------------------

function orDefault<T, F>(value: T, fallback: F): T | F {
  return value || fallback;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

// A node that was already saved/edited carries its own config verbatim.
function getNodeConfigFromSavedData(node: WorkflowFlowNode): WorkflowNodeConfig {
  return {
    name: orDefault(node.data.name, ''),
    description: orDefault(node.data.description, ''),
    dataAssets: orDefault(node.data.dataAssets, []),
    triggerType: node.data.triggerType ?? '',
    eventType: orDefault(node.data.eventType, ['Created', 'Updated']),
    excludeFields: orDefault(node.data.excludeFields, []),
    include: asArray(node.data.include),
    scheduleType: orDefault(node.data.scheduleType, ''),
    cronExpression: orDefault(node.data.cronExpression, ''),
    batchSize: orDefault(node.data.batchSize, 100),
    dataAssetFilters: orDefault(node.data.dataAssetFilters, []),
    triggerFilter: orDefault(node.data.triggerFilter, ''),
    approvalMode: node.data.approvalMode,
  };
}

function getTriggerConfig(
  trigger: WorkflowDefinitionFull['trigger'],
): Record<string, unknown> {
  if (trigger && typeof trigger === 'object' && !Array.isArray(trigger)) {
    const config = (trigger as Record<string, unknown>).config;
    return isRecord(config) ? config : {};
  }
  return {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getStartNodeScheduleType(config: Record<string, unknown>): string {
  const schedule = isRecord(config.schedule) ? config.schedule : {};
  if (schedule.scheduleTimeline === 'None') {
    return 'OnDemand';
  }
  if (
    schedule.scheduleTimeline === 'Custom' &&
    schedule.cronExpression
  ) {
    return 'Scheduled';
  }
  return '';
}

function getStartNodeDataAssetFilters(
  trigger: WorkflowDefinitionFull['trigger'],
  config: Record<string, unknown>,
  entityTypes: string[],
): WorkflowNodeConfig['dataAssetFilters'] {
  if (
    isRecord(trigger) &&
    trigger.type === 'periodicBatchEntity' &&
    config.filters
  ) {
    return deserializePeriodicBatchFilters(
      config.filters as Record<string, string>,
      entityTypes,
    );
  }
  return [];
}

function getStartNodeTriggerFilter(
  trigger: WorkflowDefinitionFull['trigger'],
  config: Record<string, unknown>,
  entityTypes: string[],
): string {
  if (
    isRecord(trigger) &&
    trigger.type === 'eventBasedEntity' &&
    config.filter
  ) {
    return deserializeEventBasedFilters(
      config.filter as Record<string, string>,
      entityTypes,
    );
  }
  return '';
}

function getStartNodeTriggerType(
  trigger: WorkflowDefinitionFull['trigger'],
): string {
  return convertBackendToDisplayTriggerType(
    isRecord(trigger) ? orDefault(trigger.type as string, '') : '',
  );
}

function getStartNodeEventType(config: Record<string, unknown>): string[] {
  return Array.isArray(config.events) && config.events.length > 0
    ? (config.events as string[])
    : ['Created', 'Updated'];
}

function getStartNodeExcludeFields(config: Record<string, unknown>): string[] {
  return Array.isArray(config.exclude) ? asArray(config.exclude) : [];
}

// The start node's config is derived from the workflow definition's trigger.
function getNodeConfigFromStartNode(
  workflowDefinition: WorkflowDefinitionFull,
  workflowMetadata?: WorkflowMetadata | null,
): WorkflowNodeConfig {
  const trigger = workflowDefinition.trigger;
  const config = getTriggerConfig(trigger);
  const entityTypes = orDefault(config.entityTypes as string[], []);

  return {
    name: orDefault(
      workflowMetadata?.displayName,
      orDefault(workflowDefinition.displayName, ''),
    ),
    description: orDefault(
      workflowMetadata?.description,
      orDefault(workflowDefinition.description, ''),
    ),
    dataAssets: entityTypes,
    triggerType: getStartNodeTriggerType(trigger),
    eventType: getStartNodeEventType(config),
    excludeFields: getStartNodeExcludeFields(config),
    include: asArray(config.include),
    scheduleType: getStartNodeScheduleType(config),
    cronExpression: orDefault(
      (isRecord(config.schedule) ? config.schedule.cronExpression : undefined) as string,
      '',
    ),
    batchSize: orDefault(config.batchSize as number, 500),
    dataAssetFilters: getStartNodeDataAssetFilters(
      trigger,
      config,
      entityTypes,
    ),
    triggerFilter: getStartNodeTriggerFilter(trigger, config, entityTypes),
    approvalMode: config.approvalMode as WorkflowNodeConfig['approvalMode'],
  };
}

// A brand-new, non-start node falls back to generic defaults.
function getDefaultNodeConfig(node: WorkflowFlowNode): WorkflowNodeConfig {
  return {
    name: node?.data?.displayName || node?.data?.label || '',
    description: node?.data?.description || '',
    dataAssets: [],
    triggerType: EVENT_BASED_TRIGGER_TYPE,
    eventType: ['Created', 'Updated'],
    dataAssetFilters: [],
    excludeFields: [],
    include: node?.data?.include ?? [],
    triggerFilter: '',
    scheduleType: '',
    cronExpression: '',
    batchSize: 100,
  };
}

export function getInitialNodeConfig(
  node: WorkflowFlowNode,
  workflowDefinition: WorkflowDefinitionFull | null,
  workflowMetadata?: WorkflowMetadata | null,
): WorkflowNodeConfig {
  if (node.data && (node.data.lastSaved || node.data.userModified)) {
    return getNodeConfigFromSavedData(node);
  }
  if (isStartNode(node) && workflowDefinition) {
    return getNodeConfigFromStartNode(workflowDefinition, workflowMetadata);
  }
  return getDefaultNodeConfig(node);
}

// --- getNodeConfiguration (save path) --------------------------------------

export function findPathBetweenNodes(
  sourceId: string,
  targetId: string,
  edges: WorkflowBackendEdge[],
): boolean {
  if (sourceId === targetId) {
    return true;
  }
  const visited = new Set<string>();
  const queue = [sourceId];
  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId || visited.has(currentId)) {
      continue;
    }
    visited.add(currentId);
    if (currentId === targetId) {
      return true;
    }
    const outgoingEdges = edges.filter((edge) => edge.from === currentId);
    for (const edge of outgoingEdges) {
      if (!visited.has(edge.to)) {
        queue.push(edge.to);
      }
    }
  }
  return false;
}

export function getNodeName(
  subType: string,
  nodeId: string,
  allNodes: WorkflowNodeDataWithMetadata[],
): string {
  if (subType === 'startEvent') {
    return 'start';
  }
  // Check if the current node already has a name property
  const currentNode = allNodes.find((n) => n.id === nodeId);
  if (currentNode?.name) {
    // Preserve the existing node name to maintain consistency across migrations
    return currentNode.name;
  }
  // For new nodes, generate a unique name that doesn't conflict with existing ones
  const existingNames = new Set(
    allNodes
      .filter((n) => n.subType === subType && n.name)
      .map((n) => n.name)
      .filter(Boolean),
  );
  let count = 1;
  let proposedName = `${subType}_${count}`;
  while (existingNames.has(proposedName)) {
    count++;
    proposedName = `${subType}_${count}`;
  }
  return proposedName;
}

function applySetEntityAttributeConfig(
  config: WorkflowNodeConfiguration,
  nodeData: WorkflowNodeDataWithMetadata,
): void {
  const fieldName =
    nodeData.fieldName ||
    (isRecord(nodeData.config) ? (nodeData.config.fieldName as string) : undefined);
  const fieldValue =
    nodeData.fieldValue ||
    (isRecord(nodeData.config) ? (nodeData.config.fieldValue as string) : undefined);
  if (!fieldName && !fieldValue) {
    return;
  }
  config.config = {};
  if (fieldName) {
    config.config.fieldName = fieldName;
  }
  if (fieldValue) {
    config.config.fieldValue = fieldValue;
  } else if (config.config.fieldName) {
    config.config.fieldValue = '';
  }
}

function applyCheckEntityAttributesConfig(
  config: WorkflowNodeConfiguration,
  nodeData: WorkflowNodeDataWithMetadata,
): void {
  const rules =
    nodeData.rules ||
    (isRecord(nodeData.config) ? (nodeData.config.rules as string) : undefined);
  if (!rules) {
    return;
  }
  config.config = {
    rules: typeof rules === 'object' ? JSON.stringify(rules) : rules,
  };
}

function applyDataCompletenessConfig(
  config: WorkflowNodeConfiguration,
  nodeData: WorkflowNodeDataWithMetadata,
): void {
  const qualityBands =
    nodeData.qualityBands ||
    (isRecord(nodeData.config)
      ? (nodeData.config.qualityBands as WorkflowNodeConfiguration['config'])
      : undefined);
  const fieldsToCheck =
    nodeData.fieldsToCheck ||
    (isRecord(nodeData.config)
      ? (nodeData.config.fieldsToCheck as string[])
      : undefined);
  if (!qualityBands && !fieldsToCheck) {
    return;
  }
  config.config = {};
  if (qualityBands) {
    config.config.qualityBands = qualityBands;
  }
  if (fieldsToCheck) {
    config.config.fieldsToCheck = fieldsToCheck;
  }
}

function applyCheckChangeDescriptionConfig(
  config: WorkflowNodeConfiguration,
  nodeData: WorkflowNodeDataWithMetadata,
): void {
  if (!nodeData.config || typeof nodeData.config !== 'object') {
    return;
  }
  const cfg = nodeData.config as {
    condition?: 'AND' | 'OR';
    rules?: Record<string, string[]>;
  };
  const hasValidRules =
    cfg.rules && typeof cfg.rules === 'object' && !Array.isArray(cfg.rules);
  config.config = {
    condition: cfg.condition ?? 'OR',
    rules: hasValidRules ? cfg.rules : {},
  };
}

function applyPassthroughConfig(
  config: WorkflowNodeConfiguration,
  nodeData: WorkflowNodeDataWithMetadata,
): void {
  if (nodeData.config && Object.keys(nodeData.config).length > 0) {
    config.config = nodeData.config;
  }
}

const NODE_SPECIFIC_CONFIG_HANDLERS: Record<
  string,
  (config: WorkflowNodeConfiguration, nodeData: WorkflowNodeDataWithMetadata) => void
> = {
  setEntityAttributeTask: applySetEntityAttributeConfig,
  checkEntityAttributesTask: applyCheckEntityAttributesConfig,
  dataCompletenessTask: applyDataCompletenessConfig,
  checkChangeDescriptionTask: applyCheckChangeDescriptionConfig,
  rollbackEntityTask: applyPassthroughConfig,
  sinkTask: applyPassthroughConfig,
  collectMetadataTask: applyPassthroughConfig,
};

function addNodeSpecificConfig(
  config: WorkflowNodeConfiguration,
  subType: string,
  nodeData: WorkflowNodeDataWithMetadata,
): void {
  const handler = NODE_SPECIFIC_CONFIG_HANDLERS[subType];
  handler?.(config, nodeData);
}

// Most automated tasks require input: ["relatedEntity", "updatedBy"]
// Exception: checkEntityAttributesTask, checkChangeDescriptionTask and
// dataCompletenessTask only need ["relatedEntity"]
const AUTOMATED_TASK_SINGLE_INPUT_SUBTYPES: string[] = [
  'checkEntityAttributesTask',
  'checkChangeDescriptionTask',
  'dataCompletenessTask',
  'collectMetadataTask',
];

// Nodes whose schema declares no output variables, so the request may not carry one.
const AUTOMATED_TASK_WITHOUT_OUTPUT_SUBTYPES: string[] = [
  'collectMetadataTask',
];

const AUTOMATED_TASK_OUTPUT_MAP: Record<
  string,
  { output: string[]; branches?: string[] }
> = {
  checkEntityAttributesTask: {
    output: ['result'],
    branches: ['true', 'false'],
  },
  checkChangeDescriptionTask: {
    output: ['result'],
    branches: ['true', 'false'],
  },
  dataCompletenessTask: {
    output: [
      'completenessScore',
      'qualityBand',
      'filledFieldsCount',
      'totalFieldsCount',
      'missingFields',
      'filledFields',
      'result',
    ],
  },
  sinkTask: {
    output: [
      'syncResult',
      'syncedCount',
      'failedCount',
      'skippedCount',
      'result',
    ],
    branches: ['success', 'failure'],
  },
};

function configureAutomatedTaskIO(
  config: WorkflowNodeConfiguration,
  subType: string,
  nodeData: WorkflowNodeDataWithMetadata,
): void {
  config.input = AUTOMATED_TASK_SINGLE_INPUT_SUBTYPES.includes(subType)
    ? ['relatedEntity']
    : ['relatedEntity', 'updatedBy'];
  const outputConfig = AUTOMATED_TASK_OUTPUT_MAP[subType];
  if (!AUTOMATED_TASK_WITHOUT_OUTPUT_SUBTYPES.includes(subType)) {
    config.output = outputConfig?.output ?? [];
  }
  if (outputConfig?.branches) {
    config.branches = outputConfig.branches;
  }
  addNodeSpecificConfig(config, subType, nodeData);
}

function applyUserApprovalConfig(
  config: WorkflowNodeConfiguration,
  nodeData: WorkflowNodeDataWithMetadata,
): void {
  const assigneesFromNode = isRecord(nodeData.config)
    ? (nodeData.config.assignees as
        | {
            addReviewers?: boolean;
            addOwners?: boolean;
            emptyAssigneeStrategy?: 'none' | 'assignAdmins';
            candidates?: Array<{
              id: string;
              type: string;
              fullyQualifiedName?: string;
              name?: string;
            }>;
          }
        | undefined)
    : undefined;
  // Start from the step's stored config so settings this builder does not edit (partial
  // decisions, transition metadata, task status, domain-owner approvers) survive a save.
  config.config = { ...nodeData.config };
  config.config.assignees = {
    ...assigneesFromNode,
    addReviewers: assigneesFromNode?.addReviewers ?? true,
    addOwners: assigneesFromNode?.addOwners ?? false,
    emptyAssigneeStrategy: assigneesFromNode?.emptyAssigneeStrategy ?? 'none',
    candidates: assigneesFromNode?.candidates ?? [],
  };
  config.config.approvalThreshold =
    nodeData.approvalThreshold ??
    (isRecord(nodeData.config)
      ? (nodeData.config.approvalThreshold as number)
      : undefined) ??
    1;
  config.config.rejectionThreshold =
    nodeData.rejectionThreshold ??
    (isRecord(nodeData.config)
      ? (nodeData.config.rejectionThreshold as number)
      : undefined) ??
    1;
}

function configureUserTaskIO(
  config: WorkflowNodeConfiguration,
  subType: string,
  nodeData: WorkflowNodeDataWithMetadata,
): void {
  config.input = ['relatedEntity'];
  config.output = ['updatedBy'];
  config.branches = ['true', 'false'];
  if (subType === 'userApprovalTask') {
    applyUserApprovalConfig(config, nodeData);
  }
}

export function configureNodeInputOutput(
  config: WorkflowNodeConfiguration,
  nodeType: string,
  subType: string,
  nodeData: WorkflowNodeDataWithMetadata,
): WorkflowNodeConfiguration {
  if (nodeType === 'startEvent' || nodeType === 'endEvent') {
    return config;
  }
  if (nodeType === 'automatedTask') {
    configureAutomatedTaskIO(config, subType, nodeData);
  }
  if (nodeType === 'userTask') {
    configureUserTaskIO(config, subType, nodeData);
  }
  return config;
}

// Resolve the namespace for the "updatedBy" input by finding the nearest
// preceding user-approval task, falling back to any user task, then 'global'.
function resolveUpdatedByNamespace(
  nodeData: WorkflowNodeDataWithMetadata,
  allNodes: WorkflowNodeDataWithMetadata[],
  allEdges: WorkflowBackendEdge[],
): string {
  if (allEdges.length === 0) {
    // No edges available, find any user task (fallback for edge case)
    const userTaskNode = allNodes.find(
      (node) => node.subType === 'userApprovalTask',
    );
    return userTaskNode ? userTaskNode.name || userTaskNode.id : 'global';
  }
  const currentNodeId = nodeData.id;
  const userTasks = allNodes.filter(
    (node) => node.subType === 'userApprovalTask',
  );
  for (const userTask of userTasks) {
    const hasPath = findPathBetweenNodes(userTask.id, currentNodeId, allEdges);
    if (hasPath) {
      // Use the actual node name as the namespace for backend reference
      return userTask.name || userTask.id;
    }
  }
  return 'global';
}

// Apply user overrides with selective filtering
function applyNamespaceOverrides(
  config: WorkflowNodeConfiguration,
  nodeData: WorkflowNodeDataWithMetadata,
): void {
  if (
    !nodeData.inputNamespaceMap ||
    Object.keys(nodeData.inputNamespaceMap).length === 0
  ) {
    return;
  }
  const filteredOverrides: Record<string, string> = {};
  Object.entries(nodeData.inputNamespaceMap).forEach(([key, value]) => {
    const isRedundantGlobalUpdatedBy =
      key === 'updatedBy' &&
      value === 'global' &&
      config.inputNamespaceMap?.updatedBy !== 'global';
    if (isRedundantGlobalUpdatedBy) {
      return;
    }
    if (typeof value === 'string') {
      filteredOverrides[key] = value;
    }
  });
  config.inputNamespaceMap = {
    ...(config.inputNamespaceMap || {}),
    ...filteredOverrides,
  };
}

// Configure input namespace mapping
export function configureInputNamespaceMap(
  config: WorkflowNodeConfiguration,
  nodeData: WorkflowNodeDataWithMetadata,
  allNodes: WorkflowNodeDataWithMetadata[],
  allEdges: WorkflowBackendEdge[],
): WorkflowNodeConfiguration {
  if (!config.input || config.input.length === 0) {
    return config;
  }
  config.inputNamespaceMap = {};
  if (config.input.includes('relatedEntity')) {
    config.inputNamespaceMap.relatedEntity = 'global';
  }
  if (config.input.includes('updatedBy')) {
    config.inputNamespaceMap.updatedBy = resolveUpdatedByNamespace(
      nodeData,
      allNodes,
      allEdges,
    );
  }
  applyNamespaceOverrides(config, nodeData);
  return config;
}

// Main node configuration function
export function getNodeConfiguration(
  nodeType: string,
  subType: string,
  nodeData: WorkflowNodeDataWithMetadata,
  allNodes: WorkflowNodeDataWithMetadata[] = [],
  allEdges: WorkflowBackendEdge[] = [],
): WorkflowNodeConfiguration {
  const nodeName = getNodeName(subType, nodeData.id, allNodes);
  let config: WorkflowNodeConfiguration = {
    type: nodeType,
    subType,
    name: nodeName,
    displayName: nodeData.displayName || nodeData.label || nodeData.id,
  };
  // Configure input/output/config rules
  config = configureNodeInputOutput(config, nodeType, subType, nodeData);
  // Configure input namespace mapping
  config = configureInputNamespaceMap(config, nodeData, allNodes, allEdges);
  return config;
}

/**
 * Canvas node test id, computed exactly as official does in CustomNodes:
 * `workflow-${subType.toLowerCase().replace(/([A-Z])/g, '-$1').replace(/^-/, '')}-node`.
 * The lowercasing runs first, so the camelCase split is a no-op in practice
 * (e.g. checkEntityAttributesTask → workflow-checkentityattributestask-node);
 * the expression is kept verbatim so test hooks match official's.
 */
export function getWorkflowNodeTestId(
  subType: WorkflowNodeSubType | string | undefined,
): string {
  const slug = (subType ?? '')
    .toLowerCase()
    .replace(/([A-Z])/g, '-$1')
    .replace(/^-/, '');
  return `workflow-${slug}-node`;
}

export type { WorkflowFlowEdge };
