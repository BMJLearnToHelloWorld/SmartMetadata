/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { message } from 'ant-design-vue';
import { validateWorkflowDefinition } from '@/api/workflows';
import type {
  WorkflowBackendEdge,
  WorkflowBackendNode,
  WorkflowDefinitionFull,
  WorkflowFlowEdge,
  WorkflowFlowNode,
  WorkflowMetadata,
  WorkflowNodeConfig,
  WorkflowNodeConfiguration,
  WorkflowNodeSubType,
  WorkflowNodeType,
} from '@/types/governance';
import { getGitSinkTriggerConfig, isGitSinkNode } from '@/utils/workflowConfig';
import {
  getNodeConfiguration,
  getNodeName,
  isUserApprovalTaskSubType,
} from '@/utils/workflowNodeUtils';
import { deserializeEventBasedFilters } from '@/utils/workflowSerialization';

/**
 * Official WorkflowValidationService (pin a3012259ca), ported 1:1:
 * buildWorkflowForSave (client build + assertions) and testWorkflow
 * (build → POST /validate). Toasts use the product's antd `message` pattern
 * (as in LineageGraph.vue). The translate function is passed in by the page
 * — the product has no module-level i18n singleton; without one the key
 * itself is thrown/shown, exactly as a missing vue-i18n key renders.
 */

type TranslateFn = (key: string) => string;

type NodeConfigWithMetadata = WorkflowNodeConfig & {
  lastSaved?: string;
  userModified?: boolean;
};

// Shared with buildWorkflowForSave() so both agree on what "user touched the
// start node" means.
function hasUserModifiedStartNode(
  startNodeConfig: NodeConfigWithMetadata,
): boolean {
  return Boolean(startNodeConfig.lastSaved || startNodeConfig.userModified);
}

function hasConfiguredDataAssets(
  startNodeConfig: NodeConfigWithMetadata,
): boolean {
  return Boolean(
    startNodeConfig.dataAssets &&
      Array.isArray(startNodeConfig.dataAssets) &&
      startNodeConfig.dataAssets.length > 0,
  );
}

// EntityTypes resolution is identical for both event-based and periodic-batch
// triggers - only what gets layered on top of it differs.
function resolveEntityTypes(
  startNodeConfig: NodeConfigWithMetadata,
  existingTriggerConfig: Record<string, unknown> | undefined,
  hasUserChanges: boolean,
  hasStartNodeConfig: boolean,
): string[] {
  const entityTypes: string[] = [];
  if (hasUserChanges && hasStartNodeConfig) {
    const validAssets = (startNodeConfig.dataAssets ?? []).filter(
      (asset: string) => asset && asset.trim() !== '',
    );
    if (validAssets.length > 0) {
      entityTypes.push(...validAssets);
    }
  } else if (
    existingTriggerConfig?.entityTypes &&
    Array.isArray(existingTriggerConfig.entityTypes)
  ) {
    entityTypes.push(...(existingTriggerConfig.entityTypes as string[]));
  } else if (
    existingTriggerConfig?.entityType &&
    typeof existingTriggerConfig.entityType === 'string'
  ) {
    entityTypes.push(existingTriggerConfig.entityType);
  }
  return entityTypes;
}

function resolveEventBasedEvents(
  startNodeConfig: NodeConfigWithMetadata,
  existingTriggerConfig: Record<string, unknown> | undefined,
  hasUserChanges: boolean,
): string[] | undefined {
  if (
    hasUserChanges &&
    startNodeConfig.eventType &&
    startNodeConfig.eventType.length > 0
  ) {
    return startNodeConfig.eventType;
  }
  return existingTriggerConfig?.events as string[] | undefined;
}

function resolveEventBasedExclude(
  startNodeConfig: NodeConfigWithMetadata,
  existingTriggerConfig: Record<string, unknown> | undefined,
  hasUserChanges: boolean,
): string[] | undefined {
  if (hasUserChanges && startNodeConfig.excludeFields !== undefined) {
    return startNodeConfig.excludeFields.length > 0
      ? startNodeConfig.excludeFields
      : undefined;
  }
  return existingTriggerConfig?.exclude as string[] | undefined;
}

function resolveEventBasedInclude(
  startNodeConfig: NodeConfigWithMetadata,
  existingTriggerConfig: Record<string, unknown> | undefined,
  hasUserChanges: boolean,
): string[] | undefined {
  if (hasUserChanges && Array.isArray(startNodeConfig.include)) {
    // An explicitly cleared list means "every field" and must not fall back to the saved include.
    return startNodeConfig.include.length > 0
      ? startNodeConfig.include
      : undefined;
  }
  return existingTriggerConfig?.include as string[] | undefined;
}

function resolveEventBasedFilter(
  entityTypes: string[],
  startNodeConfig: NodeConfigWithMetadata,
  existingTriggerConfig: Record<string, unknown> | undefined,
  hasUserChanges: boolean,
): Record<string, string> | string | undefined {
  const triggerFilter = startNodeConfig.triggerFilter?.trim() ?? '';
  if (hasUserChanges && triggerFilter !== '') {
    const filterObj: Record<string, string> = {};
    entityTypes.forEach((entityType) => {
      filterObj[entityType] = startNodeConfig.triggerFilter || '';
    });
    return filterObj;
  }
  // The user emptied a filter that was shown to them: save no filter instead of the old one.
  const savedFilter = deserializeEventBasedFilters(
    existingTriggerConfig?.filter as Record<string, string> | undefined,
    entityTypes,
  );
  if (
    hasUserChanges &&
    startNodeConfig.triggerFilter !== undefined &&
    savedFilter.trim() !== ''
  ) {
    return undefined;
  }
  return existingTriggerConfig?.filter as
    | Record<string, string>
    | string
    | undefined;
}

function resolveApprovalMode(
  startNodeConfig: NodeConfigWithMetadata,
  existingTriggerConfig: Record<string, unknown> | undefined,
  hasUserChanges: boolean,
): string | undefined {
  return hasUserChanges && startNodeConfig.approvalMode
    ? startNodeConfig.approvalMode
    : (existingTriggerConfig?.approvalMode as string | undefined);
}

function buildEventBasedTriggerConfig(
  startNodeConfig: NodeConfigWithMetadata,
  existingTriggerConfig: Record<string, unknown> | undefined,
  hasUserChanges: boolean,
  hasStartNodeConfig: boolean,
): Record<string, unknown> {
  const finalTriggerConfig: Record<string, unknown> = {};
  const entityTypes = resolveEntityTypes(
    startNodeConfig,
    existingTriggerConfig,
    hasUserChanges,
    hasStartNodeConfig,
  );
  // EntityTypes are required - must be provided
  if (entityTypes.length > 0) {
    finalTriggerConfig.entityTypes = entityTypes;
  }
  const events = resolveEventBasedEvents(
    startNodeConfig,
    existingTriggerConfig,
    hasUserChanges,
  );
  if (events) {
    finalTriggerConfig.events = events;
  }
  const exclude = resolveEventBasedExclude(
    startNodeConfig,
    existingTriggerConfig,
    hasUserChanges,
  );
  if (exclude) {
    finalTriggerConfig.exclude = exclude;
  }
  const include = resolveEventBasedInclude(
    startNodeConfig,
    existingTriggerConfig,
    hasUserChanges,
  );
  if (include) {
    finalTriggerConfig.include = include;
  }
  const filter = resolveEventBasedFilter(
    entityTypes,
    startNodeConfig,
    existingTriggerConfig,
    hasUserChanges,
  );
  if (filter) {
    finalTriggerConfig.filter = filter;
  }
  const approvalMode = resolveApprovalMode(
    startNodeConfig,
    existingTriggerConfig,
    hasUserChanges,
  );
  if (approvalMode) {
    finalTriggerConfig.approvalMode = approvalMode;
  }
  return finalTriggerConfig;
}

function resolveUserScheduleConfig(startNodeConfig: NodeConfigWithMetadata): {
  scheduleTimeline: string;
  cronExpression?: string;
} {
  const scheduleType = startNodeConfig.scheduleType || 'OnDemand';
  if (scheduleType === 'Scheduled' && startNodeConfig.cronExpression) {
    return {
      scheduleTimeline: 'Custom',
      cronExpression: startNodeConfig.cronExpression,
    };
  }
  return { scheduleTimeline: 'None' };
}

function resolveExistingScheduleConfig(
  existingTriggerConfig?: Record<string, unknown>,
): Record<string, unknown> {
  if (!existingTriggerConfig?.schedule) {
    return { scheduleTimeline: 'None' };
  }
  const existingSchedule = existingTriggerConfig.schedule as Record<
    string,
    unknown
  >;
  // If scheduleTimeline is "None", it means OnDemand
  if (existingSchedule.scheduleTimeline === 'None') {
    return { scheduleTimeline: 'None' };
  }
  if (
    existingSchedule.scheduleTimeline === 'Custom' &&
    existingSchedule.cronExpression
  ) {
    return {
      scheduleTimeline: 'Custom',
      cronExpression: existingSchedule.cronExpression,
    };
  }
  return existingTriggerConfig.schedule as Record<string, unknown>;
}

function resolveScheduleConfig(
  hasUserChanges: boolean,
  startNodeConfig: NodeConfigWithMetadata,
  existingTriggerConfig?: Record<string, unknown>,
): Record<string, unknown> {
  return hasUserChanges
    ? resolveUserScheduleConfig(startNodeConfig)
    : resolveExistingScheduleConfig(existingTriggerConfig);
}

function resolveUserBatchSize(
  startNodeConfig: NodeConfigWithMetadata,
  existingTriggerConfig?: Record<string, unknown>,
): number {
  if (startNodeConfig.batchSize && startNodeConfig.batchSize !== 100) {
    return startNodeConfig.batchSize;
  }
  if (existingTriggerConfig?.batchSize) {
    return existingTriggerConfig.batchSize as number;
  }
  return 100;
}

function resolveExistingBatchSize(
  existingTriggerConfig?: Record<string, unknown>,
): number {
  return existingTriggerConfig?.batchSize
    ? (existingTriggerConfig.batchSize as number)
    : 100;
}

function resolveBatchSize(
  hasUserChanges: boolean,
  startNodeConfig: NodeConfigWithMetadata,
  existingTriggerConfig?: Record<string, unknown>,
): number {
  return hasUserChanges
    ? resolveUserBatchSize(startNodeConfig, existingTriggerConfig)
    : resolveExistingBatchSize(existingTriggerConfig);
}

function buildDataAssetFilterObject(
  dataAssetFilters: WorkflowNodeConfig['dataAssetFilters'],
): Record<string, string> {
  const filterObj: Record<string, string> = {};
  dataAssetFilters.forEach((df) => {
    const jsonLogicFilter = df.filters;
    if (jsonLogicFilter && jsonLogicFilter.trim() !== '') {
      filterObj[df.dataAsset] = jsonLogicFilter;
    }
  });
  return filterObj;
}

function resolveDataAssetFilters(
  startNodeConfig: NodeConfigWithMetadata,
  existingTriggerConfig: Record<string, unknown> | undefined,
  hasUserChanges: boolean,
): Record<string, string> | undefined {
  if (
    hasUserChanges &&
    startNodeConfig.dataAssetFilters &&
    startNodeConfig.dataAssetFilters.length > 0
  ) {
    const filterObj = buildDataAssetFilterObject(
      startNodeConfig.dataAssetFilters,
    );
    return Object.keys(filterObj).length > 0 ? filterObj : undefined;
  }
  return existingTriggerConfig?.filters as Record<string, string> | undefined;
}

function buildPeriodicBatchTriggerConfig(
  startNodeConfig: NodeConfigWithMetadata,
  existingTriggerConfig: Record<string, unknown> | undefined,
  hasUserChanges: boolean,
  hasStartNodeConfig: boolean,
): Record<string, unknown> {
  const finalTriggerConfig: Record<string, unknown> = {};
  const entityTypes = resolveEntityTypes(
    startNodeConfig,
    existingTriggerConfig,
    hasUserChanges,
    hasStartNodeConfig,
  );
  // EntityTypes are required - must be provided
  if (entityTypes.length > 0) {
    finalTriggerConfig.entityTypes = entityTypes;
  }
  finalTriggerConfig.schedule = resolveScheduleConfig(
    hasUserChanges,
    startNodeConfig,
    existingTriggerConfig,
  );
  finalTriggerConfig.batchSize = resolveBatchSize(
    hasUserChanges,
    startNodeConfig,
    existingTriggerConfig,
  );
  const filters = resolveDataAssetFilters(
    startNodeConfig,
    existingTriggerConfig,
    hasUserChanges,
  );
  if (filters) {
    finalTriggerConfig.filters = filters;
  }
  return finalTriggerConfig;
}

function buildTriggerConfig(
  startNodeConfig: NodeConfigWithMetadata,
  triggerType: string,
  existingTriggerConfig?: Record<string, unknown>,
): Record<string, unknown> {
  const hasUserChanges = hasUserModifiedStartNode(startNodeConfig);
  const hasStartNodeConfig = hasConfiguredDataAssets(startNodeConfig);
  if (triggerType === 'eventBasedEntity') {
    return buildEventBasedTriggerConfig(
      startNodeConfig,
      existingTriggerConfig,
      hasUserChanges,
      hasStartNodeConfig,
    );
  }
  if (triggerType === 'periodicBatchEntity') {
    return buildPeriodicBatchTriggerConfig(
      startNodeConfig,
      existingTriggerConfig,
      hasUserChanges,
      hasStartNodeConfig,
    );
  }
  return existingTriggerConfig || {};
}

// Ordered rules for AutomatedTask subtype detection - first match wins,
// mirroring the original if/else-if chain.
const AUTOMATED_TASK_SUBTYPE_RULES: Array<{
  subType: WorkflowNodeSubType;
  matches: (subType?: WorkflowNodeSubType, label?: string) => boolean;
}> = [
  {
    subType: 'checkChangeDescriptionTask',
    matches: (subType, label) =>
      subType === 'checkChangeDescriptionTask' ||
      Boolean(label?.includes('Check Change Desc')),
  },
  {
    subType: 'checkEntityAttributesTask',
    matches: (subType, label) =>
      subType === 'checkEntityAttributesTask' ||
      Boolean(label?.includes('Check')),
  },
  {
    subType: 'setEntityAttributeTask',
    matches: (subType, label) =>
      subType === 'setEntityAttributeTask' ||
      Boolean(label?.includes('Set')),
  },
  {
    subType: 'dataCompletenessTask',
    matches: (subType, label) =>
      subType === 'dataCompletenessTask' ||
      Boolean(label?.includes('Completeness')),
  },
  {
    subType: 'rollbackEntityTask',
    matches: (subType, label) =>
      subType === 'rollbackEntityTask' ||
      Boolean(label?.includes('Roll')) ||
      Boolean(label?.includes('Revert')),
  },
];

function resolveAutomatedTaskSubType(
  nodeData: { subType?: WorkflowNodeSubType; label?: string },
  defaultSubType: WorkflowNodeSubType,
): WorkflowNodeSubType {
  const rule = AUTOMATED_TASK_SUBTYPE_RULES.find((r) =>
    r.matches(nodeData.subType, nodeData.label),
  );
  return rule ? rule.subType : defaultSubType;
}

function mapNodeTypeAndSubtype(node: WorkflowFlowNode): {
  nodeType: WorkflowNodeType;
  subType: WorkflowNodeSubType;
} {
  const nodeData = node.data || {};
  let nodeType: WorkflowNodeType =
    (node.type as WorkflowNodeType) || 'automatedTask';
  let subType: WorkflowNodeSubType =
    nodeData.subType || 'setEntityAttributeTask';
  const isAutomatedTask =
    node.type === 'automatedTask' ||
    (nodeData as Record<string, unknown>).nodeType === 'automatedTask';
  const isUserTask =
    node.type === 'userTask' ||
    (nodeData as Record<string, unknown>).nodeType === 'userTask';
  if (node.type === 'startEvent') {
    nodeType = 'startEvent';
    subType = 'startEvent';
  } else if (node.type === 'endEvent') {
    nodeType = 'endEvent';
    subType = 'endEvent';
  } else if (isAutomatedTask) {
    nodeType = 'automatedTask';
    subType = resolveAutomatedTaskSubType(nodeData, subType);
  } else if (isUserTask) {
    nodeType = 'userTask';
    // Preserve the stored specific subtype (e.g. the seeded
    // createRecognizerFeedbackApprovalTask): the server validates the node
    // against its specific schema, whose input/inputNamespaceMap allow the
    // four trigger globals — coercing it to the generic userApprovalTask
    // (input maxItems 1, namespace only relatedEntity) fails validation.
    subType = isUserApprovalTaskSubType(nodeData.subType)
      ? nodeData.subType
      : 'userApprovalTask';
  }
  return { nodeType, subType };
}

function buildWorkflowNodes(
  nodes: WorkflowFlowNode[],
  validEdges: WorkflowFlowEdge[],
): WorkflowNodeConfiguration[] {
  return nodes.map((node) => {
    const nodeData = node.data || {};
    const { nodeType, subType } = mapNodeTypeAndSubtype(node);
    if (nodeType === 'startEvent') {
      return {
        type: nodeType,
        subType,
        name: 'start',
        displayName: 'start',
        ...(nodeData.description
          ? { description: nodeData.description }
          : {}),
      };
    }
    if (nodeType === 'endEvent') {
      const endNodeName = getNodeName(
        subType,
        node.id,
        nodes.map((n) => ({ ...n.data, id: n.id })),
      );
      return {
        type: nodeType,
        subType,
        name: endNodeName,
        displayName: 'End',
        ...(nodeData.description
          ? { description: nodeData.description }
          : {}),
      };
    }
    return getNodeConfiguration(
      nodeType,
      subType,
      { ...nodeData, id: node.id },
      nodes.map((n) => ({ ...n.data, id: n.id })),
      validEdges.map((e) => ({ ...e.data, from: e.source, to: e.target })),
    );
  });
}

function buildWorkflowEdges(
  edges: WorkflowFlowEdge[],
  nodes: WorkflowFlowNode[],
): WorkflowBackendEdge[] {
  const nodesWithMetadata = nodes.map((n) => ({ ...n.data, id: n.id }));
  return edges.map((edge) => {
    const sourceNode = nodes.find((n) => n.id === edge.source);
    const targetNode = nodes.find((n) => n.id === edge.target);
    const getEdgeNodeName = (node: WorkflowFlowNode | undefined) => {
      if (node?.data?.subType) {
        return getNodeName(node.data.subType, node.id, nodesWithMetadata);
      }
      return node?.data?.name || node?.id || '';
    };
    const fromName = sourceNode ? getEdgeNodeName(sourceNode) : edge.source;
    const toName = targetNode ? getEdgeNodeName(targetNode) : edge.target;
    const edgeObj: WorkflowBackendEdge = {
      from: fromName,
      to: toName,
    };
    const condition =
      (edge.data?.condition as string | undefined) || edge.label;
    if (condition && condition !== '' && condition.trim() !== '') {
      // Check if this is a data completeness node with quality band conditions
      const isDataCompletenessNode =
        sourceNode?.data?.subType === 'dataCompletenessTask';
      if (isDataCompletenessNode) {
        // For data completeness, preserve the original quality band name (e.g., "Gold", "Silver")
        edgeObj.condition = condition;
      } else {
        edgeObj.condition = condition.toLowerCase();
      }
    }
    return edgeObj;
  });
}

// Find all nodes that can reach the target node (for save process)
function findAllPredecessorsInSave(
  targetId: string,
  edges: WorkflowBackendEdge[],
): string[] {
  const predecessors = new Set<string>();
  const visited = new Set<string>();
  // Build reverse adjacency list (who points to whom)
  const reverseAdjList = new Map<string, string[]>();
  edges.forEach((edge) => {
    if (!reverseAdjList.has(edge.to)) {
      reverseAdjList.set(edge.to, []);
    }
    reverseAdjList.get(edge.to)?.push(edge.from);
  });
  const queue = [targetId];
  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId || visited.has(currentId)) {
      continue;
    }
    visited.add(currentId);
    const parents = reverseAdjList.get(currentId) || [];
    for (const parent of parents) {
      predecessors.add(parent);
      if (!visited.has(parent)) {
        queue.push(parent);
      }
    }
  }
  return Array.from(predecessors);
}

// Migration function to fix inputNamespaceMap.updatedBy references
type BackendNode = WorkflowNodeConfiguration;
type BackendEdge = WorkflowBackendEdge;

function isUpdatedByMigrationCandidate(node: BackendNode): boolean {
  return (
    (node.subType === 'setEntityAttributeTask' ||
      node.subType === 'rollbackEntityTask') &&
    Boolean(node.input?.includes('updatedBy'))
  );
}

function shouldMigrateUpdatedBy(
  currentUpdatedBy: string | undefined,
  allPredecessors: string[],
  nodes: BackendNode[],
): boolean {
  const isKnownGlobalUpdatedBy =
    currentUpdatedBy === 'global' ||
    currentUpdatedBy === 'ApproveGlossaryTerm' ||
    currentUpdatedBy === 'ApprovalForUpdates';
  const isMissingUpdatedByReference = Boolean(
    currentUpdatedBy &&
      (!nodes.some((n) => n.name === currentUpdatedBy) ||
        !allPredecessors.includes(currentUpdatedBy)),
  );
  return isKnownGlobalUpdatedBy || isMissingUpdatedByReference;
}

function resolveMigratedUpdatedBy(
  allPredecessors: string[],
  userTasks: BackendNode[],
): string {
  // Only use a user task that is actually a predecessor (comes before this node)
  const predecessorUserTask = userTasks.find((userTask) =>
    allPredecessors.includes(userTask.name),
  );
  return predecessorUserTask ? predecessorUserTask.name : 'global';
}

function migrateNode(
  node: BackendNode,
  nodes: BackendNode[],
  edges: BackendEdge[],
  userTasks: BackendNode[],
): BackendNode {
  if (!isUpdatedByMigrationCandidate(node)) {
    return node;
  }
  const currentUpdatedBy = node.inputNamespaceMap?.updatedBy;
  const allPredecessors = findAllPredecessorsInSave(node.name, edges);
  if (!shouldMigrateUpdatedBy(currentUpdatedBy, allPredecessors, nodes)) {
    return node;
  }
  return {
    ...node,
    inputNamespaceMap: {
      ...node.inputNamespaceMap,
      updatedBy: resolveMigratedUpdatedBy(allPredecessors, userTasks),
    },
  };
}

function omitKey<T extends Record<string, unknown>>(
  obj: T,
  key: string,
): T {
  const { [key]: _dropped, ...rest } = obj;
  return rest as T;
}

function withoutPartialDecisions(node: BackendNode): BackendNode {
  return 'config' in node && node.config?.allowPartialDecisions !== undefined
    ? { ...node, config: omitKey(node.config, 'allowPartialDecisions') }
    : node;
}

function migrateInputNamespaceMap(
  nodes: BackendNode[],
  edges: BackendEdge[],
): BackendNode[] {
  const userTasks = nodes.filter((n) => n.type === 'userTask');
  return nodes.map((node) => migrateNode(node, nodes, edges, userTasks));
}

function resolveTriggerType(
  hasUserChanges: boolean | string | null | undefined,
  hasStartNodeConfig: boolean,
  startNodeConfig: NodeConfigWithMetadata,
  existingTriggerType: string | undefined,
): string {
  if (!hasUserChanges || !hasStartNodeConfig || !startNodeConfig.triggerType) {
    return existingTriggerType || 'eventBasedEntity';
  }
  const trigger = startNodeConfig.triggerType;
  if (trigger === 'Event Based') {
    return 'eventBasedEntity';
  }
  if (trigger === 'Periodic Batch' || trigger === 'scheduleType') {
    return 'periodicBatchEntity';
  }
  return 'eventBasedEntity';
}

function resolveWorkflowMetadata(
  workflowDefinition: WorkflowDefinitionFull | null,
  workflowMetadata?: WorkflowMetadata | null,
): {
  workflowName: string;
  workflowDisplayName: string;
  workflowDescription: string;
} {
  return {
    workflowName: workflowDefinition?.name || 'CustomWorkflow',
    workflowDisplayName:
      workflowMetadata?.displayName ||
      workflowDefinition?.displayName ||
      'Custom Workflow',
    workflowDescription:
      workflowMetadata?.description ||
      workflowDefinition?.description ||
      'Custom workflow created with Workflow Builder',
  };
}

// The generated `trigger` type is a wide union (schema oneOf); this narrows it
// to the actual TriggerObject shape used by both `.type` and `.config` lookups.
function getValidTriggerObject(
  workflowDefinition: WorkflowDefinitionFull | null,
): Record<string, unknown> | undefined {
  const trigger = workflowDefinition?.trigger;
  if (
    typeof trigger === 'object' &&
    trigger !== null &&
    !Array.isArray(trigger)
  ) {
    return trigger as Record<string, unknown>;
  }
  return undefined;
}

function resolveTriggerEntityTypes(
  finalTriggerConfig: Record<string, unknown>,
): string[] {
  return Array.isArray(finalTriggerConfig.entityTypes)
    ? ((finalTriggerConfig.entityTypes as string[]) ?? [])
    : [];
}

function assertTriggerHasEntityTypes(
  triggerType: string,
  triggerEntityTypes: string[],
  t: TranslateFn,
): void {
  if (
    (triggerType === 'eventBasedEntity' ||
      triggerType === 'periodicBatchEntity') &&
    triggerEntityTypes.length === 0
  ) {
    throw new Error(t('workflows.builder.triggerRequiresDataAssets'));
  }
}

export async function buildWorkflowForSave(
  nodes: WorkflowFlowNode[],
  edges: WorkflowFlowEdge[],
  workflowDefinition: WorkflowDefinitionFull | null,
  workflowMetadata?: WorkflowMetadata | null,
  t: TranslateFn = (key: string) => key,
): Promise<WorkflowDefinitionFull> {
  const { workflowName, workflowDisplayName, workflowDescription } =
    resolveWorkflowMetadata(workflowDefinition, workflowMetadata);
  const startNode = nodes.find((node) => node.type === 'startEvent');
  const startNodeConfig = (startNode?.data || {}) as NodeConfigWithMetadata;
  const currentNodeIds = new Set(nodes.map((n) => n.id));
  const validEdges = edges.filter(
    (edge) => currentNodeIds.has(edge.source) && currentNodeIds.has(edge.target),
  );
  const validTrigger = getValidTriggerObject(workflowDefinition);
  const hasUserChanges = hasUserModifiedStartNode(startNodeConfig);
  const hasStartNodeConfig = hasConfiguredDataAssets(startNodeConfig);
  const triggerType = resolveTriggerType(
    hasUserChanges,
    hasStartNodeConfig,
    startNodeConfig,
    validTrigger?.type as string | undefined,
  );
  const triggerConfig = buildTriggerConfig(
    startNodeConfig,
    triggerType,
    validTrigger?.config as Record<string, unknown> | undefined,
  );
  // A Git sink workflow's trigger cannot include entity types the sink does not sync.
  const finalTriggerConfig = nodes.some(isGitSinkNode)
    ? getGitSinkTriggerConfig(triggerConfig)
    : triggerConfig;
  const triggerEntityTypes = resolveTriggerEntityTypes(finalTriggerConfig);
  assertTriggerHasEntityTypes(triggerType, triggerEntityTypes, t);
  let workflowNodes = buildWorkflowNodes(nodes, validEdges);
  const workflowEdges = buildWorkflowEdges(validEdges, nodes);
  workflowNodes = migrateInputNamespaceMap(workflowNodes, workflowEdges);
  // Only a workflow in Enforce approval mode settles partial decisions.
  if (finalTriggerConfig.approvalMode !== 'Enforce') {
    workflowNodes = workflowNodes.map(withoutPartialDecisions);
  }
  // Round-trip the stored trigger's outputs: the trigger provides the globals
  // the nodes read (e.g. triggeringObjectId / recognizerFeedback for an
  // event-based recognizer-feedback trigger). Rebuilding them from a hardcoded
  // pair drops outputs the nodes expect and /validate rejects the save. Only
  // when the trigger type is unchanged — a type change rebuilds the trigger,
  // so the stored outputs no longer describe what it provides.
  const storedTriggerOutput = validTrigger?.output;
  const triggerOutput =
    validTrigger?.type === triggerType &&
    Array.isArray(storedTriggerOutput) &&
    storedTriggerOutput.length > 0 &&
    storedTriggerOutput.every((item) => typeof item === 'string')
      ? (storedTriggerOutput as string[])
      : ['relatedEntity', 'updatedBy'];
  const backendReadyJSON: WorkflowDefinitionFull = {
    name: workflowName,
    displayName: workflowDisplayName,
    description: workflowDescription,
    type: triggerType as WorkflowDefinitionFull['type'],
    trigger: {
      type: triggerType,
      config: finalTriggerConfig,
      output: triggerOutput,
    },
    nodes: workflowNodes as unknown as WorkflowBackendNode[],
    edges: workflowEdges,
    config: {
      ...workflowDefinition?.config,
      storeStageStatus: triggerType === 'eventBasedEntity',
    },
  };
  return backendReadyJSON;
}

export async function testWorkflow(
  nodes: WorkflowFlowNode[],
  edges: WorkflowFlowEdge[],
  workflowDefinition: WorkflowDefinitionFull | null,
  workflowMetadata?: WorkflowMetadata | null,
  t: TranslateFn = (key: string) => key,
): Promise<WorkflowDefinitionFull> {
  let backendReadyJSON: WorkflowDefinitionFull;
  try {
    backendReadyJSON = await buildWorkflowForSave(
      nodes,
      edges,
      workflowDefinition,
      workflowMetadata,
      t,
    );
  } catch (error) {
    if (error instanceof Error) {
      message.error(error.message);
    } else {
      message.error(String(error));
    }
    throw error;
  }
  try {
    const validationResult = await validateWorkflowDefinition(backendReadyJSON);
    message.success(
      validationResult.message || t('workflows.builder.validationSuccessful'),
    );
  } catch (error) {
    if (error instanceof Error) {
      message.error(error.message);
    } else {
      message.error(String(error));
    }
    throw error;
  }
  return backendReadyJSON;
}
