/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { JsonPatchOp } from '@/admin/jsonPatch';
import {
  asBoolean,
  asNumber,
  asRecord,
  asString,
  mapEntityRef,
  mapEntityRefs,
  parsePaged,
} from '@/api/json';
import type { Paged } from '@/types/admin';
import type {
  AlertCapabilities,
  AlertCapabilitiesRequest,
  AlertConditionCapability,
  AlertSourceCapability,
  ChangeEvent,
  ChangeEventClass,
  EventSubscriptionDiagnosticInfo,
  EventsRecord,
  TypedEvent,
  TypedEventStatus,
} from '@/types/notifications';
import type {
  AlertFilteringInput,
  AlertType,
  Argument,
  ArgumentsInput,
  CreateEventSubscriptionRequest,
  DestinationStatus,
  DestinationStatusValue,
  Effect,
  EventSubscription,
  EventSubscriptionDestination,
  EventSubscriptionFilterRule,
  EventSubscriptionFilteringRules,
  EventSubscriptionTrigger,
  HttpMethod,
  InputType,
  PrefixCondition,
  ProviderType,
  SubscriptionCategory,
  SubscriptionType,
  WebhookAuthConfig,
  WebhookAuthType,
  WebhookDestinationConfig,
} from '@/types/quality';
import { getEncodedFqn } from '@/utils/fqnPaths';
import { apiRequest } from './client';

/**
 * Alert API surface, ported from pin rest/alertsAPI.ts and
 * rest/observabilityAPI.ts (both share BASE_URL `/events/subscriptions`;
 * the product client prefixes `/v1`). Per-face create/update pairs are
 * separate exports with identical wire shapes because pin's form chains
 * select them by face. Deliberately NOT built: getAlertsFromId,
 * deleteAlert, both getFilterFunctions, deleteObservabilityAlert (all
 * dead in the pin classic chain — zero callers), and any templates API
 * (OSS never triggers the template chain).
 */

const BASE_URL = '/v1/events/subscriptions';

/** ListAlertsRequestParams (alertsAPI.ts:36-44). */
export interface ListAlertsParams {
  status?: DestinationStatusValue;
  alertType?: AlertType;
  before?: string;
  after?: string;
  include?: string;
  limit?: number;
  fields?: string;
}

/** By-name fetch params (alertsAPI.ts:65: Pick<..., 'include' | 'fields'>). */
export interface AlertByNameParams {
  include?: string;
  fields?: string;
}

/** getAlertEventsFromId params (alertsAPI.ts:148-152). No listCountOnly. */
export interface AlertEventsParams {
  status?: TypedEventStatus;
  limit?: number;
  paginationOffset?: number;
}

/** getAlertEventsDiagnosticsInfo params (observabilityAPI.ts:115-123). */
export interface AlertEventsDiagnosticsParams {
  fields?: string;
  include?: string;
  limit?: number;
  before?: string;
  after?: string;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => asString(item)).filter((item) => item.length > 0);
}

function mapAuthConfig(value: unknown): WebhookAuthConfig | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  return {
    type: (asString(rec.type) || undefined) as WebhookAuthType | undefined,
    secretKey: asString(rec.secretKey) || undefined,
    clientId: asString(rec.clientId) || undefined,
    clientSecret: asString(rec.clientSecret) || undefined,
    scope: asString(rec.scope) || undefined,
    tokenUrl: asString(rec.tokenUrl) || undefined,
  };
}

function mapDestinationConfig(value: unknown): WebhookDestinationConfig | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  return {
    // Unknown keys survive: pin's Webhook carries an index signature.
    ...rec,
    authType: mapAuthConfig(rec.authType),
    endpoint: asString(rec.endpoint) || undefined,
    headers: asRecord(rec.headers) ?? undefined,
    httpMethod: (asString(rec.httpMethod) || undefined) as HttpMethod | undefined,
    queryParams: asRecord(rec.queryParams) ?? undefined,
    receivers: asStringArray(rec.receivers),
    sendToAdmins: asBoolean(rec.sendToAdmins),
    sendToFollowers: asBoolean(rec.sendToFollowers),
    sendToOwners: asBoolean(rec.sendToOwners),
  };
}

function mapDestinationStatus(value: unknown): DestinationStatus | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  return {
    lastFailedAt: asNumber(rec.lastFailedAt),
    lastFailedReason: asString(rec.lastFailedReason) || undefined,
    lastFailedStatusCode: asNumber(rec.lastFailedStatusCode),
    lastSuccessfulAt: asNumber(rec.lastSuccessfulAt),
    nextAttempt: asNumber(rec.nextAttempt),
    status: (asString(rec.status) || undefined) as DestinationStatusValue | undefined,
    timestamp: asNumber(rec.timestamp),
    entity: asString(rec.entity) || undefined,
    headers: rec.headers,
    location: asString(rec.location) || undefined,
    mediaType: asString(rec.mediaType) || undefined,
    reason: asString(rec.reason) || undefined,
    statusCode: asNumber(rec.statusCode),
    statusInfo: asString(rec.statusInfo) || undefined,
  };
}

function mapDestination(value: unknown): EventSubscriptionDestination | null {
  const rec = asRecord(value);
  if (!rec) {
    return null;
  }
  return {
    category: (asString(rec.category) || undefined) as SubscriptionCategory | undefined,
    channel: asString(rec.channel) || undefined,
    config: mapDestinationConfig(rec.config),
    downstreamDepth:
      rec.downstreamDepth === null ? null : asNumber(rec.downstreamDepth),
    enabled: asBoolean(rec.enabled),
    id: asString(rec.id) || undefined,
    notifyDownstream: asBoolean(rec.notifyDownstream),
    readTimeout: asNumber(rec.readTimeout),
    statusDetails: mapDestinationStatus(rec.statusDetails),
    timeout: asNumber(rec.timeout),
    type: (asString(rec.type) || undefined) as SubscriptionType | undefined,
  };
}

function mapDestinations(value: unknown): EventSubscriptionDestination[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const mapped = mapDestination(item);
    return mapped ? [mapped] : [];
  });
}

function mapFilterRule(value: unknown): EventSubscriptionFilterRule | null {
  const rec = asRecord(value);
  if (!rec) {
    return null;
  }
  return {
    arguments: asStringArray(rec.arguments),
    // Pin's condition is a string (eventSubscription.ts:573); an array
    // value is not a condition and is dropped, never coerced.
    condition: asString(rec.condition) || undefined,
    description: asString(rec.description) || undefined,
    displayName: asString(rec.displayName) || undefined,
    effect: (asString(rec.effect) || undefined) as Effect | undefined,
    fullyQualifiedName: asString(rec.fullyQualifiedName) || undefined,
    inputType: (asString(rec.inputType) || undefined) as InputType | undefined,
    name: asString(rec.name) || undefined,
    prefixCondition: (asString(rec.prefixCondition) || undefined) as PrefixCondition | undefined,
  };
}

function mapFilterRules(value: unknown): EventSubscriptionFilterRule[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.flatMap((item) => {
    const mapped = mapFilterRule(item);
    return mapped ? [mapped] : [];
  });
}

function mapFilteringRules(value: unknown): EventSubscriptionFilteringRules | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  const resources = asStringArray(rec.resources);
  const rules = mapFilterRules(rec.rules);
  const actions = mapFilterRules(rec.actions);
  if (!resources && !rules && !actions) {
    return undefined;
  }
  return { resources, rules, actions };
}

function mapArgument(value: unknown): Argument | null {
  const rec = asRecord(value);
  if (!rec) {
    return null;
  }
  return {
    input: asStringArray(rec.input),
    name: asString(rec.name) || undefined,
  };
}

function mapArgumentsInput(value: unknown): ArgumentsInput | null {
  const rec = asRecord(value);
  if (!rec) {
    return null;
  }
  const args = Array.isArray(rec.arguments)
    ? rec.arguments.flatMap((item) => {
        const mapped = mapArgument(item);
        return mapped ? [mapped] : [];
      })
    : undefined;
  return {
    arguments: args,
    effect: (asString(rec.effect) || undefined) as Effect | undefined,
    name: asString(rec.name) || undefined,
    prefixCondition: (asString(rec.prefixCondition) || undefined) as PrefixCondition | undefined,
  };
}

function mapAlertInput(value: unknown): AlertFilteringInput | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  const mapList = (list: unknown): ArgumentsInput[] | undefined => {
    if (!Array.isArray(list)) {
      return undefined;
    }
    return list.flatMap((item) => {
      const mapped = mapArgumentsInput(item);
      return mapped ? [mapped] : [];
    });
  };
  return { actions: mapList(rec.actions), filters: mapList(rec.filters) };
}

function mapTrigger(value: unknown): EventSubscriptionTrigger | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  return {
    cronExpression: asString(rec.cronExpression) || undefined,
    scheduleInfo: (asString(rec.scheduleInfo) || undefined) as
      | EventSubscriptionTrigger['scheduleInfo']
      | undefined,
    triggerType: (asString(rec.triggerType) || undefined) as
      | EventSubscriptionTrigger['triggerType']
      | undefined,
  };
}

function mapSubscription(raw: Record<string, unknown>): EventSubscription | null {
  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id && !name) {
    return null;
  }
  return {
    id,
    name,
    alertType: (asString(raw.alertType) || undefined) as AlertType | undefined,
    batchSize: asNumber(raw.batchSize),
    className: asString(raw.className) || undefined,
    config: asRecord(raw.config) ?? undefined,
    description: asString(raw.description) || undefined,
    displayName: asString(raw.displayName) || undefined,
    destinations: mapDestinations(raw.destinations),
    domains: mapEntityRefs(raw.domains),
    enabled: asBoolean(raw.enabled),
    filteringRules: mapFilteringRules(raw.filteringRules),
    fullyQualifiedName: asString(raw.fullyQualifiedName) || name,
    href: asString(raw.href) || undefined,
    input: mapAlertInput(raw.input),
    notificationTemplate: mapEntityRef(raw.notificationTemplate),
    owners: mapEntityRefs(raw.owners),
    pollInterval: asNumber(raw.pollInterval),
    provider: (asString(raw.provider) || undefined) as ProviderType | undefined,
    retries: asNumber(raw.retries),
    trigger: mapTrigger(raw.trigger),
    updatedAt: asNumber(raw.updatedAt),
    updatedBy: asString(raw.updatedBy) || undefined,
    version: asNumber(raw.version),
  };
}

async function fetchSubscription(raw: Promise<Record<string, unknown>>, error: string): Promise<EventSubscription> {
  const mapped = mapSubscription(await raw);
  if (!mapped) {
    throw new Error(error);
  }
  return mapped;
}

/** alertsAPI.ts:63-78. Params spread, then `include: 'all'` forced. */
export function getAlertsFromName(fqn: string, params?: AlertByNameParams): Promise<EventSubscription> {
  return fetchSubscription(
    apiRequest<Record<string, unknown>>(`${BASE_URL}/name/${getEncodedFqn(fqn)}`, {
      query: { ...params, include: 'all' },
    }),
    'Event subscription response was missing id and name',
  );
}

/** observabilityAPI.ts:33-48. Same wire as getAlertsFromName, separate export. */
export function getObservabilityAlertByFQN(
  fqn: string,
  params?: AlertByNameParams,
): Promise<EventSubscription> {
  return fetchSubscription(
    apiRequest<Record<string, unknown>>(`${BASE_URL}/name/${getEncodedFqn(fqn)}`, {
      query: { ...params, include: 'all' },
    }),
    'Event subscription response was missing id and name',
  );
}

/** alertsAPI.ts:80-91 (observabilityAPI.ts:64-75 is the identical wire). */
export function getAllAlerts(params: ListAlertsParams): Promise<Paged<EventSubscription>> {
  return apiRequest<unknown>(BASE_URL, { query: { ...params } }).then((payload) =>
    parsePaged(payload, mapSubscription),
  );
}

/** alertsAPI.ts:93-99. Body sent as-is; no payload whitelist (deletion #16). */
export function createNotificationAlert(
  alert: CreateEventSubscriptionRequest,
): Promise<EventSubscription> {
  return fetchSubscription(
    apiRequest<Record<string, unknown>>(BASE_URL, { method: 'POST', json: alert }),
    'Create event subscription succeeded but the response had no alert',
  );
}

/** alertsAPI.ts:101-115. PATCH `/{id}`, id NOT encoded, json-patch content type. */
export function updateNotificationAlert(id: string, data: JsonPatchOp[]): Promise<EventSubscription> {
  return fetchSubscription(
    apiRequest<Record<string, unknown>>(`${BASE_URL}/${id}`, {
      method: 'PATCH',
      contentType: 'application/json-patch+json',
      json: data,
    }),
    'Update event subscription succeeded but the response had no alert',
  );
}

/** observabilityAPI.ts:77-83. */
export function createObservabilityAlert(
  alert: CreateEventSubscriptionRequest,
): Promise<EventSubscription> {
  return fetchSubscription(
    apiRequest<Record<string, unknown>>(BASE_URL, { method: 'POST', json: alert }),
    'Create event subscription succeeded but the response had no alert',
  );
}

/** observabilityAPI.ts:85-99. */
export function updateObservabilityAlert(
  id: string,
  data: JsonPatchOp[],
): Promise<EventSubscription> {
  return fetchSubscription(
    apiRequest<Record<string, unknown>>(`${BASE_URL}/${id}`, {
      method: 'PATCH',
      contentType: 'application/json-patch+json',
      json: data,
    }),
    'Update event subscription succeeded but the response had no alert',
  );
}

function mapSourceCapability(value: unknown): AlertSourceCapability | null {
  const rec = asRecord(value);
  if (!rec) {
    return null;
  }
  const name = asString(rec.name);
  if (!name) {
    return null;
  }
  return {
    canJoin: asBoolean(rec.canJoin),
    kind: (asString(rec.kind) || 'entity') as AlertSourceCapability['kind'],
    name,
    reason: asString(rec.reason) || undefined,
    selected: asBoolean(rec.selected),
    warning: asString(rec.warning) || undefined,
  };
}

function mapConditionCapabilities(value: unknown): AlertConditionCapability[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const rec = asRecord(item);
    const condition = rec ? mapFilterRule(rec.condition) : null;
    if (!rec || !condition) {
      return [];
    }
    return [{ condition, sources: asStringArray(rec.sources) ?? [] }];
  });
}

function mapCapabilities(raw: Record<string, unknown>, fallbackAlertType: AlertType): AlertCapabilities {
  return {
    alertType: (asString(raw.alertType) || fallbackAlertType) as AlertType,
    containerEntities: asStringArray(raw.containerEntities),
    eventTypes: asStringArray(raw.eventTypes),
    filters: mapConditionCapabilities(raw.filters),
    recipientCategories: asStringArray(raw.recipientCategories) as
      | SubscriptionCategory[]
      | undefined,
    sources: Array.isArray(raw.sources)
      ? raw.sources.flatMap((item) => {
          const mapped = mapSourceCapability(item);
          return mapped ? [mapped] : [];
        })
      : [],
    triggers: mapConditionCapabilities(raw.triggers),
  };
}

/** alertsAPI.ts:132-141. */
export async function getAlertCapabilities(
  request: AlertCapabilitiesRequest,
): Promise<AlertCapabilities> {
  const raw = await apiRequest<Record<string, unknown>>(`${BASE_URL}/capabilities`, {
    method: 'POST',
    json: request,
  });
  return mapCapabilities(raw, request.alertType);
}

function mapChangeEventClass(value: unknown): ChangeEventClass | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  return {
    changeDescription: rec.changeDescription,
    currentVersion: asNumber(rec.currentVersion),
    domains: asStringArray(rec.domains),
    entity: rec.entity,
    entityFullyQualifiedName: asString(rec.entityFullyQualifiedName) || undefined,
    entityId: asString(rec.entityId) || undefined,
    entityType: asString(rec.entityType) || undefined,
    eventType: asString(rec.eventType) || undefined,
    id: asString(rec.id) || undefined,
    impersonatedBy: asString(rec.impersonatedBy) || undefined,
    incrementalChangeDescription: rec.incrementalChangeDescription,
    previousVersion: asNumber(rec.previousVersion),
    recursive: asBoolean(rec.recursive),
    timestamp: asNumber(rec.timestamp),
    userName: asString(rec.userName) || undefined,
  };
}

function mapChangeEvent(value: unknown): ChangeEvent | null {
  const rec = asRecord(value);
  if (!rec) {
    return null;
  }
  return {
    changeDescription: rec.changeDescription,
    currentVersion: asNumber(rec.currentVersion),
    domains: asStringArray(rec.domains),
    entity: rec.entity,
    entityFullyQualifiedName: asString(rec.entityFullyQualifiedName) || undefined,
    entityId: asString(rec.entityId) || undefined,
    entityType: asString(rec.entityType) || undefined,
    eventType: asString(rec.eventType) || undefined,
    id: asString(rec.id) || undefined,
    impersonatedBy: asString(rec.impersonatedBy) || undefined,
    incrementalChangeDescription: rec.incrementalChangeDescription,
    previousVersion: asNumber(rec.previousVersion),
    recursive: asBoolean(rec.recursive),
    timestamp: asNumber(rec.timestamp),
    userName: asString(rec.userName) || undefined,
    changeEvent: mapChangeEventClass(rec.changeEvent),
    failingSubscriptionId: asString(rec.failingSubscriptionId) || undefined,
    reason: asString(rec.reason) || undefined,
    source: asString(rec.source) || undefined,
  };
}

function mapTypedEvent(raw: Record<string, unknown>): TypedEvent | null {
  const data = Array.isArray(raw.data)
    ? raw.data.flatMap((item) => {
        const mapped = mapChangeEvent(item);
        return mapped ? [mapped] : [];
      })
    : [];
  // Pin requires status/timestamp; the fallbacks only trigger on malformed
  // payloads the server never sends, and keep the tab a verbatim port.
  return {
    data,
    status: asString(raw.status) as TypedEventStatus,
    timestamp: asNumber(raw.timestamp) ?? 0,
  };
}

/**
 * alertsAPI.ts:143-162. Returns a paged response; the Recent Events tab
 * pages by offset client-side. `id` is NOT encoded (pin verbatim).
 */
export function getAlertEventsFromId(args: {
  id: string;
  params?: AlertEventsParams;
}): Promise<Paged<TypedEvent>> {
  return apiRequest<unknown>(`${BASE_URL}/id/${args.id}/listEvents`, {
    query: { ...args.params },
  }).then((payload) => parsePaged(payload, mapTypedEvent));
}

/** alertsAPI.ts:164-177. Body `{destinations}`; response is a bare array. */
export async function testAlertDestination(args: {
  destinations: EventSubscriptionDestination[];
}): Promise<EventSubscriptionDestination[]> {
  const raw = await apiRequest<unknown>(`${BASE_URL}/testDestination`, {
    method: 'POST',
    json: { destinations: args.destinations },
  });
  return mapDestinations(raw);
}

/** observabilityAPI.ts:49-55. PUT with NO body. */
export function syncOffset(fqn: string): Promise<unknown> {
  return apiRequest(`${BASE_URL}/name/${getEncodedFqn(fqn)}/syncOffset`, { method: 'PUT' });
}

function mapDiagnosticInfo(raw: Record<string, unknown>): EventSubscriptionDiagnosticInfo {
  const mapList = (value: unknown): ChangeEvent[] | undefined => {
    if (!Array.isArray(value)) {
      return undefined;
    }
    return value.flatMap((item) => {
      const mapped = mapChangeEvent(item);
      return mapped ? [mapped] : [];
    });
  };
  return {
    currentOffset: raw.currentOffset,
    failedEventsCount: raw.failedEventsCount,
    hasProcessedAllEvents: asBoolean(raw.hasProcessedAllEvents),
    latestOffset: raw.latestOffset,
    relevantUnprocessedEventsCount: raw.relevantUnprocessedEventsCount,
    relevantUnprocessedEventsCountIsLowerBound: asBoolean(
      raw.relevantUnprocessedEventsCountIsLowerBound,
    ),
    relevantUnprocessedEventsList: mapList(raw.relevantUnprocessedEventsList),
    startingOffset: raw.startingOffset,
    successfulEventsCount: raw.successfulEventsCount,
    totalUnprocessedEventsCount: raw.totalUnprocessedEventsCount,
    totalUnprocessedEventsList: mapList(raw.totalUnprocessedEventsList),
  };
}

/** observabilityAPI.ts:56-62. */
export async function getDiagnosticInfo(fqn: string): Promise<EventSubscriptionDiagnosticInfo> {
  const raw = await apiRequest<Record<string, unknown>>(
    `${BASE_URL}/name/${getEncodedFqn(fqn)}/diagnosticInfo`,
  );
  return mapDiagnosticInfo(raw);
}

function mapEventsRecord(raw: Record<string, unknown>): EventsRecord {
  return {
    countsAreLowerBound: asBoolean(raw.countsAreLowerBound),
    failedEventsCount: raw.failedEventsCount,
    pendingEventsCount: raw.pendingEventsCount,
    successfulEventsCount: raw.successfulEventsCount,
    totalEventsCount: raw.totalEventsCount,
  };
}

/**
 * observabilityAPI.ts:115-135. The fqn is NOT encoded in the path (pin
 * verbatim — unlike every other by-name call); listCountOnly defaults
 * to false and is always sent.
 */
export async function getAlertEventsDiagnosticsInfo(args: {
  fqn: string;
  params?: AlertEventsDiagnosticsParams;
  listCountOnly?: boolean;
}): Promise<EventsRecord> {
  const { fqn, params, listCountOnly = false } = args;
  const raw = await apiRequest<Record<string, unknown>>(`${BASE_URL}/name/${fqn}/eventsRecord`, {
    query: { ...params, listCountOnly },
  });
  return mapEventsRecord(raw);
}

/**
 * Delete an event subscription with the pin UI's wire shape
 * (hardDeleteEntity -> deleteEntity): DELETE /v1/events/subscriptions/{id}
 * with hardDelete=true&recursive=false, in that key order. The server
 * ignores both parameters — EventSubscriptionResource.deleteEventSubscription
 * hardcodes recursive=true, hardDelete=true and the base delete never
 * reads the query — so the delete is unconditionally hard either way;
 * the parameters are sent so the wire matches pin exactly.
 * The previous comment cited rest/alertsAPI.ts deleteAlert, which is
 * dead code in pin (zero callers); the live chain is hardDeleteEntity.
 * ADR:2026-11-18-event-subscription-delete-wire-matches-pin
 */
export function deleteEventSubscription(id: string): Promise<unknown> {
  return apiRequest(`${BASE_URL}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    query: { hardDelete: true, recursive: false },
  });
}
