/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * Task-type labels, ported as data from the official inbox
 * TASK_TYPE_BADGE table (components/discovery/personal-space/InboxPage/
 * taskDetail.utils.ts): the labelKey column only. Colour and icon are
 * not ported — the fork inbox rows are plain text, and this batch is
 * label-only by ruling (D-F11). An unmapped type keeps its raw string
 * (the caller falls back); the pin's neutral "Task" default badge is
 * not reproduced, per the same ruling. The two getTypeBadgeConfig
 * overrides are deliberately not ported: the revise-and-resubmit badge
 * for revision-carrying MetadataCompletion tasks, and the incident
 * fallback for unmapped types in the Incident category — both are
 * detail-panel/grouping behavior beyond the label table, recorded as a
 * known divergence in the leaf report.
 */
export const TASK_TYPE_LABEL_KEYS: Record<string, string> = {
  TestCaseResolution: 'collaboration.task.typeLabels.incident',
  IncidentResolution: 'collaboration.task.typeLabels.incident',
  DataAccessRequest: 'collaboration.task.typeLabels.accessRequest',
  TagUpdate: 'collaboration.task.typeLabels.tagRequest',
  OwnershipUpdate: 'collaboration.task.typeLabels.ownership',
  DescriptionUpdate: 'collaboration.task.typeLabels.description',
  Suggestion: 'collaboration.task.typeLabels.suggestion',
  TierUpdate: 'collaboration.task.typeLabels.tier',
  DomainUpdate: 'collaboration.task.typeLabels.domain',
  GlossaryApproval: 'collaboration.task.typeLabels.glossary',
  RequestApproval: 'collaboration.task.typeLabels.approval',
  CustomTask: 'collaboration.task.typeLabels.customTask',
  DataQualityReview: 'collaboration.task.typeLabels.dataQualityReview',
  PipelineReview: 'collaboration.task.typeLabels.pipelineReview',
  MemoryConflictReview: 'collaboration.task.typeLabels.memoryConflict',
  MetadataCompletion: 'collaboration.task.typeLabels.missingMetadata',
  RecognizerFeedbackApproval: 'collaboration.task.typeLabels.recognizerFeedback',
};

/** The locale key for a task type, or undefined when the type is unmapped. */
export function getTaskTypeLabelKey(type: string | undefined): string | undefined {
  return type === undefined ? undefined : TASK_TYPE_LABEL_KEYS[type];
}
