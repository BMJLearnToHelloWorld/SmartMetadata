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
import {
  WORKFLOW_NODE_CONFIG_SCHEMAS,
  getWorkflowNodeConfigSchema,
} from './workflowNodeSchemas';

/**
 * R-5: the full-map pinning test below locks the hand-maintained snapshot
 * in workflowNodeSchemas.ts to the official generated UI JSONs at pin
 * a3012259ca, verified field-by-field against that pin on 2026-11-06:
 *   openmetadata-ui/src/main/resources/ui/src/jsons/governanceSchemas/
 *     automatedTask/{runAppTask,setGlossaryTermStatusTask,
 *       setEntityCertificationTask,applyRecognizerFeedbackTask,
 *       rejectRecognizerFeedbackTask,createAndRunIngestionPipelineTask,
 *       policyAgentTaskDefinition}.json
 *     userTask/createRecognizerFeedbackApprovalTask.json
 * (Note: the policy-agent JSON file is named policyAgentTaskDefinition.json
 * while the node subtype is policyAgentTask; the config lives under
 * definitions.config — properties.config is a $ref — as it does for
 * createAndRunIngestionPipelineTask and setEntityCertificationTask.)
 * The test cannot fetch the pin at runtime — it pins the transcribed
 * values, so any edit that drifts from the verified transcription fails
 * loudly. When the upstream pin moves, re-transcribe from the same files
 * and update the expectations here.
 */
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

describe('WORKFLOW_NODE_CONFIG_SCHEMAS', () => {
  it('matches the official config surface transcribed from pin a3012259ca', () => {
    expect(WORKFLOW_NODE_CONFIG_SCHEMAS).toEqual({
      runAppTask: {
        appName: { title: 'App Name', type: 'string' },
        waitForCompletion: { title: 'Wait for Completion', type: 'boolean' },
        timeoutSeconds: { title: 'Timeout Seconds', type: 'integer' },
      },
      setGlossaryTermStatusTask: {
        glossaryTermStatus: { title: 'Glossary Term Status', type: 'string' },
      },
      setEntityCertificationTask: {
        // No `type`: official declares certification as a $ref to
        // certificationEnum, not as a typed property.
        certification: { title: 'Certification' },
      },
      applyRecognizerFeedbackTask: {},
      rejectRecognizerFeedbackTask: {},
      createAndRunIngestionPipelineTask: {
        pipelineType: { title: 'Pipeline Type', type: 'string' },
        shouldRun: { title: 'Run the Ingestion Pipeline', type: 'boolean' },
        waitForCompletion: { title: 'Wait for Completion', type: 'boolean' },
        timeoutSeconds: { title: 'Timeout Seconds', type: 'integer' },
      },
      policyAgentTask: {
        waitForCompletion: { title: 'Wait for Completion', type: 'boolean' },
        timeoutSeconds: { title: 'Timeout Seconds', type: 'integer' },
        accessType: { title: 'Access Type Override', type: 'string' },
      },
      createRecognizerFeedbackApprovalTask: {
        assignees: { title: 'Assignees', type: 'object' },
        approvalThreshold: { title: 'Approval Threshold', type: 'integer' },
        rejectionThreshold: { title: 'Rejection Threshold', type: 'integer' },
      },
    });
  });
});
