/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { getUserById } from '@/api/users';
import type { useAuthStore } from '@/stores/auth';
import type { AdminUser } from '@/types/admin';

type AuthStore = ReturnType<typeof useAuthStore>;
type FetchUserById = (
  id: string,
  options: { fields: string[]; include: 'all' },
) => Promise<AdminUser>;

/**
 * Pin `fetchCurrentUser` (PersonaDetailsPage.tsx:171-188): re-read the
 * current user with `fields: [personas, defaultPersona]`,
 * `include: all`, and merge the result over the stored user, forcing
 * `defaultPersona` from the fetched user so a removed default clears
 * instead of lingering. Silent on failure; a no-op without a current
 * user. Called after membership/default changes that refetch.
 */
export async function fetchCurrentUserForPersonaDetail(
  authStore: AuthStore,
  fetchUser: FetchUserById = getUserById,
): Promise<void> {
  const currentUser = authStore.user;
  if (!currentUser?.id) {
    return;
  }
  try {
    const user = await fetchUser(currentUser.id, {
      fields: ['personas', 'defaultPersona'],
      include: 'all',
    });
    authStore.user = {
      ...currentUser,
      ...user,
      defaultPersona: user.defaultPersona,
    };
  } catch {
    return;
  }
}

/**
 * Pin `fetchCurrentUser` (AddEditPersona.component.tsx:69-82): the
 * create-modal variant reads `fields: [personas]` only and merges with
 * a plain spread (no forced defaultPersona key). Silent on failure;
 * a no-op without a current user.
 */
export async function fetchCurrentUserAfterPersonaCreate(
  authStore: AuthStore,
  fetchUser: FetchUserById = getUserById,
): Promise<void> {
  const currentUser = authStore.user;
  if (!currentUser?.id) {
    return;
  }
  try {
    const user = await fetchUser(currentUser.id, {
      fields: ['personas'],
      include: 'all',
    });
    authStore.user = { ...currentUser, ...user };
  } catch {
    return;
  }
}
