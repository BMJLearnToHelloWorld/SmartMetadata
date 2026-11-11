/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import { generateUUID, getIngestionName, randomAlphanumeric, replaceAllSpacialCharWith_ } from './uuid';

describe('generateUUID (official utils/StringUtils.ts)', () => {
  it('produces a v4-shaped UUID', () => {
    expect(generateUUID()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('produces distinct values', () => {
    expect(generateUUID()).not.toBe(generateUUID());
  });
});

describe('replaceAllSpacialCharWith_ (official utils/StringUtils.ts)', () => {
  it('replaces the official special-character set with _', () => {
    expect(replaceAllSpacialCharWith_('my service/name (prod)')).toBe('my_service_name__prod_');
    expect(replaceAllSpacialCharWith_('plain-name')).toBe('plain-name');
  });
});

describe('randomAlphanumeric', () => {
  it('produces the requested length of alphanumeric characters', () => {
    expect(randomAlphanumeric(8)).toMatch(/^[A-Za-z0-9]{8}$/);
  });
});

describe('getIngestionName (official utils/ServicePureUtils.ts)', () => {
  it('adds an 8-random-char suffix for the six suffixed types', () => {
    for (const type of ['metadata', 'profiler', 'lineage', 'dbt', 'application', 'TestSuite'] as const) {
      expect(getIngestionName('warehouse', type)).toMatch(
        new RegExp(`^warehouse_${type}_[A-Za-z0-9]{8}$`),
      );
    }
  });

  it('uses plain ${service}_${type} for the other types', () => {
    expect(getIngestionName('warehouse', 'usage')).toBe('warehouse_usage');
    expect(getIngestionName('warehouse', 'autoClassification')).toBe('warehouse_autoClassification');
    expect(getIngestionName('warehouse', 'dataInsight')).toBe('warehouse_dataInsight');
    expect(getIngestionName('warehouse', 'elasticSearchReindex')).toBe('warehouse_elasticSearchReindex');
    expect(getIngestionName('warehouse', 'reverseMetadata')).toBe('warehouse_reverseMetadata');
    expect(getIngestionName('warehouse', 'policyAgent')).toBe('warehouse_policyAgent');
  });

  it('replaces special characters in the service name only in the suffixed form', () => {
    expect(getIngestionName('my service', 'metadata')).toMatch(/^my_service_metadata_[A-Za-z0-9]{8}$/);
    expect(getIngestionName('my service', 'usage')).toBe('my service_usage');
  });
});
