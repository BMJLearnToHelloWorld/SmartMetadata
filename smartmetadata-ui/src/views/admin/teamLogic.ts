/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { AdminEntityRef, AdminProfile, AdminTeam } from '@/types/admin';
import type { EntityBreadcrumb } from '@/features/crud/types';

/**
 * Pure team-detail logic, ported from the pin (392b3efd object tree).
 * Every function cites its anchor; the view only wires state to these.
 */

export const TEAM_TAB_TEAMS = 'teams';
export const TEAM_TAB_USERS = 'users';
export const TEAM_TAB_ASSETS = 'assets';
export const TEAM_TAB_ROLES = 'roles';
export const TEAM_TAB_POLICIES = 'policies';
export const TEAM_TAB_CUSTOM_PROPERTIES = 'custom_properties';

/**
 * Tab split (pin TeamDetailsV1.utils getTabs:18-72). Organization drops
 * users/assets; Group drops teams; every other type shows all six.
 */
export function getTeamTabs(teamType: string): string[] {
  if (teamType === 'Organization') {
    return [TEAM_TAB_TEAMS, TEAM_TAB_ROLES, TEAM_TAB_POLICIES, TEAM_TAB_CUSTOM_PROPERTIES];
  }
  if (teamType === 'Group') {
    return [TEAM_TAB_USERS, TEAM_TAB_ASSETS, TEAM_TAB_ROLES, TEAM_TAB_POLICIES, TEAM_TAB_CUSTOM_PROPERTIES];
  }
  return [
    TEAM_TAB_TEAMS,
    TEAM_TAB_USERS,
    TEAM_TAB_ROLES,
    TEAM_TAB_POLICIES,
    TEAM_TAB_CUSTOM_PROPERTIES,
  ];
}

/** First tab of the split; the pin renders it when activeTab is absent. */
export function getFirstTeamTab(teamType: string): string {
  return getTeamTabs(teamType)[0];
}

export interface TeamTabCounts {
  teams?: number;
  users?: number;
  assets?: number;
  roles?: number;
  policies?: number;
}

/**
 * Tab counts (pin getTabs:18-72): teams = child list length, users =
 * userCount ?? users.length, assets = search total, roles/policies =
 * array lengths, custom_properties carries no count.
 */
export function getTeamTabCounts(
  team: Pick<AdminTeam, 'users' | 'defaultRoles' | 'policies' | 'userCount'>,
  childCount: number,
  assetsCount?: number,
): TeamTabCounts {
  return {
    teams: childCount,
    users: team.userCount ?? team.users.length,
    assets: assetsCount,
    roles: team.defaultRoles.length,
    policies: team.policies.length,
  };
}

/**
 * Child-type options for a parent type (pin TeamUtils
 * getTeamOptionsFromType:55-73). Unknown parent types yield no options
 * rather than an invented fallback list.
 */
export function getTeamOptionsFromType(parentType: string): string[] {
  switch (parentType) {
    case 'Organization':
      return ['BusinessUnit', 'Division', 'Department', 'Group'];
    case 'BusinessUnit':
      return ['Division', 'Department', 'Group'];
    case 'Division':
      return ['Division', 'Department', 'Group'];
    case 'Department':
      return ['Department', 'Group'];
    case 'Group':
      return ['Group'];
    default:
      return [];
  }
}

/**
 * Drop restriction (pin TeamUtils isDropRestricted:82-101): a Group
 * accepts no children; a Division rejects BusinessUnit drops; a
 * Department rejects BusinessUnit and Division drops.
 */
export function isDropRestricted(dragTeamType?: string, dropTeamType?: string): boolean {
  const isRestrictedDivisionDrop = dropTeamType === 'Division' && dragTeamType === 'BusinessUnit';
  const isRestrictedDepartmentDrop =
    (dropTeamType === 'Department' && dragTeamType === 'BusinessUnit') ||
    (dropTeamType === 'Department' && dragTeamType === 'Division');
  return dropTeamType === 'Group' || isRestrictedDivisionDrop || isRestrictedDepartmentDrop;
}

/** Pin getNonDeletedTeams (TeamUtils:102-104). */
export function getNonDeletedTeams<T extends { deleted?: boolean }>(teams: readonly T[]): T[] {
  return teams.filter((team) => !team.deleted);
}

/**
 * Hierarchy node conversion (pin TeamsPage toListTeam:54-58): `children`
 * is set to an empty array only when childrenCount > 0, which is what
 * marks the row expandable; leaf teams carry no children key.
 */
export function toHierarchyNode(team: AdminTeam): AdminTeam {
  if ((team.childrenCount ?? 0) > 0) {
    return { ...team, children: [] };
  }
  return { ...team, children: undefined };
}

/**
 * Grafts lazily loaded children under the node whose FQN matches,
 * returning a new tree. Nodes that already hold children are left
 * untouched (the pin only expands when children is empty).
 */
export function graftHierarchyChildren(
  nodes: readonly AdminTeam[],
  parentFqn: string,
  children: AdminTeam[],
): AdminTeam[] {
  return nodes.map((node) => {
    const nodeFqn = node.fullyQualifiedName ?? node.name;
    if (nodeFqn === parentFqn) {
      return { ...node, children: children.map(toHierarchyNode) };
    }
    if (node.children?.length) {
      return { ...node, children: graftHierarchyChildren(node.children, parentFqn, children) };
    }
    return node;
  });
}

/**
 * Teams-tab empty-state predicate (pin TeamDetailsV1:713-773): shown
 * exactly when there is no search term, the child list is empty,
 * childrenCount is 0, and the basic fetch is not loading.
 */
export function shouldShowTeamsEmptyState(args: {
  searchTerm: string;
  childCount: number;
  childrenCount?: number;
  basicLoading: boolean;
}): boolean {
  return (
    args.searchTerm === '' &&
    args.childCount === 0 &&
    (args.childrenCount ?? 0) === 0 &&
    !args.basicLoading
  );
}

/**
 * Page breadcrumb (pin TeamDetailsV1:229-236): the settings breadcrumb
 * is the same for every team — Settings, Members, Teams label — with
 * no team name. The category crumb stays unlinked until the shell
 * batch lands its §9 breadcrumb constructor (precedent:
 * CustomPropertyTypeDetailView).
 */
export function buildTeamPageBreadcrumbs(labels: {
  settings: string;
  members: string;
  teams: string;
}): EntityBreadcrumb[] {
  return [
    { label: labels.settings, to: { name: 'admin-settings' } },
    { label: labels.members },
    { label: labels.teams },
  ];
}

/** Slashed parent-chain title items (pin TeamDetailsV1:539-562). */
export function buildSlashedTeamName(
  parents: readonly AdminEntityRef[],
  currentName: string,
  pathFor: (fqn: string) => string,
): Array<{ name: string; to?: string }> {
  const items: Array<{ name: string; to?: string }> = parents.map((parent) => ({
    name: parent.displayName || parent.name,
    to: pathFor(parent.fullyQualifiedName ?? parent.name),
  }));
  items.push({ name: currentName });
  return items;
}

// ---------------------------------------------------------------------------
// Subscription facet (pin TeamsSubscription + Teams.constants:27-55).
// ---------------------------------------------------------------------------

export const SUBSCRIPTION_NONE = 'none';
export const SUBSCRIPTION_WEBHOOKS = ['msTeams', 'slack', 'gChat', 'generic'] as const;

/**
 * Entity-name rules (pin Form.constants.ts:18,40-47 + regex.constants.ts:31).
 * NAME_FIELD_REGISTER_RULES: required, maxLength 128, ENTITY_NAME_REGEX
 * (imported from the shared utils/entityName module).
 */
export const ENTITY_NAME_MAX_LENGTH = 128;

/** Case-insensitive duplicate check against the full team list (pin AddTeamForm). */
export function isDuplicateTeamName(name: string, allTeams: readonly { name: string }[]): boolean {
  const wanted = name.toLowerCase();
  return allTeams.some((team) => team.name.toLowerCase() === wanted);
}

/**
 * Subscription select options (pin Teams.constants SUBSCRIPTION_WEBHOOK_OPTIONS):
 * None carries the empty value at the schema level but the 'none' sentinel as
 * the select key (react-aria keys cannot be empty); labels are i18n keys.
 */
export function getSubscriptionOptions(): Array<{ value: string; labelKey: string }> {
  return [
    { value: SUBSCRIPTION_NONE, labelKey: 'label.none' },
    { value: 'msTeams', labelKey: 'label.ms-team-plural' },
    { value: 'slack', labelKey: 'label.slack' },
    { value: 'gChat', labelKey: 'label.g-chat' },
    { value: 'generic', labelKey: 'label.webhook' },
  ];
}

export interface TeamSubscription {
  webhook: string;
  endpoint?: string;
}

/** First (only) subscription entry of a team profile, if any. */
export function getFirstSubscription(profile?: AdminProfile): TeamSubscription | undefined {
  const subscription = profile?.subscription;
  if (!subscription) {
    return undefined;
  }
  const entry = Object.entries(subscription)[0];
  if (!entry) {
    return undefined;
  }
  return { webhook: entry[0], endpoint: entry[1]?.endpoint };
}

/** Endpoint validity: required and a parseable URL when a webhook is selected. */
export function isValidSubscriptionEndpoint(endpoint: string): boolean {
  if (!endpoint.trim()) {
    return false;
  }
  try {
    new URL(endpoint.trim());
    return true;
  } catch {
    return false;
  }
}

/**
 * TeamType edit options for the header facet (pin TeamsInfo): the
 * Organization type is never rendered, a Group is never changeable,
 * options come from the parent's type, and Group is filtered out when
 * the team already has child teams.
 */
export function getTeamTypeEditOptions(args: {
  teamType: string;
  parentType?: string;
  childrenCount?: number;
}): string[] {
  if (args.teamType === 'Organization' || args.teamType === 'Group') {
    return [];
  }
  // Pin TeamsInfo:337-338: the parent type is the last parent team's
  // type, defaulting to Organization when the chain is empty.
  const options = getTeamOptionsFromType(args.parentType ?? 'Organization');
  if ((args.childrenCount ?? 0) > 0) {
    return options.filter((option) => option !== 'Group');
  }
  return options;
}
