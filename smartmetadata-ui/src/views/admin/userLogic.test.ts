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
  buildCreateUserPayload,
  buildRolesSave,
  filterOnlineUsersByWindow,
  getOnlineActivityCell,
  getRenderedUserTab,
  getTokenExpiryLabel,
  getTokenExpiryState,
  getUserCreationErrorKind,
  getUserOnlineStatus,
  getUserTabs,
  getVisibleEmail,
  isMaskedEmail,
  MASKED_EMAIL,
  mergeDefaultPersonaOptions,
  resolveEffectiveUserTab,
  shouldRedirectAccessToken,
  USER_TAB_PLATFORM_SETTINGS,
  type CreateUserFormValues,
} from './userLogic';

describe('userLogic tabs (pin Users.component)', () => {
  it('includes access-token only for the logged-in user', () => {
    expect(getUserTabs(true)).toHaveLength(7);
    expect(getUserTabs(true)[6]).toBe('access-token');
    expect(getUserTabs(false)).toEqual(['activity_feed', 'task', 'mydata', 'following', 'permissions', 'custom_properties']);
  });

  // D-CFG-3 (host lane): pin profileNavConfig.tsx:219-227 — the
  // platform-settings tab is admin-only on the own profile.
  it('includes platform-settings only for the logged-in admin', () => {
    expect(getUserTabs(true, true)).toHaveLength(8);
    expect(getUserTabs(true, true)[7]).toBe(USER_TAB_PLATFORM_SETTINGS);
    expect(getUserTabs(true, true)[7]).toBe('platform-settings');
    expect(getUserTabs(true, false)).not.toContain(USER_TAB_PLATFORM_SETTINGS);
    expect(getUserTabs(false, true)).not.toContain(USER_TAB_PLATFORM_SETTINGS);
    expect(getUserTabs(false, false)).not.toContain(USER_TAB_PLATFORM_SETTINGS);
  });

  it('falls back to the first tab for unknown or missing segments', () => {
    const tabs = getUserTabs(false);
    expect(getRenderedUserTab('mydata', tabs)).toBe('mydata');
    expect(getRenderedUserTab('bogus', tabs)).toBe('activity_feed');
    expect(getRenderedUserTab(undefined, tabs)).toBe('activity_feed');
  });

  it('forces TASK for MENTIONS/TASKS subTabs', () => {
    const tabs = getUserTabs(false);
    expect(resolveEffectiveUserTab('mydata', 'tasks', tabs)).toBe('task');
    expect(resolveEffectiveUserTab('mydata', 'mentions', tabs)).toBe('task');
    expect(resolveEffectiveUserTab('mydata', 'all', tabs)).toBe('mydata');
    expect(resolveEffectiveUserTab(undefined, undefined, tabs)).toBe('activity_feed');
  });

  it('redirects non-self access-token visits to Activity', () => {
    expect(shouldRedirectAccessToken('access-token', false)).toBe(true);
    expect(shouldRedirectAccessToken('access-token', true)).toBe(false);
    expect(shouldRedirectAccessToken('mydata', false)).toBe(false);
  });
});

describe('userLogic online status (pin getUserOnlineStatus)', () => {
  const now = 1_700_000_000_000;

  it('returns null for bots and for users without activity time', () => {
    expect(getUserOnlineStatus({ isBot: true, lastActivityTime: now }, now)).toBeNull();
    expect(getUserOnlineStatus({}, now)).toBeNull();
  });

  it('prefers lastActivityTime and applies the 5/60 minute bands', () => {
    expect(getUserOnlineStatus({ lastActivityTime: now - 5 * 60 * 1000 }, now)).toBe('online-now');
    expect(getUserOnlineStatus({ lastActivityTime: now - 5 * 60 * 1000 - 1 }, now)).toBe('active-recently');
    expect(getUserOnlineStatus({ lastActivityTime: now - 60 * 60 * 1000 }, now)).toBe('active-recently');
    expect(getUserOnlineStatus({ lastActivityTime: now - 60 * 60 * 1000 - 1 }, now)).toBeNull();
    expect(getUserOnlineStatus({ lastActivityTime: now - 1000, lastLoginTime: now - 3600000 }, now)).toBe('online-now');
    expect(getUserOnlineStatus({ lastLoginTime: now - 30 * 60 * 1000 }, now)).toBe('active-recently');
  });
});

describe('userLogic online-users activity cell (pin OnlineUsersPage)', () => {
  const now = 1_700_000_000_000;

  it('returns never without activity time', () => {
    expect(getOnlineActivityCell({}, now).band).toBe('never');
  });

  it('floors diffs and bands at 5 minutes / 60 minutes / 24 hours', () => {
    expect(getOnlineActivityCell({ lastActivityTime: now - 4 * 60000 - 30000 }, now)).toMatchObject({ band: 'now', diffMinutes: 4 });
    expect(getOnlineActivityCell({ lastActivityTime: now - 59 * 60000 }, now)).toMatchObject({ band: 'recent', diffMinutes: 59 });
    expect(getOnlineActivityCell({ lastActivityTime: now - 5 * 3600000 }, now)).toMatchObject({ band: 'hours', diffHours: 5 });
    expect(getOnlineActivityCell({ lastActivityTime: now - 3 * 86400000 }, now)).toMatchObject({ band: 'days', diffDays: 3 });
    // lastLoginTime fallback.
    expect(getOnlineActivityCell({ lastLoginTime: now - 60000 }, now).band).toBe('now');
  });

  it('filters search results by the login-time window, excluding users without one', () => {
    const users = [
      { lastLoginTime: now - 10 * 60000 },
      { lastLoginTime: now - 200 * 60000 },
      {},
    ];
    expect(filterOnlineUsersByWindow(users, 60, now)).toHaveLength(1);
    expect(filterOnlineUsersByWindow(users, 0, now)).toHaveLength(3);
  });
});

describe('userLogic masked email / roles / personas', () => {
  it('hides the masked email sentinel', () => {
    expect(isMaskedEmail(MASKED_EMAIL)).toBe(true);
    expect(isMaskedEmail('a@b.c')).toBe(false);
    expect(getVisibleEmail(MASKED_EMAIL)).toBeUndefined();
    expect(getVisibleEmail('a@b.c')).toBe('a@b.c');
    expect(getVisibleEmail(undefined)).toBeUndefined();
  });

  it('folds the Admin pseudo-option into isAdmin and out of role ids', () => {
    expect(buildRolesSave([{ id: 'admin', name: 'Admin' }, { id: 'r1', name: 'DataSteward' }])).toEqual({
      roleIds: ['r1'],
      isAdmin: true,
    });
    expect(buildRolesSave([{ id: 'r1', name: 'DataSteward' }])).toEqual({ roleIds: ['r1'], isAdmin: false });
    expect(buildRolesSave([])).toEqual({ roleIds: [], isAdmin: false });
  });

  it('merges default-persona options deduped by id', () => {
    const merged = mergeDefaultPersonaOptions(
      [{ id: 'p1', name: 'A' }],
      [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }],
      { id: 'p3', name: 'C' },
    );
    expect(merged.map((item) => item.id)).toEqual(['p1', 'p2', 'p3']);
  });
});

describe('userLogic token expiry state', () => {
  const now = 1_700_000_000_000;

  it('distinguishes absent / no-expiry / expired / expires', () => {
    expect(getTokenExpiryState(undefined, now)).toBe('absent');
    expect(getTokenExpiryState({}, now)).toBe('absent');
    expect(getTokenExpiryState({ jwtToken: 'x' }, now)).toBe('no-expiry');
    expect(getTokenExpiryState({ jwtToken: 'x', expiryDate: now - 1 }, now)).toBe('expired');
    expect(getTokenExpiryState({ jwtToken: 'x', expiryDate: now + 1000 }, now)).toBe('expires');
  });
});

describe('userLogic create-user payload (pin CreateUser handleSave)', () => {
  const base: CreateUserFormValues = {
    email: 'jane.doe@example.com',
    displayName: '  Jane  ',
    roles: ['r1'],
    teams: ['t1'],
    personas: ['p1'],
    domains: ['sales'],
    isAdmin: false,
    isBot: false,
    passwordGenerator: 'automatic',
    generatedPassword: 'gen-1',
    allowImpersonation: false,
  };

  it('derives name from the email prefix and trims the display name', () => {
    const payload = buildCreateUserPayload(base, { forceBot: false, isAuthProviderBasic: true });
    expect(payload.name).toBe('jane.doe');
    expect(payload.displayName).toBe('Jane');
    expect(payload.personas).toEqual([{ id: 'p1', type: 'persona' }]);
    expect(payload.password).toBe('gen-1');
    expect(payload.confirmPassword).toBe('gen-1');
    expect(payload.createPasswordType).toBe('ADMIN_CREATE');
  });

  it('drops empty teams and omits the password block for non-basic providers', () => {
    const payload = buildCreateUserPayload(
      { ...base, teams: [] },
      { forceBot: false, isAuthProviderBasic: false },
    );
    expect(payload.teams).toBeUndefined();
    expect(payload.password).toBeUndefined();
    expect(payload.createPasswordType).toBeUndefined();
  });

  it('uses manual passwords and the bot mechanism branch', () => {
    const manual = buildCreateUserPayload(
      { ...base, passwordGenerator: 'manual', password: 'pw-1', confirmPassword: 'pw-1' },
      { forceBot: false, isAuthProviderBasic: true },
    );
    expect(manual.password).toBe('pw-1');
    const bot = buildCreateUserPayload(
      { ...base, isBot: true, tokenExpiry: '30', allowImpersonation: true },
      { forceBot: true, isAuthProviderBasic: true, botName: 'ingestion-bot' },
    );
    expect(bot.botName).toBe('ingestion-bot');
    expect(bot.authenticationMechanism).toEqual({ authType: 'JWT', config: { JWTTokenExpiry: '30' } });
    expect(bot.allowImpersonation).toBe(true);
    expect(bot.password).toBeUndefined();
  });
});

describe('userLogic token expiry labels (pin BotsUtils getJWTTokenExpiryLabel)', () => {
  const translate = (key: string, params?: Record<string, unknown>): string =>
    params?.number !== undefined ? `${key}:${params.number}` : key;

  it('maps all seven expiry values to the pin label keys', () => {
    expect(getTokenExpiryLabel('OneHour', translate)).toBe('label.1-hr');
    expect(getTokenExpiryLabel('1', translate)).toBe('label.1-day');
    expect(getTokenExpiryLabel('7', translate)).toBe('label.number-day-plural:7');
    expect(getTokenExpiryLabel('30', translate)).toBe('label.number-day-plural:30');
    expect(getTokenExpiryLabel('60', translate)).toBe('label.number-day-plural:60');
    expect(getTokenExpiryLabel('90', translate)).toBe('label.number-day-plural:90');
    expect(getTokenExpiryLabel('Unlimited', translate)).toBe('label.unlimited');
    expect(getTokenExpiryLabel('bogus', translate)).toBe('bogus');
  });
});

describe('userLogic creation error mapping (pin getUserCreationErrorMessage)', () => {
  it('matches already-exists, then 429, then generic', () => {
    expect(getUserCreationErrorKind({ status: 409, message: 'User already exists' })).toBe('email-already-exist');
    expect(getUserCreationErrorKind({ status: 429, message: 'too many' })).toBe('entity-limit-reached');
    expect(getUserCreationErrorKind({ status: 500, message: 'boom' })).toBe('create-entity-error');
    expect(getUserCreationErrorKind(undefined)).toBe('create-entity-error');
  });
});
