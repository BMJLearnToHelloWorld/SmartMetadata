/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import type { ActivityEvent } from '@/types/collaboration';
import { activitySentence, getActivitySentenceKey } from './activitySentence';

const t = (key: string, params?: Record<string, string>): string =>
  key.replace('{actor}', params?.actor ?? '').replace('{entity}', params?.entity ?? '');

function event(overrides: Partial<ActivityEvent> & { id: string }): ActivityEvent {
  return { eventType: 'EntityUpdated', ...overrides };
}

describe('activitySentence', () => {
  it('maps each event type to its sentence key', () => {
    expect(getActivitySentenceKey('DescriptionUpdated')).toBe(
      'home.activityActorUpdatedDescription',
    );
    expect(getActivitySentenceKey('EntityCreated')).toBe('home.activityActorCreated');
    expect(getActivitySentenceKey('TestCaseStatusChanged')).toBe(
      'home.activityActorChangedStatus',
    );
  });

  it('falls back to the generic update sentence for unmapped types', () => {
    expect(getActivitySentenceKey('SomethingNew')).toBe('home.activityActorUpdated');
  });

  it('renders one sentence with the actor and entity as slots', () => {
    expect(
      activitySentence(
        event({
          id: 'e1',
          eventType: 'DescriptionUpdated',
          actor: { id: 'u1', displayName: 'Alice', name: 'alice', type: 'user' },
          entity: { id: 't1', displayName: 'orders', name: 'orders', type: 'table' },
        }),
        t,
      ),
    ).toBe('home.activityActorUpdatedDescription');
  });
});
