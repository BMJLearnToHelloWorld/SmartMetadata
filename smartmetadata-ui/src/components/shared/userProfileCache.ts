/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { reactive } from 'vue';
import type { PopoverUser } from './popoverTypes';

/**
 * Module-level mirror of the official application-store `userProfilePics`
 * slice (hooks/user-profile/useUserProfile.ts:28,72-76) plus the
 * module-level in-flight list (:28,107-129).
 *
 * The popover data layer writes here on the user branch
 * (useEntityPopoverData.ts) and the avatar layer reads/writes here, so a
 * profile fetched for one card is reused by every avatar of that user.
 * The store is a reactive Map so avatar components update when a fetch
 * lands. Bounded (oldest-first eviction) per the bounded-cache rule; the
 * official store is unbounded, but an unbounded module cache would grow
 * with the catalog.
 */
export const USER_PROFILE_PICS_MAX = 500;

const cache = reactive(new Map<string, PopoverUser>());
const loading = reactive(new Set<string>());

export function getCachedUserProfile(name: string): PopoverUser | undefined {
  return cache.get(name);
}

export function setCachedUserProfile(id: string, user: PopoverUser): void {
  if (!cache.has(id) && cache.size >= USER_PROFILE_PICS_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      cache.delete(oldest);
    }
  }
  cache.set(id, user);
}

export function isProfileLoading(name: string): boolean {
  return loading.has(name);
}

export function markProfileLoading(name: string): void {
  loading.add(name);
}

export function unmarkProfileLoading(name: string): void {
  loading.delete(name);
}

/** Test seam: clears both the cache and the in-flight set. */
export function clearUserProfileCache(): void {
  cache.clear();
  loading.clear();
}
