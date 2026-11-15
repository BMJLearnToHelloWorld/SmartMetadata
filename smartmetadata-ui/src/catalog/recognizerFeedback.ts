/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asNumber, asRecord, asString, mapEntityRefs } from '@/api/json';
import type {
  CollaborationTask,
  RecognizerFeedbackPayload,
} from '@/types/collaboration';

/**
 * Recognizer-feedback approval tasks, mirroring the official pair
 * utils/TaskActionUtils.ts isRecognizerFeedbackTask and
 * utils/TaskFormSchemaUtils.ts getDefaultTaskFormHandler
 * ('feedbackApproval' handler). The predicate and the resolve sentinels
 * live here once and are shared by every resolve path (the bulk widget
 * via catalog/taskResolve.ts, the detail view's accept/resolve/split
 * button) so a feedback task can never resolve with the suggested-value
 * JSON the generic paths would send.
 *
 * The server builds this payload for both qualifying types
 * (CreateTask.buildWorkflowPayload): RecognizerFeedbackApproval and
 * DataQualityReview tasks created by the recognizer-feedback workflow
 * carry RecognizerFeedbackTaskPayload{feedback, recognizer}.
 */

/** Official DEFAULT_APPROVAL_VALUES (TaskFormSchemaUtils). */
export const FEEDBACK_APPROVED_VALUE = 'approved';
export const FEEDBACK_REJECTED_VALUE = 'rejected';

/**
 * Official isRecognizerFeedbackTask, verbatim: a `feedback` key in the
 * task payload AND (type DataQualityReview OR type-string
 * 'RecognizerFeedbackApproval'). A RecognizerFeedbackApproval task with
 * no `feedback` payload is NOT a feedback task anywhere — it falls
 * through to the generic handler. The `in` check is deliberate: the
 * pin counts a present-but-null `feedback` key as a feedback task (the
 * renderer then shows nothing, while resolve still uses the sentinels).
 * The fork reads the raw payload record only; a parsed feedbackPayload
 * alone never qualifies a task, exactly as the pin reads `task.payload`
 * only.
 */
export function isRecognizerFeedbackTask(
  task: Pick<CollaborationTask, 'type' | 'rawPayload'>,
): boolean {
  const hasFeedbackPayload =
    task.rawPayload !== undefined && 'feedback' in task.rawPayload;
  return (
    hasFeedbackPayload &&
    (task.type === 'DataQualityReview' || task.type === 'RecognizerFeedbackApproval')
  );
}

export type FeedbackApprovalDecision = 'approve' | 'reject';

export interface FeedbackApprovalResolution {
  resolutionType: 'Approved' | 'Rejected';
  newValue: string;
  payload?: Record<string, unknown>;
}

/**
 * The legacy resolve body for a feedback task, mirroring the pin's
 * task-tab and inbox legacy paths: approve sends the 'approved'
 * sentinel plus the raw payload echoed unchanged (official
 * getEditableTaskPayload returns cloneDeep(payload) for feedback tasks
 * with no editable schema); reject sends the 'rejected' sentinel with
 * NO payload ("a rejection applies nothing"). Never the suggested
 * value, on either path.
 */
export function buildFeedbackApprovalResolution(
  task: Pick<CollaborationTask, 'rawPayload'>,
  decision: FeedbackApprovalDecision,
): FeedbackApprovalResolution {
  if (decision === 'reject') {
    return { resolutionType: 'Rejected', newValue: FEEDBACK_REJECTED_VALUE };
  }
  const resolution: FeedbackApprovalResolution = {
    resolutionType: 'Approved',
    newValue: FEEDBACK_APPROVED_VALUE,
  };
  if (task.rawPayload !== undefined) {
    resolution.payload = task.rawPayload;
  }
  return resolution;
}

/**
 * Typed parse of the workflow payload, on the mapTask pattern (cf.
 * parseTaskSuggestionPayload): the `feedback` object plus the
 * recognizer name from the SIBLING `payload.recognizer` object. There
 * is deliberately NO fallback to `feedback.recognizerInfo`: the pin UI
 * reads only `payload.recognizer`, and the server resolves that object
 * from the entity's tag label, so a missing sibling means the
 * Recognizer row does not render. Returns undefined when the payload
 * carries no `feedback` object.
 */
export function parseRecognizerFeedbackPayload(raw: unknown): RecognizerFeedbackPayload | undefined {
  const rec = asRecord(raw);
  if (!rec) {
    return undefined;
  }
  const feedbackRec = asRecord(rec.feedback);
  if (!feedbackRec) {
    return undefined;
  }
  const recognizerRec = asRecord(rec.recognizer);
  return {
    feedback: {
      entityLink: asString(feedbackRec.entityLink) || undefined,
      feedbackType: asString(feedbackRec.feedbackType) || undefined,
      userComments: asString(feedbackRec.userComments) || undefined,
      createdBy: mapEntityRefs(feedbackRec.createdBy ? [feedbackRec.createdBy] : [])[0],
      createdAt: asNumber(feedbackRec.createdAt),
    },
    recognizerName:
      recognizerRec && asString(recognizerRec.recognizerName)
        ? asString(recognizerRec.recognizerName)
        : undefined,
  };
}

/**
 * Official FeedbackApprovalTask feedback-type map, as data: the
 * recognizerFeedback.json FeedbackType enum values to their locale
 * keys. Keyed on the schema's SCREAMING_SNAKE values, which is what
 * the server sends.
 */
export const RECOGNIZER_FEEDBACK_TYPE_LABEL_KEYS: Record<string, string> = {
  FALSE_POSITIVE: 'collaboration.task.feedbackTypeFalsePositive',
  INCORRECT_CLASSIFICATION: 'collaboration.task.feedbackTypeIncorrectClassification',
  OVERLY_BROAD: 'collaboration.task.feedbackTypeOverlyBroad',
  CONTEXT_SPECIFIC: 'collaboration.task.feedbackTypeContextSpecific',
};

/**
 * Official feedback-type label: the mapped label, falling back to the
 * raw enum value for an unmapped value, and '' when there is no
 * feedback type (the pin still renders the row, with an empty badge).
 */
export function feedbackTypeLabel(
  feedbackType: string | undefined,
  translate: (key: string) => string,
): string {
  if (!feedbackType) {
    return '';
  }
  const key = RECOGNIZER_FEEDBACK_TYPE_LABEL_KEYS[feedbackType];
  return key ? translate(key) : feedbackType;
}
