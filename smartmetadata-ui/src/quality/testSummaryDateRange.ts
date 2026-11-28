/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Official getPastDaysRange (calendarDate.utils) — local midnights, not UTC bounds.
 */
import dayjs from 'dayjs';

export const TEST_SUMMARY_DEFAULT_DAYS = 30;

export interface TestSummaryDateRange {
  startTs: number;
  endTs: number;
}

export function getPastDaysRange(days: number): TestSummaryDateRange {
  const endTs = dayjs().endOf('day').valueOf();
  const startTs = dayjs().startOf('day').subtract(days, 'day').valueOf();
  return { startTs, endTs };
}