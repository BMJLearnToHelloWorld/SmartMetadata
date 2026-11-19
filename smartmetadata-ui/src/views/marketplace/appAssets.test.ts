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
import {
  ALL_ENTITY_TYPES,
  HIDDEN_SCHEMA_PATHS,
  importAppLogo,
  importAppScreenshot,
  importSchema,
  isHiddenSchemaPath,
  withSearchEntityTypes,
} from './appAssets';

describe('appAssets', () => {
  it('loads bundled schemas by app name', async () => {
    const schema = await importSchema('McpApplication');
    expect(schema.title).toBe('MCP Server');
    expect(Object.keys(schema.properties ?? {})).toEqual([
      'baseUrl',
      'allowedOrigins',
      'maxResponseChars',
    ]);
  });

  it('throws for a missing schema (callers rely on the rejection)', async () => {
    await expect(importSchema('NoSuchApplication')).rejects.toThrow(
      'Application schema not found: NoSuchApplication',
    );
  });

  it('injects server-driven entity types into the SearchIndexing schema', async () => {
    const schema = await importSchema('SearchIndexingApplication', {
      fetchEntityTypes: async () => ['table', 'dashboard'],
    });
    const items = schema.properties?.entities?.items as { enum?: string[] } | undefined;
    expect(items?.enum).toEqual([ALL_ENTITY_TYPES, 'table', 'dashboard']);
  });

  it('returns the SearchIndexing schema unconstrained when entity types fail', async () => {
    const onEntityTypesError = vi.fn();
    const schema = await importSchema('SearchIndexingApplication', {
      fetchEntityTypes: async () => {
        throw new Error('boom');
      },
      onEntityTypesError,
    });
    expect(onEntityTypesError).toHaveBeenCalledTimes(1);
    // The bundled schema has no items enum; the failure path must not
    // narrow it to just ['all'].
    const items = schema.properties?.entities?.items as { enum?: string[] } | undefined;
    expect(items?.enum).toBeUndefined();
  });

  it('does not inject entity types into other schemas', async () => {
    const fetchEntityTypes = vi.fn(async () => ['table']);
    await importSchema('McpApplication', { fetchEntityTypes });
    expect(fetchEntityTypes).not.toHaveBeenCalled();
  });

  it('withSearchEntityTypes keeps the rest of the schema intact', async () => {
    const schema = await withSearchEntityTypes(
      {
        title: 'T',
        type: 'object',
        properties: {
          batchSize: { type: 'integer' },
          entities: { type: 'array', items: { type: 'string' } },
        },
      },
      { fetchEntityTypes: async () => ['topic'] },
    );
    expect(schema.properties?.batchSize).toEqual({ type: 'integer' });
    expect(schema.properties?.entities?.items).toEqual({
      type: 'string',
      enum: ['all', 'topic'],
    });
  });

  it('resolves app logos and falls back to the default logo', () => {
    const logo = importAppLogo('SearchIndexingApplication');
    // Vite inlines small SVGs as data URIs; the URL form is build-dependent.
    expect(logo.length).toBeGreaterThan(0);
    const fallback = importAppLogo('HelloPipelines');
    expect(fallback.length).toBeGreaterThan(0);
    expect(fallback).not.toBe(logo);
    expect(importAppLogo('NoSuchApp')).toBe(fallback);
    expect(importAppLogo('application-colored')).toBe(fallback);
  });

  it('throws for missing screenshots so callers drop them', () => {
    expect(() => importAppScreenshot('search-indexing-1')).toThrow(
      'App screenshot not found: search-indexing-1',
    );
  });

  it('hides exactly the pin uiSchema paths', () => {
    expect(HIDDEN_SCHEMA_PATHS.size).toBe(3);
    expect(isHiddenSchemaPath('type')).toBe(true);
    expect(isHiddenSchemaPath('entityLink')).toBe(true);
    expect(isHiddenSchemaPath('moduleConfiguration.dataAssets.serviceFilter')).toBe(true);
    expect(isHiddenSchemaPath('moduleConfiguration.dataAssets.entities')).toBe(false);
    expect(isHiddenSchemaPath('batchSize')).toBe(false);
  });
});
