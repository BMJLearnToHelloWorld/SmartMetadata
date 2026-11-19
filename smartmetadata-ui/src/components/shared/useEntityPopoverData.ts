/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { onUnmounted, ref, watch } from 'vue';
import { apiRequest } from '@/api/client';
import { getEncodedFqn } from '@/utils/fqnPaths';
import {
  mapPopoverTeam,
  mapPopoverUser,
  type PopoverTeam,
  type PopoverUser,
} from './popoverTypes';
import { getUserWithImage } from './profilePictureUtils';
import { setCachedUserProfile } from './userProfileCache';

/**
 * Vue port of official hooks/popover/useEntityPopoverData.ts:24-67.
 *
 * Official shape: react-query keyed ['entity-popover', type, name],
 * enabled only for a non-empty name, USER_POPOVER_FIELDS =
 * [teams, roles, profile] / TEAM_POPOVER_FIELDS = [parents, userCount],
 * GET /users/name/{encodedFqn} and /teams/name/{encodedFqn}
 * (rest/userAPI.ts:77-84, rest/teamsAPI.ts:55-64), user branch mirror-writes
 * into the profile-pics store, team branch does not, and the hook returns
 * { data, loading: isLoading } with no error surface: every failure
 * collapses to empty data, which the content components render as
 * no-data-available.
 *
 * Framework adaptations (behavior-preserving):
 * - A module-level cache + in-flight map replaces react-query: concurrent
 *   consumers of one (type, name) share one request, exactly as the
 *   official query key dedups the Title and Content hooks. The shared
 *   request is never aborted by one unmounting consumer (react-query
 *   does not cancel on unmount either); staleness is guarded by a
 *   per-instance generation counter instead of AbortSignal.
 * - Cache rule: an entry younger than 30 minutes is served without a
 *   refetch; older entries are refetched. QUALIFICATION: the 05 doc
 *   claims official staleTime 0 + 30min gc, but the official queryClient
 *   defaults were not re-verified against the object tree; if the
 *   official defaults differ, this rule is the product choice to revisit,
 *   not a verified 1:1 claim. Bounded (500 entries, oldest-first
 *   eviction) per the bounded-cache rule.
 * - Fetch goes through apiRequest directly with the official field sets
 *   because src/api/ is outside this batch's ownership and the product
 *   getUserByName/getTeamByName take no fields parameter. INTEGRATION
 *   REQUEST: extend those API functions with an optional fields
 *   parameter and re-point this module at them; the field sets above
 *   are the contract.
 */
export type PopoverOwnerType = 'user' | 'team';

export const USER_POPOVER_FIELDS = 'teams,roles,profile';
export const TEAM_POPOVER_FIELDS = 'parents,userCount';

export const POPOVER_DATA_CACHE_TTL_MS = 30 * 60 * 1000;
export const POPOVER_DATA_CACHE_MAX = 500;

interface CacheEntry {
  data: PopoverUser | PopoverTeam;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const pending = new Map<string, Promise<PopoverUser | PopoverTeam | undefined>>();

function cacheKey(type: PopoverOwnerType, name: string): string {
  return `${type}:${name}`;
}

function putCache(key: string, data: PopoverUser | PopoverTeam): void {
  if (!cache.has(key) && cache.size >= POPOVER_DATA_CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      cache.delete(oldest);
    }
  }
  cache.set(key, { data, fetchedAt: Date.now() });
}

function fetchPopoverData(
  type: PopoverOwnerType,
  name: string
): Promise<PopoverUser | PopoverTeam | undefined> {
  const key = cacheKey(type, name);
  const inFlight = pending.get(key);
  if (inFlight) {
    return inFlight;
  }
  const fields = type === 'user' ? USER_POPOVER_FIELDS : TEAM_POPOVER_FIELDS;
  const path =
    type === 'user'
      ? `/v1/users/name/${getEncodedFqn(name)}`
      : `/v1/teams/name/${getEncodedFqn(name)}`;
  const promise = apiRequest<unknown>(path, { query: { fields } })
    .then((payload) => {
      // Branch on the type first: narrowing `mapped` through the
      // `type` discriminant is not something control flow can do for a
      // value produced by an earlier ternary, so each branch maps its
      // own payload. Runtime behavior is identical to the merged form.
      if (type === 'user') {
        const mapped = mapPopoverUser(payload);
        if (!mapped) {
          return undefined;
        }
        // Official user branch: resolve the image, then mirror-write.
        const withImage = getUserWithImage(mapped);
        setCachedUserProfile(name, withImage);
        putCache(key, withImage);
        return withImage;
      }
      const mapped = mapPopoverTeam(payload);
      if (!mapped) {
        return undefined;
      }
      putCache(key, mapped);
      return mapped;
    })
    .catch(() => {
      // Every failure collapses to no-data: 403/404/5xx/network alike.
      // No error state is exposed; the content renders no-data-available.
      return undefined;
    })
    .finally(() => {
      pending.delete(key);
    });
  pending.set(key, promise);
  return promise;
}

/**
 * Fetches the popover payload for one (type, name). `name` is a getter so
 * prop changes re-resolve. An empty name never fetches (official
 * `enabled: Boolean(name)`); the `'-'` sentinel is a non-empty string, so
 * it fetches, fails with 404, and collapses to no-data — do not
 * special-case it.
 */
export function useEntityPopoverData(name: () => string, type: PopoverOwnerType) {
  const data = ref<PopoverUser | PopoverTeam | undefined>(undefined);
  const loading = ref(false);
  let generation = 0;
  let disposed = false;

  function refresh(): void {
    generation += 1;
    const gen = generation;
    const currentName = name();
    if (!currentName) {
      data.value = undefined;
      loading.value = false;
      return;
    }
    const key = cacheKey(type, currentName);
    const entry = cache.get(key);
    if (entry && Date.now() - entry.fetchedAt < POPOVER_DATA_CACHE_TTL_MS) {
      data.value = entry.data;
      loading.value = false;
      return;
    }
    if (entry) {
      cache.delete(key);
    }
    data.value = undefined;
    loading.value = true;
    void fetchPopoverData(type, currentName).then((result) => {
      if (disposed || gen !== generation) {
        return;
      }
      data.value = result;
      loading.value = false;
    });
  }

  watch(name, refresh, { immediate: true });

  onUnmounted(() => {
    disposed = true;
    generation += 1;
  });

  return { data, loading };
}

/** Test seam: clears the popover data cache (in-flight requests untouched). */
export function clearPopoverDataCache(): void {
  cache.clear();
}
