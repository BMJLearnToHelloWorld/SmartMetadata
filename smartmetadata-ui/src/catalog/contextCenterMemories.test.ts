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
import type { ContextMemory } from '@/types/contextCenter';
import {
  buildMemoryCreatePayload,
  buildMemoryUpdatePatch,
  diffList,
  diffText,
  getClaimUpdatedAt,
  getComparedMemories,
  getConflictRecency,
  getMemoryCitations,
  getMemoryDiffRows,
  getMemoryLinkedEntities,
  getReviewDisputes,
  getSortConfig,
  resolveMemoryType,
  slugMemoryName,
} from './contextCenterMemories';

function memory(overrides: Partial<ContextMemory> = {}): ContextMemory {
  return {
    id: 'm1',
    name: 'what-is-churn',
    title: 'What is churn?',
    question: 'What is churn?',
    answer: 'Lost customers.',
    entityStatus: 'Approved',
    updatedAt: 1700000000000,
    ...overrides,
  };
}

describe('getSortConfig', () => {
  it('maps usage to appliedCount desc, never usageCount', () => {
    expect(getSortConfig('usage')).toEqual({ sortBy: 'appliedCount', sortOrder: 'desc' });
  });

  it('maps updatedBy to ascending and defaults to updatedAt desc', () => {
    expect(getSortConfig('updatedBy')).toEqual({ sortBy: 'updatedBy', sortOrder: 'asc' });
    expect(getSortConfig('updated')).toEqual({ sortBy: 'updatedAt', sortOrder: 'desc' });
  });
});

describe('getMemoryCitations', () => {
  it('falls back to usageCount/lastUsedAt before outcomes exist', () => {
    expect(
      getMemoryCitations(memory({ usageCount: 3, lastUsedAt: 1699000000000 })),
    ).toEqual({ count: 3, lastAt: 1699000000000 });
  });

  it('reads appliedCount/lastAppliedAt once outcomes are counted', () => {
    expect(
      getMemoryCitations(
        memory({
          usageCount: 9,
          outcomes: { countedAt: 1700000001000, appliedCount: 4, lastAppliedAt: 1700000002000 },
        }),
      ),
    ).toEqual({ count: 4, lastAt: 1700000002000 });
  });

  it('counts zero applied once counted, even when usage is higher', () => {
    expect(
      getMemoryCitations(memory({ usageCount: 9, outcomes: { countedAt: 1, appliedCount: 0 } })),
    ).toEqual({ count: 0, lastAt: undefined });
  });
});

describe('slugMemoryName', () => {
  it('slugs the title, lowercases and truncates to 64 chars', () => {
    expect(slugMemoryName('What Is Churn?', 'fallback')).toBe('what-is-churn-');
    expect(slugMemoryName('', 'A'.repeat(100))).toBe('a'.repeat(64));
  });

  it('falls back to the memory text when the title is blank', () => {
    expect(slugMemoryName('  ', 'Lost Customers!')).toBe('lost-customers-');
  });
});

describe('resolveMemoryType', () => {
  it('keeps an agent-only stored type when nothing is selected', () => {
    expect(resolveMemoryType('Learning', undefined)).toBe('Learning');
  });

  it('drops a form-offered stored type when nothing is selected', () => {
    expect(resolveMemoryType('FAQ', undefined)).toBeUndefined();
  });

  it('prefers the selected type', () => {
    expect(resolveMemoryType('Learning', 'Note')).toBe('Note');
  });
});

describe('buildMemoryCreatePayload', () => {
  it('builds the official create payload with shareConfig always present', () => {
    const payload = buildMemoryCreatePayload({
      title: 'What Is Churn?',
      memory: 'Lost customers.',
      memoryType: 'FAQ',
      visibility: 'Private',
      tags: [{ tagFQN: 'PII.Sensitive', name: 'Sensitive' }],
      primaryEntity: { id: 't1', type: 'table', name: 'churn' },
    });
    expect(payload).toEqual({
      name: 'what-is-churn-',
      question: 'Lost customers.',
      answer: 'Lost customers.',
      title: 'What Is Churn?',
      memoryType: 'FAQ',
      tags: [{ tagFQN: 'PII.Sensitive', name: 'Sensitive' }],
      primaryEntity: { id: 't1', type: 'table', name: 'churn' },
      shareConfig: { visibility: 'Private' },
    });
  });

  it('omits empty optional fields', () => {
    const payload = buildMemoryCreatePayload({ memory: 'Just text.', visibility: 'Shared' });
    expect(payload).toEqual({
      name: 'just-text-',
      question: 'Just text.',
      answer: 'Just text.',
      shareConfig: { visibility: 'Shared' },
    });
  });
});

describe('buildMemoryUpdatePatch', () => {
  it('emits diff-only ops and always clears summary', () => {
    const ops = buildMemoryUpdatePatch(
      memory({
        question: 'Lost customers.',
        summary: 'old summary',
        shareConfig: { visibility: 'Private' },
      }),
      {
        title: 'What is churn?',
        memory: 'Lost customers.',
        visibility: 'Private',
        tags: [],
        relatedEntities: [],
      },
    );
    expect(ops).toEqual([{ op: 'replace', path: '/summary', value: '' }]);
  });

  it('adds shareConfig when visibility leaves Private', () => {
    const ops = buildMemoryUpdatePatch(memory({ question: 'Lost customers.' }), {
      title: 'What is churn?',
      memory: 'Lost customers.',
      visibility: 'Shared',
      tags: [],
      relatedEntities: [],
    });
    expect(ops).toEqual([
      { op: 'add', path: '/shareConfig', value: { visibility: 'Shared' } },
    ]);
  });

  it('emits no op when nothing changed', () => {
    const ops = buildMemoryUpdatePatch(
      memory({ question: 'Lost customers.', summary: '', shareConfig: { visibility: 'Private' } }),
      {
        title: 'What is churn?',
        memory: 'Lost customers.',
        memoryType: undefined,
        visibility: 'Private',
        tags: [],
        relatedEntities: [],
      },
    );
    expect(ops).toEqual([]);
  });

  it('normalizes linked entities so server-added fields emit no op', () => {
    const stored = memory({
      question: 'Lost customers.',
      primaryEntity: { id: 't1', type: 'table', name: 'churn', fullyQualifiedName: 'svc.churn' },
    });
    const ops = buildMemoryUpdatePatch(stored, {
      title: 'What is churn?',
      memory: 'Lost customers.',
      visibility: 'Private',
      tags: [],
      primaryEntity: { id: 't1', type: 'table', name: 'churn', fullyQualifiedName: 'svc.churn' },
      relatedEntities: [],
    });
    expect(ops).toEqual([]);
  });
});

describe('getReviewDisputes', () => {
  it('parses disputes and skips malformed entries', () => {
    expect(
      getReviewDisputes({
        disputes: [
          { memory: { id: 'm2', type: 'contextMemory', name: 'other' }, detectedAt: 123 },
          { memory: { name: 'no-id' } },
          'not-an-object',
          { memory: { id: 'm3', type: 'contextMemory', name: 'third' } },
        ],
      }),
    ).toEqual([
      { memory: { id: 'm2', type: 'contextMemory', name: 'other' }, detectedAt: 123 },
      { memory: { id: 'm3', type: 'contextMemory', name: 'third' } },
    ]);
  });

  it('returns empty for a missing payload', () => {
    expect(getReviewDisputes(undefined)).toEqual([]);
    expect(getReviewDisputes({})).toEqual([]);
  });
});

describe('getClaimUpdatedAt / getConflictRecency', () => {
  it('prefers lastContentUpdatedAt over updatedAt', () => {
    expect(getClaimUpdatedAt(memory({ updatedAt: 100, lastContentUpdatedAt: 200 }))).toBe(200);
    expect(getClaimUpdatedAt(memory({ updatedAt: 100 }))).toBe(100);
  });

  it('marks the reviewed side newer only when newer than every disputed claim', () => {
    const reviewed = memory({ lastContentUpdatedAt: 300 });
    const disputed = [
      memory({ id: 'm2', lastContentUpdatedAt: 100 }),
      memory({ id: 'm3', lastContentUpdatedAt: 200 }),
    ];
    expect(getConflictRecency(reviewed, disputed)).toEqual({
      reviewed: 'newer',
      disputed: { m2: 'older', m3: 'older' },
    });
  });

  it('leaves the reviewed side undecided when disputed claims disagree', () => {
    const reviewed = memory({ lastContentUpdatedAt: 200 });
    const disputed = [
      memory({ id: 'm2', lastContentUpdatedAt: 100 }),
      memory({ id: 'm3', lastContentUpdatedAt: 300 }),
    ];
    const recency = getConflictRecency(reviewed, disputed);
    expect(recency.reviewed).toBeUndefined();
    expect(recency.disputed).toEqual({ m2: 'older', m3: 'newer' });
  });
});

describe('getComparedMemories', () => {
  it('carries contentUpdatedAt for readable memories and none for unreadable ones', () => {
    expect(
      getComparedMemories([
        { id: 'm1', memory: memory({ lastContentUpdatedAt: 500 }) },
        { id: 'm2' },
        {},
      ]),
    ).toEqual([
      { id: 'm1', contentUpdatedAt: 500 },
      { id: 'm2', contentUpdatedAt: undefined },
    ]);
  });
});

describe('diffText', () => {
  it('marks only the differing words on each side', () => {
    const { current, proposed, isChanged } = diffText('Lost customers churn', 'Lost users churn');
    expect(isChanged).toBe(true);
    expect(current.map((part) => `${part.value}${part.change ? `:${part.change}` : ''}`)).toEqual([
      'Lost',
      ' ',
      'customers:removed',
      ' ',
      'churn',
    ]);
    expect(proposed.map((part) => `${part.value}${part.change ? `:${part.change}` : ''}`)).toEqual([
      'Lost',
      ' ',
      'users:added',
      ' ',
      'churn',
    ]);
  });

  it('reports unchanged text as unchanged', () => {
    expect(diffText('same text', 'same text').isChanged).toBe(false);
  });
});

describe('diffList', () => {
  it('marks values held by only one side', () => {
    const sides = diffList(
      [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
      ],
      [
        { key: 'b', label: 'B' },
        { key: 'c', label: 'C' },
      ],
    );
    expect(sides.isChanged).toBe(true);
    expect(sides.current.map((part) => part.change)).toEqual(['removed', undefined]);
    expect(sides.proposed.map((part) => part.change)).toEqual([undefined, 'added']);
  });
});

describe('getMemoryDiffRows', () => {
  const t = (key: string): string => key;

  it('builds nine rows and marks changed fields', () => {
    const rows = getMemoryDiffRows(
      memory({ title: 'Old title', answer: 'Old answer' }),
      memory({ title: 'New title', answer: 'Old answer' }),
      t,
    );
    expect(rows).toHaveLength(9);
    expect(rows.map((row) => row.key)).toEqual([
      'title',
      'memory',
      'question',
      'type',
      'linked-assets',
      'visibility',
      'tags',
      'source',
      'owners',
    ]);
    expect(rows[0]?.sides.isChanged).toBe(true);
    expect(rows[1]?.sides.isChanged).toBe(false);
  });

  it('marks nothing when a side is missing', () => {
    const rows = getMemoryDiffRows(memory({ title: 'Only side' }), undefined, t);
    expect(rows.every((row) => !row.sides.isChanged)).toBe(true);
  });
});

describe('getMemoryLinkedEntities', () => {
  it('dedups by id and caps at four with a hidden count', () => {
    const refs = Array.from({ length: 6 }, (_, i) => ({
      id: `e${i}`,
      type: 'table',
      name: `t${i}`,
    }));
    const { visible, hiddenCount } = getMemoryLinkedEntities(
      memory({ primaryEntity: refs[0], relatedEntities: [...refs, refs[1]] }),
    );
    expect(visible).toHaveLength(4);
    expect(hiddenCount).toBe(2);
  });
});
