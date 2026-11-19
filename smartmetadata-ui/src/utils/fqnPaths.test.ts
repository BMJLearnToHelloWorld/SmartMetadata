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
  getAddPolicyRulePath,
  getApplicationDetailsPath,
  getBotPath,
  getDecodedFqn,
  getEditPolicyRulePath,
  getEncodedFqn,
  getFqnPath,
  getNotificationAlertDetailsPath,
  getObservabilityAlertDetailsPath,
  getPersonaDetailsPath,
  getRoleWithFqnPath,
  getPolicyWithFqnPath,
  getSettingPath,
  getSettingPathRelative,
  getSettingsPathWithFqn,
  getTeamAndUserDetailsPath,
  getTeamsWithFqnPath,
  getUserPath,
} from './fqnPaths';

describe('getEncodedFqn', () => {
  it('encodes dots, spaces and slashes like encodeURIComponent', () => {
    expect(getEncodedFqn('a.b c/d')).toBe('a.b%20c%2Fd');
    expect(getEncodedFqn('plain')).toBe('plain');
  });

  it('spaceAsPlus is opt-in and off by default', () => {
    expect(getEncodedFqn('a b')).toBe('a%20b');
    expect(getEncodedFqn('a b', true)).toBe('a+b');
  });

  // Relocated verbatim from src/api/search.test.ts with the M-4
  // convergence (the search.ts copy was removed; this is the single
  // implementation under test).
  it('encodes an FQN as a URI component', () => {
    expect(getEncodedFqn('svc.db.schema')).toBe('svc.db.schema');
    expect(getEncodedFqn('a/b c')).toBe('a%2Fb%20c');
    expect(getEncodedFqn('a/b c', true)).toBe('a%2Fb+c');
    expect(getEncodedFqn('')).toBe('');
  });

  it('decodes symmetrically', () => {
    expect(getDecodedFqn('a.b%20c%2Fd')).toBe('a.b c/d');
    expect(getDecodedFqn('a+b', true)).toBe('a b');
    expect(getDecodedFqn('a+b')).toBe('a+b');
  });
});

describe('getSettingPath', () => {
  it('selects templates without substituting the FQN placeholder', () => {
    expect(getSettingPath()).toBe('/settings');
    expect(getSettingPath('members')).toBe('/settings/members');
    expect(getSettingPath('members', undefined, true)).toBe('/settings/members/:fqn');
    expect(getSettingPath('members', 'teams')).toBe('/settings/members/teams');
    expect(getSettingPath('members', 'teams', true)).toBe('/settings/members/teams/:fqn');
    expect(getSettingPath('members', 'teams', true, true)).toBe(
      '/settings/members/teams/:fqn/:action',
    );
  });

  it('relative form strips the settings root', () => {
    expect(getSettingPathRelative('access', 'roles', true)).toBe('/access/roles/:fqn');
  });

  it('getSettingsPathWithFqn substitutes the encoded FQN and action', () => {
    expect(getSettingsPathWithFqn('access', 'policies', 'a b/c')).toBe(
      '/settings/access/policies/a%20b%2Fc',
    );
    expect(getSettingsPathWithFqn('access', 'policies', 'p1', 'add-rule')).toBe(
      '/settings/access/policies/p1/add-rule',
    );
  });
});

describe('entity constructors', () => {
  it('builds user/bot bare routes', () => {
    expect(getUserPath('john doe')).toBe('/users/john%20doe');
    expect(getUserPath('j', 'activity', 'all')).toBe('/users/j/activity/all');
    expect(getUserPath('')).toBe('/users/');
    expect(getBotPath('my bot')).toBe('/bots/my%20bot');
  });

  it('builds team paths, empty name falling back to the list path', () => {
    expect(getTeamAndUserDetailsPath('team a')).toBe('/settings/members/teams/team%20a');
    expect(getTeamAndUserDetailsPath('')).toBe('/settings/members/teams');
    expect(getTeamAndUserDetailsPath()).toBe('/settings/members/teams');
    expect(getTeamsWithFqnPath('t1', { activeTab: 'users & teams' })).toBe(
      '/settings/members/teams/t1?activeTab=users%20%26%20teams',
    );
  });

  it('builds role/policy/persona/application paths', () => {
    expect(getRoleWithFqnPath('r.1')).toBe('/settings/access/roles/r.1');
    expect(getPolicyWithFqnPath('p/1')).toBe('/settings/access/policies/p%2F1');
    expect(getPersonaDetailsPath('persona 1')).toBe('/settings/persona/persona%201');
    expect(getApplicationDetailsPath('app 1')).toBe('/settings/apps/app%201');
  });

  it('builds policy rule action paths with both segments encoded', () => {
    expect(getAddPolicyRulePath('p 1')).toBe('/settings/access/policies/p%201/add-rule');
    expect(getEditPolicyRulePath('p 1', 'rule/a')).toBe(
      '/settings/access/policies/p%201/edit-rule/rule%2Fa',
    );
  });

  it('builds alert detail paths defaulting the tab to configuration', () => {
    expect(getNotificationAlertDetailsPath('a1')).toBe(
      '/settings/notifications/alerts/a1/configuration',
    );
    expect(getNotificationAlertDetailsPath('a1', 'history')).toBe(
      '/settings/notifications/alerts/a1/history',
    );
    // F-07-2: the observability builder returns the observability
    // path, not the settings path it returned before the fix.
    expect(getObservabilityAlertDetailsPath('a/b')).toBe(
      '/observability/alert/a%2Fb/configuration',
    );
    expect(getObservabilityAlertDetailsPath('a1', 'diagnostic-info')).toBe(
      '/observability/alert/a1/diagnostic-info',
    );
  });

  it('resolves through the constructor table', () => {
    expect(getFqnPath('team', 't')).toBe('/settings/members/teams/t');
    expect(getFqnPath('user', 'u')).toBe('/users/u');
  });
});
