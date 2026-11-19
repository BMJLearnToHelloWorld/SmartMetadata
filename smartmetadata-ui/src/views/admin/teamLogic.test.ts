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
import type { AdminTeam } from '@/types/admin';
import {
  buildSlashedTeamName,
  buildTeamPageBreadcrumbs,
  getFirstSubscription,
  getTeamOptionsFromType,
  getTeamTabCounts,
  getTeamTabs,
  getTeamTypeEditOptions,
  graftHierarchyChildren,
  isDropRestricted,
  isValidSubscriptionEndpoint,
  shouldShowTeamsEmptyState,
  toHierarchyNode,
} from './teamLogic';

function team(overrides: Partial<AdminTeam> = {}): AdminTeam {
  return {
    id: 't1',
    name: 'team-a',
    teamType: 'Group',
    users: [],
    defaultRoles: [],
    parents: [],
    policies: [],
    ...overrides,
  };
}

describe('teamLogic tab split (pin TeamDetailsV1.utils getTabs)', () => {
  it('shows teams/roles/policies/custom_properties for Organization', () => {
    expect(getTeamTabs('Organization')).toEqual(['teams', 'roles', 'policies', 'custom_properties']);
  });

  it('shows users/assets/roles/policies/custom_properties for Group', () => {
    expect(getTeamTabs('Group')).toEqual(['users', 'assets', 'roles', 'policies', 'custom_properties']);
  });

  it('shows all five non-asset tabs plus users for other types', () => {
    expect(getTeamTabs('Department')).toEqual(['teams', 'users', 'roles', 'policies', 'custom_properties']);
    expect(getTeamTabs('Division')).toEqual(['teams', 'users', 'roles', 'policies', 'custom_properties']);
    expect(getTeamTabs('BusinessUnit')).toEqual(['teams', 'users', 'roles', 'policies', 'custom_properties']);
  });

  it('counts users from userCount with users.length fallback', () => {
    const counts = getTeamTabCounts(
      team({ userCount: 7, users: [{ id: 'u1', name: 'a' }], defaultRoles: [{ id: 'r1', name: 'r' }], policies: [] }),
      3,
      11,
    );
    expect(counts).toEqual({ teams: 3, users: 7, assets: 11, roles: 1, policies: 0 });
    const fallback = getTeamTabCounts(team({ users: [{ id: 'u1', name: 'a' }, { id: 'u2', name: 'b' }] }), 0);
    expect(fallback.users).toBe(2);
  });
});

describe('teamLogic type options + drop restriction (pin TeamUtils)', () => {
  it('returns the child-type matrix per parent type', () => {
    expect(getTeamOptionsFromType('Organization')).toEqual(['BusinessUnit', 'Division', 'Department', 'Group']);
    expect(getTeamOptionsFromType('BusinessUnit')).toEqual(['Division', 'Department', 'Group']);
    expect(getTeamOptionsFromType('Division')).toEqual(['Division', 'Department', 'Group']);
    expect(getTeamOptionsFromType('Department')).toEqual(['Department', 'Group']);
    expect(getTeamOptionsFromType('Group')).toEqual(['Group']);
    expect(getTeamOptionsFromType('Unknown')).toEqual([]);
  });

  it('restricts Group drops, Division-from-BusinessUnit, Department-from-BusinessUnit/Division', () => {
    expect(isDropRestricted('Department', 'Group')).toBe(true);
    expect(isDropRestricted('BusinessUnit', 'Division')).toBe(true);
    expect(isDropRestricted('BusinessUnit', 'Department')).toBe(true);
    expect(isDropRestricted('Division', 'Department')).toBe(true);
    expect(isDropRestricted('Department', 'Division')).toBe(false);
    expect(isDropRestricted('Group', 'Department')).toBe(false);
    expect(isDropRestricted('Division', 'BusinessUnit')).toBe(false);
    expect(isDropRestricted(undefined, undefined)).toBe(false);
  });
});

describe('teamLogic hierarchy grafting (pin toListTeam)', () => {
  it('marks expandable nodes only when childrenCount > 0', () => {
    expect(toHierarchyNode(team({ childrenCount: 2 })).children).toEqual([]);
    expect(toHierarchyNode(team({ childrenCount: 0 })).children).toBeUndefined();
    expect(toHierarchyNode(team()).children).toBeUndefined();
  });

  it('grafts children under the matching FQN without touching siblings', () => {
    const tree = [team({ id: 'a', name: 'a', fullyQualifiedName: 'a', children: [] }), team({ id: 'b', name: 'b', fullyQualifiedName: 'b' })];
    const grafted = graftHierarchyChildren(tree, 'a', [team({ id: 'c', name: 'c', childrenCount: 1 })]);
    expect(grafted[0].children).toHaveLength(1);
    expect(grafted[0].children?.[0].children).toEqual([]);
    expect(grafted[1].children).toBeUndefined();
    // The input tree is not mutated.
    expect(tree[0].children).toEqual([]);
  });

  it('grafts into nested levels', () => {
    const tree = [team({ id: 'a', name: 'a', fullyQualifiedName: 'a', children: [team({ id: 'b', name: 'b', fullyQualifiedName: 'a.b', children: [] })] })];
    const grafted = graftHierarchyChildren(tree, 'a.b', [team({ id: 'c', name: 'c' })]);
    expect(grafted[0].children?.[0].children).toHaveLength(1);
  });
});

describe('teamLogic empty state + breadcrumbs + subscription', () => {
  it('shows the teams empty state only with no search, no children, count 0, not loading', () => {
    const base = { searchTerm: '', childCount: 0, childrenCount: 0, basicLoading: false };
    expect(shouldShowTeamsEmptyState(base)).toBe(true);
    expect(shouldShowTeamsEmptyState({ ...base, searchTerm: 'x' })).toBe(false);
    expect(shouldShowTeamsEmptyState({ ...base, childCount: 1 })).toBe(false);
    expect(shouldShowTeamsEmptyState({ ...base, childrenCount: 1 })).toBe(false);
    expect(shouldShowTeamsEmptyState({ ...base, basicLoading: true })).toBe(false);
  });

  it('builds the same 3-level settings breadcrumb for every team', () => {
    expect(buildTeamPageBreadcrumbs({ settings: 'Settings', members: 'Members', teams: 'Teams' })).toEqual([
      { label: 'Settings', to: { name: 'admin-settings' } },
      { label: 'Members' },
      { label: 'Teams' },
    ]);
  });

  it('builds the slashed parent chain with the current team unlinked', () => {
    const items = buildSlashedTeamName(
      [{ id: 'p', name: 'parent', displayName: 'Parent', fullyQualifiedName: 'org.parent' }],
      'Child',
      (fqn) => `/teams/${fqn}`,
    );
    expect(items).toEqual([{ name: 'Parent', to: '/teams/org.parent' }, { name: 'Child' }]);
  });

  it('reads the first subscription entry and validates endpoints', () => {
    expect(getFirstSubscription({ subscription: { slack: { endpoint: 'https://hooks/x' } } })).toEqual({
      webhook: 'slack',
      endpoint: 'https://hooks/x',
    });
    expect(getFirstSubscription(undefined)).toBeUndefined();
    expect(getFirstSubscription({})).toBeUndefined();
    expect(isValidSubscriptionEndpoint('https://hooks.slack.example/x')).toBe(true);
    expect(isValidSubscriptionEndpoint('')).toBe(false);
    expect(isValidSubscriptionEndpoint('not a url')).toBe(false);
  });

  it('derives TeamType edit options from the parent type with the Group filter', () => {
    expect(getTeamTypeEditOptions({ teamType: 'Organization' })).toEqual([]);
    expect(getTeamTypeEditOptions({ teamType: 'Group', parentType: 'Department' })).toEqual([]);
    expect(getTeamTypeEditOptions({ teamType: 'Department', parentType: 'Division', childrenCount: 0 })).toEqual([
      'Division',
      'Department',
      'Group',
    ]);
    expect(getTeamTypeEditOptions({ teamType: 'Department', parentType: 'Division', childrenCount: 2 })).toEqual([
      'Division',
      'Department',
    ]);
    // No parent chain defaults to Organization options (pin TeamsInfo:337-338).
    expect(getTeamTypeEditOptions({ teamType: 'Department' })).toEqual([
      'BusinessUnit',
      'Division',
      'Department',
      'Group',
    ]);
  });
});
