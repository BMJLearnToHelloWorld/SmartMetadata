/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import {
  cronstrueLocaleFor,
  ensureCronstrueLoaded,
  getScheduleDescriptionTexts,
} from './scheduleDescription';

describe('scheduleDescription (P-44)', () => {
  it('parses a daily cron into the official two-line description', async () => {
    await ensureCronstrueLoaded();
    const texts = getScheduleDescriptionTexts('0 0 * * *');
    expect(texts.descriptionFirstPart).toBe('At 12:00 AM');
    expect(texts.descriptionSecondPart).toBe('Every day');
  });

  it('returns empty strings for an unparsable cron, never a hand-written guess', async () => {
    await ensureCronstrueLoaded();
    expect(getScheduleDescriptionTexts('not a cron')).toEqual({
      descriptionFirstPart: '',
      descriptionSecondPart: '',
    });
    expect(getScheduleDescriptionTexts(undefined)).toEqual({
      descriptionFirstPart: '',
      descriptionSecondPart: '',
    });
  });

  it('maps BCP 47 locales to cronstrue locale names', () => {
    expect(cronstrueLocaleFor('zh-CN')).toBe('zh_CN');
    expect(cronstrueLocaleFor('zh')).toBe('zh_CN');
    expect(cronstrueLocaleFor('en-US')).toBe('en');
  });
});
