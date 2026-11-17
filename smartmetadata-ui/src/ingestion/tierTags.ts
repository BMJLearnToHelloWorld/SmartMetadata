/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { setFieldPatch, type JsonPatchOp } from '@/admin/jsonPatch';
import type { ServiceTagLabel } from '@/types/ingestion';

/**
 * Tier and certification helpers, ported from pin
 * utils/TablePureUtils.ts (isTierTag, getTierTags,
 * getTagsWithoutTier, isCertificationTag, getCertificationTag,
 * getTagsWithoutCertification) at a3012259ca: a tier is the first
 * tag label whose FQN starts with the `Tier` category plus the FQN
 * separator, and a certification the first whose FQN starts with the
 * `Certification` category plus the separator. A label such as
 * `TierX.Foo` is neither.
 */
export const TIER_TAG_PREFIX = 'Tier.';
export const CERTIFICATION_TAG_PREFIX = 'Certification.';

export function isTierTag(tagFQN: string): boolean {
  return tagFQN.startsWith(TIER_TAG_PREFIX);
}

export function isCertificationTag(tagFQN: string): boolean {
  return tagFQN.startsWith(CERTIFICATION_TAG_PREFIX);
}

/** First `Tier.*` label, or undefined when the service has no tier. */
export function getTierTag<T extends { tagFQN: string }>(tags: readonly T[]): T | undefined {
  return tags.find((tag) => isTierTag(tag.tagFQN));
}

/** First `Certification.*` label, or undefined when there is none. */
export function getCertificationTag<T extends { tagFQN: string }>(
  tags: readonly T[],
): T | undefined {
  return tags.find((tag) => isCertificationTag(tag.tagFQN));
}

/** Every label except the `Tier.*` ones, in stored order. */
export function getTagsWithoutTier<T extends { tagFQN: string }>(tags: readonly T[]): T[] {
  return tags.filter((tag) => !isTierTag(tag.tagFQN));
}

/** Every label except the `Certification.*` ones, in stored order. */
export function getTagsWithoutCertification<T extends { tagFQN: string }>(
  tags: readonly T[],
): T[] {
  return tags.filter((tag) => !isCertificationTag(tag.tagFQN));
}

/**
 * Pin onUpdateTier (integration ConnectionServiceDetailsPage): filter
 * out every existing `Tier.*` label, then append the new tier label —
 * or append nothing when clearing. Retained labels pass through as
 * the stored objects, untouched: rebuilding them through toTagLabel
 * would drop their display fields and reset an Automated labelType or
 * a Suggested state to Manual/Confirmed.
 *
 * The new label is the pin integration shape verbatim —
 * `{tagFQN, source: 'Classification', labelType: 'Manual', state:
 * 'Confirmed'}` — built as a literal rather than through toTagLabel,
 * whose picker input requires a `name` the pin label does not carry.
 */
export function tierTagsPatch(
  currentTags: ServiceTagLabel[] | undefined,
  newTierFqn?: string,
): JsonPatchOp[] {
  const retained = getTagsWithoutTier(currentTags ?? []);
  const next: ServiceTagLabel[] = newTierFqn
    ? [
        ...retained,
        {
          tagFQN: newTierFqn,
          source: 'Classification',
          labelType: 'Manual',
          state: 'Confirmed',
        },
      ]
    : retained;
  return setFieldPatch('/tags', currentTags, next);
}
