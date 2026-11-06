/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { WorkflowNodeSubType } from '@/types/governance';

/**
 * R-5, resolved in S3: the schema-based node form renders a node's stored
 * config read-only, labelling each entry with the title from its JSON
 * schema. Official reads the generated UI JSONs
 * (`openmetadata-ui/.../jsons/governanceSchemas/{automatedTask,userTask}/*.json`);
 * those JSONs are generated from the spec schemas in
 * `openmetadata-spec/.../governance/workflows/elements/nodes/...`, which
 * the product carries in-tree. This map is the `properties.config`
 * surface of those schemas (verified against pin a3012259ca 2026-11-06):
 * property title + JSON type per subtype. `applyRecognizerFeedbackTask`
 * and `rejectRecognizerFeedbackTask` genuinely have no config properties
 * — the form renders only the (locked) name/description for them.
 * `setEntityCertificationTask.certification` has no `type` in its schema
 * (it is a `$ref` to `certificationEnum`); it renders as a plain input,
 * exactly as official's fallback does for a non-boolean, non-object value.
 */
export interface WorkflowNodeSchemaField {
  title: string;
  /** JSON Schema `type` when the schema declares one; undefined otherwise. */
  type?: string;
}

export type WorkflowNodeConfigSchema = Record<string, WorkflowNodeSchemaField>;

export const WORKFLOW_NODE_CONFIG_SCHEMAS: Partial<
  Record<WorkflowNodeSubType, WorkflowNodeConfigSchema>
> = {
  runAppTask: {
    appName: { title: 'App Name', type: 'string' },
    waitForCompletion: { title: 'Wait for Completion', type: 'boolean' },
    timeoutSeconds: { title: 'Timeout Seconds', type: 'integer' },
  },
  setGlossaryTermStatusTask: {
    glossaryTermStatus: { title: 'Glossary Term Status', type: 'string' },
  },
  setEntityCertificationTask: {
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
};

/** Config properties for a subtype (empty when the schema declares none). */
export function getWorkflowNodeConfigSchema(
  subType: WorkflowNodeSubType | string | undefined,
): WorkflowNodeConfigSchema {
  if (!subType) {
    return {};
  }
  return WORKFLOW_NODE_CONFIG_SCHEMAS[subType as WorkflowNodeSubType] ?? {};
}
