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
 * admin picks "load built-in template". The lookup carries the same 10
 * entries as the official registry, including the description/tag
 * schemas, which the settings page reaches through the shared
 * TaskFormSchemaUtils re-export.
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

const descriptionUpdateSchema: TemplateSchema = {
  name: 'DescriptionUpdate',
  displayName: 'Description Update',
  taskType: 'DescriptionUpdate',
  taskCategory: 'MetadataUpdate',
  formSchema: {
    type: 'object',
    additionalProperties: true,
    properties: {
      fieldPath: { type: 'string', title: 'Field Path' },
      currentDescription: { type: 'string', title: 'Current Description' },
      newDescription: { type: 'string', title: 'New Description' },
      source: { type: 'string', title: 'Source' },
      confidence: { type: 'number', title: 'Confidence' },
    },
  },
  uiSchema: {
    'ui:handler': {
      type: 'descriptionUpdate',
      permission: 'EDIT_DESCRIPTION',
      fieldPathField: 'fieldPath',
      valueField: 'newDescription',
    },
    'ui:editablePayload': {
      fieldPathField: 'fieldPath',
      currentValueField: 'currentDescription',
      editedValueField: 'newDescription',
    },
    'ui:resolution': {
      mode: 'field',
      valueField: 'newDescription',
    },
    'ui:execution': {
      approve: {
        actions: [
          {
            type: 'setDescription',
            fieldPathField: 'fieldPath',
            valueField: 'newDescription',
          },
        ],
      },
      reject: {
        actions: [],
      },
    },
    'ui:order': [
      'newDescription',
      'fieldPath',
      'currentDescription',
      'source',
      'confidence',
    ],
    fieldPath: { 'ui:widget': 'hidden' },
    currentDescription: { 'ui:widget': 'hidden' },
    source: { 'ui:widget': 'hidden' },
    confidence: { 'ui:widget': 'hidden' },
    newDescription: { 'ui:widget': 'descriptionTabs' },
  },
};

const tagUpdateSchema: TemplateSchema = {
  name: 'TagUpdate',
  displayName: 'Tag Update',
  taskType: 'TagUpdate',
  taskCategory: 'MetadataUpdate',
  formSchema: {
    type: 'object',
    additionalProperties: true,
    properties: {
      fieldPath: { type: 'string', title: 'Field Path' },
      currentTags: {
        type: 'array',
        title: 'Current Tags',
        items: { type: 'object', additionalProperties: true },
      },
      tagsToAdd: {
        type: 'array',
        title: 'Tags To Add',
        items: { type: 'object', additionalProperties: true },
      },
      tagsToRemove: {
        type: 'array',
        title: 'Tags To Remove',
        items: { type: 'object', additionalProperties: true },
      },
      operation: { type: 'string', title: 'Operation' },
      source: { type: 'string', title: 'Source' },
      confidence: { type: 'number', title: 'Confidence' },
    },
  },
  uiSchema: {
    'ui:handler': {
      type: 'tagUpdate',
      permission: 'EDIT_TAGS',
      fieldPathField: 'fieldPath',
      currentTagsField: 'currentTags',
      addTagsField: 'tagsToAdd',
      removeTagsField: 'tagsToRemove',
    },
    'ui:editablePayload': {
      fieldPathField: 'fieldPath',
      currentTagsField: 'currentTags',
      addTagsField: 'tagsToAdd',
      removeTagsField: 'tagsToRemove',
    },
    'ui:resolution': {
      mode: 'tagMerge',
      currentField: 'currentTags',
      addField: 'tagsToAdd',
      removeField: 'tagsToRemove',
    },
    'ui:execution': {
      approve: {
        actions: [
          {
            type: 'mergeTags',
            fieldPathField: 'fieldPath',
            currentTagsField: 'currentTags',
            addTagsField: 'tagsToAdd',
            removeTagsField: 'tagsToRemove',
          },
        ],
      },
      reject: {
        actions: [],
      },
    },
    'ui:order': [
      'tagsToAdd',
      'fieldPath',
      'currentTags',
      'tagsToRemove',
      'operation',
      'source',
      'confidence',
    ],
    fieldPath: { 'ui:widget': 'hidden' },
    currentTags: { 'ui:widget': 'hidden' },
    tagsToRemove: { 'ui:widget': 'hidden' },
    operation: { 'ui:widget': 'hidden' },
    source: { 'ui:widget': 'hidden' },
    confidence: { 'ui:widget': 'hidden' },
    tagsToAdd: { 'ui:widget': 'tagsTabs' },
  },
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
    DescriptionUpdate: { category: 'MetadataUpdate', resolve: () => descriptionUpdateSchema },
    TagUpdate: { category: 'MetadataUpdate', resolve: () => tagUpdateSchema },
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
