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
import type { CollaborationTask } from '@/types/collaboration';
import {
  buildFeedbackApprovalResolution,
  feedbackTypeLabel,
  isRecognizerFeedbackTask,
  parseRecognizerFeedbackPayload,
} from './recognizerFeedback';

function task(overrides: Partial<CollaborationTask>): CollaborationTask {
  return { id: 't1', assignees: [], comments: [], status: 'Open', ...overrides };
}

const FEEDBACK_PAYLOAD = {
  field: 'tags',
  fieldPath: 'columns.email.tags',
  currentValue: '[]',
  suggestedValue: '[{"tagFQN":"PII.Sensitive"}]',
  feedback: {
    entityLink: '<#E::table::db.schema.orders::columns::email>',
    tagFQN: 'PII.Sensitive',
    feedbackType: 'FALSE_POSITIVE',
    userComments: 'This is not a sensitive field',
    createdBy: { id: 'u1', type: 'user', name: 'admin', displayName: 'Admin User' },
    createdAt: 1701686127533,
    recognizerInfo: { recognizerName: 'Wrong Recognizer', confidenceScore: 0.9 },
    sampleValues: ['secret@example.com'],
  },
  recognizer: { recognizerId: 'r1', recognizerName: 'PII Recognizer', score: 0.9 },
};

describe('isRecognizerFeedbackTask', () => {
  it('matches RecognizerFeedbackApproval with a feedback payload', () => {
    expect(
      isRecognizerFeedbackTask(
        task({ type: 'RecognizerFeedbackApproval', rawPayload: FEEDBACK_PAYLOAD }),
      ),
    ).toBe(true);
  });

  it('matches DataQualityReview with a feedback payload', () => {
    expect(
      isRecognizerFeedbackTask(
        task({ type: 'DataQualityReview', rawPayload: FEEDBACK_PAYLOAD }),
      ),
    ).toBe(true);
  });

  it('does not match RecognizerFeedbackApproval without a feedback payload', () => {
    expect(
      isRecognizerFeedbackTask(
        task({ type: 'RecognizerFeedbackApproval', rawPayload: { suggestedValue: 'x' } }),
      ),
    ).toBe(false);
    expect(
      isRecognizerFeedbackTask(task({ type: 'RecognizerFeedbackApproval' })),
    ).toBe(false);
  });

  it('does not match other types even with a feedback payload', () => {
    expect(
      isRecognizerFeedbackTask(task({ type: 'TagUpdate', rawPayload: FEEDBACK_PAYLOAD })),
    ).toBe(false);
  });

  it('counts a present-but-null feedback key, as the pin `in` check does', () => {
    expect(
      isRecognizerFeedbackTask(
        task({ type: 'RecognizerFeedbackApproval', rawPayload: { feedback: null } }),
      ),
    ).toBe(true);
  });

  it('does not match via a parsed feedbackPayload alone, without the feedback key in the raw record', () => {
    expect(
      isRecognizerFeedbackTask(
        task({
          type: 'RecognizerFeedbackApproval',
          feedbackPayload: { feedback: { feedbackType: 'FALSE_POSITIVE' } },
        }),
      ),
    ).toBe(false);
    expect(
      isRecognizerFeedbackTask(
        task({
          type: 'RecognizerFeedbackApproval',
          rawPayload: { suggestedValue: 'x' },
          feedbackPayload: { feedback: { feedbackType: 'FALSE_POSITIVE' } },
        }),
      ),
    ).toBe(false);
  });
});

describe('buildFeedbackApprovalResolution', () => {
  it('approves with the approved sentinel and the raw payload echoed unchanged', () => {
    const source = task({ type: 'RecognizerFeedbackApproval', rawPayload: FEEDBACK_PAYLOAD });
    const body = buildFeedbackApprovalResolution(source, 'approve');
    expect(body.resolutionType).toBe('Approved');
    expect(body.newValue).toBe('approved');
    expect(body.payload).toEqual(FEEDBACK_PAYLOAD);
  });

  it('rejects with the rejected sentinel and no payload', () => {
    const source = task({ type: 'DataQualityReview', rawPayload: FEEDBACK_PAYLOAD });
    const body = buildFeedbackApprovalResolution(source, 'reject');
    expect(body).toEqual({ resolutionType: 'Rejected', newValue: 'rejected' });
  });

  it('approves without a payload key when the task carries no raw payload', () => {
    const body = buildFeedbackApprovalResolution(task({ type: 'RecognizerFeedbackApproval' }), 'approve');
    expect(body).toEqual({ resolutionType: 'Approved', newValue: 'approved' });
  });
});

describe('parseRecognizerFeedbackPayload', () => {
  it('parses the feedback object and the sibling recognizer name', () => {
    const parsed = parseRecognizerFeedbackPayload(FEEDBACK_PAYLOAD);
    expect(parsed?.feedback.entityLink).toBe('<#E::table::db.schema.orders::columns::email>');
    expect(parsed?.feedback.feedbackType).toBe('FALSE_POSITIVE');
    expect(parsed?.feedback.userComments).toBe('This is not a sensitive field');
    expect(parsed?.feedback.createdBy?.displayName).toBe('Admin User');
    expect(parsed?.feedback.createdAt).toBe(1701686127533);
    expect(parsed?.recognizerName).toBe('PII Recognizer');
  });

  it('never falls back to feedback.recognizerInfo for the recognizer name', () => {
    const { recognizer: _dropped, ...withoutSibling } = FEEDBACK_PAYLOAD;
    const parsed = parseRecognizerFeedbackPayload(withoutSibling);
    expect(parsed?.feedback).toBeDefined();
    expect(parsed?.recognizerName).toBeUndefined();
  });

  it('returns undefined without a feedback object', () => {
    expect(parseRecognizerFeedbackPayload({ suggestedValue: 'x' })).toBeUndefined();
    expect(parseRecognizerFeedbackPayload({ feedback: null })).toBeUndefined();
    expect(parseRecognizerFeedbackPayload({ feedback: 'nope' })).toBeUndefined();
    expect(parseRecognizerFeedbackPayload(null)).toBeUndefined();
    expect(parseRecognizerFeedbackPayload(undefined)).toBeUndefined();
  });
});

describe('feedbackTypeLabel', () => {
  const translate = (key: string) => `t:${key}`;

  it('maps all four schema values', () => {
    expect(feedbackTypeLabel('FALSE_POSITIVE', translate)).toBe(
      't:collaboration.task.feedbackTypeFalsePositive',
    );
    expect(feedbackTypeLabel('INCORRECT_CLASSIFICATION', translate)).toBe(
      't:collaboration.task.feedbackTypeIncorrectClassification',
    );
    expect(feedbackTypeLabel('OVERLY_BROAD', translate)).toBe(
      't:collaboration.task.feedbackTypeOverlyBroad',
    );
    expect(feedbackTypeLabel('CONTEXT_SPECIFIC', translate)).toBe(
      't:collaboration.task.feedbackTypeContextSpecific',
    );
  });

  it('falls back to the raw value for an unmapped value', () => {
    expect(feedbackTypeLabel('SOMETHING_ELSE', translate)).toBe('SOMETHING_ELSE');
  });

  it('returns empty when there is no feedback type', () => {
    expect(feedbackTypeLabel(undefined, translate)).toBe('');
    expect(feedbackTypeLabel('', translate)).toBe('');
  });
});
