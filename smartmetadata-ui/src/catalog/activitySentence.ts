/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { ActivityEvent } from '@/types/collaboration';

/**
 * One whole sentence per event, with the actor and the entity as its
 * slots — a port of official
 * `components/MyData/Widgets/Common/TopicWidget/activityVerb.tsx`.
 *
 * Each sentence is translated as a unit rather than assembled from a verb
 * and a field noun, so a locale can order the parts its own way.
 */
const SENTENCE_KEYS: Partial<Record<string, string>> = {
  ColumnDescriptionUpdated: 'home.activityActorUpdatedColumnDescription',
  ColumnTagsUpdated: 'home.activityActorUpdatedColumnTags',
  CustomPropertyUpdated: 'home.activityActorUpdatedCustomProperty',
  DescriptionUpdated: 'home.activityActorUpdatedDescription',
  DomainUpdated: 'home.activityActorUpdatedDomain',
  EntityCreated: 'home.activityActorCreated',
  EntityDeleted: 'home.activityActorDeleted',
  EntityRestored: 'home.activityActorRestored',
  EntitySoftDeleted: 'home.activityActorDeleted',
  EntityUpdated: 'home.activityActorUpdated',
  OwnerUpdated: 'home.activityActorUpdatedOwners',
  PipelineStatusChanged: 'home.activityActorChangedStatus',
  TagsUpdated: 'home.activityActorUpdatedTags',
  TestCaseStatusChanged: 'home.activityActorChangedStatus',
  TierUpdated: 'home.activityActorUpdatedTier',
};

/** An unmapped event still reads as a generic update rather than a gap. */
export function getActivitySentenceKey(eventType: string): string {
  return SENTENCE_KEYS[eventType] ?? 'home.activityActorUpdated';
}

/** "<actor> updated the description of <entity>", translated as one sentence. */
export function activitySentence(
  event: ActivityEvent,
  t: (key: string, params?: Record<string, string>) => string,
): string {
  const actor = event.actor?.displayName ?? event.actor?.name ?? '';
  const entity = event.entity?.displayName ?? event.entity?.name ?? '';
  return t(getActivitySentenceKey(event.eventType), { actor, entity });
}
