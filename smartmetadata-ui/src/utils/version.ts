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
 * Version display helpers, ported from pin
 * `utils/Version/Version.ts:26-49` (NavBar help menu, `Version` item).
 *
 * Pin parses the 12-digit build segment with luxon
 * (`DateTime.fromFormat(build, 'yyyyMMddHHMM')`, local zone, `isValid`
 * guard). The product has no date helper, so the parse below uses the
 * platform `Date` in the local zone with a round-trip check standing in
 * for luxon's `isValid` (the `Date` constructor would otherwise roll an
 * impossible field such as month 13 over into the next year).
 */

const BUILD_SEGMENT = /^\d{12}$/;

/**
 * Drops the build segment from a version string for display.
 * "1.13.202609250000" -> "1.13" (pin `getSimplifiedVersion`).
 */
export function getSimplifiedVersion(version?: string): string {
  const parts = (version ?? '').split('.');

  return BUILD_SEGMENT.test(parts.at(-1) ?? '')
    ? parts.slice(0, -1).join('.')
    : parts.join('.');
}

/**
 * Derives the release date from the build segment (YYYYMMDDHHMM) of a
 * version string. Parsed in the local zone so a same-zone format call
 * does not drift a day. Returns undefined for clean releases without a
 * 12-digit build stamp (pin `getVersionReleaseTimestamp`).
 */
export function getVersionReleaseTimestamp(version?: string): number | undefined {
  const build = (version ?? '').split('.').pop() ?? '';
  if (!BUILD_SEGMENT.test(build)) {
    return undefined;
  }
  const year = Number(build.slice(0, 4));
  const month = Number(build.slice(4, 6));
  const day = Number(build.slice(6, 8));
  const hour = Number(build.slice(8, 10));
  const minute = Number(build.slice(10, 12));
  const date = new Date(year, month - 1, day, hour, minute);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return undefined;
  }

  return date.getTime();
}

/**
 * Pin `DateTimeUtils.formatDate` (DATE_MED): "Sep 25, 2026" in the
 * viewer's locale. Same `toLocaleDateString` shape as the notification
 * surfaces' `formatAnnouncementDate` (`utils/notifications/alertDates.ts`).
 */
export function formatReleaseDate(timestamp: number, locale?: string): string {
  return new Date(timestamp).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
