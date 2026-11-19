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
import {
  onlineUsersColumns,
  rolesPoliciesColumns,
  teamHierarchyColumns,
  teamMemberColumns,
  userListColumnKeys,
  userListColumns,
} from './membersColumns';

const userTitles = { username: 'Username', name: 'Name', teams: 'Teams', roles: 'Roles', actions: 'Actions' };

describe('membersColumns', () => {
  it('drops the roles column on the Admins tab', () => {
    expect(userListColumnKeys(false)).toEqual(['username', 'name', 'teams', 'roles']);
    expect(userListColumnKeys(true)).toEqual(['username', 'name', 'teams']);
    expect(userListColumns(userTitles, true).map((c) => c.key)).toEqual(['username', 'name', 'teams', 'actions']);
    expect(userListColumns(userTitles, false).map((c) => c.key)).toEqual(['username', 'name', 'teams', 'roles', 'actions']);
  });

  it('inserts Last Activity after the first two columns for Online Users', () => {
    const keys = onlineUsersColumns({
      username: 'Username',
      name: 'Name',
      lastActivity: 'Last Activity',
      teams: 'Teams',
      roles: 'Roles',
    }).map((c) => c.key);
    expect(keys).toEqual(['username', 'name', 'lastActivityTime', 'teams', 'roles']);
  });

  it('orders hierarchy columns with pin widths', () => {
    const columns = teamHierarchyColumns({
      teams: 'Teams',
      type: 'Type',
      subTeams: 'Sub-teams',
      users: 'Users',
      assets: 'Assets',
      description: 'Description',
    });
    expect(columns.map((c) => c.key)).toEqual(['name', 'teamType', 'childrenCount', 'userCount', 'assetCount', 'description']);
    expect(columns[1].width).toBe(120);
    expect(columns[3].width).toBe(80);
    expect(columns[4].width).toBe(120);
  });

  it('drops the actions column for deleted teams in roles/policies and member lists', () => {
    expect(rolesPoliciesColumns({ name: 'Name', description: 'Description', actions: 'Actions' }, true).map((c) => c.key))
      .toEqual(['name', 'description', 'actions']);
    expect(rolesPoliciesColumns({ name: 'Name', description: 'Description', actions: 'Actions' }, false).map((c) => c.key))
      .toEqual(['name', 'description']);
    expect(teamMemberColumns(userTitles, false).map((c) => c.key)).toEqual(['username', 'name', 'roles']);
    expect(rolesPoliciesColumns({ name: 'Name', description: 'Description', actions: 'Actions' }, true)[0].width).toBe(300);
  });
});
