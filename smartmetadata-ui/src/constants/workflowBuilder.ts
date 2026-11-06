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
  WorkflowNodeSubType,
  WorkflowNodeType,
} from '@/types/governance';

/**
 * Official WorkflowBuilder.constants (pin a3012259ca), ported 1:1. Labels
 * here are the official English display strings; the UI renders them through
 * i18n keys where the product already has one (see workflows.builder.*).
 */

export type ConditionValue = 'TRUE' | 'FALSE' | 'approve' | 'reject';

export const CONDITION_VALUES = {
  TRUE: 'TRUE',
  FALSE: 'FALSE',
  APPROVE: 'approve',
  REJECT: 'reject',
} as const;

export const SCHEDULAR_OPTIONS = {
  SCHEDULE: 'Scheduled',
  ON_DEMAND: 'OnDemand',
} as const;

export const WORKFLOW_TYPES = {
  EVENT_BASED: 'Event Based',
  PERIODIC_BATCH: 'Periodic Batch',
} as const;

export const SCHEDULE_CONFIG = {
  SCHEDULE_TYPE: 'scheduleType',
  CRON_EXPRESSION: 'cronExpression',
} as const;

export const CONNECTION_MODAL_RULES = {
  ALWAYS_SHOW_SOURCES: [
    'checkEntityAttributesTask',
    'checkChangeDescriptionTask',
    'userApprovalTask',
    'dataCompletenessTask',
  ],
  NEVER_SHOW_SOURCES: ['setEntityAttributeTask', 'rollbackEntityTask'],
} as const;

export interface NodeTypeMapping {
  type: WorkflowNodeType;
  label: string;
  displayLabel: string;
  category?: string;
}

export const NODE_TYPE_MAPPINGS: Partial<Record<WorkflowNodeSubType, NodeTypeMapping>> = {
  checkEntityAttributesTask: {
    type: 'automatedTask',
    label: 'Check Condition',
    displayLabel: 'Check',
  },
  checkChangeDescriptionTask: {
    type: 'automatedTask',
    label: 'Detect Field Change',
    displayLabel: 'Detect Field Change',
  },
  setEntityAttributeTask: {
    type: 'automatedTask',
    label: 'Set Action',
    displayLabel: 'Action',
  },
  userApprovalTask: {
    type: 'userTask',
    label: 'Request Approval',
    displayLabel: 'User Approval',
  },
  dataCompletenessTask: {
    type: 'automatedTask',
    label: 'Data Completeness',
    displayLabel: 'Data Completeness',
  },
  rollbackEntityTask: {
    type: 'automatedTask',
    label: 'Revert Changes',
    displayLabel: 'Revert Changes',
  },
  policyAgentTask: {
    type: 'automatedTask',
    label: 'Policy Enforcement',
    displayLabel: 'Policy Enforcement',
  },
  // Compiled by lifecycle playbooks from their stages, so the palette does not offer it.
  collectMetadataTask: {
    type: 'automatedTask',
    category: 'lifecycle',
    label: 'Request Missing Fields',
    displayLabel: 'Missing Fields Task',
  },
  sinkTask: {
    type: 'automatedTask',
    category: 'sink',
    label: 'Git Sink',
    displayLabel: 'Git Sink',
  },
  startEvent: { type: 'startEvent', label: 'Start', displayLabel: 'Start' },
  endEvent: { type: 'endEvent', label: 'End', displayLabel: 'End' },
};

export const DEFAULT_QUALITY_BANDS = [
  { name: 'Gold', minimumScore: 90 },
  { name: 'Silver', minimumScore: 75 },
  { name: 'Bronze', minimumScore: 50 },
  { name: 'No Plate', minimumScore: 0 },
] as const;

export const ALL_DATA_ASSETS_OPTION_VALUE = '__ALL_DATA_ASSETS__';

/**
 * Official Secrets.constants MASKED_PASSWORD_VALUE (pin a3012259ca): nine
 * asterisks. A stored secret arrives masked; the sink form treats this
 * exact string as "the stored value" in its focus/blur/change dance.
 */
export const MASKED_PASSWORD_VALUE = '*********';

/**
 * Official UserApprovalForm default transitions (pin a3012259ca).
 * TaskResource.validateTransition rejects /resolve calls whose
 * transitionId is not declared here, so a userApprovalTask saved without
 * transitionMetadata is un-resolvable. Emitted whenever the node config
 * does not already carry a non-empty list.
 */
export const DEFAULT_USER_APPROVAL_TRANSITIONS = [
  {
    id: 'approve',
    label: 'Approve',
    targetStageId: 'approved',
    targetTaskStatus: 'Approved',
    resolutionType: 'Approved',
    requiresComment: false,
  },
  {
    id: 'reject',
    label: 'Reject',
    targetStageId: 'rejected',
    targetTaskStatus: 'Rejected',
    resolutionType: 'Rejected',
    requiresComment: false,
  },
] as const;

export const AVAILABLE_OPTIONS = {
  TRIGGER_TYPES: [
    { value: 'periodicBatchEntity', label: 'Schedule' },
    { value: 'eventBasedEntity', label: 'Event' },
  ],
  EVENT_TYPES: ['Created', 'Updated'],
  CONDITION_VALUES: [
    { value: CONDITION_VALUES.TRUE, label: 'True' },
    { value: CONDITION_VALUES.FALSE, label: 'False' },
  ],
  APPROVAL_CONDITION_VALUES: [
    { value: CONDITION_VALUES.APPROVE, label: 'Approve' },
    { value: CONDITION_VALUES.REJECT, label: 'Reject' },
  ],
  FIELD_NAMES: ['dataAssets', 'eventType', 'excludeFields'],
} as const;

export const FIELD_OPTIONS = {
  TAGS: 'tags',
  DESCRIPTION: 'description',
  DISPLAY_NAME: 'displayName',
  NAME: 'name',
  GLOSSARY_TERMS: 'glossaryTerms',
  TIER: 'tier',
  STATUS: 'status',
  CERTIFICATION: 'certification',
} as const;

export const FIELD_OPTIONS_DROPDOWN = [
  { label: 'Tags', value: FIELD_OPTIONS.TAGS },
  { label: 'Description', value: FIELD_OPTIONS.DESCRIPTION },
  { label: 'Display Name', value: FIELD_OPTIONS.DISPLAY_NAME },
  { label: 'Glossary Terms', value: FIELD_OPTIONS.GLOSSARY_TERMS },
  { label: 'Tier', value: FIELD_OPTIONS.TIER },
  { label: 'Status', value: FIELD_OPTIONS.STATUS },
  { label: 'Certification', value: FIELD_OPTIONS.CERTIFICATION },
] as const;

/** Workflow instance status (WorkflowStatus enum). */
export type WorkflowInstanceStatus =
  | 'CANCELLED'
  | 'EXCEPTION'
  | 'FAILURE'
  | 'FINISHED'
  | 'RUNNING'
  | 'SUPERSEDED';

export type WorkflowStatusTone = 'success' | 'running' | 'failed' | 'warning';

/**
 * Official getStatusMapping (WorkflowBuilder.constants): instance status to
 * badge tone + display label. Unknown statuses fall back to the raw status
 * text with the default tone (official WorkflowExecutionHistory behavior).
 */
export function getWorkflowStatusMapping(
  t: (key: string) => string,
): Record<string, { tone: WorkflowStatusTone; displayLabel: string }> {
  return {
    FINISHED: { tone: 'success', displayLabel: t('workflows.builder.statusSuccess') },
    RUNNING: { tone: 'running', displayLabel: t('workflows.builder.statusRunning') },
    FAILURE: { tone: 'failed', displayLabel: t('workflows.builder.statusFailed') },
    EXCEPTION: { tone: 'failed', displayLabel: t('workflows.builder.statusFailed') },
  };
}

export type WorkflowBuilderTab = 'workflow-builder' | 'execution-history';

export const WORKFLOW_BUILDER_TAB_TEST_IDS: Record<WorkflowBuilderTab, string> = {
  'execution-history': 'workflow-execution-history',
  'workflow-builder': 'workflow-builder-tab',
};

export function getWorkflowBuilderTabs(
  t: (key: string) => string,
): Array<{ id: WorkflowBuilderTab; label: string; value: WorkflowBuilderTab }> {
  return [
    {
      id: 'workflow-builder',
      label: t('workflows.builder.workflowBuilderTab'),
      value: 'workflow-builder',
    },
    {
      id: 'execution-history',
      label: t('workflows.builder.executionHistoryTab'),
      value: 'execution-history',
    },
  ];
}
