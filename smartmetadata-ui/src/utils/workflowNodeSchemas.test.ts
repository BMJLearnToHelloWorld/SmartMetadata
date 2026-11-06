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
import { getWorkflowNodeConfigSchema } from './workflowNodeSchemas';

describe('getWorkflowNodeConfigSchema', () => {
  it('returns the runAppTask properties with titles and types', () => {
    const schema = getWorkflowNodeConfigSchema('runAppTask');
    expect(schema.appName).toEqual({ title: 'App Name', type: 'string' });
    expect(schema.waitForCompletion).toEqual({
      title: 'Wait for Completion',
      type: 'boolean',
    });
    expect(schema.timeoutSeconds).toEqual({
      title: 'Timeout Seconds',
      type: 'integer',
    });
  });

  it('returns an empty map for subtypes with no config properties', () => {
    expect(getWorkflowNodeConfigSchema('applyRecognizerFeedbackTask')).toEqual({});
    expect(getWorkflowNodeConfigSchema('rejectRecognizerFeedbackTask')).toEqual({});
  });

  it('returns the certification field without a type ($ref, not a primitive)', () => {
    expect(getWorkflowNodeConfigSchema('setEntityCertificationTask')).toEqual({
      certification: { title: 'Certification' },
    });
  });

  it('returns the policy agent and approval task shapes', () => {
    expect(getWorkflowNodeConfigSchema('policyAgentTask').accessType).toEqual({
      title: 'Access Type Override',
      type: 'string',
    });
    expect(
      getWorkflowNodeConfigSchema('createRecognizerFeedbackApprovalTask').assignees,
    ).toEqual({ title: 'Assignees', type: 'object' });
  });

  it('returns an empty map for unknown or missing subtypes', () => {
    expect(getWorkflowNodeConfigSchema('checkEntityAttributesTask')).toEqual({});
    expect(getWorkflowNodeConfigSchema(undefined)).toEqual({});
  });
});
