/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/** Epoch millis to a locale date-time string; empty when absent. */
export function formatEpoch(epoch?: number): string {
  if (!epoch) {
    return '';
  }
  return new Date(epoch).toLocaleString();
}

/** ISO date string to a locale date; empty when absent or unparsable. */
export function formatDateString(iso?: string): string {
  if (!iso) {
    return '';
  }
  const time = Date.parse(iso);
  if (Number.isNaN(time)) {
    return '';
  }
  return new Date(time).toLocaleDateString();
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Short relative time ("5m ago", "2h ago", "3d ago"), falling back to the
 * locale date for older stamps; empty when absent. Mirrors the official
 * memory citation line, which shows when a memory was last cited.
 */
export function formatRelativeTime(epoch?: number, now: number = Date.now()): string {
  if (!epoch) {
    return '';
  }
  const diff = now - epoch;
  if (diff < 0 || diff >= 30 * DAY_MS) {
    return new Date(epoch).toLocaleDateString();
  }
  if (diff < HOUR_MS) {
    return `${Math.max(1, Math.floor(diff / MINUTE_MS))}m ago`;
  }
  if (diff < DAY_MS) {
    return `${Math.floor(diff / HOUR_MS)}h ago`;
  }
  return `${Math.floor(diff / DAY_MS)}d ago`;
}
