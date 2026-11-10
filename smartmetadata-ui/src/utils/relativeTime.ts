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
