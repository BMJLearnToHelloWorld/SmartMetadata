/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import {
  USER_PREFERENCES_KEY,
  clearUserPreference,
  readGlobalPageSize,
  writeGlobalPageSize,
} from './userPageSizePreference';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

describe('readGlobalPageSize', () => {
  it('returns 15 when nothing is stored', () => {
    expect(readGlobalPageSize(memoryStorage(), 'alice')).toBe(15);
  });

  it('returns 15 for an empty user name without touching storage', () => {
    const storage = memoryStorage();
    expect(readGlobalPageSize(storage, '')).toBe(15);
    expect(readGlobalPageSize(storage, undefined)).toBe(15);
    expect(storage.getItem(USER_PREFERENCES_KEY)).toBeNull();
  });

  it('returns the stored size for the current user only', () => {
    const storage = memoryStorage({
      [USER_PREFERENCES_KEY]: JSON.stringify({
        version: 1,
        preferences: { alice: { globalPageSize: 50 }, bob: { globalPageSize: 25 } },
      }),
    });
    expect(readGlobalPageSize(storage, 'alice')).toBe(50);
    expect(readGlobalPageSize(storage, 'bob')).toBe(25);
    expect(readGlobalPageSize(storage, 'carol')).toBe(15);
  });

  it('returns 15 for out-of-set, missing-key and corrupt values without write-back', () => {
    const cases = [
      JSON.stringify({ version: 1, preferences: { alice: { globalPageSize: 24 } } }),
      JSON.stringify({ version: 1, preferences: { alice: {} } }),
      JSON.stringify({ version: 1, preferences: { alice: { globalPageSize: '25' } } }),
      'not-json{',
      JSON.stringify({ version: 2, preferences: { alice: { globalPageSize: 25 } } }),
      JSON.stringify({ version: 1, preferences: [] }),
      JSON.stringify({ preferences: { alice: { globalPageSize: 25 } } }),
    ];
    for (const raw of cases) {
      const storage = memoryStorage({ [USER_PREFERENCES_KEY]: raw });
      expect(readGlobalPageSize(storage, 'alice')).toBe(15);
      expect(storage.getItem(USER_PREFERENCES_KEY)).toBe(raw);
    }
  });
});

describe('writeGlobalPageSize', () => {
  it('writes only the current user entry and preserves the rest', () => {
    const storage = memoryStorage({
      [USER_PREFERENCES_KEY]: JSON.stringify({
        version: 1,
        preferences: {
          alice: { globalPageSize: 15, futureKey: 'keep' },
          bob: { globalPageSize: 50 },
        },
      }),
    });
    writeGlobalPageSize(storage, 'alice', 25);
    expect(JSON.parse(storage.getItem(USER_PREFERENCES_KEY)!)).toEqual({
      version: 1,
      preferences: {
        alice: { globalPageSize: 25, futureKey: 'keep' },
        bob: { globalPageSize: 50 },
      },
    });
  });

  it('creates the document structure on first write', () => {
    const storage = memoryStorage();
    writeGlobalPageSize(storage, 'alice', 50);
    expect(JSON.parse(storage.getItem(USER_PREFERENCES_KEY)!)).toEqual({
      version: 1,
      preferences: { alice: { globalPageSize: 50 } },
    });
  });

  it('rewrites a corrupt document wholesale', () => {
    const storage = memoryStorage({ [USER_PREFERENCES_KEY]: 'garbage{' });
    writeGlobalPageSize(storage, 'alice', 25);
    expect(JSON.parse(storage.getItem(USER_PREFERENCES_KEY)!)).toEqual({
      version: 1,
      preferences: { alice: { globalPageSize: 25 } },
    });
  });

  it('drops out-of-set sizes and empty user names silently', () => {
    const storage = memoryStorage();
    writeGlobalPageSize(storage, 'alice', 24);
    writeGlobalPageSize(storage, '', 25);
    writeGlobalPageSize(storage, undefined, 25);
    expect(storage.getItem(USER_PREFERENCES_KEY)).toBeNull();
  });

  it('switching users never leaks a value', () => {
    const storage = memoryStorage();
    writeGlobalPageSize(storage, 'alice', 50);
    expect(readGlobalPageSize(storage, 'bob')).toBe(15);
    writeGlobalPageSize(storage, 'bob', 25);
    expect(readGlobalPageSize(storage, 'alice')).toBe(50);
  });

  it('never touches the old Explore key', () => {
    const storage = memoryStorage({ 'sm.explore.pageSize.v1': '50' });
    writeGlobalPageSize(storage, 'alice', 25);
    expect(storage.getItem('sm.explore.pageSize.v1')).toBe('50');
    expect(readGlobalPageSize(storage, 'alice')).toBe(25);
  });
});

describe('clearUserPreference', () => {
  it('deletes only the named entry', () => {
    const storage = memoryStorage({
      [USER_PREFERENCES_KEY]: JSON.stringify({
        version: 1,
        preferences: { alice: { globalPageSize: 50 }, bob: { globalPageSize: 25 } },
      }),
    });
    clearUserPreference(storage, 'alice');
    expect(JSON.parse(storage.getItem(USER_PREFERENCES_KEY)!)).toEqual({
      version: 1,
      preferences: { bob: { globalPageSize: 25 } },
    });
    expect(readGlobalPageSize(storage, 'alice')).toBe(15);
  });
});
