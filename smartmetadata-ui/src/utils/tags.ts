/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 *
 * Official TagsPureUtils helpers used by TagsViewer and the
 * ContractSchemaFormTab columns (TagsPureUtils.ts).
 */
import { getEntityName } from '@/utils/dataContract';
import { getEncodedFqn } from '@/utils/fqnPaths';

export const LIST_SIZE = 5;
export const NO_DATA_PLACEHOLDER = '--';

export const TAG_SOURCE_CLASSIFICATION = 'Classification';
export const TAG_SOURCE_GLOSSARY = 'Glossary';
export const TAG_LABEL_GENERATED = 'Generated';

export interface EntityTagStyle {
  color?: string;
  iconURL?: string;
}

export interface EntityTag {
  tagFQN: string;
  name?: string;
  displayName?: string;
  description?: string;
  source?: string;
  labelType?: string;
  style?: EntityTagStyle;
}

export function getTagDisplay(tag?: string): string | undefined {
  const levels = tag?.split('.') ?? [];
  if (levels.length > 3) {
    return `${levels[0]}...${levels.slice(-2).join('.')}`;
  }
  return tag;
}

export function getTagName(tag: EntityTag, showOnlyName?: boolean): string {
  return (
    getEntityName(tag) ||
    getTagDisplay(showOnlyName ? tag.tagFQN.split('.').slice(-2).join('.') : tag.tagFQN) ||
    tag.tagFQN
  );
}

/**
 * Official getGlossaryPath / getClassificationTagPath, pointed at the
 * product detail routes that already exist (`governance/terms/:id` and
 * `governance/tags/:id`) rather than official `/glossary/:fqn` and
 * `/tag/:fqn`, which are not mounted in the product router.
 */
export function getGlossaryPath(fqn?: string): string {
  if (!fqn) {
    return '/governance/glossaries';
  }
  return `/governance/terms/${getEncodedFqn(fqn)}`;
}

export function getClassificationTagPath(tagFqn: string): string {
  return `/governance/tags/${getEncodedFqn(tagFqn)}`;
}

export function getTagRedirectLink(tag: EntityTag, tagType?: string): string {
  return (tagType ?? tag.source) === TAG_SOURCE_GLOSSARY
    ? getGlossaryPath(tag.tagFQN)
    : getClassificationTagPath(tag.tagFQN);
}

export function getGlossaryTags(tags: EntityTag[] | undefined): EntityTag[] {
  return tags?.filter((tag) => tag.source === TAG_SOURCE_GLOSSARY) ?? [];
}

export function getClassificationTags(tags: EntityTag[] | undefined): EntityTag[] {
  return tags?.filter((tag) => tag.source === TAG_SOURCE_CLASSIFICATION) ?? [];
}

export function sortTagsBySource(tags: EntityTag[] | undefined): EntityTag[] {
  const seen = new Set<string>();
  const unique = (tags ?? []).filter((tag) => {
    if (!tag.tagFQN || seen.has(tag.tagFQN)) {
      return false;
    }
    seen.add(tag.tagFQN);
    return true;
  });
  return [...unique].sort((left, right) => (left.source ?? '').localeCompare(right.source ?? ''));
}