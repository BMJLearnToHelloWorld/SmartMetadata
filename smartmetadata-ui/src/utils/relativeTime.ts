/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';
import { readStoredLocale } from '@/i18n/localePreference';

dayjs.extend(relativeTime);

/**
 * Relative time ("3 hours ago"), mirroring official
 * utils/date-time/DateTimeUtils getRelativeTime (Luxon toRelative).
 * The product has no Luxon; dayjs relativeTime is the equivalent
 * already in the dependency tree. The locale follows the stored
 * product locale (zh-CN renders Chinese relative strings).
 */
export function getRelativeTime(timestamp?: number): string {
  if (timestamp === undefined || timestamp === null) {
    return '';
  }
  const locale = readStoredLocale(window.localStorage);
  return dayjs(timestamp)
    .locale(locale === 'zh-CN' ? 'zh-cn' : 'en')
    .fromNow();
}

/**
 * Short unit words for the relative-time shortening below, ported from
 * official enums/common.enum.ts `DATE_TIME_SHORT_UNITS` (pin
 * a3012259ca). Only English unit words shorten: a Chinese relative
 * string has no matching words and passes through unchanged, exactly
 * as in official (Luxon renders the same Chinese long form there).
 */
const DATE_TIME_SHORT_UNITS: Record<string, string> = {
  YEAR: 'yr',
  YEARS: 'yrs',
  MONTH: 'mo',
  MONTHS: 'mos',
  DAY: 'day',
  DAYS: 'days',
  HOUR: 'hr',
  HOURS: 'hrs',
  MINUTE: 'min',
  MINUTES: 'mins',
  SECOND: 'sec',
  SECONDS: 'secs',
};

/**
 * Short relative time ("10 mins ago"), ported from official
 * utils/date-time/DateTimeUtils.ts `getShortRelativeTime`: the long
 * form with each unit word replaced by its short form. Falls back to
 * "" when the timestamp is missing or the long form is empty.
 */
export function getShortRelativeTime(timestamp?: number): string {
  if (timestamp === undefined || timestamp === null) {
    return '';
  }
  const longForm = getRelativeTime(timestamp);
  if (!longForm) {
    return '';
  }
  return longForm
    .split(' ')
    .map((word) => DATE_TIME_SHORT_UNITS[word.toUpperCase()] || word)
    .join(' ');
}
