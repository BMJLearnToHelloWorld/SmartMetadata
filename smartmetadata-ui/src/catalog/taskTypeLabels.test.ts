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
import { getTaskTypeLabelKey, TASK_TYPE_LABEL_KEYS } from './taskTypeLabels';

describe('taskTypeLabels', () => {
  it('maps every type in the pin badge table', () => {
    expect(getTaskTypeLabelKey('RecognizerFeedbackApproval')).toBe(
      'collaboration.task.typeLabels.recognizerFeedback',
    );
    expect(getTaskTypeLabelKey('TestCaseResolution')).toBe('collaboration.task.typeLabels.incident');
    expect(getTaskTypeLabelKey('IncidentResolution')).toBe('collaboration.task.typeLabels.incident');
    expect(getTaskTypeLabelKey('DataAccessRequest')).toBe(
      'collaboration.task.typeLabels.accessRequest',
    );
    expect(getTaskTypeLabelKey('TagUpdate')).toBe('collaboration.task.typeLabels.tagRequest');
    expect(getTaskTypeLabelKey('OwnershipUpdate')).toBe('collaboration.task.typeLabels.ownership');
    expect(getTaskTypeLabelKey('DescriptionUpdate')).toBe(
      'collaboration.task.typeLabels.description',
    );
    expect(getTaskTypeLabelKey('Suggestion')).toBe('collaboration.task.typeLabels.suggestion');
    expect(getTaskTypeLabelKey('TierUpdate')).toBe('collaboration.task.typeLabels.tier');
    expect(getTaskTypeLabelKey('DomainUpdate')).toBe('collaboration.task.typeLabels.domain');
    expect(getTaskTypeLabelKey('GlossaryApproval')).toBe('collaboration.task.typeLabels.glossary');
    expect(getTaskTypeLabelKey('RequestApproval')).toBe('collaboration.task.typeLabels.approval');
    expect(getTaskTypeLabelKey('CustomTask')).toBe('collaboration.task.typeLabels.customTask');
    expect(getTaskTypeLabelKey('DataQualityReview')).toBe(
      'collaboration.task.typeLabels.dataQualityReview',
    );
    expect(getTaskTypeLabelKey('PipelineReview')).toBe(
      'collaboration.task.typeLabels.pipelineReview',
    );
    expect(getTaskTypeLabelKey('MemoryConflictReview')).toBe(
      'collaboration.task.typeLabels.memoryConflict',
    );
    expect(getTaskTypeLabelKey('MetadataCompletion')).toBe(
      'collaboration.task.typeLabels.missingMetadata',
    );
    expect(Object.keys(TASK_TYPE_LABEL_KEYS)).toHaveLength(17);
  });

  it('returns undefined for unmapped and missing types, so callers keep the raw string', () => {
    expect(getTaskTypeLabelKey('dataQuality')).toBeUndefined();
    expect(getTaskTypeLabelKey('FutureType')).toBeUndefined();
    expect(getTaskTypeLabelKey(undefined)).toBeUndefined();
  });
});
