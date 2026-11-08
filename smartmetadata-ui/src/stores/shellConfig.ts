/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { getLimitConfig, type LimitConfig } from '@/api/limits';
import { fetchServerVersion, getTypedSetting, settingAsLineage } from '@/api/system';
import type { LineageSettings } from '@/types/admin';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

/**
 * Shell startup configuration, mirroring the official AppContainer
 * parallel fetch (limit config + LineageSettings) as far as the product
 * API reaches.
 *
 * Wired: GET /v1/system/version (the `-SNAPSHOT` suffix is stripped,
 * matching the official getVersion handling) with a 1-hour cache, GET
 * /v1/system/settings/lineageSettings for lineage configuration, and
 * GET /v1/limits/config for the limit configuration that LimitWrapper
 * gates creation entries on (LimitsResource @Path /v1/limits).
 * Residual: the official version-mismatch alert is not wired — this
 * console has no client version constant to compare the server version
 * against. A failed limit fetch leaves `limit` null, which LimitWrapper
 * treats as fail-open (ungated), never as a startup failure.
 */
export const VERSION_CACHE_KEY = 'sm.version.v1';
export const VERSION_CACHE_TTL_MS = 60 * 60 * 1000;

export function stripSnapshot(version: string): string {
  return version.replace(/-SNAPSHOT$/i, '');
}

export const useShellConfigStore = defineStore('shellConfig', () => {
  const serverVersion = ref<string | undefined>(undefined);
  const serverVersionLoadedAt = ref<number | null>(null);
  const versionLoading = ref(false);
  const versionError = ref('');
  const lineageSettings = ref<LineageSettings | null>(null);
  const lineageLoading = ref(false);
  const lineageError = ref('');
  /** Limit configuration from GET /v1/limits/config; null until loaded or when the fetch fails. */
  const limit = ref<LimitConfig | null>(null);
  const limitLoading = ref(false);
  const limitError = ref('');

  const displayVersion = computed(() =>
    serverVersion.value ? stripSnapshot(serverVersion.value) : undefined,
  );

  function hydrateVersionCache(): void {
    try {
      const raw = window.localStorage.getItem(VERSION_CACHE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as { version?: unknown; at?: unknown };
      if (
        typeof parsed.version === 'string' &&
        typeof parsed.at === 'number' &&
        Date.now() - parsed.at < VERSION_CACHE_TTL_MS
      ) {
        serverVersion.value = parsed.version;
        serverVersionLoadedAt.value = parsed.at;
      }
    } catch {
      // A corrupt cache entry must not break shell startup.
    }
  }

  async function loadVersion(force = false): Promise<void> {
    if (!force && serverVersion.value && serverVersionLoadedAt.value) {
      return;
    }
    versionLoading.value = true;
    versionError.value = '';
    try {
      const next = await fetchServerVersion();
      if (next.version) {
        serverVersion.value = next.version;
        serverVersionLoadedAt.value = Date.now();
        window.localStorage.setItem(
          VERSION_CACHE_KEY,
          JSON.stringify({ version: next.version, at: serverVersionLoadedAt.value }),
        );
      }
    } catch (error) {
      versionError.value = error instanceof Error ? error.message : 'Failed to load version';
    } finally {
      versionLoading.value = false;
    }
  }

  async function loadLineageSettings(): Promise<void> {
    lineageLoading.value = true;
    lineageError.value = '';
    try {
      lineageSettings.value = await getTypedSetting('lineageSettings', settingAsLineage);
    } catch (error) {
      lineageError.value = error instanceof Error ? error.message : 'Failed to load lineage settings';
    } finally {
      lineageLoading.value = false;
    }
  }

  async function loadLimitConfig(): Promise<void> {
    if (limitLoading.value || limit.value) {
      return;
    }
    limitLoading.value = true;
    limitError.value = '';
    try {
      limit.value = await getLimitConfig();
    } catch (error) {
      // Fail-open by design: LimitWrapper renders its children when
      // `limit` is null, so a failed config fetch must not break shell
      // startup or any gated entry.
      limitError.value = error instanceof Error ? error.message : 'Failed to load limit config';
    } finally {
      limitLoading.value = false;
    }
  }

  async function loadShellConfig(): Promise<void> {
    hydrateVersionCache();
    await Promise.all([loadVersion(), loadLineageSettings(), loadLimitConfig()]);
  }

  return {
    serverVersion,
    displayVersion,
    versionLoading,
    versionError,
    lineageSettings,
    lineageLoading,
    lineageError,
    limit,
    limitLoading,
    limitError,
    hydrateVersionCache,
    loadVersion,
    loadLineageSettings,
    loadLimitConfig,
    loadShellConfig,
  };
});
