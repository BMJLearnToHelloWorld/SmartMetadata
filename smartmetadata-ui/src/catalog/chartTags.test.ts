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
import { mergeChartTags } from './chartTags';
import type { TagRef } from '@/types/api';
import type { AssetTagOption } from '@/types/governance';

const CURRENT: TagRef[] = [
  { tagFQN: 'PII.Email', name: 'Email', source: 'Classification', labelType: 'Generated', state: 'Confirmed' },
  { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
  { tagFQN: 'Glossary.Contact', name: 'Contact', source: 'Glossary', labelType: 'Manual', state: 'Confirmed' },
];

const OPTIONS: AssetTagOption[] = [
  { tagFQN: 'PII.Email', name: 'Email', source: 'Classification' },
  { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification' },
  { tagFQN: 'PII.Phone', name: 'Phone', source: 'Classification' },
  { tagFQN: 'Glossary.Contact', name: 'Contact', source: 'Glossary' },
];

describe('mergeChartTags', () => {
  it('keeps other-source tags, keeps re-selected tags as-is, builds new ones as Manual/Confirmed', () => {
    const merged = mergeChartTags(CURRENT, 'Classification', ['PII.Email', 'PII.Phone'], OPTIONS);
    expect(merged).toEqual([
      { tagFQN: 'Glossary.Contact', name: 'Contact', source: 'Glossary', labelType: 'Manual', state: 'Confirmed' },
      { tagFQN: 'PII.Email', name: 'Email', source: 'Classification', labelType: 'Generated', state: 'Confirmed' },
      { tagFQN: 'PII.Phone', name: 'Phone', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
    ]);
  });

  it('drops deselected tags of the edited source only', () => {
    const merged = mergeChartTags(CURRENT, 'Classification', [], OPTIONS);
    expect(merged.map((tag) => tag.tagFQN)).toEqual(['Glossary.Contact']);
  });

  it('falls back to the last FQN segment when the option carries no name', () => {
    const merged = mergeChartTags([], 'Classification', ['PII.Unknown'], []);
    expect(merged[0]).toMatchObject({ tagFQN: 'PII.Unknown', name: 'Unknown', source: 'Classification' });
  });
});
