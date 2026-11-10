/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { ref, type Ref } from 'vue';

/**
 * Port of official
 * `components/MyData/HomeLandingPage/useDismissedAnnouncements.ts`:
 * announcements the user has dismissed from a Home surface,
 * remembered per user and per surface (`scope`) in `localStorage`.
 *
 * Each Home surface keeps its own list, because each prunes against
 * what *it* shows: the rail lists asset announcements, the critical
 * banner system ones, and a shared list would let one prune the
 * other's dismissals away.
 *
 * The announcements API has no per-user dismiss, so this is
 * browser-local: a dismissal holds across visits on this browser,
 * not across devices. Keyed by user id so a shared browser does not
 * hand one user's dismissals to the next. Without a user id nothing
 * is read or persisted.
 *
 * `prune` drops ids the server no longer returns as live — expired
 * or deleted announcements can never reappear on the surface, so
 * keeping their ids would only grow the stored list for good.
 *
 * ADR:2026-11-08-my-data-announcements-rail
 */

export const DismissedAnnouncementsScope = {
  Rail: 'om-home-dismissed-announcements',
  CriticalBanner: 'om-home-dismissed-critical-announcements',
} as const;

export type DismissedAnnouncementsScopeValue =
  (typeof DismissedAnnouncementsScope)[keyof typeof DismissedAnnouncementsScope];

export function getDismissedAnnouncementsStorageKey(
  userId: string,
  scope: DismissedAnnouncementsScopeValue = DismissedAnnouncementsScope.Rail,
): string {
  return `${scope}:${userId}`;
}

function readDismissed(
  userId: string | undefined,
  scope: DismissedAnnouncementsScopeValue,
): Set<string> {
  if (!userId) {
    return new Set();
  }
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(getDismissedAnnouncementsStorageKey(userId, scope)) ?? '[]',
    );
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === 'string')
        : [],
    );
  } catch {
    return new Set();
  }
}

function writeDismissed(
  userId: string | undefined,
  scope: DismissedAnnouncementsScopeValue,
  ids: Set<string>,
): void {
  if (!userId) {
    return;
  }
  const key = getDismissedAnnouncementsStorageKey(userId, scope);
  try {
    if (ids.size === 0) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify([...ids]));
    }
  } catch {
    // Storage can be full or disabled (private mode); the dismissal
    // still holds for this visit, it just will not outlive it.
  }
}

export interface DismissedAnnouncements {
  dismissedIds: Ref<Set<string>>;
  dismiss: (id: string) => void;
  prune: (liveIds: string[]) => void;
}

export function useDismissedAnnouncements(
  userId: Ref<string | undefined>,
  scope: DismissedAnnouncementsScopeValue = DismissedAnnouncementsScope.Rail,
): DismissedAnnouncements {
  const dismissedIds = ref<Set<string>>(readDismissed(userId.value, scope));

  function dismiss(id: string): void {
    const ids = new Set(dismissedIds.value);
    ids.add(id);
    dismissedIds.value = ids;
    writeDismissed(userId.value, scope, ids);
  }

  function prune(liveIds: string[]): void {
    const live = new Set(liveIds);
    const ids = new Set([...dismissedIds.value].filter((id) => live.has(id)));
    if (ids.size === dismissedIds.value.size) {
      return;
    }
    dismissedIds.value = ids;
    writeDismissed(userId.value, scope, ids);
  }

  return { dismissedIds, dismiss, prune };
}
