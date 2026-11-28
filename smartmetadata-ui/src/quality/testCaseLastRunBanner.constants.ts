/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Official TestCaseLastRunBanner.constants.ts test ids (OSS reference).
 */
export const NO_RUN_BANNER_TEST_ID = 'test-case-last-run-banner-not-run-yet';

export const LAST_RUN_BANNER_TEST_IDS: Record<string, string> = {
  Aborted: 'test-case-last-run-banner-aborted',
  Failed: 'test-case-last-run-banner-failed',
  Queued: 'test-case-last-run-banner-queued',
  Success: 'test-case-last-run-banner-success',
};

export const INCIDENT_STATUS_CONFIG = {
  Ack: { color: 'blue', label: 'label.acknowledged' },
  Assigned: { color: 'orange', label: 'label.assigned' },
  New: { color: 'red', label: 'label.new' },
  Resolved: { color: 'green', label: 'label.resolved' },
} as const;

export const INCIDENT_RUN_STATUSES = new Set(['Aborted', 'Failed']);

export const METRIC_RUN_STATUSES = new Set(['Failed', 'Success']);