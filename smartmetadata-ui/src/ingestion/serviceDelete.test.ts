/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { waitForServiceDelete } from './serviceDelete';

describe('waitForServiceDelete', () => {
  it('confirms a soft delete when the re-read returns deleted: true', async () => {
    const fetchService = vi
      .fn()
      .mockResolvedValueOnce({ deleted: false })
      .mockResolvedValueOnce({ deleted: true });
    const confirmed = await waitForServiceDelete(false, fetchService, {
      intervalMs: 1,
      timeoutMs: 100,
    });
    expect(confirmed).toBe(true);
    expect(fetchService).toHaveBeenCalledTimes(2);
  });

  it('times out when the service never shows deleted', async () => {
    const fetchService = vi.fn(async () => ({ deleted: false }));
    const confirmed = await waitForServiceDelete(false, fetchService, {
      intervalMs: 1,
      timeoutMs: 10,
    });
    expect(confirmed).toBe(false);
    expect(fetchService.mock.calls.length).toBeGreaterThan(1);
  });

  it('confirms a hard delete when the re-read 404s', async () => {
    const fetchService = vi
      .fn()
      .mockResolvedValueOnce({ deleted: false })
      .mockRejectedValueOnce(new ApiError(404, 'not found'));
    const confirmed = await waitForServiceDelete(true, fetchService, {
      intervalMs: 1,
      timeoutMs: 100,
    });
    expect(confirmed).toBe(true);
    expect(fetchService).toHaveBeenCalledTimes(2);
  });

  it('does not treat a 404 as a soft-delete confirmation', async () => {
    const fetchService = vi.fn(async () => {
      throw new ApiError(404, 'not found');
    });
    const confirmed = await waitForServiceDelete(false, fetchService, {
      intervalMs: 1,
      timeoutMs: 10,
    });
    expect(confirmed).toBe(false);
  });

  it('treats a non-404 failure as not confirmed yet', async () => {
    const fetchService = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(500, 'boom'))
      .mockRejectedValueOnce(new ApiError(404, 'not found'));
    const confirmed = await waitForServiceDelete(true, fetchService, {
      intervalMs: 1,
      timeoutMs: 100,
    });
    expect(confirmed).toBe(true);
    expect(fetchService).toHaveBeenCalledTimes(2);
  });

  it('times out on a hard delete when the service keeps responding', async () => {
    const fetchService = vi.fn(async () => ({ deleted: true }));
    const confirmed = await waitForServiceDelete(true, fetchService, {
      intervalMs: 1,
      timeoutMs: 10,
    });
    expect(confirmed).toBe(false);
  });
});
