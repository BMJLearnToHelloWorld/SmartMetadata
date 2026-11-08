/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { KnowledgePageType } from '@/types/contextCenter';

/**
 * Recently-viewed knowledge pages (G-22).
 *
 * ADR:2026-11-07-context-center-recently-viewed-local-per-user — mirrors
 * official `addToKnowledgeCenterRecentViewed`: localStorage only (never
 * synced to the server), keyed per user by LoginUser.name, deduped by id
 * with only the newest entry kept, timestamp descending, at most 10
 * entries. Reads and writes are shared by the overview card and Wave 2's
 * G-19 right panel, so they live here — never inside a view.
 */
export interface RecentlyViewedPage {
  id: string;
  title: string;
  pageType: KnowledgePageType;
  /** QuickLink target URL; absent for articles. */
  pageUrl?: string;
  fullyQualifiedName?: string;
  timestamp: number;
}

export const MAX_RECENTLY_VIEWED = 10;

function storageKey(userKey: string): string {
  return `sm.contextCenter.recentlyViewed.v1:${userKey}`;
}

function readStored(userKey: string): RecentlyViewedPage[] {
  try {
    const raw = window.localStorage.getItem(storageKey(userKey));
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.flatMap((item) => {
      if (typeof item !== 'object' || item === null) {
        return [];
      }
      const rec = item as Record<string, unknown>;
      const id = typeof rec.id === 'string' ? rec.id : '';
      const title = typeof rec.title === 'string' ? rec.title : '';
      const pageType = rec.pageType === 'QuickLink' ? 'QuickLink' : 'Article';
      const timestamp = typeof rec.timestamp === 'number' ? rec.timestamp : 0;
      if (!id || !title || timestamp <= 0) {
        return [];
      }
      return [
        {
          id,
          title,
          pageType,
          pageUrl: typeof rec.pageUrl === 'string' ? rec.pageUrl : undefined,
          fullyQualifiedName:
            typeof rec.fullyQualifiedName === 'string' ? rec.fullyQualifiedName : undefined,
          timestamp,
        } satisfies RecentlyViewedPage,
      ];
    });
  } catch {
    // Corrupt local JSON must never white-screen the page.
    return [];
  }
}

/** Entries for one user, newest first. No user key means no entries. */
export function listRecentlyViewed(userKey?: string): RecentlyViewedPage[] {
  if (!userKey) {
    return [];
  }
  return readStored(userKey)
    .slice()
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_RECENTLY_VIEWED);
}

/**
 * Record a page view. Idempotent: re-viewing the same page only refreshes
 * its timestamp and moves it to the front. No logged-in user, no record,
 * no throw.
 */
export function recordRecentlyViewed(
  userKey: string | undefined,
  page: {
    id: string;
    title: string;
    pageType: KnowledgePageType;
    pageUrl?: string;
    fullyQualifiedName?: string;
  },
): void {
  if (!userKey || !page.id || !page.title) {
    return;
  }
  try {
    const entry: RecentlyViewedPage = { ...page, timestamp: Date.now() };
    const next = [
      entry,
      ...readStored(userKey).filter((item) => item.id !== page.id),
    ].slice(0, MAX_RECENTLY_VIEWED);
    window.localStorage.setItem(storageKey(userKey), JSON.stringify(next));
  } catch {
    // Official swallows storage errors; a full or denied store must not
    // break navigation.
  }
}
