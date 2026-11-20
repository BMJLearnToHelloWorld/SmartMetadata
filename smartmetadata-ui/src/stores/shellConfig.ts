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
import {
  fetchServerVersion,
  getCustomUiThemePreference,
  getTypedSetting,
  settingAsLineage,
  settingAsUiTheme,
} from '@/api/system';
import type { LineageSettings, UiThemePreference } from '@/types/admin';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

/**
 * Shell startup configuration, mirroring the official AppContainer
 * parallel fetch (limit config + LineageSettings) as far as the product
 * API reaches.
 *
 * Wired: GET /v1/system/version (the `-SNAPSHOT` suffix is stripped,
 * matching the official getVersion handling) with a 1-hour cache, GET
 * /v1/system/settings/lineageSettings for lineage configuration, GET
 * /v1/system/config/customUiThemePreference for the custom UI theme
 * preference (P-THEME startup read through the public config endpoint,
 * so the theme applies to every user; a failed read leaves the slice null
 * and the iSmart defaults apply), and GET /v1/limits/config for the
 * limit configuration that LimitWrapper gates creation entries on
 * (LimitsResource @Path /v1/limits).
 * Residual: the official version-mismatch alert compares the freshly
 * fetched server version against the one seen at startup
 * (`checkVersionMismatch`, wired to window focus in AppShell, mirroring
 * pin NavBar's focus listener); there is no client version constant to
 * compare against. A failed limit fetch leaves `limit` null, which
 * LimitWrapper treats as fail-open (ungated), never as a startup failure.
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
  /**
   * Pin NavBar `:320-340` / `:546-566` version-mismatch alert: set when
   * a re-fetch (after the 1-hour cache expired) returns a different
   * server version than the one already on screen. AppShell renders the
   * refresh alert while this is true; nothing clears it — the refresh
   * reloads the page.
   */
  const versionMismatch = ref(false);
  const lineageSettings = ref<LineageSettings | null>(null);
  const lineageLoading = ref(false);
  const lineageError = ref('');
  /**
   * Custom UI theme preference (P-THEME slice). Null until loaded or
   * when the fetch fails; App.vue treats null as "no customization"
   * and the iSmart defaults apply. The stored value is the whitelist
   * display form (settingAsUiTheme); the Appearance page keeps the
   * raw snapshot for its R-THEME overlay save, and hands the saved
   * payload to setUiThemePreference on success (Q-TH-5: direct
   * update with this payload, no reload; on failure the slice is
   * untouched).
   */
  const uiThemePreference = ref<UiThemePreference | null>(null);
  const uiThemeLoading = ref(false);
  const uiThemeError = ref('');

  /**
   * P-TIME (bounded): the tenant default time format, updated only by the
   * Time Format page after its PATCH succeeds — mirroring official's
   * `setTimeFormat` call point in DefaultTimeFormatPage. No startup load
   * and no consumers yet: global date-rendering consumption is a
   * recorded residual, never claimed closed. `undefined` means the
   * official 12h default.
   */
  const timeFormat = ref<'12h' | '24h' | undefined>(undefined);

  function setTimeFormat(next: '12h' | '24h'): void {
    timeFormat.value = next;
  }
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

  /**
   * Pin NavBar `:320-340` (focus re-check): within an hour of the last
   * fetch the check is skipped; once expired, re-fetch and compare the
   * `-SNAPSHOT`-stripped version against the one already on screen.
   * A difference sets `versionMismatch` (AppShell renders the refresh
   * alert). The comparison only runs when a version was already seen,
   * so a first load never trips the alert; a failed re-fetch leaves the
   * stored timestamp untouched, so the next check retries.
   */
  async function checkVersionMismatch(): Promise<void> {
    if (versionLoading.value) {
      return;
    }
    const lastFetchAt = serverVersionLoadedAt.value;
    if (lastFetchAt && Date.now() - lastFetchAt < VERSION_CACHE_TTL_MS) {
      return;
    }
    const previous = displayVersion.value;
    await loadVersion(true);
    const next = displayVersion.value;
    if (previous && next && previous !== next) {
      versionMismatch.value = true;
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

  /**
   * Direct slice update from a save response (Lineage 8.9 seam): the
   * Lineage canvas watches this slice, so a successful save refreshes
   * the canvas defaults without a refetch. Mirrors the official
   * setAppPreferences({ lineageConfig }) update on save.
   */
  function setLineageSettings(next: LineageSettings): void {
    lineageSettings.value = next;
  }

  async function loadUiThemePreference(): Promise<void> {
    uiThemeLoading.value = true;
    uiThemeError.value = '';
    try {
      // The public-endpoint semantics live with getCustomUiThemePreference.
      uiThemePreference.value = await getCustomUiThemePreference();
    } catch (error) {
      // Fail-open by design: a failed theme read must not break shell
      // startup; null keeps the iSmart defaults in effect.
      uiThemeError.value = error instanceof Error ? error.message : 'Failed to load UI theme preference';
    } finally {
      uiThemeLoading.value = false;
    }
  }

  /**
   * Q-TH-5: on a successful Appearance save/reset, update this slice
   * directly with the saved payload (parsed through the same display
   * whitelist as the startup read). Never called on failure.
   */
  function setUiThemePreference(payload: unknown): void {
    uiThemePreference.value = settingAsUiTheme(payload);
  }

  async function loadLimitConfig(): Promise<void> {
    if (limitLoading.value || limit.value) {
      return;
    }
    await refreshLimitConfig();
  }

  /**
   * Force-refresh the limit configuration, bypassing the load-once guard.
   * Pin calls `getResourceLimit('app', true, true)` after app install /
   * uninstall so the creation gate re-evaluates against fresh counts
   * (Applications §1.5); the load-once entry cannot express that.
   * Fail-open semantics are identical to loadLimitConfig.
   */
  async function refreshLimitConfig(): Promise<void> {
    if (limitLoading.value) {
      return;
    }
    limitLoading.value = true;
    limitError.value = '';
    try {
      limit.value = await getLimitConfig();
    } catch (error) {
      limitError.value = error instanceof Error ? error.message : 'Failed to load limit config';
    } finally {
      limitLoading.value = false;
    }
  }

  async function loadShellConfig(): Promise<void> {
    hydrateVersionCache();
    await Promise.all([loadVersion(), loadLineageSettings(), loadUiThemePreference(), loadLimitConfig()]);
  }

  return {
    serverVersion,
    displayVersion,
    versionLoading,
    versionError,
    versionMismatch,
    lineageSettings,
    lineageLoading,
    lineageError,
    uiThemePreference,
    uiThemeLoading,
    uiThemeError,
    timeFormat,
    limit,
    limitLoading,
    limitError,
    hydrateVersionCache,
    loadVersion,
    checkVersionMismatch,
    loadLineageSettings,
    setLineageSettings,
    loadUiThemePreference,
    setUiThemePreference,
    setTimeFormat,
    loadLimitConfig,
    refreshLimitConfig,
    loadShellConfig,
  };
});
