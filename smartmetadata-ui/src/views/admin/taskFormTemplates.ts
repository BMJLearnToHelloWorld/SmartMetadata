/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { JsonSchemaObject, TaskFormSchema } from '@/api/taskFormSchemas';

/**
 * Built-in task form templates, ported from the official
 * TaskFormSchemaRegistry: the schemas the settings page loads when the
 * admin picks "load built-in template". Only the templates the official
 * lookup reaches are carried here; the registry file also defines
 * description/tag schemas that the settings lookup never returns.
 */
export const TASK_CATEGORIES = [
  'Approval',
  'Custom',
  'DataAccess',
  'Incident',
  'MetadataUpdate',
  'Review',
] as const;

export const TASK_STATUSES = [
  'Approved',
  'Cancelled',
  'Completed',
  'Expired',
  'Failed',
  'Granted',
  'InProgress',
  'ManualRevoke',
  'Open',
  'Pending',
  'Rejected',
  'Revoked',
] as const;

/** Workflow definition default per task type, mirroring the official page lookup. */
export const DEFAULT_WORKFLOW_DEFINITION_REF_BY_TASK_TYPE: Record<string, string> = {
  DescriptionUpdate: 'DescriptionUpdateTaskWorkflow',
  TagUpdate: 'TagUpdateTaskWorkflow',
  OwnershipUpdate: 'OwnershipUpdateTaskWorkflow',
  TierUpdate: 'TierUpdateTaskWorkflow',
  DomainUpdate: 'DomainUpdateTaskWorkflow',
  GlossaryApproval: 'GlossaryApprovalTaskWorkflow',
  RequestApproval: 'RequestApprovalTaskWorkflow',
  Suggestion: 'SuggestionTaskWorkflow',
  TestCaseResolution: 'TestCaseResolutionTaskWorkflow',
  IncidentResolution: 'IncidentResolutionTaskWorkflow',
  CustomTask: 'CustomTaskWorkflow',
};

export function getDefaultWorkflowDefinitionRef(taskType?: string): string | undefined {
  return taskType ? DEFAULT_WORKFLOW_DEFINITION_REF_BY_TASK_TYPE[taskType] : undefined;
}

type TemplateSchema = Omit<TaskFormSchema, 'formSchema' | 'uiSchema'> & {
  formSchema: JsonSchemaObject;
  uiSchema: JsonSchemaObject;
};

const approvalSchema: TemplateSchema = {
  name: 'Approval',
  displayName: 'Approval',
  taskType: 'RequestApproval',
  taskCategory: 'Approval',
  formSchema: {
    type: 'object',
    additionalProperties: true,
    properties: {
      comment: { type: 'string', title: 'Comment' },
    },
  },
  uiSchema: {
    'ui:handler': { type: 'approval', permission: 'EDIT_ALL' },
    'ui:resolution': { mode: 'payload' },
    comment: { 'ui:widget': 'textarea' },
  },
};

const incidentResolutionSchema: TemplateSchema = {
  name: 'IncidentResolution',
  displayName: 'Incident Resolution',
  taskType: 'TestCaseResolution',
  taskCategory: 'Incident',
  formSchema: {
    type: 'object',
    additionalProperties: true,
    properties: {
      rootCause: { type: 'string', title: 'Root Cause' },
      resolution: { type: 'string', title: 'Resolution' },
    },
  },
  uiSchema: {
    'ui:handler': { type: 'incident' },
    'ui:resolution': { mode: 'payload' },
    rootCause: { 'ui:widget': 'textarea' },
    resolution: { 'ui:widget': 'textarea' },
  },
};

const ownershipUpdateSchema: TemplateSchema = {
  name: 'OwnershipUpdate',
  displayName: 'Ownership Update',
  taskType: 'OwnershipUpdate',
  taskCategory: 'MetadataUpdate',
  formSchema: {
    type: 'object',
    additionalProperties: true,
    properties: {
      currentOwners: { type: 'array', title: 'Current Owners', items: { type: 'object' } },
      newOwners: { type: 'array', title: 'New Owners', items: { type: 'object' } },
    },
  },
  uiSchema: {
    'ui:handler': { type: 'ownershipUpdate', permission: 'EDIT_OWNERS' },
    'ui:resolution': { mode: 'payload' },
    'ui:execution': {
      approve: { actions: [{ type: 'replaceOwners', payloadField: 'newOwners' }] },
      reject: { actions: [] },
    },
    currentOwners: { 'ui:widget': 'hidden' },
    newOwners: { 'ui:widget': 'textarea' },
  },
};

const tierUpdateSchema: TemplateSchema = {
  name: 'TierUpdate',
  displayName: 'Tier Update',
  taskType: 'TierUpdate',
  taskCategory: 'MetadataUpdate',
  formSchema: {
    type: 'object',
    additionalProperties: true,
    properties: {
      currentTier: { type: 'object', title: 'Current Tier' },
      newTier: { type: 'object', title: 'New Tier' },
    },
  },
  uiSchema: {
    'ui:handler': { type: 'tierUpdate', permission: 'EDIT_TIER' },
    'ui:resolution': { mode: 'payload' },
    'ui:execution': {
      approve: { actions: [{ type: 'applyTier', payloadField: 'newTier' }] },
      reject: { actions: [] },
    },
    currentTier: { 'ui:widget': 'hidden' },
    newTier: { 'ui:widget': 'textarea' },
  },
};

const domainUpdateSchema: TemplateSchema = {
  name: 'DomainUpdate',
  displayName: 'Domain Update',
  taskType: 'DomainUpdate',
  taskCategory: 'MetadataUpdate',
  formSchema: {
    type: 'object',
    additionalProperties: true,
    properties: {
      currentDomain: { type: 'object', title: 'Current Domain' },
      newDomain: { type: 'object', title: 'New Domain' },
    },
  },
  uiSchema: {
    'ui:handler': { type: 'domainUpdate', permission: 'EDIT_ALL' },
    'ui:resolution': { mode: 'payload' },
    'ui:execution': {
      approve: { actions: [{ type: 'replaceDomains', payloadField: 'newDomain' }] },
      reject: { actions: [] },
    },
    currentDomain: { 'ui:widget': 'hidden' },
    newDomain: { 'ui:widget': 'textarea' },
  },
};

const customTaskSchema: TemplateSchema = {
  name: 'CustomTask',
  displayName: 'Custom Task',
  taskType: 'CustomTask',
  taskCategory: 'Custom',
  formSchema: { type: 'object', additionalProperties: true, properties: {} },
  uiSchema: {
    'ui:handler': { type: 'custom' },
    'ui:resolution': { mode: 'payload' },
  },
};

function withTaskIdentity(schema: TemplateSchema) {
  return (taskType: string): TemplateSchema => ({
    ...schema,
    taskType,
    name: taskType,
    fullyQualifiedName: taskType,
    displayName: taskType,
  });
}

interface DefaultSchemaEntry {
  category: string;
  resolve: (taskType: string) => TemplateSchema;
}

/**
 * Official getDefaultTaskFormSchema: the entry must exist for the task
 * type AND its category must match, otherwise no template is available.
 */
export function getDefaultTaskFormSchema(
  taskType: string,
  taskCategory: string,
): TemplateSchema | undefined {
  const schemaByTaskType: Partial<Record<string, DefaultSchemaEntry>> = {
    GlossaryApproval: { category: 'Approval', resolve: withTaskIdentity(approvalSchema) },
    RequestApproval: { category: 'Approval', resolve: withTaskIdentity(approvalSchema) },
    TestCaseResolution: { category: 'Incident', resolve: withTaskIdentity(incidentResolutionSchema) },
    IncidentResolution: { category: 'Incident', resolve: withTaskIdentity(incidentResolutionSchema) },
    OwnershipUpdate: { category: 'MetadataUpdate', resolve: () => ownershipUpdateSchema },
    TierUpdate: { category: 'MetadataUpdate', resolve: () => tierUpdateSchema },
    DomainUpdate: { category: 'MetadataUpdate', resolve: () => domainUpdateSchema },
    CustomTask: { category: 'Custom', resolve: () => customTaskSchema },
  };
  const entry = schemaByTaskType[taskType];
  if (!entry || entry.category !== taskCategory) {
    return undefined;
  }
  return entry.resolve(taskType);
}
