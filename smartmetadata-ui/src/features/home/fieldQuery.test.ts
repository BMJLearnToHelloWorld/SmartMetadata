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
import { fieldTermQuery, startCaseName } from './fieldQuery';

describe('fieldTermQuery', () => {
  it('quotes a Lucene field term and escapes quotes', () => {
    expect(fieldTermQuery('owners.id', 'user-1')).toBe('owners.id:"user-1"');
    expect(fieldTermQuery('followers', 'a"b\\c')).toBe('followers:"a\\"b\\\\c"');
  });
});

describe('startCaseName', () => {
  it('title-cases dotted or underscored display names for the greeting', () => {
    expect(startCaseName('alice.admin')).toBe('Alice Admin');
    expect(startCaseName('data_steward')).toBe('Data Steward');
    expect(startCaseName('')).toBe('');
  });
});
