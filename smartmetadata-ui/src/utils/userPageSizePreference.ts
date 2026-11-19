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
 * T-5 page-size preference persistence (07 §2 + R-T5, t350 ruling (a)).
 *
 * Mirrors official `useCurrentUserStore` (`user-preferences-store`):
 * one localStorage key, per-`auth.user.name` entries, merge order
 * default → existing entry → new value. `globalPageSize` is a LOCAL
 * preference: `BACKEND_SYNCED_KEYS` holds only `appMode`, and the
 * backend rejects unregistered preference types — so this module must
 * never import any API client (structural guarantee, §2.6). All page
 * size actions send no server write requests.
 *
 * Storage shape: `{ "version": 1, "preferences": { "<userName>": { "globalPageSize": 25 } } }`.
 *
 * The old Explore key `sm.explore.pageSize.v1` is NOT read, written,
 * claimed or deleted here (Q-T5-3: direct abandonment); the integration
 * line retired it from `shellPreferences`/`SearchView` in the sections
 * batch, so no code references it any more.
 */

import { PAGE_SIZE_BASE } from './pagination';

export const USER_PREFERENCES_KEY = 'sm.userPreferences.v1';

/** The only sizes that may be persisted (R-T5: membership gate, no array-equality gate). */
export const PERSISTABLE_PAGE_SIZES: readonly number[] = [15, 25, 50];

export const DEFAULT_GLOBAL_PAGE_SIZE = PAGE_SIZE_BASE;

export interface UserPreferenceEntry {
  globalPageSize?: number;
  [key: string]: unknown;
}

interface UserPreferencesDocument {
  version: number;
  preferences: Record<string, UserPreferenceEntry>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDocument(raw: string | null): UserPreferencesDocument | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.preferences)) {
      return null;
    }
    return parsed as unknown as UserPreferencesDocument;
  } catch {
    return null;
  }
}

function readDocument(storage: Storage): UserPreferencesDocument {
  return (
    parseDocument(storage.getItem(USER_PREFERENCES_KEY)) ?? { version: 1, preferences: {} }
  );
}

/**
 * Read the current user's persisted page size. Missing entry, missing
 * key, out-of-set value, corrupt JSON, wrong version, or an empty user
 * name all return the default 15 — with no write-back and no throw
 * (read path has no side effects).
 */
export function readGlobalPageSize(storage: Storage, userName: string | undefined): number {
  if (!userName) {
    return DEFAULT_GLOBAL_PAGE_SIZE;
  }
  const entry = readDocument(storage).preferences[userName];
  const size = entry?.globalPageSize;
  if (typeof size === 'number' && (PERSISTABLE_PAGE_SIZES as readonly number[]).includes(size)) {
    return size;
  }
  return DEFAULT_GLOBAL_PAGE_SIZE;
}

/**
 * Persist a page size for the current user. Silently drops the write
 * when the user name is empty (mirrors official `setPreference`'s early
 * return) or the size is outside {15, 25, 50} (R-T5 membership gate).
 * Replaces only the current user's entry; other users' entries and
 * other keys in the entry are preserved byte-for-byte. The default
 * applies on read (see readGlobalPageSize); a write always carries an
 * explicit gated size, so the entry is the existing entry with the new
 * size applied. A corrupt or wrong-version document is rewritten
 * wholesale with the new structure.
 */
export function writeGlobalPageSize(
  storage: Storage,
  userName: string | undefined,
  pageSize: number,
): void {
  if (!userName) {
    return;
  }
  if (!(PERSISTABLE_PAGE_SIZES as readonly number[]).includes(pageSize)) {
    return;
  }
  const doc = readDocument(storage);
  const existing = isRecord(doc.preferences[userName]) ? doc.preferences[userName] : {};
  doc.preferences[userName] = {
    ...existing,
    globalPageSize: pageSize,
  };
  storage.setItem(USER_PREFERENCES_KEY, JSON.stringify(doc));
}

/** Delete a single user's entry (official `clearUserPreference`). No call site yet. */
export function clearUserPreference(storage: Storage, userName: string | undefined): void {
  if (!userName) {
    return;
  }
  const doc = readDocument(storage);
  if (userName in doc.preferences) {
    delete doc.preferences[userName];
    storage.setItem(USER_PREFERENCES_KEY, JSON.stringify(doc));
  }
}
