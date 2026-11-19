/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { AdminEntityRef, CreateUserRequest, JwtTokenExpiry } from '@/types/admin';
import type { UserAuthMechanism } from '@/api/users';

/**
 * Pure user-detail logic, ported from the pin (392b3efd object tree).
 */

export const USER_TAB_ACTIVITY = 'activity_feed';
export const USER_TAB_TASK = 'task';
export const USER_TAB_MY_DATA = 'mydata';
export const USER_TAB_FOLLOWING = 'following';
export const USER_TAB_PERMISSIONS = 'permissions';
export const USER_TAB_CUSTOM_PROPERTIES = 'custom_properties';
export const USER_TAB_ACCESS_TOKEN = 'access-token';

export const USER_TABS_ALL = [
  USER_TAB_ACTIVITY,
  USER_TAB_TASK,
  USER_TAB_MY_DATA,
  USER_TAB_FOLLOWING,
  USER_TAB_PERMISSIONS,
  USER_TAB_CUSTOM_PROPERTIES,
  USER_TAB_ACCESS_TOKEN,
] as const;

/** Tab set (pin Users.component:214-346): Access Token exists only for self. */
export function getUserTabs(isLoggedInUser: boolean): string[] {
  return isLoggedInUser ? [...USER_TABS_ALL] : USER_TABS_ALL.slice(0, -1);
}

/**
 * Rendered tab (pin getRenderedActiveTab via CustomizePageEntityTabUtils:
 * 82-89): an unknown tab renders the first tab; the URL is unchanged —
 * navigation only happens on explicit user selection. A missing tab
 * segment defaults to Activity (useRequiredParams default).
 */
export function getRenderedUserTab(tab: string | undefined, tabs: readonly string[]): string {
  if (tab && tabs.includes(tab)) {
    return tab;
  }
  return tabs[0];
}

/**
 * Sub-tab forcing (pin Users.component:199-206): a MENTIONS or TASKS
 * subTab forces the TASK tab regardless of the tab segment.
 */
export function resolveEffectiveUserTab(
  tab: string | undefined,
  subTab: string | undefined,
  tabs: readonly string[],
): string {
  if (subTab === 'mentions' || subTab === 'tasks') {
    return USER_TAB_TASK;
  }
  return getRenderedUserTab(tab, tabs);
}

/** Non-self direct visit to access-token redirects to Activity (pin :138-145). */
export function shouldRedirectAccessToken(tab: string | undefined, isLoggedInUser: boolean): boolean {
  return tab === USER_TAB_ACCESS_TOKEN && !isLoggedInUser;
}

// ---------------------------------------------------------------------------
// Online status (pin UsersPureUtils getUserOnlineStatus:69-99).
// ---------------------------------------------------------------------------

export type UserOnlineStatus = 'online-now' | 'active-recently' | null;

/**
 * Two-band badge status: bots and users without any activity time get
 * no badge (null — the pin invents no "offline" state); activity is
 * lastActivityTime || lastLoginTime; ≤5 min "Online now", ≤60 min
 * "Active recently", older gets no badge.
 */
export function getUserOnlineStatus(
  user: { isBot?: boolean; lastActivityTime?: number; lastLoginTime?: number },
  now = Date.now(),
): UserOnlineStatus {
  if (user.isBot) {
    return null;
  }
  const activity = user.lastActivityTime || user.lastLoginTime;
  if (!activity) {
    return null;
  }
  const diffMs = now - activity;
  if (diffMs <= 5 * 60 * 1000) {
    return 'online-now';
  }
  if (diffMs <= 60 * 60 * 1000) {
    return 'active-recently';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Online Users activity cell (pin OnlineUsersPage:195-244).
// ---------------------------------------------------------------------------

export interface OnlineActivityCell {
  band: 'now' | 'recent' | 'hours' | 'days' | 'never';
  diffMinutes: number;
  diffHours: number;
  diffDays: number;
  activityTime?: number;
}

/** Moment-diff semantics: whole minutes/hours/days via flooring. */
export function getOnlineActivityCell(
  user: { lastActivityTime?: number; lastLoginTime?: number },
  now = Date.now(),
): OnlineActivityCell {
  const activityTime = user.lastActivityTime || user.lastLoginTime;
  if (!activityTime) {
    return { band: 'never', diffMinutes: 0, diffHours: 0, diffDays: 0 };
  }
  const diffMs = Math.max(0, now - activityTime);
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const band =
    diffMinutes < 5 ? 'now' : diffMinutes < 60 ? 'recent' : diffHours < 24 ? 'hours' : 'days';
  return { band, diffMinutes, diffHours, diffDays, activityTime };
}

/** Absolute second line (product equivalent of pin formatDateTime). */
export function formatAbsoluteDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

/**
 * Online Users search window filter (pin OnlineUsersPage:121-164):
 * client-side on lastLoginTime; timeWindow 0 (all time) does not
 * filter; users without a login time are excluded.
 */
export function filterOnlineUsersByWindow<T extends { lastLoginTime?: number }>(
  users: readonly T[],
  timeWindowMinutes: number,
  now = Date.now(),
): T[] {
  if (timeWindowMinutes === 0) {
    return [...users];
  }
  const cutoff = now - timeWindowMinutes * 60 * 1000;
  return users.filter((user) => user.lastLoginTime !== undefined && user.lastLoginTime >= cutoff);
}

// ---------------------------------------------------------------------------
// Masked email (pin User.constants MASKED_EMAIL + UsersPureUtils).
// ---------------------------------------------------------------------------

export const MASKED_EMAIL = '********@masked.com';

export function isMaskedEmail(email?: string): boolean {
  return email === MASKED_EMAIL;
}

/** The email to show, or undefined when missing or PII-masked. */
export function getVisibleEmail(email?: string): string | undefined {
  if (!email || isMaskedEmail(email)) {
    return undefined;
  }
  return email;
}

// ---------------------------------------------------------------------------
// Roles card (pin UsersProfile roles edit).
// ---------------------------------------------------------------------------

export const TERM_ADMIN = 'Admin';
export const TERM_ADMIN_ID = 'admin';

/** Admin pseudo-option appended to the roles search results. */
export function getAdminPseudoOption(): AdminEntityRef {
  return { id: TERM_ADMIN_ID, name: TERM_ADMIN, type: 'role' };
}

/**
 * Roles save mapping: the Admin pseudo-option is filtered out of the
 * roles array and folded into isAdmin (pin roles edit onSave).
 */
export function buildRolesSave(selected: readonly AdminEntityRef[]): {
  roleIds: string[];
  isAdmin: boolean;
} {
  const isAdmin = selected.some((item) => item.id === TERM_ADMIN_ID);
  const roleIds = selected
    .filter((item) => item.id !== TERM_ADMIN_ID && item.id)
    .map((item) => item.id as string);
  return { roleIds, isAdmin };
}

/**
 * Default-persona options (pin Personas card): deduped merge of the
 * user's personas, inherited personas, and the current default
 * persona, keyed by id.
 */
export function mergeDefaultPersonaOptions(
  personas: readonly AdminEntityRef[],
  inheritedPersonas: readonly AdminEntityRef[],
  defaultPersona?: AdminEntityRef,
): AdminEntityRef[] {
  const seen = new Set<string>();
  const out: AdminEntityRef[] = [];
  const all = defaultPersona ? [...personas, ...inheritedPersonas, defaultPersona] : [...personas, ...inheritedPersonas];
  for (const item of all) {
    const key = item.id ?? item.name;
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Access token card (pin AccessTokenCard / AuthMechanism / BotsUtils).
// ---------------------------------------------------------------------------

/** Pin literal: the card always passes tokenName 'test'. Never "fixed". */
export const USER_TOKEN_NAME = 'test';

export type TokenExpiryState = 'absent' | 'no-expiry' | 'expired' | 'expires';

/** Expiry state from the single mechanism: no token, no expiry, expired, or expiring. */
export function getTokenExpiryState(
  mechanism: UserAuthMechanism | undefined,
  now = Date.now(),
): TokenExpiryState {
  if (!mechanism?.jwtToken) {
    return 'absent';
  }
  if (mechanism.expiryDate === undefined || mechanism.expiryDate === null) {
    return 'no-expiry';
  }
  return mechanism.expiryDate < now ? 'expired' : 'expires';
}

/** Pin getTokenExpiry: expiry date rendered via formatDateTimeLong. */
export function getTokenExpiryDate(mechanism: UserAuthMechanism | undefined): number | undefined {
  return mechanism?.expiryDate;
}

/**
 * Expiry option labels (pin BotsUtils getJWTTokenExpiryLabel:24-40):
 * data table, not a switch pile. Returns the i18n key + params so
 * both the token card and the create-user form share one mapping.
 */
export const TOKEN_EXPIRY_LABELS: Record<string, { key: string; number?: number }> = {
  OneHour: { key: 'label.1-hr' },
  '1': { key: 'label.1-day' },
  '7': { key: 'label.number-day-plural', number: 7 },
  '30': { key: 'label.number-day-plural', number: 30 },
  '60': { key: 'label.number-day-plural', number: 60 },
  '90': { key: 'label.number-day-plural', number: 90 },
  Unlimited: { key: 'label.unlimited' },
};

export function getTokenExpiryLabel(
  value: string,
  translate: (key: string, params?: Record<string, unknown>) => string,
): string {
  const entry = TOKEN_EXPIRY_LABELS[value];
  if (!entry) {
    return value;
  }
  return entry.number !== undefined
    ? translate(entry.key, { number: entry.number })
    : translate(entry.key);
}

// ---------------------------------------------------------------------------
// Create user (pin CreateUser.component + UsersPureUtils).
// ---------------------------------------------------------------------------

export interface CreateUserFormValues {
  email: string;
  displayName: string;
  description?: string;
  roles: string[];
  teams: string[];
  personas: string[];
  domains: string[];
  isAdmin: boolean;
  isBot: boolean;
  passwordGenerator: 'automatic' | 'manual';
  generatedPassword: string;
  password?: string;
  confirmPassword?: string;
  tokenExpiry?: JwtTokenExpiry;
  allowImpersonation: boolean;
}

/**
 * Create payload (pin handleSave:311-345): name is the email prefix
 * before '@'; personas become [{id, type: 'persona'}]; domains stay
 * FQN strings; teams drop when empty; the bot branch carries the JWT
 * mechanism config + allowImpersonation; the password branch carries
 * the password + AdminCreate type.
 */
export function buildCreateUserPayload(
  values: CreateUserFormValues,
  options: { forceBot: boolean; isAuthProviderBasic: boolean; botName?: string },
): CreateUserRequest {
  const payload: CreateUserRequest = {
    name: values.email.split('@')[0],
    email: values.email,
    displayName: values.displayName.trim(),
    description: values.description,
    roles: values.roles,
    teams: values.teams.length ? values.teams : undefined,
    personas: values.personas.map((id) => ({ id, type: 'persona' })),
    domains: values.domains.length ? values.domains : undefined,
    isAdmin: values.isAdmin,
    isBot: values.isBot,
  };
  if (options.forceBot) {
    payload.botName = options.botName;
    payload.authenticationMechanism = {
      authType: 'JWT',
      config: { JWTTokenExpiry: values.tokenExpiry },
    };
    payload.allowImpersonation = values.allowImpersonation;
  } else if (options.isAuthProviderBasic) {
    const generated = values.passwordGenerator === 'automatic';
    payload.password = generated ? values.generatedPassword : values.password;
    payload.confirmPassword = generated ? values.generatedPassword : values.confirmPassword;
    payload.createPasswordType = 'ADMIN_CREATE';
  }
  return payload;
}

export interface CreationErrorInput {
  status?: number;
  message?: string;
}

export type CreationErrorKind = 'email-already-exist' | 'entity-limit-reached' | 'create-entity-error';

/**
 * Error mapping (pin getUserCreationErrorMessage:31-56): a response
 * message containing 'already exists' wins; HTTP 429 (LIMIT_REACHED)
 * is next; everything else is the generic create error. The caller
 * renders the matching i18n key with the entity params.
 */
export function getUserCreationErrorKind(error: CreationErrorInput | undefined): CreationErrorKind {
  if (error) {
    if (error.message?.includes('already exists')) {
      return 'email-already-exist';
    }
    if (error.status === 429) {
      return 'entity-limit-reached';
    }
  }
  return 'create-entity-error';
}

/** Display-name fallback chain for the profile card title. */
export function getUserDisplayTitle(user: { displayName?: string; name: string }): string {
  return user.displayName || user.name;
}
