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
 * Official DateTimeUtils.convertMillisecondsToHumanReadableFormat
 * (pin a3012259ca), ported without luxon: the same units, the same
 * divisors (luxon counts a year as 365 days and a month as 30 days),
 * the same '0s' for zero and for sub-second durations, the same
 * space-joined parts, and the same '-' prefix for negatives.
 */
const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const MS_PER_MONTH = 30 * MS_PER_DAY;
const MS_PER_YEAR = 365 * MS_PER_DAY;

export function convertMillisecondsToHumanReadableFormat(
  milliseconds: number,
  length?: number,
  showMilliseconds = false,
  prependForNegativeValue = '-',
): string {
  if (
    milliseconds === 0 ||
    (!showMilliseconds && milliseconds > 0 && milliseconds < 1000)
  ) {
    return '0s';
  }
  const isNegative = milliseconds < 0;
  const absoluteMilliseconds = Math.abs(milliseconds);
  const units: Array<{ value: number; suffix: string }> = [
    { value: Math.floor(absoluteMilliseconds / MS_PER_YEAR), suffix: 'Y' },
    {
      value: Math.floor(absoluteMilliseconds / MS_PER_MONTH) % 12,
      suffix: 'M',
    },
    { value: Math.floor(absoluteMilliseconds / MS_PER_DAY) % 30, suffix: 'd' },
    { value: Math.floor(absoluteMilliseconds / MS_PER_HOUR) % 24, suffix: 'h' },
    {
      value: Math.floor(absoluteMilliseconds / MS_PER_MINUTE) % 60,
      suffix: 'm',
    },
    {
      value: Math.floor(absoluteMilliseconds / MS_PER_SECOND) % 60,
      suffix: 's',
    },
  ];
  if (showMilliseconds) {
    units.push({
      value: Math.floor(absoluteMilliseconds) % 1000,
      suffix: 'ms',
    });
  }
  const parts = units
    .filter((unit) => unit.value > 0)
    .map((unit) => `${unit.value}${unit.suffix}`);
  if (parts.length === 0) {
    return '0s';
  }
  const limitedParts =
    length && parts.length > length ? parts.slice(0, length) : parts;
  const formattedResult = limitedParts.join(' ');
  return isNegative
    ? `${prependForNegativeValue}${formattedResult}`
    : formattedResult;
}
