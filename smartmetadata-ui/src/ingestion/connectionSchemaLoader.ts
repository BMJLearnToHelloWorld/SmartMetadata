/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { coverageFor } from '@/ingestion/connectionCoverage';

/**
 * Runtime connection-schema loading (t364 Q7): fetch the expanded
 * public JSON schema at runtime, version fixed with the build
 * artifact. Port of pin `loadConnectionSchema`
 * (utils/loadConnectionSchema.ts) + the per-category loader tables
 * (`*ServiceUtils.ts`): the relative path comes from the T-2 ledger,
 * which mirrors the official loader tables exactly — the six types
 * with no loader entry never fetch and resolve to `empty` (L2), and
 * categories outside the 11 resolve to `empty` without fetching (L1).
 *
 * Only the 34 loader-registered schemas are bundled under
 * `public/jsons/connectionSchemas/`; the five unregistered-but-present
 * JSON files are deliberately not copied (the loader never fetches
 * them, and Q1 forbids inventing loader-equivalent fetching for them).
 * A non-2xx response or network failure throws, and the caller maps
 * the throw to the `failed` guard state (L3) — it must never be
 * silently treated as `empty`.
 */

export const CONNECTION_SCHEMA_BASE = '/jsons/connectionSchemas/';

/** Pin SCHEMA_CACHE_LIMIT: the catalog is closed, cap well above it. */
const SCHEMA_CACHE_LIMIT = 256;

const schemaCache = new Map<string, Promise<Record<string, unknown>>>();

function touchLru(key: string, value: Promise<Record<string, unknown>>): void {
  schemaCache.delete(key);
  if (schemaCache.size >= SCHEMA_CACHE_LIMIT) {
    const oldest = schemaCache.keys().next().value;
    if (oldest !== undefined) {
      schemaCache.delete(oldest);
    }
  }
  schemaCache.set(key, value);
}

/** Pin assertSafeRelativePath: nothing may escape the schemas root. */
function assertSafeRelativePath(relativePath: string): void {
  if (
    relativePath.startsWith('/') ||
    relativePath.startsWith('\\') ||
    relativePath.includes('..') ||
    relativePath.includes('\0')
  ) {
    throw new Error(`Invalid connection schema path: ${relativePath}`);
  }
}

export type FetchConnectionSchema = (url: string, init?: RequestInit) => Promise<Response>;

async function fetchSchemaModule(
  relativePath: string,
  fetchFn: FetchConnectionSchema,
): Promise<Record<string, unknown>> {
  assertSafeRelativePath(relativePath);
  const cached = schemaCache.get(relativePath);
  if (cached) {
    touchLru(relativePath, cached);
    return cached;
  }
  const pending = (async () => {
    const response = await fetchFn(`${CONNECTION_SCHEMA_BASE}${relativePath}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(
        `Failed to load connection schema ${relativePath}: ${response.status} ${response.statusText}`,
      );
    }
    return (await response.json()) as Record<string, unknown>;
  })();
  // A rejected fetch must not poison the cache: drop it so a retry
  // (or a later navigation) fetches again.
  pending.catch(() => {
    if (schemaCache.get(relativePath) === pending) {
      schemaCache.delete(relativePath);
    }
  });
  touchLru(relativePath, pending);
  return pending;
}

export type ConnectionSchemaLoadResult =
  | { state: 'empty' }
  | { state: 'present'; schema: Record<string, unknown> };

/**
 * Load the connection schema for a (kind, type) pair. Returns `empty`
 * without fetching when the ledger has no loader entry (L1/L2).
 * Throws on fetch failure (L3) — the caller maps it to `failed`.
 */
export async function loadConnectionSchemaJson(
  kind: string,
  type: string,
  fetchFn: FetchConnectionSchema = fetch,
): Promise<ConnectionSchemaLoadResult> {
  const row = coverageFor(kind, type);
  if (!row?.schemaPath) {
    return { state: 'empty' };
  }
  const schema = await fetchSchemaModule(row.schemaPath, fetchFn);
  return { state: 'present', schema };
}

/** Test-only cache reset. */
export function clearConnectionSchemaCache(): void {
  schemaCache.clear();
}
