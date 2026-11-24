/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * Recent global searches (Explore D13).
 *
 * Pin `utils/RecentActivityUtils.ts:addToRecentSearched` records every
 * submitted global search term in the user's persistent preferences:
 * exact-term dedup, newest first, capped at 5. The product keeps the
 * same rules in localStorage only (never synced to the server), keyed
 * per user by `auth.user.name` — the same shape as
 * `stores/contextCenterRecent.ts` (G-22 recently-viewed pages), which
 * this module mirrors. Reads and writes live here, never inside a view,
 * so the header search bar and any later surface share one list.
 */
export const MAX_RECENT_SEARCHES = 5;

function storageKey(userKey: string): string {
  return `sm.recentSearches.v1:${userKey}`;
}

function readStored(userKey: string): string[] {
  try {
    const raw = window.localStorage.getItem(storageKey(userKey));
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  } catch {
    // Corrupt local JSON must never white-screen the page.
    return [];
  }
}

/** Recent search terms for one user, newest first. No user key means no entries. */
export function listRecentSearches(userKey?: string): string[] {
  if (!userKey) {
    return [];
  }
  return readStored(userKey).slice(0, MAX_RECENT_SEARCHES);
}

/**
 * Record a submitted search term. Idempotent: re-searching the same term
 * only moves it to the front. Blank terms and missing users record
 * nothing and never throw; a full or denied store must not break
 * navigation, so storage errors are swallowed like the pin's.
 */
export function recordRecentSearch(userKey: string | undefined, term: string): void {
  const trimmed = term.trim();
  if (!userKey || !trimmed) {
    return;
  }
  try {
    const next = [trimmed, ...readStored(userKey).filter((item) => item !== trimmed)].slice(
      0,
      MAX_RECENT_SEARCHES,
    );
    window.localStorage.setItem(storageKey(userKey), JSON.stringify(next));
  } catch {
    // A full or denied store must not break navigation.
  }
}
