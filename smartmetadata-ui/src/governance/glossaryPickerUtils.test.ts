/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { describe, expect, it } from 'vitest';
import {
  fqnsToGlossaryPickerTags,
  glossaryPickerTagsToFqns,
} from './glossaryPickerUtils';

describe('glossaryPickerUtils', () => {
  it('maps FQNs to glossary picker tags and back (pin fqnsToGlossaryTags)', () => {
    const tags = fqnsToGlossaryPickerTags(['Glossary.Customer', 'Glossary.Order']);
    expect(tags).toEqual([
      {
        tagFQN: 'Glossary.Customer',
        name: 'Customer',
        displayName: 'Glossary.Customer',
        source: 'Glossary',
      },
      {
        tagFQN: 'Glossary.Order',
        name: 'Order',
        displayName: 'Glossary.Order',
        source: 'Glossary',
      },
    ]);
    expect(glossaryPickerTagsToFqns(tags)).toEqual(['Glossary.Customer', 'Glossary.Order']);
  });
});