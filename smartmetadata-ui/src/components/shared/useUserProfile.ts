/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { computed, ref, watch } from 'vue';
import { ApiError, apiRequest } from '@/api/client';
import { getEncodedFqn } from '@/utils/fqnPaths';
import { mapPopoverUser } from './popoverTypes';
import {
  getImageWithResolutionAndFallback,
  getUserWithImage,
  ImageQuality,
} from './profilePictureUtils';
import {
  getCachedUserProfile,
  isProfileLoading,
  markProfileLoading,
  setCachedUserProfile,
  unmarkProfileLoading,
} from './userProfileCache';

/**
 * Vue port of official hooks/user-profile/useUserProfile.ts:62-151.
 *
 * Profile images are best-effort. A read failure caches a placeholder
 * user so avatar loaders can settle instead of retrying a denied/missing
 * profile forever (official :39-60). Cacheable statuses: 404/403/401/400
 * plus 500 and status-less (network) failures (:30-37).
 *
 * For teams the official hook sets the static teams-icon URL as the
 * picture, but the team avatar branch never renders it (ProfilePicture
 * draws the placeholder icon inline instead), so the team path here
 * simply never fetches and reports no picture.
 */

const CACHEABLE_ERROR_STATUSES = [404, 403, 401, 400];

function shouldCachePlaceholderOnError(status?: number): boolean {
  return CACHEABLE_ERROR_STATUSES.includes(status as number) || status === 500 || status === undefined;
}

export function useUserProfile(options: {
  permission: () => boolean;
  name: () => string;
  isTeam?: boolean;
}) {
  const { permission, name } = options;
  const isTeam = options.isTeam ?? false;

  const user = computed(() => getCachedUserProfile(name()));
  const profilePic = ref<string | null>(
    getImageWithResolutionAndFallback(ImageQuality['6x'], user.value?.profile?.images) ?? null
  );

  // Keep the resolved picture in step with the cached user, including
  // when the name changes to a different cached user.
  watch(
    [name, user],
    () => {
      const resolved =
        getImageWithResolutionAndFallback(ImageQuality['6x'], user.value?.profile?.images) ?? '';
      if (user.value && profilePic.value !== resolved) {
        profilePic.value = resolved;
      }
      // No else branch: when the name changes to an uncached user the
      // previous picture stays until the fetch lands, matching the
      // official effect (which only updates while `user` exists).
    },
    { immediate: true }
  );

  async function fetchProfileIfRequired(): Promise<void> {
    const cacheKey = name();
    if (isTeam || getCachedUserProfile(cacheKey)) {
      return;
    }
    if (isProfileLoading(cacheKey)) {
      return;
    }
    markProfileLoading(cacheKey);
    try {
      const payload = await apiRequest<unknown>(
        `/v1/users/name/${getEncodedFqn(cacheKey)}`,
        { query: { fields: 'profile' } }
      );
      const mapped = mapPopoverUser(payload);
      if (mapped) {
        setCachedUserProfile(cacheKey, getUserWithImage(mapped));
      }
    } catch (error) {
      const status = error instanceof ApiError ? error.status : undefined;
      if (shouldCachePlaceholderOnError(status)) {
        setCachedUserProfile(cacheKey, {
          id: cacheKey,
          name: cacheKey,
          email: '',
          teams: [],
          roles: [],
        });
      }
    } finally {
      unmarkProfileLoading(cacheKey);
    }
  }

  watch(
    [permission, name],
    () => {
      if (!permission() || !name()) {
        return;
      }
      void fetchProfileIfRequired();
    },
    { immediate: true }
  );

  const isLoading = computed(
    () => !isTeam && user.value === undefined && isProfileLoading(name())
  );

  return { profilePic, isLoading, user };
}
