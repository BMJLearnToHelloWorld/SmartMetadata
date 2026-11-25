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
 * Pin `DateTimeUtils.formatDate` (DATE_MED): "Nov 22, 2026" in the
 * viewer's locale. The product renders with the platform Intl
 * formatters (same shape as `utils/notifications/alertDates.ts`
 * `formatAnnouncementDate`); this is the shared home for that shape so
 * the insight tooltip header and the insight date-range text use one
 * formatter. Accepts epoch millis or an ISO `YYYY-MM-DD` label (the
 * chart axis label); an ISO label is parsed as a UTC day so the date
 * never shifts across timezones.
 */
export function formatMediumDate(value: number | string, locale?: string): string {
  let date: Date;
  if (typeof value === 'string') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return '';
    }
    date = new Date(`${value}T00:00:00Z`);
  } else {
    if (!Number.isFinite(value)) {
      return '';
    }
    date = new Date(value);
  }
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
