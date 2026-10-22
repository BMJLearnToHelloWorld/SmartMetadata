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
import { descriptionPatch, domainsPatch, extensionPatch, ownersPatch, tagsPatch, toTagLabel } from './assetPatch';

describe('asset governance patches', () => {
  it('builds a TagLabel with the schema-required keys', () => {
    expect(toTagLabel({ tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification' })).toEqual({
      tagFQN: 'PII.Sensitive',
      source: 'Classification',
      labelType: 'Manual',
      state: 'Confirmed',
    });
  });

  it('replaces description when the field already exists', () => {
    expect(descriptionPatch('old', 'new copy')).toEqual([
      { op: 'replace', path: '/description', value: 'new copy' },
    ]);
  });

  it('adds owners when the asset has none', () => {
    expect(ownersPatch(undefined, [{ id: 'u1', type: 'user' }])).toEqual([
      { op: 'add', path: '/owners', value: [{ id: 'u1', type: 'user' }] },
    ]);
  });

  it('replaces the whole tags array with TagLabel objects', () => {
    expect(
      tagsPatch([], [{ tagFQN: 'Glossary.Customer', name: 'Customer', source: 'Glossary' }]),
    ).toEqual([
      {
        op: 'replace',
        path: '/tags',
        value: [
          {
            tagFQN: 'Glossary.Customer',
            source: 'Glossary',
            labelType: 'Manual',
            state: 'Confirmed',
          },
        ],
      },
    ]);
  });

  it('patches domains as entity references of type domain', () => {
    expect(domainsPatch([], ['d1'])).toEqual([
      { op: 'replace', path: '/domains', value: [{ id: 'd1', type: 'domain' }] },
    ]);
  });

  it('replaces the whole extension object for custom property values', () => {
    expect(extensionPatch({ retentionDays: 7 }, { retentionDays: 30, stewardNote: 'ok' })).toEqual([
      { op: 'replace', path: '/extension', value: { retentionDays: 30, stewardNote: 'ok' } },
    ]);
  });
});
