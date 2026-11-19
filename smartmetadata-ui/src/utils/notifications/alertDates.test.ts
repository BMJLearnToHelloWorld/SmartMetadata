/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the Apache License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import { formatAlertDateTime, formatAnnouncementDate } from './alertDates';

describe('alert dates', () => {
  it('renders the event timestamp with date and time', () => {
    const rendered = formatAlertDateTime(new Date(2026, 10, 18, 9, 30, 0).getTime(), 'en-US');
    expect(rendered).toContain('2026');
    expect(rendered).toContain('9:30');
  });

  it('renders announcement dates in DATE_MED shape', () => {
    expect(formatAnnouncementDate(new Date(2026, 10, 18).getTime(), 'en-US')).toBe('Nov 18, 2026');
    expect(formatAnnouncementDate(new Date(2026, 0, 5).getTime(), 'en-US')).toBe('Jan 5, 2026');
  });
});
