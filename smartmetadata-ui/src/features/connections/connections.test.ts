/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import {
  CATEGORY_TO_ENTITY_TYPE,
  CONNECTIONS_ENTITY_TYPES,
  HEALTH_FILTER_ORDER,
  LEGACY_HEALTH_ALIASES,
  PAGE_SIZE_OPTIONS,
  SERVICES_ESTATE_LIMIT,
  categoryOfEntityType,
  isConnectionsCategory,
  isLegacyHealthParam,
  parseCsvParam,
  parseHealthParam,
} from './connections';

describe('connections constants', () => {
  it('tabs the eleven categories, never llm/mcp', () => {
    expect(CONNECTIONS_ENTITY_TYPES).toHaveLength(11);
    expect(CONNECTIONS_ENTITY_TYPES).not.toContain('llmService');
    expect(CONNECTIONS_ENTITY_TYPES).not.toContain('mcpService');
    expect(CATEGORY_TO_ENTITY_TYPE.database).toBe('databaseService');
    expect(CATEGORY_TO_ENTITY_TYPE.security).toBe('securityService');
    expect(SERVICES_ESTATE_LIMIT).toBe(500);
    expect(PAGE_SIZE_OPTIONS).toEqual([12, 24, 48]);
  });

  it('resolves a category only for the eleven kinds', () => {
    expect(isConnectionsCategory('database')).toBe(true);
    expect(isConnectionsCategory('llm')).toBe(false);
    expect(isConnectionsCategory('bogus')).toBe(false);
    expect(isConnectionsCategory(null)).toBe(false);
    expect(categoryOfEntityType('databaseService')).toBe('database');
    expect(categoryOfEntityType('llmService')).toBeUndefined();
    expect(categoryOfEntityType('unknownService')).toBeUndefined();
  });

  it('orders health worst-wins', () => {
    expect(HEALTH_FILTER_ORDER).toEqual(['failed', 'partialSuccess', 'notRun', 'success']);
    expect(LEGACY_HEALTH_ALIASES.failing).toEqual(['failed', 'partialSuccess']);
  });
});

describe('parseCsvParam', () => {
  it('splits, trims and drops empties', () => {
    expect(parseCsvParam('a, b,,c ')).toEqual(['a', 'b', 'c']);
    expect(parseCsvParam(null)).toEqual([]);
    expect(parseCsvParam('')).toEqual([]);
  });
});

describe('parseHealthParam', () => {
  it('passes precise CSV values through', () => {
    expect(parseHealthParam('failed,success')).toEqual(['failed', 'success']);
  });

  it('expands legacy aliases on read', () => {
    expect(parseHealthParam('failing')).toEqual(['failed', 'partialSuccess']);
    expect(parseHealthParam('healthy')).toEqual(['success']);
    expect(parseHealthParam('notRun')).toEqual(['notRun']);
    expect(parseHealthParam('failing,success')).toEqual(['failed', 'partialSuccess', 'success']);
  });

  it('drops illegal values', () => {
    expect(parseHealthParam('failed,bogus')).toEqual(['failed']);
    expect(parseHealthParam('bogus')).toEqual([]);
  });

  it('detects a lone legacy alias for the one-time rewrite', () => {
    expect(isLegacyHealthParam('failing')).toBe(true);
    expect(isLegacyHealthParam('healthy')).toBe(true);
    expect(isLegacyHealthParam('failed,partialSuccess')).toBe(false);
    expect(isLegacyHealthParam('failed')).toBe(false);
    expect(isLegacyHealthParam(null)).toBe(false);
  });
});
