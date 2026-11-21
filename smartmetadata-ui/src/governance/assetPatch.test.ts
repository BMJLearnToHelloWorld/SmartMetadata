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
import { API_SCHEMA_FIELD_BASES, certificationPatch, columnDescriptionPatch, columnTagsPatch, dataProductsPatch, descriptionPatch, domainsPatch, entityRefsPatch, extensionPatch, ownersPatch, tagRefToInput, tagsPatch, toTagLabel, withCertificationTag, withTierTag, type TagLabelInput } from './assetPatch';

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

  it('preserves a Generated labelType through toTagLabel', () => {
    expect(
      toTagLabel({ tagFQN: 'PII.Email', name: 'Email', source: 'Classification', labelType: 'Generated' }),
    ).toEqual({
      tagFQN: 'PII.Email',
      source: 'Classification',
      labelType: 'Generated',
      state: 'Confirmed',
    });
  });

  it('preserves a Suggested state through toTagLabel instead of flipping it to Confirmed', () => {
    expect(
      toTagLabel({
        tagFQN: 'PII.Email',
        name: 'Email',
        source: 'Classification',
        labelType: 'Generated',
        state: 'Suggested',
      }),
    ).toEqual({
      tagFQN: 'PII.Email',
      source: 'Classification',
      labelType: 'Generated',
      state: 'Suggested',
    });
  });

  it('preserves any incoming labelType instead of special-casing Generated', () => {
    expect(
      toTagLabel({ tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification', labelType: 'Derived' }),
    ).toMatchObject({ labelType: 'Derived' });
    expect(
      toTagLabel({ tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification', labelType: 'Automated' }),
    ).toMatchObject({ labelType: 'Automated' });
  });

  it('preserves Generated labels and defaults fresh picks to Manual in tagsPatch', () => {
    expect(
      tagsPatch(
        [],
        [
          { tagFQN: 'PII.Email', name: 'Email', source: 'Classification', labelType: 'Generated' },
          { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification' },
        ],
      ),
    ).toEqual([
      {
        op: 'replace',
        path: '/tags',
        value: [
          {
            tagFQN: 'PII.Email',
            source: 'Classification',
            labelType: 'Generated',
            state: 'Confirmed',
          },
          {
            tagFQN: 'PII.Sensitive',
            source: 'Classification',
            labelType: 'Manual',
            state: 'Confirmed',
          },
        ],
      },
    ]);
  });

  it('replaces one topic field tags array by its schemaFields index', () => {
    expect(
      columnTagsPatch(
        'topic',
        [1],
        [{ tagFQN: 'PII.Old', name: 'Old', source: 'Classification' }],
        [{ tagFQN: 'PII.Email', name: 'Email', source: 'Classification' }],
      ),
    ).toEqual([
      {
        op: 'replace',
        path: '/messageSchema/schemaFields/1/tags',
        value: [{ tagFQN: 'PII.Email', source: 'Classification', labelType: 'Manual', state: 'Confirmed' }],
      },
    ]);
  });

  it('descends through children for a nested container column', () => {
    expect(
      columnTagsPatch('container', [0, 2], [], [
        { tagFQN: 'Glossary.City', name: 'City', source: 'Glossary' },
      ]),
    ).toEqual([
      {
        op: 'replace',
        path: '/dataModel/columns/0/children/2/tags',
        value: [{ tagFQN: 'Glossary.City', source: 'Glossary', labelType: 'Manual', state: 'Confirmed' }],
      },
    ]);
  });

  it('adds the tags array when a search index field has none', () => {
    expect(
      columnTagsPatch('searchIndex', [0], undefined, [
        { tagFQN: 'PII.Email', name: 'Email', source: 'Classification' },
      ]),
    ).toEqual([
      {
        op: 'add',
        path: '/fields/0/tags',
        value: [{ tagFQN: 'PII.Email', source: 'Classification', labelType: 'Manual', state: 'Confirmed' }],
      },
    ]);
  });

  it('rejects an entity type with no column-tags patch base', () => {
    expect(() => columnTagsPatch('table', [0], [], [])).toThrow('No column-tags patch base');
  });

  it('rejects an empty index path instead of patching the whole array', () => {
    expect(() => columnTagsPatch('topic', [], [], [])).toThrow('non-empty index path');
  });
});

describe('D-2 batch 2 cell patch helpers', () => {
  it('preserves labelType and state when converting a stored tag ref', () => {
    expect(
      tagRefToInput({
        tagFQN: 'PII.Email',
        name: 'Email',
        source: 'Classification',
        labelType: 'Generated',
        state: 'Suggested',
      }),
    ).toEqual({
      tagFQN: 'PII.Email',
      name: 'Email',
      source: 'Classification',
      labelType: 'Generated',
      state: 'Suggested',
    });
  });

  it('writes entity refs as {id, type} pairs on the given path', () => {
    expect(entityRefsPatch('/experts', undefined, [{ id: 'u1', type: 'user' }])).toEqual([
      { op: 'add', path: '/experts', value: [{ id: 'u1', type: 'user' }] },
    ]);
    expect(dataProductsPatch([], [{ id: 'dp1', type: 'dataProduct' }])).toEqual([
      { op: 'replace', path: '/dataProducts', value: [{ id: 'dp1', type: 'dataProduct' }] },
    ]);
  });

  it('sets the certification field and removes it on clear, never replace-with-null', () => {
    expect(certificationPatch(undefined, 'Certification.Gold')).toEqual([
      {
        op: 'add',
        path: '/certification',
        value: {
          tagLabel: {
            tagFQN: 'Certification.Gold',
            source: 'Classification',
            labelType: 'Manual',
            state: 'Confirmed',
          },
        },
      },
    ]);
    expect(certificationPatch({ tagLabel: { tagFQN: 'Certification.Gold' } }, undefined)).toEqual([
      { op: 'remove', path: '/certification' },
    ]);
    expect(certificationPatch(undefined, undefined)).toEqual([]);
  });

  it('replaces the tier tag and keeps the other labels untouched', () => {
    const current: TagLabelInput[] = [
      { tagFQN: 'Tier.Tier1', name: 'Tier1', source: 'Classification' },
      { tagFQN: 'PII.Email', name: 'Email', source: 'Classification', labelType: 'Generated' },
    ];
    expect(
      withTierTag(current, { tagFQN: 'Tier.Tier2', name: 'Tier2', source: 'Classification' }),
    ).toEqual([
      { tagFQN: 'PII.Email', name: 'Email', source: 'Classification', labelType: 'Generated' },
      { tagFQN: 'Tier.Tier2', name: 'Tier2', source: 'Classification' },
    ]);
    expect(withTierTag(current, undefined)).toEqual([
      { tagFQN: 'PII.Email', name: 'Email', source: 'Classification', labelType: 'Generated' },
    ]);
  });

  it('replaces the certification tag and keeps the other labels untouched', () => {
    const current: TagLabelInput[] = [
      { tagFQN: 'Certification.Gold', name: 'Gold', source: 'Classification' },
      { tagFQN: 'PII.Email', name: 'Email', source: 'Classification' },
    ];
    expect(
      withCertificationTag(current, { tagFQN: 'Certification.Silver', name: 'Silver', source: 'Classification' }),
    ).toEqual([
      { tagFQN: 'PII.Email', name: 'Email', source: 'Classification' },
      { tagFQN: 'Certification.Silver', name: 'Silver', source: 'Classification' },
    ]);
    expect(withCertificationTag(current, undefined)).toEqual([
      { tagFQN: 'PII.Email', name: 'Email', source: 'Classification' },
    ]);
  });
});

describe('columnDescriptionPatch (D-2 batch 3 PATCH-group column description)', () => {
  it('replaces one topic field description by its schemaFields index', () => {
    expect(columnDescriptionPatch('topic', [1], 'old', 'new')).toEqual([
      { op: 'replace', path: '/messageSchema/schemaFields/1/description', value: 'new' },
    ]);
  });

  it('adds the description when a search index field has none', () => {
    expect(columnDescriptionPatch('searchIndex', [0], undefined, 'new')).toEqual([
      { op: 'add', path: '/fields/0/description', value: 'new' },
    ]);
  });

  it('writes an empty string as-is instead of emitting a remove op', () => {
    // Pin sends the edited string through updateFieldDescription,
    // including an empty string; the entity-description path differs
    // (empty means remove there).
    expect(columnDescriptionPatch('container', [0], 'old', '')).toEqual([
      { op: 'replace', path: '/dataModel/columns/0/description', value: '' },
    ]);
  });

  it('descends through children for a nested field', () => {
    expect(columnDescriptionPatch('topic', [0, 2], undefined, 'new')).toEqual([
      { op: 'add', path: '/messageSchema/schemaFields/0/children/2/description', value: 'new' },
    ]);
  });

  it('writes into the active API schema object via the base override', () => {
    expect(
      columnDescriptionPatch(
        'apiEndpoint',
        [0],
        undefined,
        'new',
        API_SCHEMA_FIELD_BASES.responseSchema,
      ),
    ).toEqual([
      { op: 'add', path: '/responseSchema/schemaFields/0/description', value: 'new' },
    ]);
    expect(
      columnTagsPatch(
        'apiEndpoint',
        [0],
        undefined,
        [{ tagFQN: 'PII.Email', name: 'Email', source: 'Classification' }],
        API_SCHEMA_FIELD_BASES.requestSchema,
      ),
    ).toEqual([
      {
        op: 'add',
        path: '/requestSchema/schemaFields/0/tags',
        value: [
          { tagFQN: 'PII.Email', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
        ],
      },
    ]);
  });

  it('rejects an entity type with no column-description patch base', () => {
    expect(() => columnDescriptionPatch('table', [0], undefined, 'new')).toThrow(
      'No column-description patch base',
    );
  });

  it('rejects an empty index path instead of patching the whole object', () => {
    expect(() => columnDescriptionPatch('topic', [], undefined, 'new')).toThrow(
      'non-empty index path',
    );
  });
});
