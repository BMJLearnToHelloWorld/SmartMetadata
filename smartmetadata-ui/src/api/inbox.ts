/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { listActivityEvents } from '@/api/activity';
import { listTasks } from '@/api/tasks';

/**
 * Inbox counts, mirroring the official InboxIconButton badge: open tasks
 * (statusGroup Open, the same query as the Triage tab) plus activity the
 * user has not looked at yet. Official "unread" is conversations newer
 * than a locally stored seen-mark (there is no server-side read state);
 * the product equivalent counts activity events newer than the mark.
 * Before the first inbox visit there is no mark and nothing is counted,
 * so a brand-new user does not open to a stale badge. A failed count
 * fetch degrades to zero: the badge must never break the shell.
 */
export const INBOX_SEEN_KEY = 'sm-inbox-activity-seen-ts';

export function readInboxSeenTs(): number | null {
  try {
    const raw = localStorage.getItem(INBOX_SEEN_KEY);
    const ts = raw === null ? NaN : Number(raw);
    return Number.isFinite(ts) ? ts : null;
  } catch {
    return null;
  }
}

export function markInboxSeenNow(): void {
  try {
    localStorage.setItem(INBOX_SEEN_KEY, String(Date.now()));
  } catch {
    // Private-mode storage failures must not break navigation.
  }
}

export interface InboxCounts {
  openTaskCount: number;
  unreadActivityCount: number;
  pendingCount: number;
}

/** Client-side date-range filter for activity events (timestamp in ms). */
export function filterEventsByRange<T extends { timestamp?: number }>(
  events: T[],
  from: number | null,
  to: number | null,
): T[] {
  return events.filter((event) => {
    const ts = event.timestamp ?? 0;
    if (from !== null && ts < from) {
      return false;
    }
    if (to !== null && ts > to) {
      return false;
    }
    return true;
  });
}

export async function getInboxCounts(): Promise<InboxCounts> {
  let openTaskCount = 0;
  try {
    const page = await listTasks({ statusGroup: 'Open', limit: 1 });
    openTaskCount = page.total ?? 0;
  } catch {
    openTaskCount = 0;
  }
  let unreadActivityCount = 0;
  const seenTs = readInboxSeenTs();
  if (seenTs !== null) {
    try {
      const days = Math.min(365, Math.max(1, Math.ceil((Date.now() - seenTs) / 86400000)));
      const page = await listActivityEvents({ days, limit: 100 });
      // Window-capped, not a server total: events past the fetch window
      // are not counted. The cap is documented, not hidden.
      unreadActivityCount = page.data.filter((event) => (event.timestamp ?? 0) > seenTs).length;
    } catch {
      unreadActivityCount = 0;
    }
  }
  return { openTaskCount, unreadActivityCount, pendingCount: openTaskCount + unreadActivityCount };
}
