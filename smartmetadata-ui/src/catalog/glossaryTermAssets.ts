/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { TagAssetsQueryFilter } from '@/catalog/tagAssets';
import { getTermQuery } from '@/catalog/tagAssets';

/**
 * GlossaryTerm assets tab query builders — pin ports, no product invention.
 *
 * Sources (pin a3012259ca, verified against e07bbd8f):
 * - getGlossaryTermAssetsQueryFilter: the GLOSSARY branch of
 *   queryParamBuilders (components/Glossary/GlossaryTerms/tabs/
 *   AssetsTabs.component.tsx:250-251) — `getTermQuery({'tags.tagFQN': fqn})`;
 *   the same filter drives the tab count in GlossaryTermsV1
 *   fetchGlossaryTermAssets (:151-169).
 * - getQueryFilterToExcludeTerm: utils/GlossaryPureUtils.ts:85-113.
 *
 * Deliberately NOT the Tag variant: the term picker excludes only the
 * three fixed entity types (glossaryTerm, tag, dataProduct). Pin's Tag
 * picker additionally excludes the types the viewer cannot EditTags on
 * (TagsPureUtils.ts:180-220); the term picker has no such per-type
 * exclusion, so the two filters must not be "unified".
 */

/**
 * Official GLOSSARY queryParamBuilders branch
 * (AssetsTabs.component.tsx:250-251).
 */
export function getGlossaryTermAssetsQueryFilter(fqn: string): TagAssetsQueryFilter {
  return getTermQuery({ 'tags.tagFQN': fqn });
}

/**
 * Official getQueryFilterToExcludeTerm (GlossaryPureUtils.ts:85-113),
 * verbatim shape: already-tagged assets are excluded by `tags.tagFQN`,
 * and glossary terms, tags and data products are never offered as
 * linkable assets.
 */
export function getQueryFilterToExcludeTerm(fqn: string): TagAssetsQueryFilter {
  return {
    query: {
      bool: {
        must: [
          {
            bool: {
              must_not: [{ term: { 'tags.tagFQN': fqn } }],
            },
          },
          {
            bool: {
              must_not: [
                { term: { entityType: 'glossaryTerm' } },
                { term: { entityType: 'tag' } },
                { term: { entityType: 'dataProduct' } },
              ],
            },
          },
        ],
      },
    },
  };
}
