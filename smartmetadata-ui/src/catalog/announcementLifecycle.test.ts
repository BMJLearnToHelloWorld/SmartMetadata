/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import {
  compareAnnouncements,
  getAnnouncementLifecycle,
  getAnnouncementStatus,
} from './announcementLifecycle';
import type { Announcement } from '@/types/collaboration';

const NOW = Date.now();

function announcement(overrides: Partial<Announcement>): Announcement {
  return {
    id: 'a1',
    startTime: NOW - 1000,
    endTime: NOW + 1000,
    ...overrides,
  };
}

describe('announcement lifecycle', () => {
  it('derives status from the window, not the stored field', () => {
    expect(getAnnouncementStatus(announcement({}))).toBe('Active');
    expect(
      getAnnouncementStatus(announcement({ startTime: NOW + 1000, endTime: NOW + 2000 })),
    ).toBe('Scheduled');
    expect(
      getAnnouncementStatus(announcement({ startTime: NOW - 2000, endTime: NOW - 1000 })),
    ).toBe('Expired');
    // A stored Active that has since expired reads as Expired.
    expect(
      getAnnouncementStatus(
        announcement({ startTime: NOW - 2000, endTime: NOW - 1000, announcementStatus: 'Active' }),
      ),
    ).toBe('Expired');
  });

  it('only live announcements are dismissible, with the explaining timestamp', () => {
    const live = getAnnouncementLifecycle(
      announcement({ updatedAt: NOW - 500, createdAt: NOW - 900 }),
    );
    expect(live.isDismissible).toBe(true);
    expect(live.timestamp).toBe(NOW - 500);
    const scheduled = getAnnouncementLifecycle(
      announcement({ startTime: NOW + 1000, endTime: NOW + 2000 }),
    );
    expect(scheduled.isDismissible).toBe(false);
    expect(scheduled.timestamp).toBe(NOW + 1000);
    const expired = getAnnouncementLifecycle(
      announcement({ startTime: NOW - 2000, endTime: NOW - 1000 }),
    );
    expect(expired.isDismissible).toBe(false);
    expect(expired.timestamp).toBe(NOW - 1000);
  });

  it('sorts Active first, then Scheduled, then Expired, newest start first within a rank', () => {
    const active = announcement({ id: 'active', startTime: NOW - 1000 });
    const scheduled = announcement({ id: 'sched', startTime: NOW + 5000, endTime: NOW + 6000 });
    const expired = announcement({ id: 'exp', startTime: NOW - 5000, endTime: NOW - 4000 });
    const activeNewer = announcement({ id: 'active-new', startTime: NOW - 100 });
    expect([scheduled, expired, activeNewer, active].sort(compareAnnouncements).map((a) => a.id)).toEqual([
      'active-new',
      'active',
      'sched',
      'exp',
    ]);
  });
});
