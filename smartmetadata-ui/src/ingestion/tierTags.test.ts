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
import type { ServiceTagLabel } from '@/types/ingestion';
import {
  getCertificationTag,
  getTagsWithoutCertification,
  getTagsWithoutTier,
  getTierTag,
  isCertificationTag,
  isTierTag,
  tierTagsPatch,
} from './tierTags';

const SUGGESTED: ServiceTagLabel = {
  tagFQN: 'PII.Sensitive',
  name: 'Sensitive',
  displayName: 'Sensitive Data',
  description: 'Auto-detected PII',
  source: 'Classification',
  // Pin tagLabel.json: 'Suggested' is a state, not a label type; a
  // tool-suggested label carries labelType Automated + state Suggested.
  labelType: 'Automated',
  state: 'Suggested',
  reason: 'Recognizer match',
};

describe('tier tag helpers', () => {
  it('matches only the Tier. category prefix', () => {
    expect(isTierTag('Tier.Tier1')).toBe(true);
    expect(isTierTag('TierX.Tier1')).toBe(false);
    expect(isTierTag('Tier')).toBe(false);
    expect(isTierTag('PII.Sensitive')).toBe(false);
  });

  it('returns the first Tier.* label and the rest without tier', () => {
    const tags: ServiceTagLabel[] = [
      SUGGESTED,
      { tagFQN: 'Tier.Tier2', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
      { tagFQN: 'Tier.Tier1', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
    ];
    expect(getTierTag(tags)?.tagFQN).toBe('Tier.Tier2');
    expect(getTagsWithoutTier(tags)).toEqual([SUGGESTED]);
    expect(getTierTag([SUGGESTED])).toBeUndefined();
  });
});

describe('certification tag helpers', () => {
  it('matches only the Certification. category prefix', () => {
    expect(isCertificationTag('Certification.Gold')).toBe(true);
    expect(isCertificationTag('CertificationX.Gold')).toBe(false);
    expect(isCertificationTag('Certification')).toBe(false);
    expect(isCertificationTag('Tier.Tier1')).toBe(false);
  });

  it('returns the first Certification.* label and the rest without it', () => {
    const tags: ServiceTagLabel[] = [
      SUGGESTED,
      { tagFQN: 'Tier.Tier1', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
      {
        tagFQN: 'Certification.Gold',
        source: 'Classification',
        labelType: 'Manual',
        state: 'Confirmed',
      },
      {
        tagFQN: 'Certification.Silver',
        source: 'Classification',
        labelType: 'Manual',
        state: 'Confirmed',
      },
    ];
    expect(getCertificationTag(tags)?.tagFQN).toBe('Certification.Gold');
    expect(getTagsWithoutCertification(tags).map((tag) => tag.tagFQN)).toEqual([
      'PII.Sensitive',
      'Tier.Tier1',
    ]);
    expect(getCertificationTag([SUGGESTED])).toBeUndefined();
  });
});

describe('tierTagsPatch', () => {
  it('replaces the tier and keeps retained labels byte-identical', () => {
    const current: ServiceTagLabel[] = [
      SUGGESTED,
      { tagFQN: 'Tier.Tier2', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
    ];
    const [op] = tierTagsPatch(current, 'Tier.Tier1');
    expect(op?.path).toBe('/tags');
    expect(op?.value).toEqual([
      SUGGESTED,
      {
        tagFQN: 'Tier.Tier1',
        source: 'Classification',
        labelType: 'Manual',
        state: 'Confirmed',
      },
    ]);
    // Retained labels pass through as the stored objects, not rebuilds.
    expect((op?.value as ServiceTagLabel[])[0]).toBe(SUGGESTED);
  });

  it('clears the tier and leaves the other labels untouched', () => {
    const [op] = tierTagsPatch(
      [
        SUGGESTED,
        { tagFQN: 'Tier.Tier1', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
      ],
      undefined,
    );
    expect(op?.value).toEqual([SUGGESTED]);
  });

  it('filters every Tier.* label when dirty data holds more than one', () => {
    const [op] = tierTagsPatch(
      [
        { tagFQN: 'Tier.Tier1', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
        SUGGESTED,
        { tagFQN: 'Tier.Tier3', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
      ],
      'Tier.Tier2',
    );
    expect(op?.value).toEqual([
      SUGGESTED,
      {
        tagFQN: 'Tier.Tier2',
        source: 'Classification',
        labelType: 'Manual',
        state: 'Confirmed',
      },
    ]);
  });

  it('adds the tags field when the service has no tags yet', () => {
    const [op] = tierTagsPatch(undefined, 'Tier.Tier1');
    expect(op).toEqual({
      op: 'add',
      path: '/tags',
      value: [
        {
          tagFQN: 'Tier.Tier1',
          source: 'Classification',
          labelType: 'Manual',
          state: 'Confirmed',
        },
      ],
    });
  });

  it('keeps a Suggested label Suggested across a tier change', () => {
    const [op] = tierTagsPatch([SUGGESTED], 'Tier.Tier1');
    const retained = (op?.value as ServiceTagLabel[])[0];
    expect(retained?.labelType).toBe('Automated');
    expect(retained?.state).toBe('Suggested');
    expect(retained?.reason).toBe('Recognizer match');
  });
});
