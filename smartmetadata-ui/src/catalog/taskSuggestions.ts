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
 * Task suggestion normalization, mirroring the official pair
 * utils/TaskPayloadUtils.ts getNormalizedTaskPayload and
 * utils/TaskFormSchemaUtils.ts getTaskResolutionNewValue (default
 * branches only — the product carries no task-form uiSchema, so the
 * schema-driven 'payload' / 'field' / 'tagMerge' modes have no input
 * here and are not reproduced).
 *
 * Description tasks: current = currentDescription ?? currentValue,
 * suggested = newDescription ?? suggestedValue.
 * Tag tasks (type TagUpdate): currentTags / tagsToAdd / tagsToRemove
 * may arrive as JSON strings or as arrays of {tagFQN}; the suggested
 * set is current minus removals plus additions, falling back to the
 * legacy suggestedValue list when there is no tag operation at all.
 * The resolution newValue is the suggested description, or the
 * suggested tag set serialized — exactly the official resolve payload
 * the VIEW (accept-suggestion) action sends with Approved.
 */
import type { CollaborationTask, TaskSuggestionPayload } from '@/types/collaboration';

export interface NormalizedTaskSuggestion {
  fieldPath?: string;
  currentDescription?: string;
  newDescription?: string;
  currentTags: string[];
  suggestedTags: string[];
  suggestedValue?: string;
  isSuggestionEmpty: boolean;
}

function parseTagFqns(value: unknown): string[] {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item === 'string') {
        return [item];
      }
      if (item !== null && typeof item === 'object') {
        const rec = item as Record<string, unknown>;
        return typeof rec.tagFQN === 'string' ? [rec.tagFQN] : [];
      }
      return [];
    });
  }
  if (typeof value === 'string') {
    try {
      return parseTagFqns(JSON.parse(value) as unknown);
    } catch {
      return [];
    }
  }
  return [];
}

function asStringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function normalizeTaskSuggestion(task: CollaborationTask): NormalizedTaskSuggestion {
  const payload = task.suggestionPayload ?? {};
  const isTagTask = task.type === 'TagUpdate';
  const fieldPath = payload.fieldPath;
  const currentDescription = payload.currentDescription;
  const newDescription = payload.newDescription;
  const currentTags = payload.currentTags ?? [];
  const tagsToAdd = payload.tagsToAdd ?? [];
  const tagsToRemove = payload.tagsToRemove ?? [];
  const legacySuggested = parseTagFqns(payload.suggestedValue);
  const hasTagOperation = tagsToAdd.length > 0 || tagsToRemove.length > 0 || legacySuggested.length > 0;
  // Official computeSuggestedTags: the merge applies when there is any
  // tag change (add / remove / a non-empty current set); otherwise the
  // legacy suggestedValue list stands on its own.
  const hasTagChanges = tagsToAdd.length > 0 || tagsToRemove.length > 0 || currentTags.length > 0;
  const suggestedTags = isTagTask
    ? hasTagChanges
      ? [
          ...currentTags.filter((tag) => !tagsToRemove.includes(tag)),
          ...tagsToAdd,
        ]
      : legacySuggested
    : [];
  if (isTagTask) {
    return {
      fieldPath,
      currentDescription,
      newDescription,
      currentTags,
      suggestedTags,
      suggestedValue: suggestedTags.length > 0 || hasTagOperation ? JSON.stringify(suggestedTags) : undefined,
      isSuggestionEmpty: suggestedTags.length === 0 && !hasTagOperation,
    };
  }
  return {
    fieldPath,
    currentDescription,
    newDescription,
    currentTags,
    suggestedTags,
    suggestedValue: newDescription,
    isSuggestionEmpty: !newDescription,
  };
}

export function getTaskResolutionNewValue(task: CollaborationTask): string | undefined {
  return normalizeTaskSuggestion(task).suggestedValue;
}

export function parseTaskSuggestionPayload(raw: unknown): TaskSuggestionPayload | undefined {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const rec = raw as Record<string, unknown>;
  const hasAny =
    rec.fieldPath !== undefined ||
    rec.field !== undefined ||
    rec.currentDescription !== undefined ||
    rec.currentValue !== undefined ||
    rec.newDescription !== undefined ||
    rec.suggestedValue !== undefined ||
    rec.currentTags !== undefined ||
    rec.tagsToAdd !== undefined ||
    rec.tagsToRemove !== undefined;
  if (!hasAny) {
    return undefined;
  }
  return {
    fieldPath: asStringOrUndefined(rec.fieldPath ?? rec.field),
    currentDescription: asStringOrUndefined(rec.currentDescription ?? rec.currentValue),
    newDescription: asStringOrUndefined(rec.newDescription ?? rec.suggestedValue),
    currentTags: parseTagFqns(rec.currentTags ?? rec.currentValue),
    tagsToAdd: parseTagFqns(rec.tagsToAdd),
    tagsToRemove: parseTagFqns(rec.tagsToRemove),
    suggestedValue: typeof rec.suggestedValue === 'string' ? rec.suggestedValue : undefined,
  };
}
