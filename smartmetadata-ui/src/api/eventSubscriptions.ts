/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asBoolean, asNumber, asRecord, asString, mapEntityRefs, parsePaged } from '@/api/json';
import type { Paged } from '@/types/admin';
import type {
  CreateEventSubscriptionRequest,
  EventSubscription,
  EventSubscriptionDestination,
  EventSubscriptionFilteringRules,
} from '@/types/quality';
import { apiRequest } from './client';

export const EVENT_SUBSCRIPTION_FIELDS = 'owners,filteringRules';

export interface ListEventSubscriptionsQuery {
  limit?: number;
  after?: string;
}

function mapDestinations(value: unknown): EventSubscriptionDestination[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const rec = asRecord(item);
    if (!rec) {
      return [];
    }
    const config = asRecord(rec.config);
    return [
      {
        category: asString(rec.category) || undefined,
        type: asString(rec.type) || undefined,
        enabled: asBoolean(rec.enabled),
        endpoint: asString(config?.endpoint) || undefined,
        // Fix4 follow-up: readTimeout lives on the destination itself, not
        // inside config — official formatDestinations writes it beside
        // config, and the server rejects it inside Webhook config.
        readTimeout: asNumber(rec.readTimeout),
      },
    ];
  });
}

function mapFilteringRules(value: unknown): EventSubscriptionFilteringRules | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  const resources = Array.isArray(rec.resources)
    ? rec.resources.map((item) => asString(item)).filter((item) => item.length > 0)
    : undefined;
  const rules = Array.isArray(rec.rules)
    ? rec.rules.flatMap((item) => {
        const rule = asRecord(item);
        if (!rule) {
          return [];
        }
        const condition = Array.isArray(rule.condition)
          ? rule.condition.map((entry) => asString(entry)).filter((entry) => entry.length > 0)
          : asString(rule.condition) || undefined;
        return [{ name: asString(rule.name) || undefined, effect: asString(rule.effect) || undefined, condition }];
      })
    : undefined;
  if (!resources && !rules) {
    return undefined;
  }
  return { resources, rules };
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
    displayName: asString(raw.displayName) || undefined,
    description: asString(raw.description) || undefined,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || name,
    alertType: asString(raw.alertType) || undefined,
    enabled: asBoolean(raw.enabled),
    destinations: mapDestinations(raw.destinations),
    filteringRules: mapFilteringRules(raw.filteringRules),
    owners: mapEntityRefs(raw.owners),
  };
}

export function listEventSubscriptions(
  query: ListEventSubscriptionsQuery = {},
): Promise<Paged<EventSubscription>> {
  return apiRequest<unknown>('/v1/events/subscriptions', {
    query: {
      fields: EVENT_SUBSCRIPTION_FIELDS,
      limit: query.limit ?? 50,
      after: query.after,
    },
  }).then((payload) => parsePaged(payload, mapSubscription));
}

export async function getEventSubscription(id: string): Promise<EventSubscription> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/events/subscriptions/${encodeURIComponent(id)}`, {
    query: { fields: EVENT_SUBSCRIPTION_FIELDS },
  });
  const mapped = mapSubscription(raw);
  if (!mapped) {
    throw new Error('Event subscription response was missing id and name');
  }
  return mapped;
}

/**
 * Server subscriptionCategory / subscriptionType enums (eventSubscription
 * schema). Case is significant: the server rejects an unknown case with
 * a Jackson error, so a wrong-case type never reaches validation.
 */
export const DESTINATION_CATEGORIES = [
  'Users',
  'Teams',
  'Admins',
  'Assignees',
  'Owners',
  'Mentions',
  'Followers',
  'External',
] as const;

export const DESTINATION_TYPES = [
  'Webhook',
  'Slack',
  'MsTeams',
  'GChat',
  'Email',
  'ActivityFeed',
  'GovernanceWorkflowChangeEvent',
] as const;

/**
 * Build the exact create/update wire payload. The create schema's only
 * required fields are name and alertType, it has no filteringRules
 * field, and it rejects unknown fields — so this whitelist drops
 * filteringRules and every entity-only field (id, fqn, href, version)
 * instead of forwarding the form object. Resources must be exactly
 * one: the server builds the stored filtering rules from this list
 * and rejects any other count. Destination readTimeout stays beside
 * config, never inside it, where the server rejects it for webhooks.
 */
export function buildEventSubscriptionPayload(
  body: CreateEventSubscriptionRequest,
): Record<string, unknown> {
  const name = body.name?.trim();
  if (!name) {
    throw new Error('An alert needs a name');
  }
  if (!body.alertType) {
    throw new Error('An alert needs an alertType');
  }
  const resources = (body.resources ?? []).filter((item) => item.trim().length > 0);
  if (resources.length !== 1) {
    throw new Error('An alert needs exactly one resource');
  }
  const destinations = body.destinations.map((destination) => {
    if (destination.category && !DESTINATION_CATEGORIES.includes(destination.category as (typeof DESTINATION_CATEGORIES)[number])) {
      throw new Error(`Unknown destination category: ${destination.category}`);
    }
    if (destination.type && !DESTINATION_TYPES.includes(destination.type as (typeof DESTINATION_TYPES)[number])) {
      throw new Error(`Unknown destination type: ${destination.type}`);
    }
    const config = destination.config ? { ...destination.config } : undefined;
    return {
      category: destination.category,
      type: destination.type,
      config,
      readTimeout: destination.readTimeout,
    };
  });
  return {
    name,
    alertType: body.alertType,
    displayName: body.displayName,
    description: body.description,
    enabled: body.enabled,
    resources,
    destinations,
  };
}

export async function createEventSubscription(
  body: CreateEventSubscriptionRequest,
): Promise<EventSubscription> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/events/subscriptions', {
    method: 'POST',
    json: buildEventSubscriptionPayload(body),
  });
  const mapped = mapSubscription(raw);
  if (!mapped) {
    throw new Error('Create event subscription succeeded but the response had no alert');
  }
  return mapped;
}

export async function updateEventSubscription(
  body: CreateEventSubscriptionRequest,
): Promise<EventSubscription> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/events/subscriptions', {
    method: 'PUT',
    json: buildEventSubscriptionPayload(body),
  });
  const mapped = mapSubscription(raw);
  if (!mapped) {
    throw new Error('Update event subscription succeeded but the response had no alert');
  }
  return mapped;
}

/** Official deleteAlert (rest/alertsAPI.ts): DELETE {BASE}/{id}. */
export function deleteEventSubscription(id: string): Promise<unknown> {
  return apiRequest(`/v1/events/subscriptions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
