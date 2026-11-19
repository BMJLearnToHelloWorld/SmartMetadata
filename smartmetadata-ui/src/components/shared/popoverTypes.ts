/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asBoolean, asNumber, asRecord, asString } from '@/api/json';
import type { ImageList } from './profilePictureUtils';

/**
 * Raw-mapped shapes for the PER-D9 popover data layer.
 *
 * The product admin types drop fields the popover contract needs:
 * AdminUser has no `profile` (avatar images), and EntityRef has no
 * `deleted` (getNonDeletedTeams). These shapes map the raw payloads
 * directly so no popover-visible field is lost. Official sources:
 * generated/entity/teams/user + team, utils/TeamUtils.ts
 * getNonDeletedTeams, components/common/PopOverCard/*.
 */
export interface PopoverEntityRef {
  id?: string;
  name: string;
  displayName?: string;
  type?: string;
  deleted?: boolean;
}

export interface PopoverProfile {
  images?: ImageList;
}

export interface PopoverUser {
  id: string;
  name: string;
  displayName?: string;
  email?: string;
  description?: string;
  isAdmin?: boolean;
  isBot?: boolean;
  deleted?: boolean;
  teams: PopoverEntityRef[];
  roles: PopoverEntityRef[];
  profile?: PopoverProfile;
}

export interface PopoverTeam {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  teamType?: string;
  deleted?: boolean;
  userCount?: number;
  parents: PopoverEntityRef[];
}

export function mapPopoverRefs(raw: unknown): PopoverEntityRef[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const refs: PopoverEntityRef[] = [];
  for (const entry of raw) {
    const record = asRecord(entry);
    if (!record) {
      continue;
    }
    const name = asString(record.name);
    if (!name) {
      continue;
    }
    refs.push({
      id: asString(record.id) || undefined,
      name,
      displayName: asString(record.displayName) || undefined,
      type: asString(record.type) || undefined,
      deleted: asBoolean(record.deleted),
    });
  }
  return refs;
}

function mapImageList(raw: unknown): ImageList | undefined {
  const record = asRecord(raw);
  if (!record) {
    return undefined;
  }
  const images: ImageList = {
    image: asString(record.image) || undefined,
    image24: asString(record.image24) || undefined,
    image32: asString(record.image32) || undefined,
    image48: asString(record.image48) || undefined,
    image72: asString(record.image72) || undefined,
    image192: asString(record.image192) || undefined,
    image512: asString(record.image512) || undefined,
  };
  return Object.values(images).some(Boolean) ? images : undefined;
}

export function mapPopoverUser(raw: unknown): PopoverUser | null {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }
  const id = asString(record.id);
  const name = asString(record.name);
  if (!id && !name) {
    return null;
  }
  const profileRecord = asRecord(record.profile);
  const images = profileRecord ? mapImageList(profileRecord.images) : undefined;
  return {
    id,
    name,
    displayName: asString(record.displayName) || undefined,
    email: asString(record.email) || undefined,
    description: asString(record.description) || undefined,
    isAdmin: asBoolean(record.isAdmin),
    isBot: asBoolean(record.isBot),
    deleted: asBoolean(record.deleted),
    teams: mapPopoverRefs(record.teams),
    roles: mapPopoverRefs(record.roles),
    profile: images ? { images } : undefined,
  };
}

export function mapPopoverTeam(raw: unknown): PopoverTeam | null {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }
  const id = asString(record.id);
  const name = asString(record.name);
  if (!id && !name) {
    return null;
  }
  return {
    id,
    name,
    displayName: asString(record.displayName) || undefined,
    description: asString(record.description) || undefined,
    teamType: asString(record.teamType) || undefined,
    deleted: asBoolean(record.deleted),
    userCount: asNumber(record.userCount),
    parents: mapPopoverRefs(record.parents),
  };
}
