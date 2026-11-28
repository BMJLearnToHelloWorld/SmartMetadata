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