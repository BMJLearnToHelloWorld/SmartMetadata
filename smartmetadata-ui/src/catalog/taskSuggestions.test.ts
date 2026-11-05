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
import type { CollaborationTask } from '@/types/collaboration';
import { getTaskResolutionNewValue, normalizeTaskSuggestion, parseTaskSuggestionPayload } from './taskSuggestions';

function task(partial: Partial<CollaborationTask>): CollaborationTask {
  return { id: 't1', assignees: [], comments: [], ...partial };
}

describe('taskSuggestions', () => {
  it('normalizes a description suggestion from newDescription and resolves to it', () => {
    const normalized = normalizeTaskSuggestion(
      task({
        type: 'DescriptionUpdate',
        suggestionPayload: { currentDescription: 'old text', newDescription: 'new text' },
      }),
    );
    expect(normalized.currentDescription).toBe('old text');
    expect(normalized.suggestedValue).toBe('new text');
    expect(normalized.isSuggestionEmpty).toBe(false);
    expect(
      getTaskResolutionNewValue(
        task({
          type: 'DescriptionUpdate',
          suggestionPayload: { currentDescription: 'old text', newDescription: 'new text' },
        }),
      ),
    ).toBe('new text');
  });

  it('falls back to the legacy currentValue / suggestedValue field names', () => {
    const payload = parseTaskSuggestionPayload({ currentValue: 'legacy old', suggestedValue: 'legacy new' });
    expect(payload?.currentDescription).toBe('legacy old');
    expect(payload?.newDescription).toBe('legacy new');
    expect(payload).toBeDefined();
  });

  it('merges tag additions and removals into the suggested set and serializes it', () => {
    const normalized = normalizeTaskSuggestion(
      task({
        type: 'TagUpdate',
        suggestionPayload: {
          currentTags: ['a.b', 'a.c'],
          tagsToAdd: ['a.d'],
          tagsToRemove: ['a.c'],
        },
      }),
    );
    expect(normalized.suggestedTags).toEqual(['a.b', 'a.d']);
    expect(normalized.suggestedValue).toBe(JSON.stringify(['a.b', 'a.d']));
    expect(normalized.isSuggestionEmpty).toBe(false);
  });

  it('falls back to the legacy suggestedValue tag list when there is no tag operation', () => {
    const normalized = normalizeTaskSuggestion(
      task({
        type: 'TagUpdate',
        suggestionPayload: { suggestedValue: JSON.stringify(['x.y']) },
      }),
    );
    expect(normalized.suggestedTags).toEqual(['x.y']);
    expect(normalized.isSuggestionEmpty).toBe(false);
  });

  it('reports an empty suggestion when a description task has no new description', () => {
    const normalized = normalizeTaskSuggestion(
      task({ type: 'DescriptionUpdate', suggestionPayload: { currentDescription: 'only old' } }),
    );
    expect(normalized.isSuggestionEmpty).toBe(true);
    expect(normalized.suggestedValue).toBeUndefined();
  });

  it('ignores payloads without any suggestion field', () => {
    expect(parseTaskSuggestionPayload({ accessType: 'FullAccess' })).toBeUndefined();
    expect(parseTaskSuggestionPayload(null)).toBeUndefined();
  });
});
