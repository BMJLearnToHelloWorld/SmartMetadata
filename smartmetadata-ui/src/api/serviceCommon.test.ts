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
import { mapServiceAttributes, mapServiceTags } from './serviceCommon';

describe('mapServiceTags', () => {
  it('preserves every stored TagLabel field on a retained label', () => {
    const labels = mapServiceTags([
      {
        tagFQN: 'PII.Sensitive',
        name: 'Sensitive',
        displayName: 'Sensitive Data',
        description: 'Auto-detected PII',
        style: { color: '#ff0000', iconURL: 'https://example.invalid/icon.svg' },
        source: 'Classification',
        labelType: 'Suggested',
        state: 'Suggested',
        href: 'https://example.invalid/api/v1/tags/1',
        reason: 'Recognizer match',
        appliedAt: '2026-11-01T00:00:00.000Z',
        appliedBy: 'auto-classifier',
        metadata: { recognizer: 'EmailRecognizer', score: 0.9 },
      },
    ]);
    expect(labels).toEqual([
      {
        tagFQN: 'PII.Sensitive',
        name: 'Sensitive',
        displayName: 'Sensitive Data',
        description: 'Auto-detected PII',
        style: { color: '#ff0000', iconURL: 'https://example.invalid/icon.svg' },
        source: 'Classification',
        labelType: 'Suggested',
        state: 'Suggested',
        href: 'https://example.invalid/api/v1/tags/1',
        reason: 'Recognizer match',
        appliedAt: '2026-11-01T00:00:00.000Z',
        appliedBy: 'auto-classifier',
        metadata: { recognizer: 'EmailRecognizer', score: 0.9 },
      },
    ]);
  });

  it('maps a missing or non-array value to an empty array', () => {
    expect(mapServiceTags(undefined)).toEqual([]);
    expect(mapServiceTags(null)).toEqual([]);
    expect(mapServiceTags('Tier.Tier1')).toEqual([]);
    expect(mapServiceTags({ tagFQN: 'Tier.Tier1' })).toEqual([]);
  });

  it('drops entries without a tagFQN and non-record entries', () => {
    expect(
      mapServiceTags([{ name: 'nameless' }, 'Tier.Tier1', null, { tagFQN: 'Tier.Tier1' }]),
    ).toEqual([
      {
        tagFQN: 'Tier.Tier1',
        name: undefined,
        displayName: undefined,
        description: undefined,
        style: undefined,
        source: undefined,
        labelType: undefined,
        state: undefined,
        href: undefined,
        reason: undefined,
        appliedAt: undefined,
        appliedBy: undefined,
        metadata: undefined,
      },
    ]);
  });

  it('does not alias the stored metadata object', () => {
    const metadata = { recognizer: 'EmailRecognizer' };
    const labels = mapServiceTags([{ tagFQN: 'PII.Sensitive', metadata }]);
    expect(labels[0]?.metadata).toEqual(metadata);
    expect(labels[0]?.metadata).not.toBe(metadata);
  });
});

describe('mapServiceAttributes', () => {
  it('maps environment, region, and deployment', () => {
    expect(
      mapServiceAttributes({ environment: 'Production', region: 'us-east-1', deployment: 'prod-cluster-01' }),
    ).toEqual({ environment: 'Production', region: 'us-east-1', deployment: 'prod-cluster-01' });
  });

  it('maps a missing or malformed value to undefined', () => {
    expect(mapServiceAttributes(undefined)).toBeUndefined();
    expect(mapServiceAttributes(null)).toBeUndefined();
    expect(mapServiceAttributes('Production')).toBeUndefined();
  });

  it('keeps an environment string outside the pin closed set verbatim', () => {
    expect(mapServiceAttributes({ environment: 'OnPrem' })).toEqual({
      environment: 'OnPrem',
      region: undefined,
      deployment: undefined,
    });
  });
});
