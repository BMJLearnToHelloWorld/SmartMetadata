/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
/**
 * Port of official
 * `components/MyData/HomeLandingPage/announcementLifecycle.ts` (+ the
 * status half of `utils/AnnouncementsUtils.ts`): where an announcement
 * sits in its own lifecycle, derived from its start/end window rather
 * than the stored `status` field, which is only a snapshot of the
 * announcement's last write.
 *
 * ADR:2026-11-08-my-data-announcements-rail
 */
import type { Announcement } from '@/types/collaboration';

export type AnnouncementStatus = 'Active' | 'Scheduled' | 'Expired';

export interface AnnouncementLifecycle {
  status: AnnouncementStatus;
  /** Expired/scheduled cards are read-only context — only live ones dismiss. */
  isDismissible: boolean;
  /** The moment that explains the status (relative formatting handles the future). */
  timestamp?: number;
}

export function isActiveAnnouncement(startTime: number, endTime: number): boolean {
  const now = Date.now();
  return now > startTime && now < endTime;
}

export function isScheduledAnnouncement(startTime: number): boolean {
  return Date.now() < startTime;
}

export function getAnnouncementStatus(
  announcement: Pick<Announcement, 'startTime' | 'endTime'>,
): AnnouncementStatus {
  const startTime = announcement.startTime ?? 0;
  const endTime = announcement.endTime ?? 0;
  if (isScheduledAnnouncement(startTime)) {
    return 'Scheduled';
  }
  return isActiveAnnouncement(startTime, endTime) ? 'Active' : 'Expired';
}

const TIMESTAMP_OF: Record<
  AnnouncementStatus,
  (announcement: Pick<Announcement, 'startTime' | 'endTime' | 'updatedAt' | 'createdAt'>) => number | undefined
> = {
  Active: (a) => a.updatedAt ?? a.createdAt,
  Scheduled: (a) => a.startTime,
  Expired: (a) => a.endTime,
};

export function getAnnouncementLifecycle(announcement: Announcement): AnnouncementLifecycle {
  const status = getAnnouncementStatus(announcement);
  return {
    status,
    isDismissible: status === 'Active',
    timestamp: TIMESTAMP_OF[status](announcement),
  };
}

// Active first, then upcoming, then history — the order the "all" dialog lists.
const STATUS_RANK: Record<AnnouncementStatus, number> = {
  Active: 0,
  Scheduled: 1,
  Expired: 2,
};

export function compareAnnouncements(a: Announcement, b: Announcement): number {
  const rank = STATUS_RANK[getAnnouncementStatus(a)] - STATUS_RANK[getAnnouncementStatus(b)];
  return rank !== 0 ? rank : (b.startTime ?? 0) - (a.startTime ?? 0);
}
