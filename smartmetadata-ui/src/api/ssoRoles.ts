/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asString, parsePaged } from '@/api/json';
import { apiRequest } from './client';

/**
 * SSO-scoped role search with pin's exact query shape (rolesAPIV1
 * `searchRoles`): `q` omitted when empty, `limit` 25, `offset` 0, no
 * `fields` parameter. Kept separate from the shared `api/roles.ts`
 * `searchRoles` (which always sends `q` + `fields` and no offset, and is
 * also used by RolesListView) so the SSO query shape changes no other
 * caller. Returns the `data` array only, like pin.
 */

export interface SsoRoleOption {
  name: string;
  displayName?: string;
}

function mapSsoRole(raw: Record<string, unknown>): SsoRoleOption | null {
  const name = asString(raw.name);
  if (!name) {
    return null;
  }
  const displayName = asString(raw.displayName);
  return { name, ...(displayName ? { displayName } : {}) };
}

export async function searchSsoRoles(query: string): Promise<SsoRoleOption[]> {
  const payload = await apiRequest<unknown>('/v1/roles/search', {
    query: { q: query || undefined, limit: 25, offset: 0 },
  });
  return parsePaged(payload, mapSsoRole).data;
}
