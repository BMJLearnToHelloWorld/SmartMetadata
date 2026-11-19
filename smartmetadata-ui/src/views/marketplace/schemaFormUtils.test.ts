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
  dotPathForPath,
  fieldIdForPath,
  fieldLabel,
  getNextEnumSelection,
  omitExtraData,
  seedSchemaDefaults,
  validateSchemaForm,
} from './schemaFormUtils';
import { getFormDisplayLabel, startCase } from '@/utils/text';

describe('schemaFormUtils', () => {
  it('start-cases camelCase, snake_case, and acronyms like lodash', () => {
    expect(startCase('databaseSchema')).toBe('Database Schema');
    expect(startCase('maxResponseChars')).toBe('Max Response Chars');
    expect(startCase('baseUrl')).toBe('Base Url');
    expect(startCase('sendToAdmins')).toBe('Send To Admins');
  });

  it('applies the acronym map and letter-number merging for display labels', () => {
    expect(getFormDisplayLabel('baseUrl')).toBe('Base URL');
    expect(getFormDisplayLabel('maxResponseChars')).toBe('Max Response Chars');
    expect(getFormDisplayLabel('s3Config')).toBe('S3 Config');
    expect(getFormDisplayLabel('oauth2Config')).toBe('OAuth 2 Config');
  });

  it('keeps All mutually exclusive with specific enum values', () => {
    expect(getNextEnumSelection([], 'all')).toEqual(['all']);
    expect(getNextEnumSelection(['all'], 'table')).toEqual(['table']);
    expect(getNextEnumSelection(['table'], 'dashboard')).toEqual(['table', 'dashboard']);
    expect(getNextEnumSelection(['table', 'dashboard'], 'all')).toEqual(['all']);
  });

  it('seeds defaults for missing keys without touching present values', () => {
    const seeded = seedSchemaDefaults(
      {
        type: 'object',
        properties: {
          batchSize: { type: 'integer', default: 100 },
          nested: {
            type: 'object',
            properties: { flag: { type: 'boolean', default: true } },
          },
          list: { type: 'array', default: ['all'] },
        },
      },
      { batchSize: 50, nested: {} },
    );
    expect(seeded.batchSize).toBe(50);
    expect(seeded.nested).toEqual({ flag: true });
    expect(seeded.list).toEqual(['all']);
  });

  it('does not share references with schema defaults', () => {
    const schema = { type: 'object', properties: { list: { type: 'array', default: ['all'] } } };
    const seeded = seedSchemaDefaults(schema, {});
    (seeded.list as string[]).push('table');
    expect(schema.properties?.list.default).toEqual(['all']);
  });

  it('omits extra data except under schema-valued additionalProperties', () => {
    const result = omitExtraData(
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          kept: { type: 'string' },
          nested: {
            type: 'object',
            additionalProperties: false,
            properties: { inner: { type: 'string' } },
          },
          extensions: {
            type: 'object',
            additionalProperties: { type: 'integer' },
          },
        },
      },
      {
        kept: 'x',
        dropped: 1,
        nested: { inner: 'y', dropped: 2 },
        extensions: { custom: 5 },
      },
    );
    expect(result).toEqual({ kept: 'x', nested: { inner: 'y' }, extensions: { custom: 5 } });
  });

  it('validates only required/minimum/maximum, skipping hidden paths', () => {
    const schema = {
      type: 'object',
      required: ['name', 'type'],
      properties: {
        name: { type: 'string' },
        type: { type: 'string' },
        count: { type: 'integer', minimum: 1, maximum: 10 },
        nested: {
          type: 'object',
          required: ['inner'],
          properties: { inner: { type: 'string' } },
        },
      },
    };
    const errors = validateSchemaForm(
      schema,
      { count: 20, nested: {} },
      new Set(['type']),
    );
    expect(errors).toEqual([
      { path: 'name', name: 'required', param: 'name' },
      { path: 'count', name: 'maximum', param: 10 },
      { path: 'nested.inner', name: 'required', param: 'inner' },
    ]);
    expect(validateSchemaForm(schema, { name: 'x', type: 't', count: 5, nested: { inner: 'y' } })).toEqual([]);
  });

  it('builds RJSF field ids with the slash separator', () => {
    expect(fieldIdForPath(['moduleConfiguration', 'dataAssets', 'entities'])).toBe(
      'root/moduleConfiguration/dataAssets/entities',
    );
    expect(dotPathForPath(['a', 'b'])).toBe('a.b');
  });

  it('prefers the schema title for field labels', () => {
    expect(fieldLabel({ title: 'Batch Size' }, 'batchSize')).toBe('Batch Size');
    expect(fieldLabel({}, 'batchSize')).toBe('Batch Size');
    expect(fieldLabel({}, 'baseUrl')).toBe('Base URL');
  });
});
