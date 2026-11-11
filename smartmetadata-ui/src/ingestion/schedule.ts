/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
/**
 * Port of official `utils/CronExpressionUtils.ts` and
 * `constants/Schedular.constants.ts` (pin a3012259ca).
 *
 * The schedule step is a period picker (hour / day / week / month /
 * custom) plus an On Demand card (empty cron). New pipelines default to
 * daily `0 0 * * *`; editing keeps the saved value, and an empty cron
 * means on-demand — it is never backfilled with the default.
 *
 * `cronValidator` mirrors official exactly, including the cronstrue
 * readability check that rejects sub-hour frequencies: a cron whose
 * description reads "Every N minute(s)" is rejected. It resolves to the
 * i18n key of the failure (callers translate with `t()`), or `undefined`
 * when the value is valid. An empty value is valid (on-demand).
 */
export type SchedulePeriod = 'hour' | 'day' | 'week' | 'month' | 'custom';

export interface ScheduleStateValue {
  selectedPeriod: string;
  cron?: string;
  min?: string;
  hour?: string;
  dow?: string;
  dom?: string;
}

export const PERIOD_OPTIONS: ReadonlyArray<{ label: string; value: SchedulePeriod }> = [
  { label: 'label.hour', value: 'hour' },
  { label: 'label.day', value: 'day' },
  { label: 'label.week', value: 'week' },
  { label: 'label.month', value: 'month' },
  { label: 'label.custom', value: 'custom' },
];

export const DAY_OPTIONS: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'Sunday', value: '0' },
  { label: 'Monday', value: '1' },
  { label: 'Tuesday', value: '2' },
  { label: 'Wednesday', value: '3' },
  { label: 'Thursday', value: '4' },
  { label: 'Friday', value: '5' },
  { label: 'Saturday', value: '6' },
];

export const DAY_IN_MONTH_OPTIONS: ReadonlyArray<{ label: string; value: string }> = Array.from(
  { length: 31 },
  (_, index) => ({ label: String(index + 1), value: String(index + 1) }),
);

export const CRON_COMBINATIONS: Record<string, RegExp> = {
  hour: /^\d{1,2}\s(\*\s){3}\*$/, // "? * * * *"
  day: /^(\d{1,2}\s){2}(\*\s){2}\*$/, // "? ? * * *"
  week: /^(\d{1,2}\s){2}(\*\s){2}\d{1,2}$/, // "? ? * * ?"
  month: /^(\d{1,2}\s){3}\*\s\*$/, // "? ? ? * *"
};

export const DEFAULT_SCHEDULE_CRON_HOURLY = '0 * * * *';
export const DEFAULT_SCHEDULE_CRON_DAILY = '0 0 * * *';
export const DEFAULT_SCHEDULE_CRON_WEEKLY = '0 0 * * 1';
export const DEFAULT_SCHEDULE_CRON_MONTHLY = '0 0 1 * *';

// MINUTE: 0-59
export const MINUTE_PATTERN =
  /^(\*|\*\/\d+|([0-5]?\d)(-([0-5]?\d))?(\/\d+)?(,([0-5]?\d)(-([0-5]?\d))?(\/\d+)?)*)$/;

// HOUR: 0-23
export const HOUR_PATTERN =
  /^(\*|\*\/\d+|([01]?\d|2[0-3])(-([01]?\d|2[0-3]))?(\/\d+)?(,([01]?\d|2[0-3])(-([01]?\d|2[0-3]))?(\/\d+)?)*)$/;

// DAY OF MONTH: 1-31
export const DAY_OF_MONTH_PATTERN =
  /^(\*|\*\/\d+|([1-9]|[12]\d|3[01])(-([1-9]|[12]\d|3[01]))?(\/\d+)?(,([1-9]|[12]\d|3[01])(-([1-9]|[12]\d|3[01]))?(\/\d+)?)*)$/;

// MONTH: 1-12 or JAN-DEC
export const MONTH_PATTERN = new RegExp(
  '^(\\*|\\*\\/\\d+|([1-9]|1[0-2]|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)' +
    '(-([1-9]|1[0-2]|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC))?(\\/\\d+)?' +
    '(,([1-9]|1[0-2]|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)' +
    '(-([1-9]|1[0-2]|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC))?(\\/\\d+)?)*)$',
  'i',
);

// DAY OF WEEK: 0-6 or SUN-SAT
export const DAY_OF_WEEK_PATTERN =
  /^(\*|\*\/\d+|([0-6]|SUN|MON|TUE|WED|THU|FRI|SAT)(-([0-6]|SUN|MON|TUE|WED|THU|FRI|SAT))?(\/\d+)?(,([0-6]|SUN|MON|TUE|WED|THU|FRI|SAT)(-([0-6]|SUN|MON|TUE|WED|THU|FRI|SAT))?(\/\d+)?)*)$/i;

export const getScheduleOptionsFromSchedules = (scheduleOptions: string[]): string[] => {
  return scheduleOptions.map((scheduleOption) => {
    switch (scheduleOption) {
      case 'run_once':
        return '';
      case 'hourly':
        return 'hour';
      case 'daily':
        return 'day';
      case 'weekly':
        return 'week';
      case 'monthly':
        return 'month';
    }

    return '';
  });
};

export const getMinuteCron = (value: Partial<ScheduleStateValue>): string => {
  return `*/${value.min} * * * *`;
};

export const getHourCron = (value: Partial<ScheduleStateValue>): string => {
  return `${value.min} * * * *`;
};

export const getDayCron = (value: Partial<ScheduleStateValue>): string => {
  return `${value.min} ${value.hour} * * *`;
};

export const getWeekCron = (value: Partial<ScheduleStateValue>): string => {
  return `${value.min} ${value.hour} * * ${value.dow}`;
};

export const getMonthCron = (value: Partial<ScheduleStateValue>): string => {
  return `${value.min} ${value.hour} ${value.dom} * ${value.dow}`;
};

export const getCron = (state: ScheduleStateValue): string | undefined => {
  const { selectedPeriod, cron } = state;

  switch (selectedPeriod) {
    case 'hour':
      return getHourCron(state);
    case 'day':
      return getDayCron(state);
    case 'week':
      return getWeekCron(state);
    case 'month':
      return getMonthCron(state);
    default:
      return cron;
  }
};

const getCronType = (cronStr: string): string => {
  for (const c in CRON_COMBINATIONS) {
    if (CRON_COMBINATIONS[c]?.test(cronStr)) {
      return c;
    }
  }

  return 'custom';
};

export const getStateValue = (value?: string, defaultValue?: string): ScheduleStateValue => {
  const a = value?.split(' ');
  const d = a ?? defaultValue?.split(' ') ?? [];

  const min = d[0];
  const hour = d[1];
  const dom = d[2];
  const dow = d[4];

  const cronType = getCronType(value ?? defaultValue ?? '');

  const stateVal: ScheduleStateValue = {
    selectedPeriod: cronType,
    cron: value,
    min,
    hour,
    dow,
    dom,
  };

  return stateVal;
};

export const getCronDefaultValue = (appName: string): string => {
  const value = {
    min: '0',
    hour: '0',
  };

  let initialValue = getDayCron(value);

  if (appName === 'DataInsightsReportApplication') {
    initialValue = getWeekCron({ ...value, dow: '0' });
  }

  return initialValue;
};

export const getDefaultScheduleFromPeriod = (includePeriodOptions: string[]): string => {
  if (includePeriodOptions.includes('day')) {
    return DEFAULT_SCHEDULE_CRON_DAILY;
  } else if (includePeriodOptions.includes('week')) {
    return DEFAULT_SCHEDULE_CRON_WEEKLY;
  } else if (includePeriodOptions.includes('month')) {
    return DEFAULT_SCHEDULE_CRON_MONTHLY;
  } else if (includePeriodOptions.includes('hour')) {
    return DEFAULT_SCHEDULE_CRON_HOURLY;
  }

  return DEFAULT_SCHEDULE_CRON_DAILY;
};

export const getDefaultScheduleValue = ({
  defaultSchedule,
  includePeriodOptions,
  allowNoSchedule = false,
}: {
  defaultSchedule?: string;
  includePeriodOptions?: string[];
  allowNoSchedule?: boolean;
}): string | undefined => {
  if (includePeriodOptions === undefined) {
    return allowNoSchedule ? defaultSchedule : defaultSchedule || DEFAULT_SCHEDULE_CRON_DAILY;
  }

  if (allowNoSchedule && defaultSchedule === undefined) {
    return defaultSchedule;
  }

  return getDefaultScheduleFromPeriod(includePeriodOptions);
};

type CronPeriodFields = Pick<ScheduleStateValue, 'min' | 'hour' | 'dow' | 'dom'>;

const PERIOD_CRON_RESOLVERS: Record<
  string,
  (fields: CronPeriodFields, cronValue?: string[]) => Partial<CronPeriodFields>
> = {
  week: ({ dow }) => ({ dow: isNaN(Number(dow)) ? '1' : dow, dom: '*' }),
  month: ({ dom }) => ({ dom: isNaN(Number(dom)) ? '1' : dom, dow: '*' }),
  custom: (_fields, cronValue) => ({
    min: cronValue?.[0] ?? '0',
    hour: cronValue?.[1] ?? '0',
    dom: cronValue?.[2] ?? '*',
    dow: cronValue?.[4] ?? '*',
  }),
};

export const getUpdatedStateFromFormState = (
  currentState: ScheduleStateValue,
  formValues: ScheduleStateValue,
): ScheduleStateValue => {
  try {
    const newState = { ...currentState, ...formValues };
    let { min, hour } = newState;
    const { dow, dom } = newState;

    min = isNaN(Number(min)) ? '0' : min;
    hour = isNaN(Number(hour)) ? '0' : hour;
    const cronValue = newState.cron?.split(' ');

    const resolvePeriodFields = PERIOD_CRON_RESOLVERS[newState.selectedPeriod];
    const periodFields = resolvePeriodFields
      ? resolvePeriodFields({ min, hour, dow, dom }, cronValue)
      : {};

    return {
      ...newState,
      min,
      hour,
      dow,
      dom,
      ...periodFields,
    };
  } catch {
    return { ...currentState, ...formValues };
  }
};

/**
 * Official `cronValidator` (`utils/CronExpressionUtils.ts:226-284`):
 * empty is valid (on-demand); otherwise exactly 5 segments, each matching
 * its segment pattern, then cronstrue readability — a description of
 * "Every N minute(s)" (or seconds) rejects the cron as sub-hour. Resolves
 * to the failing message's i18n key, or `undefined` when valid.
 */
export const cronValidator = async (value: string): Promise<string | undefined> => {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return undefined;
  }

  const cronParts = trimmedValue.split(' ');

  if (cronParts.length !== 5) {
    return 'message.cron-invalid-field-count';
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = cronParts;

  if (!MINUTE_PATTERN.test(minute ?? '')) {
    return 'message.cron-invalid-minute-field';
  }
  if (!HOUR_PATTERN.test(hour ?? '')) {
    return 'message.cron-invalid-hour-field';
  }
  if (!DAY_OF_MONTH_PATTERN.test(dayOfMonth ?? '')) {
    return 'message.cron-invalid-day-of-month-field';
  }
  if (!MONTH_PATTERN.test(month ?? '')) {
    return 'message.cron-invalid-month-field';
  }
  if (!DAY_OF_WEEK_PATTERN.test(dayOfWeek ?? '')) {
    return 'message.cron-invalid-day-of-week-field';
  }

  try {
    const cronstrue = (await import('cronstrue')).default;
    const description = cronstrue.toString(trimmedValue);

    const isFrequencyInMinutes = /Every \d* *minute/.test(description);
    const isFrequencyInSeconds = /Every \d* *second/.test(description);

    if (isFrequencyInMinutes || isFrequencyInSeconds) {
      return 'message.cron-less-than-hour-message';
    }

    return undefined;
  } catch {
    return 'message.cron-invalid-expression';
  }
};

/**
 * Port of official `Steps/ScheduleInterval.utils.ts`
 * (`validateCronExpression`) and `Steps/ScheduleInterval.constants.ts`
 * (`CRON_FIELD_PATTERNS`, `CRON_FIELD_ERROR_KEYS`).
 *
 * This is the synchronous validator the schedule field runs on every
 * keystroke. Unlike the async `cronValidator` (which judges sub-hour
 * frequency from cronstrue's description), it expands the minute field's
 * validated 0-59 grammar: any minute field that can fire more than once
 * an hour — star, a step, `0,30`, a range — rejects as sub-hour. It also
 * rejects descending minute ranges (`30-10`).
 */
export const CRON_FIELD_PATTERNS = [
  MINUTE_PATTERN,
  HOUR_PATTERN,
  DAY_OF_MONTH_PATTERN,
  MONTH_PATTERN,
  DAY_OF_WEEK_PATTERN,
];

export const CRON_FIELD_ERROR_KEYS = [
  'message.cron-invalid-minute-field',
  'message.cron-invalid-hour-field',
  'message.cron-invalid-day-of-month-field',
  'message.cron-invalid-month-field',
  'message.cron-invalid-day-of-week-field',
];

const getMinuteRange = (range: string, hasStep: boolean): [number, number] => {
  if (range === '*') {
    return [0, 59];
  }

  if (range.includes('-')) {
    const [start, end] = range.split('-').map(Number);

    return [start, end];
  }

  const start = Number(range);

  return [start, hasStep ? 59 : start];
};

const hasDescendingMinuteRange = (minuteField: string): boolean =>
  minuteField.split(',').some((segment) => {
    const [range] = segment.split('/');
    if (!range.includes('-')) {
      return false;
    }
    const [start, end] = range.split('-').map(Number);
    return start > end;
  });

const hasMultipleRunsPerHour = (minuteField: string): boolean => {
  const minutes = new Set<number>();

  for (const segment of minuteField.split(',')) {
    const [range, stepValue] = segment.split('/');
    const step = stepValue ? Number(stepValue) : 1;

    if (step <= 0) {
      return true;
    }

    const [start, end] = getMinuteRange(range, Boolean(stepValue));

    for (let minute = start; minute <= end; minute += step) {
      minutes.add(minute);
      if (minutes.size > 1) {
        return true;
      }
    }
  }

  return false;
};

export const validateCronExpression = (cron: string): string | undefined => {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== CRON_FIELD_PATTERNS.length) {
    return 'message.cron-invalid-field-count';
  }

  for (let i = 0; i < parts.length; i++) {
    if (!CRON_FIELD_PATTERNS[i]?.test(parts[i] ?? '')) {
      return CRON_FIELD_ERROR_KEYS[i];
    }
  }

  if (hasDescendingMinuteRange(parts[0] ?? '')) {
    return CRON_FIELD_ERROR_KEYS[0];
  }

  // Only the minute field can schedule multiple executions within an hour.
  // Expanding its validated 0-59 grammar keeps this synchronous for input-time validation.
  if (hasMultipleRunsPerHour(parts[0] ?? '')) {
    return 'message.cron-less-than-hour-message';
  }

  return undefined;
};
