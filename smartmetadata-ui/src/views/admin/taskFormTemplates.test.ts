/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import { getDefaultTaskFormSchema, getDefaultWorkflowDefinitionRef } from './taskFormTemplates';

describe('taskFormTemplates', () => {
  it('resolves the mapped type/category pairs and stamps the task identity', () => {
    const approval = getDefaultTaskFormSchema('GlossaryApproval', 'Approval');
    expect(approval?.name).toBe('GlossaryApproval');
    expect(approval?.displayName).toBe('GlossaryApproval');
    expect(approval?.taskCategory).toBe('Approval');
    expect(getDefaultTaskFormSchema('OwnershipUpdate', 'MetadataUpdate')?.name).toBe(
      'OwnershipUpdate',
    );
    expect(getDefaultTaskFormSchema('CustomTask', 'Custom')?.formSchema).toEqual({
      type: 'object',
      additionalProperties: true,
      properties: {},
    });
  });

  it('resolves all ten lookup entries with their matching categories', () => {
    const matrix: Array<[string, string, string]> = [
      ['DescriptionUpdate', 'MetadataUpdate', 'DescriptionUpdate'],
      ['TagUpdate', 'MetadataUpdate', 'TagUpdate'],
      ['GlossaryApproval', 'Approval', 'GlossaryApproval'],
      ['RequestApproval', 'Approval', 'RequestApproval'],
      ['TestCaseResolution', 'Incident', 'TestCaseResolution'],
      ['IncidentResolution', 'Incident', 'IncidentResolution'],
      ['OwnershipUpdate', 'MetadataUpdate', 'OwnershipUpdate'],
      ['TierUpdate', 'MetadataUpdate', 'TierUpdate'],
      ['DomainUpdate', 'MetadataUpdate', 'DomainUpdate'],
      ['CustomTask', 'Custom', 'CustomTask'],
    ];
    for (const [taskType, category, name] of matrix) {
      const schema = getDefaultTaskFormSchema(taskType, category);
      expect(schema?.name).toBe(name);
      expect(schema?.taskType).toBe(taskType);
      expect(schema?.taskCategory).toBe(category);
    }
  });

  it('returns undefined when the category does not match or the type is unmapped', () => {
    expect(getDefaultTaskFormSchema('OwnershipUpdate', 'Approval')).toBeUndefined();
    expect(getDefaultTaskFormSchema('DescriptionUpdate', 'Approval')).toBeUndefined();
    expect(getDefaultTaskFormSchema('TagUpdate', 'Incident')).toBeUndefined();
    expect(getDefaultTaskFormSchema('Nope', 'Custom')).toBeUndefined();
  });

  it('returns the description update schema verbatim without identity stamping', () => {
    const schema = getDefaultTaskFormSchema('DescriptionUpdate', 'MetadataUpdate');
    expect(schema).toEqual({
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
        'ui:resolution': { mode: 'field', valueField: 'newDescription' },
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
          reject: { actions: [] },
        },
        'ui:order': ['newDescription', 'fieldPath', 'currentDescription', 'source', 'confidence'],
        fieldPath: { 'ui:widget': 'hidden' },
        currentDescription: { 'ui:widget': 'hidden' },
        source: { 'ui:widget': 'hidden' },
        confidence: { 'ui:widget': 'hidden' },
        newDescription: { 'ui:widget': 'descriptionTabs' },
      },
    });
    expect(schema).not.toHaveProperty('fullyQualifiedName');
  });

  it('returns the tag update schema verbatim without identity stamping', () => {
    const schema = getDefaultTaskFormSchema('TagUpdate', 'MetadataUpdate');
    expect(schema).toEqual({
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
          reject: { actions: [] },
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
    });
    expect(schema).not.toHaveProperty('fullyQualifiedName');
  });

  it('maps task types to their default workflow definitions', () => {
    expect(getDefaultWorkflowDefinitionRef('TagUpdate')).toBe('TagUpdateTaskWorkflow');
    expect(getDefaultWorkflowDefinitionRef('CustomTask')).toBe('CustomTaskWorkflow');
    expect(getDefaultWorkflowDefinitionRef(undefined)).toBeUndefined();
  });
});
