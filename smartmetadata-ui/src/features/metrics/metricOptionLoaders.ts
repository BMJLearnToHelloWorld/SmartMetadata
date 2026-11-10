/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { searchAssets } from '@/api/search';
import { searchUsers } from '@/api/users';
import { composeSearchQuery } from '@/catalog/searchQuery';
import type { EntityRef } from '@/types/api';

/**
 * Create-drawer option loaders, ported from the official AddMetricForm
 * fetch*Options (components/Metric/AddMetric/AddMetricForm.tsx):
 * users + teams in parallel (USER/TEAM indexes, users filtered to
 * non-bots, teams to Group only, displayName.keyword ascending);
 * domains from the DOMAIN index; related/parent metrics from the metric
 * search. Every loader returns [] on failure, exactly as the official
 * try/catch does — a failed lookup must not break the form. Search
 * changes are debounced 250ms by the drawer, the official debounce.
 *
 * Reuse evaluation (condition 7), recorded here rather than re-decided
 * in the drawer:
 * - UserTeamPicker (workflowBuilder/forms) was evaluated and NOT
 *   reused: it loads teams from listTeams(100) with client-side
 *   filtering — no teamType Group restriction, no remote team search,
 *   and a 100-row cap that silently drops teams in a large org. The
 *   official loader searches the TEAM index remotely with the Group
 *   filter, so the loaders below are built on searchAssets/searchUsers
 *   instead. Its option shape (`user:${name}` / `team:${name}` values
 *   resolving to EntityRefs) is kept, so the two pickers stay
 *   compatible.
 * - DomainSelect (shared) was evaluated and NOT reused: it is a
 *   single-select active-domain scope switch bound to the domain
 *   store, not a multi-select form field. Domains load from the
 *   DOMAIN index here, per the official fetchDomainOptions.
 * - Related/parent metrics are new async selects on the metric search
 *   (composeSearchQuery entityType metric, the flat list's proven
 *   query), 250ms debounced.
 */

export interface MetricOption {
  value: string;
  label: string;
  supportingText?: string;
  ref: EntityRef;
}

/** Official PAGE_SIZE_MEDIUM (constants.ts). */
const PAGE_SIZE_MEDIUM = 25;

function userTeamQueryFilter(): string {
  return JSON.stringify({
    query: { bool: { must: [{ term: { isBot: 'false' } }] } },
  });
}

function groupTeamQueryFilter(): string {
  // Official getTermQuery({}, 'must', undefined, { matchTerms:
  // { teamType: 'Group' } }) — a match clause under bool.must.
  return JSON.stringify({
    query: { bool: { must: [{ match: { teamType: 'Group' } }] } },
  });
}

/**
 * Official fetchUserTeamOptions: USER and TEAM searches in parallel.
 * Users carry `user:${name}` values, teams `team:${name}`.
 */
export async function fetchUserTeamOptions(searchText = ''): Promise<MetricOption[]> {
  try {
    const [users, teams] = await Promise.all([
      searchUsers(searchText, 0, PAGE_SIZE_MEDIUM, userTeamQueryFilter()),
      searchAssets(searchText, 0, PAGE_SIZE_MEDIUM, {
        index: 'team',
        query_filter: groupTeamQueryFilter(),
        sortField: 'displayName.keyword',
        sortOrder: 'asc',
      }),
    ]);
    const userOptions: MetricOption[] = users.data.flatMap((user) => {
      if (!user.name) {
        return [];
      }
      return [
        {
          value: `user:${user.name}`,
          label: user.displayName ?? user.name,
          supportingText: user.name,
          ref: {
            id: user.id,
            type: 'user',
            name: user.name,
            displayName: user.displayName,
            fullyQualifiedName: user.name,
          } satisfies EntityRef,
        },
      ];
    });
    const teamOptions: MetricOption[] = teams.hits.flatMap((hit) => {
      const fullyQualifiedName = hit.fullyQualifiedName ?? hit.name;
      if (!fullyQualifiedName) {
        return [];
      }
      return [
        {
          value: `team:${hit.name}`,
          label: hit.displayName ?? hit.name,
          supportingText: fullyQualifiedName,
          ref: {
            id: hit.id,
            type: 'team',
            name: hit.name,
            displayName: hit.displayName,
            fullyQualifiedName,
          } satisfies EntityRef,
        },
      ];
    });
    return [...userOptions, ...teamOptions];
  } catch {
    return [];
  }
}

/** Official fetchDomainOptions: DOMAIN index search. */
export async function fetchDomainOptions(searchText = ''): Promise<MetricOption[]> {
  try {
    const page = await searchAssets(searchText, 0, PAGE_SIZE_MEDIUM, { index: 'domain' });
    return page.hits.flatMap((hit) => {
      const fullyQualifiedName = hit.fullyQualifiedName ?? hit.name;
      if (!fullyQualifiedName) {
        return [];
      }
      return [
        {
          value: fullyQualifiedName,
          label: hit.displayName ?? hit.name,
          supportingText: fullyQualifiedName,
          ref: {
            id: hit.id,
            type: 'domain',
            name: hit.name,
            displayName: hit.displayName,
            fullyQualifiedName,
          } satisfies EntityRef,
        },
      ];
    });
  } catch {
    return [];
  }
}

function metricOptionFromHit(hit: {
  id?: string;
  name: string;
  displayName?: string;
  fullyQualifiedName: string;
}): MetricOption[] {
  const fullyQualifiedName = hit.fullyQualifiedName ?? hit.name;
  if (!fullyQualifiedName) {
    return [];
  }
  return [
    {
      value: fullyQualifiedName,
      label: hit.displayName ?? hit.name,
      supportingText: fullyQualifiedName,
      // Official fetchRelatedMetricOptions: the reference id is the
      // fully qualified name, not the search hit id.
      ref: {
        id: fullyQualifiedName,
        type: 'metric',
        name: hit.name,
        displayName: hit.displayName,
        fullyQualifiedName,
      } satisfies EntityRef,
    },
  ];
}

/** Official fetchRelatedMetricOptions: metric search, FQN-keyed options. */
export async function fetchRelatedMetricOptions(searchText = ''): Promise<MetricOption[]> {
  try {
    const page = await searchAssets(
      composeSearchQuery(searchText, { entityType: ['metric'] }),
      0,
      PAGE_SIZE_MEDIUM,
    );
    return page.hits.flatMap(metricOptionFromHit);
  } catch {
    return [];
  }
}

/** Official fetchParentMetricOptions: same shape as the related list. */
export async function fetchParentMetricOptions(searchText = ''): Promise<MetricOption[]> {
  return fetchRelatedMetricOptions(searchText);
}
