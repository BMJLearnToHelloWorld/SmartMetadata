/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { deleteEventSubscription } from '@/api/eventSubscriptions';
import { hardDeleteAlert } from './alertDelete';
import type { AlertSearchHooks } from './alertSourceSearch';
import type { TranslateFn } from './alertUtils';

vi.mock('@/api/eventSubscriptions', () => ({ deleteEventSubscription: vi.fn() }));

const mockedDelete = vi.mocked(deleteEventSubscription);

const t: TranslateFn = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key) as TranslateFn;

let notified: string[];
let warned: string[];
let succeeded: string[];
let hooks: AlertSearchHooks & { notifySuccess: (message: string) => void };

beforeEach(() => {
  vi.clearAllMocks();
  notified = [];
  warned = [];
  succeeded = [];
  hooks = {
    t,
    notifyError: (message) => notified.push(message),
    notifyWarning: (message) => warned.push(message),
    notifySuccess: (message) => succeeded.push(message),
  };
});

describe('hardDeleteAlert', () => {
  it('toasts the deleted-success message and returns true on success', async () => {
    mockedDelete.mockResolvedValue(undefined);
    expect(await hardDeleteAlert('My Alert', 'id-1', hooks)).toBe(true);
    expect(mockedDelete).toHaveBeenCalledWith('id-1');
    expect(succeeded).toEqual([
      'server.entity-deleted-successfully:{"entity":"My Alert"}',
    ]);
    expect(notified).toEqual([]);
  });

  it('toasts the server text with the delete-error fallback and returns false', async () => {
    mockedDelete.mockRejectedValue(
      new ApiError(500, JSON.stringify({ message: 'boom' })),
    );
    expect(await hardDeleteAlert('My Alert', 'id-1', hooks)).toBe(false);
    expect(notified).toEqual(['boom']);
    mockedDelete.mockRejectedValue(new ApiError(500, ''));
    expect(await hardDeleteAlert('My Alert', 'id-1', hooks)).toBe(false);
    expect(notified[1]).toBe('server.delete-entity-error:{"entity":"My Alert"}');
  });

  it('still toasts a forbidden DELETE: suppression covers forbidden reads only', async () => {
    mockedDelete.mockRejectedValue(new ApiError(403, ''));
    expect(await hardDeleteAlert('My Alert', 'id-1', hooks)).toBe(false);
    expect(notified).toHaveLength(1);
  });

  it('stays silent on 401 and warns on rule violations', async () => {
    mockedDelete.mockRejectedValue(new ApiError(401, ''));
    expect(await hardDeleteAlert('My Alert', 'id-1', hooks)).toBe(false);
    expect(notified).toEqual([]);
    mockedDelete.mockRejectedValue(
      new ApiError(400, JSON.stringify({ message: 'rule!', errorType: 'RULE_VIOLATION' })),
    );
    expect(await hardDeleteAlert('My Alert', 'id-1', hooks)).toBe(false);
    expect(warned).toEqual(['rule!']);
    expect(notified).toEqual([]);
  });
});
