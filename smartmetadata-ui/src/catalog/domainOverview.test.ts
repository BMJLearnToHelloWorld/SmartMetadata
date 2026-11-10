/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import { emptyFqnsOf, fqnQueryFilter } from './domainOverview';

describe('domainOverview', () => {
  it('resolves the empty FQNs from the count map, sorted', () => {
    expect(
      emptyFqnsOf({ 'b.domain': 3, 'a.domain': 0, 'c.domain': 0, 'd.domain': 1 }),
    ).toEqual(['a.domain', 'c.domain']);
  });

  it('restricts a bucket to the given FQNs', () => {
    expect(fqnQueryFilter(['a.domain', 'b.domain'])).toEqual({
      query: {
        bool: { must: [{ terms: { fullyQualifiedName: ['a.domain', 'b.domain'] } }] },
      },
    });
  });
});
