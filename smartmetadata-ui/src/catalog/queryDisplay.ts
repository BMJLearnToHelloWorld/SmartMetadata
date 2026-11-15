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
 * Pin QueryCard display rules (components/Database/TableQueries/QueryCard.tsx
 * at a3012259ca): the date header, the duration text, and the line-count
 * badge. Pure functions so the exact rules are testable without mounting.
 */

const ONE_MINUTE_IN_MS = 60000;

/**
 * Pin duration memo: undefined shows nothing; under 1ms prints the raw
 * millisecond value; under a minute prints luxon
 * `Duration.toFormat("s.S 'sec'")` — the whole seconds plus the remainder
 * milliseconds as a plain unpadded integer (1→`0.1`, 1500→`1.500`,
 * 59999→`59.999`, never rounded); otherwise minutes + whole seconds.
 * Every form is prefixed with the translated "Runs for" label, which the
 * caller supplies. The server sends integer millis; a fractional input
 * is floored, matching the minute branch's whole-second rule.
 */
export function formatQueryDuration(
  durationMs: number | undefined,
  runsFor: string,
): string | undefined {
  if (durationMs === undefined) {
    return undefined;
  }
  if (durationMs < 1) {
    return `${runsFor} ${durationMs} ms`;
  }
  if (durationMs < ONE_MINUTE_IN_MS) {
    const wholeMs = Math.floor(durationMs);
    return `${runsFor} ${Math.floor(wholeMs / 1000)}.${wholeMs % 1000} sec`;
  }
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${runsFor} ${minutes} min ${seconds} sec`;
}

/**
 * Pin QUERY_DATE_FORMAT (`'On' MMMM dd 'at' h:mma 'UTC'ZZ`) as rendered by
 * customFormatDateTime: the quoted literals stay literal, the month name
 * and day period follow the viewer's locale, and the offset is the
 * viewer's zone offset. Pin passes `queryDate || 0`, so a missing date
 * formats the epoch rather than rendering empty; this keeps that rule.
 * `timeZone` exists for deterministic tests; callers omit it for local time.
 */
export function formatQueryDate(
  queryDate: number | undefined,
  locale: string,
  timeZone?: string,
): string {
  const date = new Date(queryDate || 0);
  // The month name is formatted on its own: in formatToParts the zh month
  // part is a bare number ("3"), while the standalone long-month format
  // carries the locale's month marker ("3月"), as luxon renders it.
  const monthName = new Intl.DateTimeFormat(locale, { timeZone, month: 'long' }).format(date);
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone,
    month: 'long',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'longOffset',
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  const offset = pick('timeZoneName').replace(/^GMT/, '');
  return `On ${monthName} ${pick('day')} at ${pick('hour')}:${pick('minute')}${pick('dayPeriod')} UTC${offset}`;
}

/** Pin `split(query.query, '\n').length`: an empty SQL string is one line. */
export function sqlLineCount(sql: string | undefined): number {
  return (sql ?? '').split('\n').length;
}

/**
 * Pin `pluralize(lineCount, t('label.line'))`: the singular form only for
 * exactly one line. The caller supplies both translated forms.
 */
export function formatLineCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
