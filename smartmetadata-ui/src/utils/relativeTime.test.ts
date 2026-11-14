/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOCALE_STORAGE_KEY } from '@/i18n/localePreference';
import { getRelativeTime, getShortRelativeTime } from './relativeTime';

const NOW = new Date('2026-11-14T12:00:00.000Z').getTime();

describe('getRelativeTime / getShortRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en-US');
  });

  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.removeItem(LOCALE_STORAGE_KEY);
  });

  it('returns an empty string for a missing timestamp', () => {
    expect(getRelativeTime()).toBe('');
    expect(getRelativeTime(null as unknown as undefined)).toBe('');
    expect(getShortRelativeTime()).toBe('');
    expect(getShortRelativeTime(null as unknown as undefined)).toBe('');
  });

  it('renders the long English form', () => {
    expect(getRelativeTime(NOW - 10 * 60 * 1000)).toBe('10 minutes ago');
    expect(getRelativeTime(NOW - 2 * 60 * 60 * 1000)).toBe('2 hours ago');
  });

  it('shortens English unit words, keeping the rest of the phrase', () => {
    expect(getShortRelativeTime(NOW - 10 * 60 * 1000)).toBe('10 mins ago');
    expect(getShortRelativeTime(NOW - 2 * 60 * 60 * 1000)).toBe('2 hrs ago');
    expect(getShortRelativeTime(NOW - 3 * 24 * 60 * 60 * 1000)).toBe('3 days ago');
    expect(getShortRelativeTime(NOW - 30 * 1000)).toBe('a few secs ago');
    expect(getShortRelativeTime(NOW - 40 * 24 * 60 * 60 * 1000)).toBe('a mo ago');
    expect(getShortRelativeTime(NOW - 400 * 24 * 60 * 60 * 1000)).toBe('a yr ago');
  });

  it('passes a Chinese relative string through unchanged', () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'zh-CN');
    const longForm = getRelativeTime(NOW - 10 * 60 * 1000);
    expect(longForm).toBe('10 分钟前');
    expect(getShortRelativeTime(NOW - 10 * 60 * 1000)).toBe(longForm);
  });
});
