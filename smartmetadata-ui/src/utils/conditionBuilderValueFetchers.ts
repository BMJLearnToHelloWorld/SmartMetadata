/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { searchAssets } from '@/api/search';
import { listTags } from '@/api/tags';
import { listTeams } from '@/api/teams';
import { searchUsers } from '@/api/users';
import type { WorkflowConditionBuilderOption } from '@/types/governance';

/**
 * Official conditionBuilderValueFetchers (pin a3012259ca), ported to the
 * product's search/list APIs (R-11: no TagSuggestion / GlossaryTermPicker /
 * UserTeamSelectableList components exist here). Every fetcher returns []
 * on failure, exactly as official's try/catch does — a failed lookup must
 * not break the condition row.
 *
 * Two adaptations:
 * - Experts/owners use `searchUsers` with the `isBot:false` filter
 *   (official's searchData call carries the same filter); teams have no
 *   search endpoint in the product API layer, so `listTeams` results are
 *   filtered client-side by the query text.
 * - Tags use `searchAssets` with the `tag` index (official's searchQuery
 *   with SearchIndex.TAG) and dedupe by value — a tag whose display name
 *   matches one in another classification must not drop its sibling.
 */

const PAGE_SIZE_MEDIUM = 25;
const PAGE_SIZE_LARGE = 1000;

function hitOption(hit: {
  fullyQualifiedName: string;
  displayName?: string;
  name: string;
}): WorkflowConditionBuilderOption {
  return {
    value: hit.fullyQualifiedName,
    label: hit.displayName ?? hit.name,
  };
}

export async function fetchCertificationOptions(
  _searchText: string,
): Promise<WorkflowConditionBuilderOption[]> {
  try {
    // Official CERTIFICATION_CATEGORY = 'Certification' (the classification
    // name); certification does not support search, so the full list is read.
    const page = await listTags({ limit: PAGE_SIZE_LARGE, parent: 'Certification' });
    return page.data
      .map((tag) => ({
        value: tag.fullyQualifiedName ?? tag.name ?? '',
        label: tag.displayName ?? tag.name ?? '',
      }))
      .filter((o) => o.value);
  } catch {
    return [];
  }
}

export async function fetchDataProductOptions(
  searchText: string,
): Promise<WorkflowConditionBuilderOption[]> {
  try {
    const page = await searchAssets(searchText || '*', 0, PAGE_SIZE_MEDIUM, {
      index: 'dataProduct',
    });
    return page.hits.map(hitOption).filter((o) => o.value);
  } catch {
    return [];
  }
}

export async function fetchDomainOptions(
  searchText: string,
): Promise<WorkflowConditionBuilderOption[]> {
  try {
    const page = await searchAssets(searchText || '*', 0, PAGE_SIZE_MEDIUM, {
      index: 'domain',
    });
    return page.hits.map(hitOption).filter((o) => o.value);
  } catch {
    return [];
  }
}

export async function fetchExpertOptions(
  searchText: string,
): Promise<WorkflowConditionBuilderOption[]> {
  try {
    const page = await searchUsers(searchText, 0, PAGE_SIZE_MEDIUM, 'isBot:false');
    return page.data
      .map((user) => ({
        // The product's user model carries no FQN; a user's FQN is its name.
        value: user.name ?? '',
        label: user.displayName ?? user.name ?? '',
      }))
      .filter((o) => o.value);
  } catch {
    return [];
  }
}

export async function fetchGlossaryOptions(
  searchText: string,
): Promise<WorkflowConditionBuilderOption[]> {
  try {
    const page = await searchAssets(searchText || '*', 0, PAGE_SIZE_MEDIUM, {
      index: 'glossaryTerm',
    });
    return page.hits.map(hitOption).filter((o) => o.value);
  } catch {
    return [];
  }
}

export async function fetchOwnerOptions(
  searchText: string,
): Promise<WorkflowConditionBuilderOption[]> {
  try {
    const [userPage, teamPage] = await Promise.all([
      searchUsers(searchText, 0, PAGE_SIZE_MEDIUM, 'isBot:false'),
      listTeams({ limit: PAGE_SIZE_LARGE }),
    ]);
    const query = searchText.trim().toLowerCase();
    const userOpts = userPage.data.map((user) => ({
      // The product's user/team models carry no FQN; a user FQN is its name.
      value: user.name ?? '',
      label: user.displayName ?? user.name ?? '',
    }));
    const teamOpts = teamPage.data
      .filter(
        (team) =>
          !query ||
          team.name.toLowerCase().includes(query) ||
          (team.displayName ?? '').toLowerCase().includes(query),
      )
      .map((team) => ({
        value: team.name ?? '',
        label: team.displayName ?? team.name ?? '',
      }));
    return [...userOpts, ...teamOpts].filter((o) => o.value);
  } catch {
    return [];
  }
}

export async function fetchRelatedTermsOptions(
  searchText: string,
): Promise<WorkflowConditionBuilderOption[]> {
  return fetchGlossaryOptions(searchText);
}

export async function fetchSynonymsOptions(
  searchText: string,
): Promise<WorkflowConditionBuilderOption[]> {
  return fetchGlossaryOptions(searchText);
}

export async function fetchTagOptions(
  searchText: string,
): Promise<WorkflowConditionBuilderOption[]> {
  try {
    const page = await searchAssets(
      searchText.trim() || '*',
      0,
      PAGE_SIZE_LARGE,
      { index: 'tag' },
    );
    const seen = new Set<string>();
    return page.hits
      .flatMap((hit) => {
        const fqn = hit.fullyQualifiedName ?? '';
        if (!fqn || seen.has(fqn)) {
          return [];
        }
        seen.add(fqn);
        const parts = fqn.split('.');
        return [
          {
            value: fqn,
            label: hit.displayName ?? hit.name,
            supportingText: parts.slice(0, -1).join('.'),
          },
        ];
      })
      .filter((o) => o.value);
  } catch {
    return [];
  }
}
