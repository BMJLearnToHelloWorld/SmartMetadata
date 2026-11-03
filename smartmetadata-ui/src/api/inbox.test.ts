/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  INBOX_SEEN_KEY,
  filterEventsByRange,
  getInboxCounts,
  markInboxSeenNow,
  readInboxSeenTs,
} from './inbox';

const listActivityEvents = vi.fn();
const listTasks = vi.fn();

vi.mock('@/api/activity', () => ({
  listActivityEvents: (...args: unknown[]) => listActivityEvents(...args),
}));

vi.mock('@/api/tasks', () => ({
  listTasks: (...args: unknown[]) => listTasks(...args),
}));

describe('inbox counts', () => {
  beforeEach(() => {
    localStorage.clear();
    listActivityEvents.mockReset();
    listTasks.mockReset();
    listTasks.mockResolvedValue({ data: [], total: 3 });
    listActivityEvents.mockResolvedValue({ data: [], total: 0 });
  });

  it('counts nothing before the first inbox visit (no seen mark)', async () => {
    const counts = await getInboxCounts();
    expect(counts).toEqual({ openTaskCount: 3, unreadActivityCount: 0, pendingCount: 3 });
    expect(listActivityEvents).not.toHaveBeenCalled();
  });

  it('counts only activity newer than the seen mark', async () => {
    const now = Date.now();
    localStorage.setItem(INBOX_SEEN_KEY, String(now - 60000));
    listActivityEvents.mockResolvedValue({
      data: [
        { id: 'e1', eventType: 'update', timestamp: now - 1000 },
        { id: 'e2', eventType: 'update', timestamp: now - 120000 },
      ],
      total: 2,
    });
    const counts = await getInboxCounts();
    expect(counts.unreadActivityCount).toBe(1);
    expect(counts.pendingCount).toBe(4);
  });

  it('degrades count fetches to zero on failure', async () => {
    localStorage.setItem(INBOX_SEEN_KEY, String(Date.now() - 1000));
    listTasks.mockRejectedValue(new Error('down'));
    listActivityEvents.mockRejectedValue(new Error('down'));
    const counts = await getInboxCounts();
    expect(counts).toEqual({ openTaskCount: 0, unreadActivityCount: 0, pendingCount: 0 });
  });

  it('filters events by an inclusive date range', () => {
    const events = [
      { id: 'a', timestamp: 100 },
      { id: 'b', timestamp: 200 },
      { id: 'c', timestamp: 300 },
    ];
    expect(filterEventsByRange(events, 200, 300).map((e) => e.id)).toEqual(['b', 'c']);
    expect(filterEventsByRange(events, null, null).map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('round-trips the seen mark through localStorage', () => {
    expect(readInboxSeenTs()).toBeNull();
    markInboxSeenNow();
    expect(readInboxSeenTs()).not.toBeNull();
  });
});
