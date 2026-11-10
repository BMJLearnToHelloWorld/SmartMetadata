/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, describe, expect, it } from 'vitest';
import { ref } from 'vue';
import {
  DismissedAnnouncementsScope,
  getDismissedAnnouncementsStorageKey,
  useDismissedAnnouncements,
} from './useDismissedAnnouncements';

afterEach(() => {
  localStorage.clear();
});

describe('useDismissedAnnouncements', () => {
  it('keeps the rail and the critical banner on independent keys', () => {
    const userId = ref('u-1');
    const rail = useDismissedAnnouncements(userId, DismissedAnnouncementsScope.Rail);
    const banner = useDismissedAnnouncements(userId, DismissedAnnouncementsScope.CriticalBanner);
    rail.dismiss('a1');
    expect(rail.dismissedIds.value.has('a1')).toBe(true);
    expect(banner.dismissedIds.value.has('a1')).toBe(false);
    expect(localStorage.getItem(getDismissedAnnouncementsStorageKey('u-1'))).toBe('["a1"]');
    expect(
      localStorage.getItem(
        getDismissedAnnouncementsStorageKey('u-1', DismissedAnnouncementsScope.CriticalBanner),
      ),
    ).toBeNull();
  });

  it('prunes ids the server no longer returns, and deletes the key when empty', () => {
    const userId = ref('u-1');
    const rail = useDismissedAnnouncements(userId);
    rail.dismiss('a1');
    rail.dismiss('a2');
    rail.prune(['a1']);
    expect([...rail.dismissedIds.value]).toEqual(['a1']);
    expect(localStorage.getItem(getDismissedAnnouncementsStorageKey('u-1'))).toBe('["a1"]');
    rail.prune([]);
    expect(rail.dismissedIds.value.size).toBe(0);
    expect(localStorage.getItem(getDismissedAnnouncementsStorageKey('u-1'))).toBeNull();
  });

  it('tolerates malformed stored JSON and an absent user id', () => {
    localStorage.setItem(getDismissedAnnouncementsStorageKey('u-1'), 'not json');
    const rail = useDismissedAnnouncements(ref('u-1'));
    expect(rail.dismissedIds.value.size).toBe(0);
    const anonymous = useDismissedAnnouncements(ref(undefined));
    anonymous.dismiss('a1');
    expect(anonymous.dismissedIds.value.has('a1')).toBe(true);
    expect(localStorage.length).toBe(1);
  });
});
