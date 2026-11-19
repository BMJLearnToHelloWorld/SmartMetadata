/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it, vi } from 'vitest';
import {
  ANNOUNCEMENTS_LIST_PATH,
  copyAnnouncementTitle,
  fromCalendarValue,
  getAnnouncementColorOptions,
  getAnnouncementFormPath,
  getAnnouncementStatus,
  getAnnouncementTypeConfig,
  getAnnouncementTypeLabel,
  getSystemAnnouncementDefaultValues,
  hasAnnouncementFormErrors,
  pickPatchedAnnouncement,
  searchSystemAnnouncements,
  toAnnouncementTypeFields,
  toCalendarDay,
  toPlainDescription,
  validateAnnouncementForm,
} from './announcementUtils';
import type { Announcement } from '@/types/collaboration';
import type { AnnouncementFormValues } from '@/types/notifications';
import type { TranslateFn } from './alertUtils';

const t: TranslateFn = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key) as TranslateFn;

describe('getAnnouncementTypeConfig', () => {
  it('derives colour from type except for Custom', () => {
    expect(getAnnouncementTypeConfig({ type: 'Critical', color: 'blue' })).toEqual({
      color: 'error',
      iconKey: 'alert-circle',
      labelKey: 'label.critical',
    });
    expect(getAnnouncementTypeConfig({ type: 'Custom', color: 'orange', customTypeName: '  Ops ' })).toEqual({
      color: 'orange',
      iconKey: 'announcement',
      labelKey: 'label.custom',
      customLabel: 'Ops',
    });
    expect(getAnnouncementTypeConfig({ type: 'Custom' }).color).toBe('pink');
    expect(getAnnouncementTypeConfig({}).labelKey).toBe('label.notice');
    expect(getAnnouncementTypeConfig({ type: 'Bogus' }).labelKey).toBe('label.notice');
  });

  it('labels with the custom name when present', () => {
    const config = getAnnouncementTypeConfig({ type: 'Custom', customTypeName: 'Ops' });
    expect(getAnnouncementTypeLabel(config, t)).toBe('Ops');
    expect(
      getAnnouncementTypeLabel(getAnnouncementTypeConfig({ type: 'Warning' }), t),
    ).toBe('label.warning');
  });
});

describe('getAnnouncementStatus', () => {
  it('derives Scheduled/Active/Expired from the window, boundaries included', () => {
    const now = 1_700_000_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      expect(getAnnouncementStatus({ startTime: now + 10000, endTime: now + 20000 })).toBe(
        'Scheduled',
      );
      expect(getAnnouncementStatus({ startTime: now - 10000, endTime: now + 10000 })).toBe('Active');
      expect(getAnnouncementStatus({ startTime: now - 20000, endTime: now - 10000 })).toBe('Expired');
      // Pin's strict inequalities: the window opens strictly after
      // start and closes strictly before end, so both exact
      // boundaries read Expired.
      expect(getAnnouncementStatus({ startTime: now, endTime: now + 10000 })).toBe('Expired');
      expect(getAnnouncementStatus({ startTime: now - 10000, endTime: now })).toBe('Expired');
    } finally {
      nowSpy.mockRestore();
    }
  });
});

describe('calendar day helpers', () => {
  it('round-trips days with the end anchored at 23:59:59.999', () => {
    const start = fromCalendarValue('2026-11-18', 'start');
    const end = fromCalendarValue('2026-11-18', 'end');
    expect(start).not.toBeNull();
    expect(end).not.toBeNull();
    expect(toCalendarDay(start!)).toBe('2026-11-18');
    expect(toCalendarDay(end!)).toBe('2026-11-18');
    expect(end! - start!).toBe(24 * 60 * 60 * 1000 - 1);
    expect(fromCalendarValue(null)).toBeNull();
    expect(fromCalendarValue('')).toBeNull();
  });
});

describe('toAnnouncementTypeFields', () => {
  it('drops colour and name outside Custom and trims the name', () => {
    expect(
      toAnnouncementTypeFields({ type: 'Notice', color: 'pink', customTypeName: 'Ops' }),
    ).toEqual({ type: 'Notice', color: undefined, customTypeName: undefined });
    expect(
      toAnnouncementTypeFields({ type: 'Custom', color: 'pink', customTypeName: '  Ops  ' }),
    ).toEqual({ type: 'Custom', color: 'pink', customTypeName: 'Ops' });
    expect(toAnnouncementTypeFields({ type: 'Custom', customTypeName: '   ' })).toEqual({
      type: 'Custom',
      color: undefined,
      customTypeName: undefined,
    });
  });
});

describe('toPlainDescription', () => {
  it('unwraps a single paragraph and decodes entities', () => {
    expect(toPlainDescription('<p>Tom &amp; Jerry</p>')).toBe('Tom & Jerry');
    expect(toPlainDescription('<p class="x">hi</p>')).toBe('hi');
  });

  it('leaves richer markup and plain text verbatim', () => {
    expect(toPlainDescription('<p>one</p><p>two</p>')).toBe('<p>one</p><p>two</p>');
    expect(toPlainDescription('<p><a href="/x">link</a></p>')).toBe('<p><a href="/x">link</a></p>');
    expect(toPlainDescription('plain')).toBe('plain');
    expect(toPlainDescription(undefined)).toBe('');
  });
});

describe('searchSystemAnnouncements', () => {
  const rows: Announcement[] = [
    { id: '1', name: 'a', displayName: 'Downtime', startTime: 100, endTime: 200 },
    { id: '2', name: 'b', displayName: 'Release', startTime: 300, endTime: 400 },
    { id: '3', name: 'c', startTime: 200, endTime: 300 },
  ];

  it('filters by title case-insensitively and sorts newest start first', () => {
    expect(searchSystemAnnouncements(rows, '')).toEqual([rows[1], rows[2], rows[0]]);
    expect(searchSystemAnnouncements(rows, '  DOWN ')).toEqual([rows[0]]);
    expect(searchSystemAnnouncements(rows, 'c')).toEqual([rows[2]]);
  });
});

describe('pickPatchedAnnouncement', () => {
  it('keeps only the seven patched keys, skipping undefined', () => {
    expect(
      pickPatchedAnnouncement({
        displayName: 'T',
        description: undefined,
        startTime: 1,
        entityLink: 'x',
        id: '9',
      }),
    ).toEqual({ displayName: 'T', startTime: 1 });
  });
});

describe('getAnnouncementColorOptions', () => {
  it('offers the five custom colours and appends a stored off-list colour', () => {
    expect(getAnnouncementColorOptions()).toEqual(['pink', 'success', 'orange', 'blue', 'error']);
    expect(getAnnouncementColorOptions('purple')).toEqual([
      'pink',
      'success',
      'orange',
      'blue',
      'error',
      'purple',
    ]);
    expect(getAnnouncementColorOptions('pink')).toEqual([
      'pink',
      'success',
      'orange',
      'blue',
      'error',
    ]);
  });
});

describe('copyAnnouncementTitle', () => {
  it('localizes the copy suffix first, then truncates to 124 code units', () => {
    expect(copyAnnouncementTitle('Downtime', t)).toBe(
      'label.entity-copy:{"entity":"Downtime"}',
    );
    const long = copyAnnouncementTitle('x'.repeat(200), t);
    expect(long.length).toBe(124);
  });
});

describe('getSystemAnnouncementDefaultValues', () => {
  const copyTitle = (title: string): string => `${title} (copy)`;
  const stored: Announcement = {
    id: 'a1',
    name: 'announcement-x',
    displayName: 'Downtime',
    description: '<p>Scheduled</p>',
    type: 'Custom',
    color: 'pink',
    customTypeName: 'Outage',
    startTime: 100,
    endTime: 200,
  };

  it('starts create empty with null dates and the Notice default', () => {
    expect(getSystemAnnouncementDefaultValues('create', copyTitle)).toEqual({
      title: '',
      description: '',
      type: 'Notice',
      startTime: null,
      endTime: null,
    });
  });

  it('starts edit from the stored values, description verbatim', () => {
    expect(getSystemAnnouncementDefaultValues('edit', copyTitle, stored)).toEqual({
      title: 'Downtime',
      description: '<p>Scheduled</p>',
      type: 'Custom',
      color: 'pink',
      customTypeName: 'Outage',
      startTime: 100,
      endTime: 200,
    });
  });

  it('starts duplicate with the copy title and everything else kept', () => {
    const values = getSystemAnnouncementDefaultValues('duplicate', copyTitle, stored);
    expect(values.title).toBe('Downtime (copy)');
    expect(values.description).toBe('<p>Scheduled</p>');
    expect(values.type).toBe('Custom');
    expect(values.color).toBe('pink');
    expect(values.startTime).toBe(100);
    expect(values.endTime).toBe(200);
  });

  it('falls back to the name when the stored announcement has no displayName', () => {
    const nameless = { ...stored, displayName: undefined };
    expect(getSystemAnnouncementDefaultValues('edit', copyTitle, nameless).title).toBe(
      'announcement-x',
    );
  });
});

describe('validateAnnouncementForm', () => {
  const valid: AnnouncementFormValues = {
    title: 'Downtime window',
    description: 'Scheduled maintenance',
    startTime: 100,
    endTime: 200,
    type: 'Notice',
  };

  it('passes a complete form', () => {
    expect(validateAnnouncementForm(valid, t)).toEqual({});
    expect(hasAnnouncementFormErrors(validateAnnouncementForm(valid, t))).toBe(false);
  });

  it('requires a non-blank title, in RHF rule order', () => {
    // '' skips the length checks and fails `validate`.
    expect(validateAnnouncementForm({ ...valid, title: '' }, t).title).toBe(
      'message.field-text-is-required:{"fieldText":"label.title"}',
    );
    // 1–4 spaces are non-empty, so minLength fires before `validate`.
    expect(validateAnnouncementForm({ ...valid, title: '  ' }, t).title).toBe(
      'message.entity-size-in-between:{"entity":"label.title","min":5,"max":124}',
    );
    // 5+ spaces pass the length checks and fail `validate`.
    expect(validateAnnouncementForm({ ...valid, title: '     ' }, t).title).toBe(
      'message.field-text-is-required:{"fieldText":"label.title"}',
    );
    expect(validateAnnouncementForm({ ...valid, title: 'abcd' }, t).title).toBe(
      'message.entity-size-in-between:{"entity":"label.title","min":5,"max":124}',
    );
    expect(validateAnnouncementForm({ ...valid, title: 'abcde' }, t).title).toBeUndefined();
  });

  it('marks an over-long title invalid with no message', () => {
    expect(validateAnnouncementForm({ ...valid, title: 'x'.repeat(125) }, t).title).toBe(true);
    expect(validateAnnouncementForm({ ...valid, title: 'x'.repeat(124) }, t).title).toBeUndefined();
  });

  it('requires both dates and end after start', () => {
    expect(validateAnnouncementForm({ ...valid, startTime: null }, t).startTime).toBe(
      'message.field-text-is-required:{"fieldText":"label.start-date"}',
    );
    expect(validateAnnouncementForm({ ...valid, endTime: null }, t).endTime).toBe(
      'message.field-text-is-required:{"fieldText":"label.end-date"}',
    );
    expect(validateAnnouncementForm({ ...valid, endTime: 100 }, t).endTime).toBe(
      'message.announcement-invalid-start-time',
    );
    expect(validateAnnouncementForm({ ...valid, endTime: 99 }, t).endTime).toBe(
      'message.announcement-invalid-start-time',
    );
  });

  it('requires a non-empty description by content', () => {
    expect(validateAnnouncementForm({ ...valid, description: '' }, t).description).toBe(
      'message.field-text-is-required:{"fieldText":"label.description"}',
    );
    expect(validateAnnouncementForm({ ...valid, description: '<p></p>' }, t).description).toBe(
      'message.field-text-is-required:{"fieldText":"label.description"}',
    );
    // Pin's emptiness rule matches only a single empty `<p>`; a
    // `<br>` inside it is content, not emptiness.
    expect(validateAnnouncementForm({ ...valid, description: '<p><br></p>' }, t).description).toBe(
      undefined,
    );
  });

  it('requires colour and a non-blank name only on Custom', () => {
    const custom = { ...valid, type: 'Custom' as const };
    expect(validateAnnouncementForm(custom, t).color).toBe(
      'message.field-text-is-required:{"fieldText":"label.color"}',
    );
    expect(validateAnnouncementForm(custom, t).customTypeName).toBe(
      'message.field-text-is-required:{"fieldText":"label.custom-name"}',
    );
    expect(
      validateAnnouncementForm(
        { ...custom, color: 'pink', customTypeName: 'x'.repeat(65) },
        t,
      ).customTypeName,
    ).toBe(true);
    expect(
      validateAnnouncementForm({ ...custom, color: 'pink', customTypeName: 'Outage' }, t),
    ).toEqual({});
    // Non-Custom ignores both, even when values linger from an earlier selection.
    expect(
      validateAnnouncementForm({ ...valid, color: undefined, customTypeName: undefined }, t),
    ).toEqual({});
  });
});

describe('announcement paths', () => {
  it('addresses the list and the id-retained form routes', () => {
    expect(ANNOUNCEMENTS_LIST_PATH).toBe('/settings/notifications/announcements');
    expect(getAnnouncementFormPath('create')).toBe('/settings/notifications/announcements/add');
    expect(getAnnouncementFormPath('edit', 'a1')).toBe(
      '/settings/notifications/announcements/edit/a1',
    );
    expect(getAnnouncementFormPath('duplicate', 'a1')).toBe(
      '/settings/notifications/announcements/duplicate/a1',
    );
  });
});
