/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asNumber, asString, parsePaged } from '@/api/json';
import type { Paged } from '@/types/admin';
import type { Announcement, CreateAnnouncementRequest } from '@/types/collaboration';
import { apiRequest } from './client';

export interface AnnouncementPatchOp {
  op: 'replace' | 'remove';
  path: string;
  value?: unknown;
}

/**
 * Delete an announcement. Official shape
 * (openmetadata-ui/.../rest/announcementsAPI.ts deleteAnnouncement):
 * DELETE /{id} with hardDelete defaulting to false. Live acceptance by
 * the product backend is unverified (R8); the shape itself is official.
 */
export async function deleteAnnouncement(id: string, hardDelete = false): Promise<void> {
  await apiRequest<unknown>(`/v1/announcements/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    query: { hardDelete },
  });
}

/**
 * Edit an announcement with JSON Patch ops. Official shape
 * (openmetadata-ui/.../rest/announcementsAPI.ts patchAnnouncement):
 * PATCH with Content-Type application/json-patch+json. Callers send only
 * ops for fields that actually changed; an empty op list sends nothing.
 */
export async function patchAnnouncement(id: string, ops: AnnouncementPatchOp[]): Promise<Announcement> {
  if (!ops.length) {
    throw new Error('No announcement changes to save');
  }
  const raw = await apiRequest<Record<string, unknown>>(`/v1/announcements/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    contentType: 'application/json-patch+json',
    json: ops,
  });
  const mapped = mapAnnouncement(raw);
  if (!mapped) {
    throw new Error('Update announcement succeeded but the response had no announcement');
  }
  return mapped;
}

export interface ListAnnouncementsQuery {
  limit?: number;
  after?: string;
  entityLink?: string;
  status?: string;
  active?: boolean;
  system?: boolean;
}

function mapAnnouncement(raw: Record<string, unknown>): Announcement | null {
  const id = asString(raw.id);
  if (!id) {
    return null;
  }
  return {
    id,
    name: asString(raw.name) || undefined,
    displayName: asString(raw.displayName) || undefined,
    description: asString(raw.description) || undefined,
    type: asString(raw.type) || undefined,
    entityLink: asString(raw.entityLink) || undefined,
    startTime: asNumber(raw.startTime),
    endTime: asNumber(raw.endTime),
    announcementStatus: asString(raw.announcementStatus) || undefined,
  };
}

export function listAnnouncements(query: ListAnnouncementsQuery = {}): Promise<Paged<Announcement>> {
  return apiRequest<unknown>('/v1/announcements', {
    query: {
      limit: query.limit ?? 50,
      after: query.after,
      entityLink: query.entityLink,
      status: query.status,
      active: query.active,
      system: query.system,
    },
  }).then((payload) => parsePaged(payload, mapAnnouncement));
}

export async function createAnnouncement(body: CreateAnnouncementRequest): Promise<Announcement> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/announcements', {
    method: 'POST',
    json: {
      description: body.description,
      startTime: body.startTime,
      endTime: body.endTime,
      name: body.name,
      displayName: body.displayName,
      type: body.type,
      entityLink: body.entityLink,
    },
  });
  const mapped = mapAnnouncement(raw);
  if (!mapped) {
    throw new Error('Create announcement succeeded but the response had no announcement');
  }
  return mapped;
}
