/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
/**
 * Bot API client.
 *
 * Port of the official Bots surface (392b3efd object tree):
 * - `openmetadata-ui/.../src/rest/botsAPI.ts` — list/create/get-by-name/
 *   update/restore.
 * - `openmetadata-ui/.../src/rest/userAPI.ts` — token generate/revoke and
 *   auth-mechanism fetch for the bot user.
 * - `openmetadata-ui/.../src/utils/APIUtils.ts` (`formatUsersResponse`),
 *   `openmetadata-ui/.../src/utils/StringUtils.ts`
 *   (`escapeESReservedCharacters`) and
 *   `openmetadata-ui/.../src/components/Settings/Bot/BotListV1/BotListV1.component.tsx`
 *   (`searchBots`) — search query filter, hit formatting, and the
 *   bot/user join with client-side term matching.
 *
 * History note (161-decisions.csv, item 10:#2 / B34): the dead
 * `getBotToken` helper (GET /v1/users/token/{id}, zero callers, no
 * official UI call) was deleted. `generateBotToken`, `revokeBotToken`,
 * `getAuthMechanismForBotUser`, `getBot`, and `mapJwt` are retained;
 * the backend token endpoints are untouched.
 */
import type { JsonPatchOp } from '@/admin/jsonPatch';
import { apiRequest } from '@/api/client';
import { getEncodedFqn } from '@/utils/fqnPaths';
import { asBoolean, asNumber, asRecord, asString, mapEntityRefs, parsePaged } from '@/api/json';
import type { EntityRef } from '@/types/api';
import type {
  AdminBot,
  AdminUser,
  IncludeFilter,
  JwtAuthMechanism,
  JwtTokenExpiry,
  Paged,
} from '@/types/admin';
import { mapUser } from './users';

export function mapBot(raw: unknown): AdminBot | null {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }
  const id = asString(record.id);
  const name = asString(record.name);
  if (!id || !name) {
    return null;
  }
  const botUserRefs = mapEntityRefs(record.botUser ? [record.botUser] : []);
  const domains = record.domains === undefined ? undefined : mapEntityRefs(record.domains);
  const updatedAt = asNumber(record.updatedAt);
  return {
    id,
    name,
    displayName: asString(record.displayName) || undefined,
    description: asString(record.description) || undefined,
    botUser: botUserRefs[0],
    allowImpersonation: asBoolean(record.allowImpersonation),
    fullyQualifiedName: asString(record.fullyQualifiedName) || undefined,
    provider: asString(record.provider) || undefined,
    domains,
    updatedAt: updatedAt === undefined ? undefined : updatedAt,
    updatedBy: asString(record.updatedBy) || undefined,
    version: asNumber(record.version),
    deleted: asBoolean(record.deleted),
  };
}

export interface ListBotsParams {
  limit?: number;
  after?: string;
  before?: string;
  include?: IncludeFilter;
  fields?: string | string[];
}

function fieldsParam(fields: string | string[] | undefined): string | undefined {
  return Array.isArray(fields) ? fields.join(',') : fields;
}

/**
 * GET /v1/bots. Official `getBots` (botsAPI.ts:25-42) accepts
 * `{limit, after, before, include, fields}`; the pre-existing product
 * signature only carried `limit`/`after`.
 */
export function listBots(params: ListBotsParams = {}): Promise<Paged<AdminBot>> {
  return apiRequest('/v1/bots', {
    query: {
      limit: params.limit,
      after: params.after,
      before: params.before,
      include: params.include,
      fields: fieldsParam(params.fields),
    },
  }).then((payload) => parsePaged(payload, mapBot));
}

export async function getBot(id: string): Promise<AdminBot> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/bots/${encodeURIComponent(id)}`);
  const bot = mapBot(raw);
  if (!bot) {
    throw new Error('Bot response was missing id and name');
  }
  return bot;
}

/** Official `CreateBot` (generated `api/createBot.ts:16-45`). */
export interface CreateBotPayload {
  botUser: string;
  name: string;
  displayName?: string;
  description?: string;
  allowImpersonation?: boolean;
  domains?: string[];
  provider?: string;
}

export async function createBot(body: CreateBotPayload): Promise<AdminBot> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/bots', {
    method: 'POST',
    json: body,
  });
  const bot = mapBot(raw);
  if (!bot) {
    throw new Error('Bot creation response was missing id and name');
  }
  return bot;
}

export interface GetBotByNameParams {
  include?: IncludeFilter;
  fields?: string | string[];
}

/** GET /v1/bots/name/{encodedFqn} (botsAPI.ts:51-58). */
export async function getBotByName(name: string, params: GetBotByNameParams = {}): Promise<AdminBot> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/bots/name/${getEncodedFqn(name)}`, {
    query: {
      include: params.include,
      fields: fieldsParam(params.fields),
    },
  });
  const bot = mapBot(raw);
  if (!bot) {
    throw new Error('Bot response was missing id and name');
  }
  return bot;
}

/**
 * PATCH /v1/bots/{id} with a JSON Patch (botsAPI.ts:60-67).
 *
 * The official client sets no Content-Type; the product PATCH
 * convention (patchUser in src/api/users.ts) uses
 * `application/json-patch+json`. Kept per product convention; live
 * verification confirms the round trip (draft 10 §7.1).
 */
export async function updateBotDetail(id: string, patch: JsonPatchOp[]): Promise<AdminBot> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/bots/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    json: patch,
    contentType: 'application/json-patch+json',
  });
  const bot = mapBot(raw);
  if (!bot) {
    throw new Error('Bot update response was missing id and name');
  }
  return bot;
}

/** PUT /v1/bots/restore (botsAPI.ts:73-80). */
export async function restoreBot(id: string): Promise<AdminBot> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/bots/restore', {
    method: 'PUT',
    json: { id },
  });
  const bot = mapBot(raw);
  if (!bot) {
    throw new Error('Bot restore response was missing id and name');
  }
  return bot;
}

/**
 * DELETE /v1/bots/{id}?hardDelete&recursive.
 *
 * Official delete goes through `deleteEntity` (miscAPI.ts:169-183)
 * with `prepareEntityType('bot') === 'bots'` and `recursive=false`;
 * `hardDelete` comes from the delete modal choice.
 */
export function deleteBot(
  id: string,
  options: { hardDelete: boolean; recursive: boolean },
): Promise<unknown> {
  return apiRequest(`/v1/bots/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    query: { hardDelete: options.hardDelete, recursive: options.recursive },
  });
}

/**
 * Page size and search-term cap from BotListV1.component.tsx:72-73
 * (`BOTS_PAGE_SIZE = 100`, `MAX_SEARCH_TEXT_LENGTH = 128`).
 */
export const BOT_SEARCH_PAGE_SIZE = 100;
export const MAX_BOT_SEARCH_LENGTH = 128;

/**
 * Keyword fields the official bot search wildcards over, in official
 * order (BotListV1.component.tsx:183-192). `email.keyword` is
 * unconditional — it is not gated on the term looking like an email.
 */
export const BOT_SEARCH_KEYWORD_FIELDS = [
  'name.keyword',
  'displayName.keyword',
  'fullyQualifiedName.keyword',
  'email.keyword',
] as const;

/**
 * Elasticsearch reserved-character escaping, ported verbatim from
 * `escapeESReservedCharacters` (StringUtils.ts:320-358). Only the
 * regex-matched characters are escaped; unchanged text is returned
 * as-is and `undefined` maps to `''`.
 */
const ES_ESCAPE_TABLE: Record<string, string> = {
  '+': String.raw`\+`,
  '-': String.raw`\-`,
  '=': String.raw`\=`,
  '&': String.raw`\&`,
  '|': String.raw`\|`,
  '>': String.raw`\>`,
  '<': String.raw`\<`,
  '!': String.raw`\!`,
  '(': String.raw`\(`,

  ')': String.raw`\)`,
  '{': String.raw`\{`,
  '}': String.raw`\}`,
  '[': String.raw`\[`,
  ']': String.raw`\]`,
  '^': String.raw`\^`,
  '"': String.raw`\"`,
  '~': String.raw`\~`,
  '*': String.raw`\*`,
  '?': String.raw`\?`,
  ':': String.raw`\:`,
  '\\': String.raw`\\`,
  '/': String.raw`\/`,
};

export function escapeESReservedCharacters(text?: string): string {
  if (!text) {
    return '';
  }

  return text.replace(
    /[\\\[\]#+=&|><!(){}^"~*?:/-]/g,
    (char) => ES_ESCAPE_TABLE[char] ?? char,
  );
}

/**
 * Official `queryFilter` for bot search (BotListV1.component.tsx:178-192):
 * `must` term `isBot: true`, `should` wildcards `*term*`
 * (case-insensitive) over the keyword fields, `minimum_should_match: 1`.
 */
export function buildBotSearchQueryFilter(term: string): Record<string, unknown> {
  const wildcardPattern = `*${escapeESReservedCharacters(term)}*`;
  return {
    query: {
      bool: {
        must: [{ term: { isBot: true } }],
        should: BOT_SEARCH_KEYWORD_FIELDS.map((field) => ({
          wildcard: { [field]: { value: wildcardPattern, case_insensitive: true } },
        })),
        minimum_should_match: 1,
      },
    },
  };
}

/**
 * A user hit from the search index, shaped by `formatUsersResponse`
 * (APIUtils.ts:23-40): only `_source` fields are carried.
 */
export interface SearchBotUser {
  id?: string;
  name?: string;
  displayName?: string;
  fullyQualifiedName?: string;
  email?: string;
  type?: string;
  teams?: EntityRef[];
  roles?: EntityRef[];
  href?: string;
  isBot?: boolean;
}

export function formatSearchUsers(payload: unknown): SearchBotUser[] {
  const root = asRecord(payload);
  const hits = asRecord(root?.hits);
  const entries = hits && Array.isArray(hits.hits) ? hits.hits : [];
  const users: SearchBotUser[] = [];
  for (const entry of entries) {
    const source = asRecord(asRecord(entry)?._source);
    if (!source) {
      continue;
    }
    users.push({
      id: asString(source.id) || undefined,
      name: asString(source.name) || undefined,
      displayName: asString(source.displayName) || undefined,
      fullyQualifiedName: asString(source.fullyQualifiedName) || undefined,
      email: asString(source.email) || undefined,
      type: asString(source.type) || undefined,
      teams: source.teams === undefined ? undefined : mapEntityRefs(source.teams),
      roles: source.roles === undefined ? undefined : mapEntityRefs(source.roles),
      href: asString(source.href) || undefined,
      isBot: asBoolean(source.isBot),
    });
  }
  return users;
}

/**
 * Bot map keyed by lowercased bot name, as the official list builds
 * it (BotListV1.component.tsx:116-146). Later same-name bots overwrite
 * earlier ones, exactly as the official `Map.set` loop does.
 */
export function indexBotsByLowerName(bots: AdminBot[]): Map<string, AdminBot> {
  const map = new Map<string, AdminBot>();
  for (const bot of bots) {
    map.set(bot.name.toLowerCase(), bot);
  }
  return map;
}

/**
 * Official `getBotUserFromUser` (BotListV1.component.tsx:75-85):
 * enriches the bot's `botUser` reference with the matched search-hit
 * user, keeping the existing reference's `type` and defaulting it to
 * `'user'`. Hit fields overwrite even when undefined, as in the
 * official spread.
 */
export function enrichBotWithMatchedUser(bot: AdminBot, user?: SearchBotUser): AdminBot {
  if (!user) {
    return bot;
  }
  return {
    ...bot,
    botUser: {
      ...bot.botUser,
      id: user.id,
      name: user.name ?? '',
      displayName: user.displayName,
      fullyQualifiedName: user.fullyQualifiedName,
      type: bot.botUser?.type ?? 'user',
    },
  };
}

/**
 * Official client-side match (BotListV1.component.tsx:153-162,
 * 207-226): a bot matches when its user hit exists OR the bot's
 * lowercased name key, displayName, or description contains the
 * (lowercased) term. Matches are deduplicated by bot id.
 */
export function matchBotsBySearchTerm(
  botsByName: Map<string, AdminBot>,
  users: SearchBotUser[],
  term: string,
): AdminBot[] {
  const usersByBotName = new Map<string, SearchBotUser>();
  for (const user of users) {
    if (user.name) {
      usersByBotName.set(user.name.toLowerCase(), user);
    }
  }
  const lowerTerm = term.toLowerCase();
  const matched = new Map<string, AdminBot>();
  for (const [botKey, bot] of botsByName) {
    if (!bot.id) {
      continue;
    }
    const user = usersByBotName.get(botKey);
    const matchesBot =
      botKey.includes(lowerTerm) ||
      (bot.displayName?.toLowerCase().includes(lowerTerm) ?? false) ||
      (bot.description?.toLowerCase().includes(lowerTerm) ?? false);
    if (user || matchesBot) {
      matched.set(bot.id, enrichBotWithMatchedUser(bot, user));
    }
  }
  return [...matched.values()];
}

export interface SearchBotsOptions {
  showDeleted: boolean;
  bots: AdminBot[];
}

/**
 * Official `searchBots` (BotListV1.component.tsx:164-227): ES query
 * with empty `q`, page 1, size 100, `index: 'user'`, the bot
 * `queryFilter`, and `includeDeleted` from the Show Deleted toggle;
 * results are joined to the bot map and client-matched.
 *
 * The caller supplies the bot map (the official list ensures the map
 * is loaded before joining); this function performs the ES request,
 * hit formatting, and join.
 */
export async function searchBots(term: string, options: SearchBotsOptions): Promise<AdminBot[]> {
  const normalizedTerm = term.trim();
  if (!normalizedTerm) {
    return [];
  }
  const payload = await apiRequest('/v1/search/query', {
    query: {
      q: '',
      index: 'user',
      from: 0,
      size: BOT_SEARCH_PAGE_SIZE,
      deleted: options.showDeleted,
      query_filter: JSON.stringify(buildBotSearchQueryFilter(normalizedTerm)),
    },
  });
  const users = formatSearchUsers(payload);
  return matchBotsBySearchTerm(indexBotsByLowerName(options.bots), users, normalizedTerm);
}

export function mapJwt(raw: unknown): JwtAuthMechanism {
  const record = asRecord(raw) ?? {};
  return {
    JWTToken: asString(record.JWTToken) || undefined,
    JWTTokenExpiry: asString(record.JWTTokenExpiry) || undefined,
    JWTTokenExpiresAt: asNumber(record.JWTTokenExpiresAt),
  };
}

/**
 * POST /v1/users/generateToken `{id, JWTTokenExpiry}` (userAPI.ts:158-166).
 * The server also accepts the legacy PUT shape; the UI uses POST for
 * official parity (B24). The response config is intentionally
 * discarded by the caller, which refetches the auth mechanism.
 */
export async function generateBotToken(
  botUserId: string,
  expiry: JwtTokenExpiry,
): Promise<JwtAuthMechanism> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/users/generateToken', {
    method: 'POST',
    json: { id: botUserId, JWTTokenExpiry: expiry },
  });
  return mapJwt(raw.config ?? raw);
}

/** PUT /v1/users/revokeToken `{id}` (userAPI.ts:176-184); returns the updated user. */
export async function revokeBotToken(botUserId: string): Promise<AdminUser> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/users/revokeToken', {
    method: 'PUT',
    json: { id: botUserId },
  });
  const user = mapUser(raw);
  if (!user) {
    throw new Error('User revoke response was missing id and name');
  }
  return user;
}

export interface BotAuthMechanism {
  authType?: string;
  config?: JwtAuthMechanism;
}

/**
 * GET /v1/users/auth-mechanism/{botUserId} (userAPI.ts:186-192).
 * Only defined keys are carried so an empty server response stays an
 * empty object — the token form's Cancel visibility depends on the
 * official `isEmpty` check (AuthMechanismForm.tsx:225-232).
 */
export async function getAuthMechanismForBotUser(botUserId: string): Promise<BotAuthMechanism> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/users/auth-mechanism/${encodeURIComponent(botUserId)}`,
  );
  const mechanism: BotAuthMechanism = {};
  const authType = asString(raw.authType);
  if (authType) {
    mechanism.authType = authType;
  }
  const config = asRecord(raw.config);
  if (config) {
    mechanism.config = mapJwt(config);
  }
  return mechanism;
}

/**
 * JWT token expiry options (BotsUtils.tsx:23-68, User.constants.ts:23-34).
 * Order is the official numeric sort: OneHour (0.0417d), 1, 7, 30, 60,
 * 90 days, Unlimited (Infinity). Labels are i18n keys resolved by the
 * caller; the API layer never renders text.
 */
export const JWT_TOKEN_EXPIRY_NUMERIC_DAYS: Record<JwtTokenExpiry, number> = {
  OneHour: 0.0417,
  '1': 1,
  '7': 7,
  '30': 30,
  '60': 60,
  '90': 90,
  Unlimited: Infinity,
};

export interface JwtTokenExpiryOption {
  value: JwtTokenExpiry;
  labelKey: string;
  labelParams?: { number: number };
}

export const JWT_TOKEN_EXPIRY_OPTIONS: readonly JwtTokenExpiryOption[] = [
  { value: 'OneHour', labelKey: 'label.1-hr' },
  { value: '1', labelKey: 'label.1-day' },
  { value: '7', labelKey: 'label.number-day-plural', labelParams: { number: 7 } },
  { value: '30', labelKey: 'label.number-day-plural', labelParams: { number: 30 } },
  { value: '60', labelKey: 'label.number-day-plural', labelParams: { number: 60 } },
  { value: '90', labelKey: 'label.number-day-plural', labelParams: { number: 90 } },
  { value: 'Unlimited', labelKey: 'label.unlimited' },
];
