/**
 * Official GlossaryTagSuggestionUtils (openmetadata-ui
 * components/common/GlossaryTermPicker/GlossaryTagSuggestionUtils.tsx):
 * filter stores bare term FQNs; the picker speaks TagLabel-shaped values.
 */
import type { TagRef } from '@/types/api';

export interface GlossaryPickerTag {
  tagFQN: string;
  name?: string;
  displayName?: string;
  source: 'Glossary';
}

export function fqnsToGlossaryPickerTags(fqns: string[]): GlossaryPickerTag[] {
  return fqns.filter(Boolean).map((tagFQN) => ({
    tagFQN,
    name: tagFQN.split('.').pop() ?? tagFQN,
    displayName: tagFQN,
    source: 'Glossary',
  }));
}

export function glossaryPickerTagsToFqns(tags: GlossaryPickerTag[] | TagRef[]): string[] {
  return tags.map((tag) => tag.tagFQN).filter(Boolean);
}