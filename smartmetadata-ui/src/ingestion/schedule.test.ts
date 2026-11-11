/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCHEDULE_CRON_DAILY,
  DEFAULT_SCHEDULE_CRON_HOURLY,
  DEFAULT_SCHEDULE_CRON_MONTHLY,
  DEFAULT_SCHEDULE_CRON_WEEKLY,
  cronValidator,
  getCron,
  getDefaultScheduleFromPeriod,
  getDefaultScheduleValue,
  getScheduleOptionsFromSchedules,
  getStateValue,
  validateCronExpression,
} from './schedule';

describe('schedule constants (official Schedular.constants.ts)', () => {
  it('carries the official default crons', () => {
    expect(DEFAULT_SCHEDULE_CRON_DAILY).toBe('0 0 * * *');
    expect(DEFAULT_SCHEDULE_CRON_HOURLY).toBe('0 * * * *');
    expect(DEFAULT_SCHEDULE_CRON_WEEKLY).toBe('0 0 * * 1');
    expect(DEFAULT_SCHEDULE_CRON_MONTHLY).toBe('0 0 1 * *');
  });
});

describe('getDefaultScheduleFromPeriod (official CronExpressionUtils.ts)', () => {
  it('takes day over week over month over hour', () => {
    expect(getDefaultScheduleFromPeriod(['day', 'week', 'month', 'hour'])).toBe(
      DEFAULT_SCHEDULE_CRON_DAILY,
    );
    expect(getDefaultScheduleFromPeriod(['week', 'month', 'hour'])).toBe(DEFAULT_SCHEDULE_CRON_WEEKLY);
    expect(getDefaultScheduleFromPeriod(['month', 'hour'])).toBe(DEFAULT_SCHEDULE_CRON_MONTHLY);
    expect(getDefaultScheduleFromPeriod(['hour'])).toBe(DEFAULT_SCHEDULE_CRON_HOURLY);
    expect(getDefaultScheduleFromPeriod([])).toBe(DEFAULT_SCHEDULE_CRON_DAILY);
  });
});

describe('getDefaultScheduleValue (official CronExpressionUtils.ts)', () => {
  it('defaults to daily when no period limits apply', () => {
    expect(getDefaultScheduleValue({})).toBe(DEFAULT_SCHEDULE_CRON_DAILY);
    expect(getDefaultScheduleValue({ defaultSchedule: '0 0 * * 1' })).toBe('0 0 * * 1');
  });

  it('returns undefined when no schedule is allowed and none is given', () => {
    expect(getDefaultScheduleValue({ allowNoSchedule: true })).toBeUndefined();
    expect(getDefaultScheduleValue({ defaultSchedule: '0 0 * * *', allowNoSchedule: true })).toBe(
      '0 0 * * *',
    );
  });

  it('picks from the period limits when they are given', () => {
    expect(getDefaultScheduleValue({ includePeriodOptions: ['week'] })).toBe(
      DEFAULT_SCHEDULE_CRON_WEEKLY,
    );
  });
});

describe('getScheduleOptionsFromSchedules (official CronExpressionUtils.ts)', () => {
  it('maps limit names to periods, run_once to empty', () => {
    expect(getScheduleOptionsFromSchedules(['run_once', 'hourly', 'daily', 'weekly', 'monthly'])).toEqual([
      '',
      'hour',
      'day',
      'week',
      'month',
    ]);
  });
});

describe('getCron / getStateValue (official CronExpressionUtils.ts)', () => {
  it('builds period crons from state fields', () => {
    expect(getCron({ selectedPeriod: 'day', min: '30', hour: '4' })).toBe('30 4 * * *');
    expect(getCron({ selectedPeriod: 'week', min: '0', hour: '0', dow: '1' })).toBe('0 0 * * 1');
    expect(getCron({ selectedPeriod: 'month', min: '0', hour: '0', dom: '1', dow: '*' })).toBe(
      '0 0 1 * *',
    );
    expect(getCron({ selectedPeriod: 'hour', min: '15' })).toBe('15 * * * *');
    expect(getCron({ selectedPeriod: 'custom', cron: '0 12 * * 1-5' })).toBe('0 12 * * 1-5');
  });

  it('classifies saved crons into periods', () => {
    expect(getStateValue('0 0 * * *').selectedPeriod).toBe('day');
    expect(getStateValue('0 0 * * 1').selectedPeriod).toBe('week');
    expect(getStateValue('0 0 1 * *').selectedPeriod).toBe('month');
    expect(getStateValue('30 * * * *').selectedPeriod).toBe('hour');
    expect(getStateValue('0 12 * * 1-5').selectedPeriod).toBe('custom');
  });
});

describe('cronValidator (official CronExpressionUtils.ts)', () => {
  it('accepts an empty value (on-demand)', async () => {
    await expect(cronValidator('')).resolves.toBeUndefined();
    await expect(cronValidator('   ')).resolves.toBeUndefined();
  });

  it('accepts the daily default and other hourly-or-slower crons', async () => {
    await expect(cronValidator('0 0 * * *')).resolves.toBeUndefined();
    await expect(cronValidator('30 4 * * 1')).resolves.toBeUndefined();
    await expect(cronValidator('0 0 1 JAN *')).resolves.toBeUndefined();
  });

  it('rejects a wrong segment count', async () => {
    await expect(cronValidator('0 0 * *')).resolves.toBe('message.cron-invalid-field-count');
    await expect(cronValidator('0 0 * * * *')).resolves.toBe('message.cron-invalid-field-count');
  });

  it('rejects each bad segment with its own message key', async () => {
    await expect(cronValidator('60 0 * * *')).resolves.toBe('message.cron-invalid-minute-field');
    await expect(cronValidator('0 24 * * *')).resolves.toBe('message.cron-invalid-hour-field');
    await expect(cronValidator('0 0 32 * *')).resolves.toBe('message.cron-invalid-day-of-month-field');
    await expect(cronValidator('0 0 * 13 *')).resolves.toBe('message.cron-invalid-month-field');
    await expect(cronValidator('0 0 * * 7')).resolves.toBe('message.cron-invalid-day-of-week-field');
  });

  it('rejects sub-hour frequencies (official cronstrue check)', async () => {
    await expect(cronValidator('* * * * *')).resolves.toBe('message.cron-less-than-hour-message');
    await expect(cronValidator('*/5 * * * *')).resolves.toBe('message.cron-less-than-hour-message');
  });

  it('rejects an unreadable expression', async () => {
    await expect(cronValidator('0 0 * * X')).resolves.toBe('message.cron-invalid-day-of-week-field');
  });
});

describe('validateCronExpression (official ScheduleInterval.utils.ts)', () => {
  it('accepts hourly-or-slower crons', () => {
    expect(validateCronExpression('0 0 * * *')).toBeUndefined();
    expect(validateCronExpression('5 * * * *')).toBeUndefined();
    expect(validateCronExpression('0 0 1 JAN *')).toBeUndefined();
  });

  it('rejects a wrong segment count and each bad segment', () => {
    expect(validateCronExpression('0 0 * *')).toBe('message.cron-invalid-field-count');
    expect(validateCronExpression('60 0 * * *')).toBe('message.cron-invalid-minute-field');
    expect(validateCronExpression('0 24 * * *')).toBe('message.cron-invalid-hour-field');
    expect(validateCronExpression('0 0 32 * *')).toBe('message.cron-invalid-day-of-month-field');
    expect(validateCronExpression('0 0 * 13 *')).toBe('message.cron-invalid-month-field');
    expect(validateCronExpression('0 0 * * 7')).toBe('message.cron-invalid-day-of-week-field');
  });

  it('rejects any minute field that can fire more than once an hour', () => {
    expect(validateCronExpression('* * * * *')).toBe('message.cron-less-than-hour-message');
    expect(validateCronExpression('*/5 * * * *')).toBe('message.cron-less-than-hour-message');
    expect(validateCronExpression('0,30 * * * *')).toBe('message.cron-less-than-hour-message');
    expect(validateCronExpression('5-10 * * * *')).toBe('message.cron-less-than-hour-message');
  });

  it('rejects a descending minute range', () => {
    expect(validateCronExpression('30-10 * * * *')).toBe('message.cron-invalid-minute-field');
  });
});
