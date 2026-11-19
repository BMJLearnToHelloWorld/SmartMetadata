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
import { fieldTermQuery } from './fieldQuery';
import { startCase } from '@/utils/text';

describe('fieldTermQuery', () => {
  it('quotes a Lucene field term and escapes quotes', () => {
    expect(fieldTermQuery('owners.id', 'user-1')).toBe('owners.id:"user-1"');
    expect(fieldTermQuery('followers', 'a"b\\c')).toBe('followers:"a\\"b\\\\c"');
  });
});

describe('startCase', () => {
  it('title-cases dotted or underscored display names for the greeting', () => {
    expect(startCase('alice.admin')).toBe('Alice Admin');
    expect(startCase('data_steward')).toBe('Data Steward');
    expect(startCase('')).toBe('');
  });
});
