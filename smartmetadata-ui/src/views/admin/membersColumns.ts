/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import {
  descriptionColumnDef,
  entityNameColumnDef,
  referenceListColumnDef,
} from '@/utils/columns';
import type { EntityListColumn } from '@/features/crud/types';

/**
 * Members column sets (COL-5 per-page composition over the D10
 * builders). Titles arrive translated from the view; keys, widths,
 * and order are the pin's.
 *
 * Pin anchors: utils/Users.util.tsx commonUserDetailColumns (users /
 * online users), TeamHierarchy.tsx:95-157 (hierarchy), RolesAndPoliciesList.tsx
 * (roles/policies), OnlineUsersPage.tsx:187-244 (last activity insert).
 */

// ---------------------------------------------------------------------------
// Users list (common columns; Admins drops the roles column).
// ---------------------------------------------------------------------------

export function userListColumnKeys(isAdminPage: boolean): string[] {
  return isAdminPage ? ['username', 'name', 'teams'] : ['username', 'name', 'teams', 'roles'];
}

/**
 * Common user columns as SmTable defs. The username/name cells render
 * in the bodyCell slot (UserPopOverCard + bot icon / entity name);
 * teams/roles render via ReferenceListCell with the pin's no-entity
 * empty text handled at the call site (the pin renders
 * label.no-entity, not the D10 '-- ' empty text, on this surface).
 */
export function userListColumns(titles: {
  username: string;
  name: string;
  teams: string;
  roles: string;
  actions: string;
}, isAdminPage: boolean): EntityListColumn[] {
  const columns: EntityListColumn[] = [
    { title: titles.username, dataIndex: 'username', key: 'username' },
    { title: titles.name, dataIndex: 'name', key: 'name' },
    ...referenceListColumnDef(titles.teams, 'teams'),
  ];
  if (!isAdminPage) {
    columns.push(...referenceListColumnDef(titles.roles, 'roles'));
  }
  columns.push({ title: titles.actions, dataIndex: 'actions', key: 'actions', width: 90 });
  return columns;
}

// ---------------------------------------------------------------------------
// Online Users: first two common columns + Last Activity + the rest.
// ---------------------------------------------------------------------------

export function onlineUsersColumns(titles: {
  username: string;
  name: string;
  lastActivity: string;
  teams: string;
  roles: string;
}): EntityListColumn[] {
  return [
    { title: titles.username, dataIndex: 'username', key: 'username' },
    { title: titles.name, dataIndex: 'name', key: 'name' },
    { title: titles.lastActivity, dataIndex: 'lastActivityTime', key: 'lastActivityTime' },
    ...referenceListColumnDef(titles.teams, 'teams'),
    ...referenceListColumnDef(titles.roles, 'roles'),
  ];
}

// ---------------------------------------------------------------------------
// Team hierarchy tree table (pin TeamHierarchy widths).
// ---------------------------------------------------------------------------

export function teamHierarchyColumns(titles: {
  teams: string;
  type: string;
  subTeams: string;
  users: string;
  assets: string;
  description: string;
}): EntityListColumn[] {
  return [
    // Pin width for the Teams column is 32%; EntityListColumn only
    // carries numeric widths, so the column flexes (adaptation).
    { title: titles.teams, dataIndex: 'name', key: 'name' },
    { title: titles.type, dataIndex: 'teamType', key: 'teamType', width: 120 },
    { title: titles.subTeams, dataIndex: 'childrenCount', key: 'childrenCount', width: 100 },
    { title: titles.users, dataIndex: 'userCount', key: 'userCount', width: 80 },
    { title: titles.assets, dataIndex: 'assetCount', key: 'assetCount', width: 120 },
    ...descriptionColumnDef(titles.description),
  ];
}

// ---------------------------------------------------------------------------
// Roles / Policies lists (pin RolesAndPoliciesList: Name 300 + description
// + Actions 100; the actions column drops when the team is deleted).
// ---------------------------------------------------------------------------

export function rolesPoliciesColumns(
  titles: { name: string; description: string; actions: string },
  includeActions: boolean,
): EntityListColumn[] {
  const columns: EntityListColumn[] = [
    ...entityNameColumnDef(titles.name, { width: 300 }),
    ...descriptionColumnDef(titles.description),
  ];
  if (includeActions) {
    columns.push({ title: titles.actions, dataIndex: 'actions', key: 'actions', width: 100 });
  }
  return columns;
}

// ---------------------------------------------------------------------------
// UserTab member list: common columns minus teams, plus actions.
// ---------------------------------------------------------------------------

export function teamMemberColumns(titles: {
  username: string;
  name: string;
  roles: string;
  actions: string;
}, includeActions: boolean): EntityListColumn[] {
  const columns: EntityListColumn[] = [
    { title: titles.username, dataIndex: 'username', key: 'username' },
    { title: titles.name, dataIndex: 'name', key: 'name' },
    ...referenceListColumnDef(titles.roles, 'roles'),
  ];
  if (includeActions) {
    columns.push({ title: titles.actions, dataIndex: 'actions', key: 'actions', width: 100 });
  }
  return columns;
}
