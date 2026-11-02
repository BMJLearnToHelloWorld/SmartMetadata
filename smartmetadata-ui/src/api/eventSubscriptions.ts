/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asBoolean, asRecord, asString, parsePaged } from '@/api/json';
import type { Paged } from '@/types/admin';
import type {
  CreateEventSubscriptionRequest,
  EventSubscription,
  EventSubscriptionDestination,
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
      },
    ];
  });
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

export async function createEventSubscription(
  body: CreateEventSubscriptionRequest,
): Promise<EventSubscription> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/events/subscriptions', {
    method: 'POST',
    json: body,
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
    json: body,
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
