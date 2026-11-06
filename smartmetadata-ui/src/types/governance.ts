/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { Position } from '@vue-flow/core';
import type { EntityRef, TagRef } from './api';

export type TagSource = 'Classification' | 'Glossary';

export interface Glossary {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  fullyQualifiedName?: string;
  mutuallyExclusive?: boolean;
  termCount?: number;
  owners: EntityRef[];
  reviewers: EntityRef[];
  tags: TagRef[];
  domains: EntityRef[];
}

export interface CreateGlossaryRequest {
  name: string;
  description: string;
  displayName?: string;
  mutuallyExclusive?: boolean;
}

export interface GlossaryTerm {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  fullyQualifiedName?: string;
  glossary?: EntityRef;
  parent?: EntityRef;
  mutuallyExclusive?: boolean;
  relatedTerms: EntityRef[];
  owners: EntityRef[];
  tags: TagRef[];
  /** Absent when the term has no children: Ant Table renders an expand icon
      for any truthy children value, so an empty array would be a dead icon. */
  children?: EntityRef[];
  /** Whole-subtree child count from the API; the expand icon is gated on
      loaded children data, not on this count, so a row never expands to
      nothing while its children page is still unloaded. */
  childrenCount?: number;
  usageCount?: number;
  /** Present when the catalog returns entityStatus; never invent one. */
  status?: string;
}

export interface CreateGlossaryTermRequest {
  glossary: string;
  name: string;
  description: string;
  displayName?: string;
  parent?: string;
  relatedTerms?: string[];
  mutuallyExclusive?: boolean;
}

export interface Classification {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  fullyQualifiedName?: string;
  mutuallyExclusive?: boolean;
  termCount?: number;
  disabled?: boolean;
  owners: EntityRef[];
}

export interface CreateClassificationRequest {
  name: string;
  description: string;
  displayName?: string;
  mutuallyExclusive?: boolean;
}

export interface ClassificationTag {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  fullyQualifiedName?: string;
  classification?: EntityRef;
  parent?: EntityRef;
  mutuallyExclusive?: boolean;
  /** OM Tag entity field; previously unmapped by the product. */
  disabled?: boolean;
  usageCount?: number;
  owners: EntityRef[];
}

export interface CreateTagRequest {
  name: string;
  description: string;
  classification?: string;
  parent?: string;
  displayName?: string;
  mutuallyExclusive?: boolean;
}

export const DOMAIN_TYPES = ['Source-aligned', 'Consumer-aligned', 'Aggregate'] as const;
export type DomainType = (typeof DOMAIN_TYPES)[number];

export interface Domain {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  fullyQualifiedName?: string;
  domainType: string;
  parent?: EntityRef;
  owners: EntityRef[];
  experts: EntityRef[];
  tags: TagRef[];
  /** Custom-property values, keyed by property name. */
  extension?: Record<string, unknown>;
  /** Absent when the domain has no sub-domains: the list renders flat, and a
      truthy empty array would draw a dead expand icon on every row. */
  children?: EntityRef[];
  childrenCount?: number;
}

/**
 * Official UI style (type/basic.json#/definitions/style, cover image
 * excluded: the marketplace create forms do not offer it). Color is a hex
 * code, iconURL an icon URL; both optional.
 */
export interface EntityStyle {
  color?: string;
  iconURL?: string;
}

export interface CreateDomainRequest {
  name: string;
  description: string;
  domainType: DomainType | string;
  displayName?: string;
  parent?: string;
  /** Official createDomain owners: entity references (type user/team). */
  owners?: EntityRef[];
  /** Official createDomain experts: user/login names, not references. */
  experts?: string[];
  style?: EntityStyle;
}

export interface DataProduct {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  fullyQualifiedName?: string;
  domains: EntityRef[];
  owners: EntityRef[];
  experts: EntityRef[];
  tags: TagRef[];
  /** Custom-property values, keyed by property name. */
  extension?: Record<string, unknown>;
}

export interface CreateDataProductRequest {
  name: string;
  description: string;
  domains: string[];
  displayName?: string;
  /** Official createDataProduct owners: entity references (type user/team). */
  owners?: EntityRef[];
  /** Official createDataProduct experts: user/login names, not references. */
  experts?: string[];
  style?: EntityStyle;
}

export interface AssetTagOption {
  tagFQN: string;
  name: string;
  source: TagSource;
}

/**
 * Workflow definition (official WorkflowsPage list item): the card shows
 * displayName ?? name plus description; the key is the fully qualified name.
 * The create contract (api/governance/createWorkflowDefinition.json) requires
 * name and description.
 */
export interface WorkflowDefinition {
  id: string;
  name: string;
  displayName?: string;
  fullyQualifiedName?: string;
  description?: string;
}

export interface CreateWorkflowDefinitionRequest {
  name: string;
  description: string;
  displayName?: string;
}

// ---------------------------------------------------------------------------
// WorkflowBuilder port (official openmetadata-ui WorkflowBuilder, pin
// a3012259ca). The data model is a framework-agnostic JSON contract, so the
// enums and shapes below are the official generated types re-expressed as
// product TS types from the spec (openmetadata-spec/.../workflowDefinition).
// ---------------------------------------------------------------------------

/** NodeType (5): generated/governance/workflows/elements/nodeType. */
export type WorkflowNodeType =
  | 'automatedTask'
  | 'endEvent'
  | 'gateway'
  | 'startEvent'
  | 'userTask';

export const WORKFLOW_NODE_TYPES: WorkflowNodeType[] = [
  'automatedTask',
  'endEvent',
  'gateway',
  'startEvent',
  'userTask',
];

/** NodeSubType (20): generated/governance/workflows/elements/nodeSubType. */
export type WorkflowNodeSubType =
  | 'applyRecognizerFeedbackTask'
  | 'checkChangeDescriptionTask'
  | 'checkEntityAttributesTask'
  | 'collectMetadataTask'
  | 'createAndRunAIAutomationTask'
  | 'createAndRunIngestionPipelineTask'
  | 'createRecognizerFeedbackApprovalTask'
  | 'dataCompletenessTask'
  | 'endEvent'
  | 'parallelGateway'
  | 'policyAgentTask'
  | 'rejectRecognizerFeedbackTask'
  | 'rollbackEntityTask'
  | 'runAppTask'
  | 'setEntityAttributeTask'
  | 'setEntityCertificationTask'
  | 'setGlossaryTermStatusTask'
  | 'sinkTask'
  | 'startEvent'
  | 'userApprovalTask';

export const WORKFLOW_NODE_SUBTYPES: WorkflowNodeSubType[] = [
  'applyRecognizerFeedbackTask',
  'checkChangeDescriptionTask',
  'checkEntityAttributesTask',
  'collectMetadataTask',
  'createAndRunAIAutomationTask',
  'createAndRunIngestionPipelineTask',
  'createRecognizerFeedbackApprovalTask',
  'dataCompletenessTask',
  'endEvent',
  'parallelGateway',
  'policyAgentTask',
  'rejectRecognizerFeedbackTask',
  'rollbackEntityTask',
  'runAppTask',
  'setEntityAttributeTask',
  'setEntityCertificationTask',
  'setGlossaryTermStatusTask',
  'sinkTask',
  'startEvent',
  'userApprovalTask',
];

/** Trigger Type enum: generated/governance/workflows/workflowDefinition. */
export type WorkflowTriggerType =
  | 'eventBasedEntity'
  | 'noOp'
  | 'periodicBatchEntity';

/** ApprovalMode: generated/.../triggers/eventBasedEntityTrigger. */
export type WorkflowApprovalMode = 'Default' | 'Enforce';

/** Event: generated/.../triggers/eventBasedEntityTrigger. */
export type WorkflowTriggerEvent = 'Created' | 'Updated';

/** ScheduleTimeline: generated/.../triggers/periodicBatchEntityTrigger. */
export type WorkflowScheduleTimeline =
  | 'Custom'
  | 'Daily'
  | 'Hourly'
  | 'Monthly'
  | 'None'
  | 'Weekly';

/** Trigger object carried on the definition (TriggerObject in official). */
export interface WorkflowTriggerObject {
  type?: WorkflowTriggerType;
  config?: Record<string, unknown>;
  [key: string]: unknown;
}

/** A backend workflow node (BackendNode in WorkflowTypes.interface). */
export interface WorkflowBackendNode {
  type: WorkflowNodeType;
  subType: WorkflowNodeSubType;
  name: string;
  displayName?: string;
  description?: string;
  input?: string[];
  inputNamespaceMap?: Record<string, string>;
  output?: string[];
  branches?: string[];
  config?: Record<string, unknown>;
}

/** A backend workflow edge (BackendEdge in WorkflowTypes.interface). */
export interface WorkflowBackendEdge {
  from: string;
  to: string;
  condition?: string;
}

/** Full workflow definition (the builder's working shape). */
export interface WorkflowDefinitionFull {
  id?: string;
  name: string;
  displayName?: string;
  description: string;
  fullyQualifiedName?: string;
  type?: WorkflowTriggerType;
  trigger?: WorkflowTriggerObject | unknown;
  nodes?: WorkflowBackendNode[];
  edges?: WorkflowBackendEdge[];
  config?: Record<string, unknown>;
  owners?: EntityRef[];
  version?: number;
  deployed?: boolean;
  suspended?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

/** Flow-node data (NodeData in WorkflowTypes.interface). */
export interface WorkflowNodeData {
  name: string;
  label: string;
  displayName?: string;
  description?: string;
  subType: WorkflowNodeSubType;
  action?: string;
  config?: Record<string, unknown>;
  input?: string[];
  inputNamespaceMap?: Record<string, string>;
  output?: string[];
  branches?: string[];
  /** Start-node edit state, read by the save-path resolvers. */
  lastSaved?: string;
  userModified?: boolean;
  dataAssets?: string[];
  triggerType?: string;
  eventType?: string[];
  excludeFields?: string[];
  include?: string[];
  triggerFilter?: string;
  scheduleType?: string;
  cronExpression?: string;
  batchSize?: number;
  dataAssetFilters?: WorkflowDataAssetFilter[];
  approvalMode?: WorkflowApprovalMode;
  fieldName?: string;
  fieldValue?: string;
  rules?: string;
  qualityBands?: Array<{ name: string; minimumScore: number }>;
  fieldsToCheck?: string[];
  approvalThreshold?: number;
  rejectionThreshold?: number;
  [key: string]: unknown;
}

/** A flow node in the builder canvas (Vue Flow node with WorkflowNodeData). */
export interface WorkflowFlowNode {
  id: string;
  type: WorkflowNodeType;
  position: { x: number; y: number };
  data: WorkflowNodeData;
  sourcePosition?: Position;
  targetPosition?: Position;
  draggable?: boolean;
  selected?: boolean;
}

/** A flow edge in the builder canvas. */
export interface WorkflowFlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string;
  label?: string;
  markerEnd?: Record<string, unknown>;
  style?: Record<string, unknown>;
  labelStyle?: Record<string, unknown>;
  labelBgStyle?: Record<string, unknown>;
  labelBgPadding?: [number, number];
  data?: {
    conditions?: WorkflowEdgeCondition[];
    condition?: string;
    /** Canvas delete callback, injected by the canvas render mapping. */
    onEdgeDelete?: (edgeId: string) => void;
  };
}

/** NodeConfiguration produced by getNodeConfiguration (save path). */
export interface WorkflowNodeConfiguration {
  type: string;
  subType: string;
  name: string;
  displayName?: string;
  input?: string[];
  inputNamespaceMap?: Record<string, string>;
  output?: string[];
  branches?: string[];
  config?: Record<string, unknown>;
}

/** NodeData with the flow-node id attached (NodeDataWithMetadata). */
export interface WorkflowNodeDataWithMetadata extends WorkflowNodeData {
  id: string;
  type?: string;
  data?: WorkflowNodeData;
}

/** Start-node form state (NodeConfig in workflow-builder-components.interface). */
export interface WorkflowNodeConfig {
  name: string;
  description: string;
  dataAssets: string[];
  triggerType: string;
  eventType: string[];
  dataAssetFilters: WorkflowDataAssetFilter[];
  excludeFields?: string[];
  include?: string[];
  periodicFilters?: Record<string, string>;
  triggerFilter?: string;
  scheduleType?: string;
  cronExpression?: string;
  batchSize?: number;
  approvalMode?: WorkflowApprovalMode;
  lastSaved?: string;
  userModified?: boolean;
}

/** One data-asset filter row (DataAssetFilter). */
export interface WorkflowDataAssetFilter {
  id: number;
  dataAsset: string;
  filters?: string;
}

/** Workflow metadata shown in the header (WorkflowMetadata). */
export interface WorkflowMetadata {
  name: string;
  displayName: string;
  description: string;
  createdAt?: string;
  isNewWorkflow?: boolean;
  id?: string;
}

/** Assignee candidate (AssigneeCandidate in WorkflowTypes.interface). */
export interface WorkflowAssigneeCandidate {
  id: string;
  type: string;
  fullyQualifiedName?: string;
  name?: string;
}

/** One edge condition (ConnectionCondition in official). */
export interface WorkflowConnectionCondition {
  id: string;
  type: 'simple' | 'complex';
  field?: string;
  operator: string;
  value: string;
  logicalOperator?: 'AND' | 'OR';
}

/** A condition stored on a flow edge (modal conditions, or the serializer's
 * {field, operator, value} triple for deserialized edges). */
export interface WorkflowEdgeCondition {
  field: string;
  operator: string;
  value: string;
  id?: string;
  type?: 'simple' | 'complex';
  logicalOperator?: 'AND' | 'OR';
}

/** A pending canvas connection (Vue Flow Connection shape). */
export interface WorkflowConnection {
  source: string | null;
  target: string | null;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

/** Trigger-fields config (WorkflowTriggerFieldsConfig in metadataTypeAPI). */
export interface WorkflowTriggerFieldsConfig {
  common: string[];
  entitySpecific: Record<string, string[]>;
}

/** One row of the check-change-description condition builder. */
export interface WorkflowConditionRow {
  id: string;
  field: string;
  values: string[];
}

/** Rules object a condition builder emits: string[] per field, boolean for `deleted`. */
export type WorkflowConditionRulesMap = Record<string, string[] | boolean>;

/** The check-change-description payload: { config: { condition, rules } }. */
export interface WorkflowCheckChangeDescConditionPayload {
  config: {
    condition: WorkflowConditionType;
    rules: WorkflowConditionRulesMap;
  };
}

export type WorkflowConditionType = 'AND' | 'OR';

export interface WorkflowConditionBuilderOption {
  value: string;
  label: string;
  /** Parent path (e.g. a tag's classification) to tell same-named options apart. */
  supportingText?: string;
}

export type WorkflowConditionValueType = 'boolean' | 'dropdown' | 'text';

export interface WorkflowConditionFieldDefinition {
  value: string;
  label: string;
  values: WorkflowConditionBuilderOption[];
  valueType?: WorkflowConditionValueType;
  fetchOptions?: (search: string) => Promise<WorkflowConditionBuilderOption[]>;
  supportsSearch?: boolean;
}
