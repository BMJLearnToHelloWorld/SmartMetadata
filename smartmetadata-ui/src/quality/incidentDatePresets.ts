/**
 * Official incident list date presets (PROFILER_FILTER_RANGE +
 * DatePickerMenu handleOptionClick): now minus N days through now.
 * Custom range stays start-of-day / end-of-day on the picked dates.
 */
export const CUSTOM_DATE_RANGE_KEY = 'customRange';

export const INCIDENT_DATE_PRESETS = [
  { key: 'yesterday', days: 1 },
  { key: 'last3days', days: 3 },
  { key: 'last7days', days: 7 },
  { key: 'last14days', days: 14 },
  { key: 'last30days', days: 30 },
  { key: 'last60days', days: 60 },
] as const;

export type IncidentDatePresetKey = (typeof INCIDENT_DATE_PRESETS)[number]['key'];

export interface IncidentDateRange {
  startTs: number;
  endTs: number;
  key: string;
  title: string;
}

/** Official getEpochMillisForPastDays + getCurrentMillis. */
export function rangeForPreset(days: number, now = Date.now()): { startTs: number; endTs: number } {
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  return { startTs: start.getTime(), endTs: now };
}
