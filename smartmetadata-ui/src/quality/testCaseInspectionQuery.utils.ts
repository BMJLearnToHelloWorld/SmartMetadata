/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { ChangeDescription } from '@/api/entities';
import {
  getChangedEntityNewValue,
  getChangedEntityOldValue,
  getDiffByFieldName,
  getTextDiff,
  toStringValue,
  type TextDiffResult,
} from '@/ingestion/versionDiff';

/** Pin EntityVersionUtilsPure.getChangedEntityStatus for inspectionQuery diff. */
export type InspectionQueryChangeStatus = 'NORMAL' | 'UPDATED' | 'ADDED' | 'DELETED';

export function getInspectionQueryChangeStatus(
  oldValue: string,
  newValue: string,
): InspectionQueryChangeStatus {
  if (oldValue && newValue) {
    return oldValue === newValue ? 'NORMAL' : 'UPDATED';
  }
  if (oldValue && !newValue) {
    return 'DELETED';
  }
  if (!oldValue && newValue) {
    return 'ADDED';
  }
  return 'NORMAL';
}

/**
 * Pin SqlQueryTab.component.tsx versionDiffInspectionQuery +
 * EntityDiffUtils.getDiffDisplayValue for the `inspectionQuery` field.
 */
export function getInspectionQueryVersionDiff(
  changeDescription: ChangeDescription | undefined,
  inspectionQuery: string | undefined,
): TextDiffResult {
  const diff = getDiffByFieldName('inspectionQuery', changeDescription, true);
  let oldValue = toStringValue(getChangedEntityOldValue(diff));
  let newValue = toStringValue(getChangedEntityNewValue(diff));
  if (!oldValue && !newValue) {
    const fallback = inspectionQuery ?? '';
    oldValue = fallback;
    newValue = fallback;
  }
  const status = getInspectionQueryChangeStatus(oldValue, newValue);
  switch (status) {
    case 'UPDATED':
      return getTextDiff(oldValue, newValue);
    case 'ADDED':
      return getTextDiff('', newValue);
    case 'DELETED':
      return getTextDiff(oldValue, '');
    default:
      return { type: 'plain', text: oldValue };
  }
}