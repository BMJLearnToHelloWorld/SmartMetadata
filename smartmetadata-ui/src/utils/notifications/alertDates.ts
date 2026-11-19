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
 * Date rendering for the notification surfaces. Pin formats with
 * luxon (DateTimeUtils.formatDateTime and DATE_MED); the product has
 * no date helper and renders with the platform Intl formatters, so
 * these two functions carry the pin shapes in that form, with the
 * viewer's locale passed in from the component.
 */

/** formatDateTime (DateTimeUtils.ts:116-126): the event timestamp, date and time. */
export const formatAlertDateTime = (timestamp: number, locale?: string): string =>
  new Date(timestamp).toLocaleString(locale);

/** DATE_MED: the announcement start/end cell, e.g. "Nov 18, 2026". */
export const formatAnnouncementDate = (timestamp: number, locale?: string): string =>
  new Date(timestamp).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
