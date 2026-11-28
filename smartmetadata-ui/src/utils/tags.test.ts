/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 *
 * Official TagsPureUtils helpers used by TagsViewer / Schema form.
 */
import { describe, expect, it } from 'vitest';
import {
  getClassificationTags,
  getGlossaryTags,
  getTagDisplay,
  getTagName,
  getTagRedirectLink,
  sortTagsBySource,
  type EntityTag,
} from './tags';

const classification: EntityTag = { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification' };
const glossary: EntityTag = { tagFQN: 'Glossary.PII.Email', name: 'Email', source: 'Glossary' };

describe('official tag helpers', () => {
  it('splits classification and glossary tags', () => {
    const tags = [classification, glossary];
    expect(getClassificationTags(tags)).toEqual([classification]);
    expect(getGlossaryTags(tags)).toEqual([glossary]);
    expect(getClassificationTags(undefined)).toEqual([]);
    expect(getGlossaryTags(undefined)).toEqual([]);
  });

  it('collapses tag FQNs longer than three levels', () => {
    expect(getTagDisplay('PII.Sensitive')).toBe('PII.Sensitive');
    expect(getTagDisplay('one.two.three.four')).toBe('one...three.four');
  });

  it('prefers displayName/name, then the official FQN display form', () => {
    expect(getTagName({ tagFQN: 'PII.Sensitive', displayName: 'Shown' })).toBe('Shown');
    expect(getTagName({ tagFQN: 'PII.Sensitive', name: 'Sensitive' })).toBe('Sensitive');
    expect(getTagName({ tagFQN: 'one.two.three.four' })).toBe('one...three.four');
    expect(getTagName({ tagFQN: 'Glossary.PII.Email' }, true)).toBe('PII.Email');
  });

  it('routes glossary and classification tags to the product detail paths', () => {
    expect(getTagRedirectLink(glossary)).toContain('/governance/terms/');
    expect(getTagRedirectLink(classification)).toContain('/governance/tags/');
  });

  it('dedupes by tagFQN and sorts by source', () => {
    const sorted = sortTagsBySource([glossary, classification, { ...classification }]);
    expect(sorted).toHaveLength(2);
    expect(sorted[0].source).toBe('Classification');
    expect(sorted[1].source).toBe('Glossary');
  });
});