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

  it('returns undefined when the category does not match or the type is unmapped', () => {
    expect(getDefaultTaskFormSchema('OwnershipUpdate', 'Approval')).toBeUndefined();
    expect(getDefaultTaskFormSchema('DescriptionUpdate', 'MetadataUpdate')).toBeUndefined();
    expect(getDefaultTaskFormSchema('Nope', 'Custom')).toBeUndefined();
  });

  it('maps task types to their default workflow definitions', () => {
    expect(getDefaultWorkflowDefinitionRef('TagUpdate')).toBe('TagUpdateTaskWorkflow');
    expect(getDefaultWorkflowDefinitionRef('CustomTask')).toBe('CustomTaskWorkflow');
    expect(getDefaultWorkflowDefinitionRef(undefined)).toBeUndefined();
  });
});
