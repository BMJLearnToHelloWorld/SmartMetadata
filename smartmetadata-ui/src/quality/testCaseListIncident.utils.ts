/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Official DataQualityTab renderIncidentCell: EditStatus gate + inlined incident.
 */
import {
  getDerivedPermissionFlags,
  toOperationPermissions,
  type OperationPermissions,
  type ResourcePermission,
} from '@/api/permissions';
import { DEFAULT_ENTITY_PERMISSION } from '@/composables/useEntityPermissions';
import type { TestCase, TestIncident } from '@/types/quality';

/**
 * Official collectInlineIncidentStatuses: incident rows ride on each
 * testCase.incidentStatus object from the list response.
 */
export function inlineIncidentFromTestCase(testCase: TestCase): TestIncident | undefined {
  const value = testCase.incidentStatus;
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  return value;
}

/**
 * Official hasEditPermission for inline incident cells:
 * !deleted && (isEditAllowed || can(EditStatus)).
 */
export function canEditTestCaseListIncident(
  testCase: TestCase,
  entityPermissions: Record<string, ResourcePermission> | undefined,
  isEditAllowed = false,
): boolean {
  if (testCase.deleted) {
    return false;
  }
  if (isEditAllowed) {
    return true;
  }
  const inline = testCase.id ? entityPermissions?.[testCase.id] : undefined;
  const rowOps: OperationPermissions = inline
    ? toOperationPermissions(inline)
    : DEFAULT_ENTITY_PERMISSION;
  return getDerivedPermissionFlags(rowOps, false).can('EditStatus');
}