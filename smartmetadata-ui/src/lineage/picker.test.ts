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
import type { SearchHit } from '@/types/api';
import {
  LINEAGE_ENTITY_EXCLUSION_FILTER,
  LINEAGE_SEARCH_INDEXES,
  mergeLineageSearchHits,
} from './picker';

function hit(fqn: string, entityType = 'table'): SearchHit {
  return {
    name: fqn.split('.').at(-1) ?? fqn,
    fullyQualifiedName: fqn,
    entityType,
    owners: [],
    tags: [],
  };
}

describe('lineage picker', () => {
  it('searches the pin indexes: dataAsset, domain, service', () => {
    expect([...LINEAGE_SEARCH_INDEXES]).toEqual(['dataAsset', 'domain', 'service']);
  });

  it('excludes glossary terms, tags, data products and knowledge pages', () => {
    const filter = JSON.parse(LINEAGE_ENTITY_EXCLUSION_FILTER) as {
      query: { bool: { must_not: Array<{ term: { entityType: string } }> } };
    };
    expect(filter.query.bool.must_not.map((clause) => clause.term.entityType).sort()).toEqual([
      'dataProduct',
      'glossaryTerm',
      'knowledgePage',
      'tag',
    ]);
  });

  it('merges pages in index order and drops FQN duplicates', () => {
    const merged = mergeLineageSearchHits([
      [hit('svc.db.a'), hit('svc.db.b')],
      [hit('svc.db.b'), hit('dom.sales')],
      [hit('svc.db.a'), hit('svc.db.c')],
    ]);
    expect(merged.map((item) => item.fullyQualifiedName)).toEqual([
      'svc.db.a',
      'svc.db.b',
      'dom.sales',
      'svc.db.c',
    ]);
  });

  it('caps merged hits at eight', () => {
    const first = Array.from({ length: 6 }, (_, index) => hit(`svc.db.t${index}`));
    const second = Array.from({ length: 6 }, (_, index) => hit(`svc.db.u${index}`));
    const merged = mergeLineageSearchHits([first, second]);
    expect(merged).toHaveLength(8);
    expect(merged.map((item) => item.fullyQualifiedName)).toEqual([
      'svc.db.t0',
      'svc.db.t1',
      'svc.db.t2',
      'svc.db.t3',
      'svc.db.t4',
      'svc.db.t5',
      'svc.db.u0',
      'svc.db.u1',
    ]);
  });

  it('returns an empty list when every page is empty', () => {
    expect(mergeLineageSearchHits([[], []])).toEqual([]);
  });
});
