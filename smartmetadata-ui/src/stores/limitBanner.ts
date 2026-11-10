/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { ref } from 'vue';
import { defineStore } from 'pinia';
import type { ResourceLimitStatus } from '@/api/limits';

/**
 * The global limit banner, ported from the official framework
 * (openmetadata-ui `hooks/useLimitStore.ts` + `components/LimitBanner/LimitBanner.tsx`).
 *
 * The product had no banner store before stage D: the entry gate
 * (LimitWrapper) evaluated the limit but never surfaced it globally.
 * The banner is the minimal global piece — the details state, the
 * soft/hard evaluation, and the banner itself (mounted in App.vue).
 * A `LimitWrapper` mount drives it: a fetched status at or over a
 * limit sets the banner, and unmounting a wrapper clears it, exactly
 * as official does. The home page mounts a hidden dataAssets wrapper
 * purely to drive the banner.
 *
 * The banner does NOT link to `/settings/billing/plans`: that route
 * does not exist in the product, so the link is dropped (recorded
 * deviation — ADR:2026-11-10-my-data-limit-banner-no-plans-link).
 *
 * ADR:2026-11-10-my-data-limit-banner-no-plans-link
 */

export interface BannerDetails {
  header: string;
  subheader: string;
  type: 'warning' | 'danger';
  softLimitExceed?: boolean;
  hardLimitExceed?: boolean;
}

/** lodash `startCase`, for the resource label (`dataAssets` -> `Data Assets`). */
export function startCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getLimitThresholdPercentage(
  limits: { softLimit: number; hardLimit: number },
  hardLimitExceed: boolean,
): number {
  if (limits.hardLimit <= 0) {
    return 100;
  }
  const threshold = hardLimitExceed ? limits.hardLimit : limits.softLimit;
  return Math.round((threshold / limits.hardLimit) * 100);
}

/**
 * The banner for one fetched resource status, or null when no limit
 * is exceeded. Soft exceed is `softLimit != -1 && currentCount >=
 * softLimit`; hard exceed is the same against the hard limit; the
 * server's own `limitReached` also triggers it. A hard exceed is
 * `danger`, a soft-only exceed is `warning`.
 */
export function buildBannerDetails(args: {
  status: ResourceLimitStatus;
  header: string;
  plan: string;
}): BannerDetails | null {
  const { status, header, plan } = args;
  const limits = status.configuredLimit.limits;
  const softLimitExceed = limits.softLimit !== -1 && status.currentCount >= limits.softLimit;
  const hardLimitExceed = limits.hardLimit !== -1 && status.currentCount >= limits.hardLimit;
  const isAnyLimitExceeded = softLimitExceed || hardLimitExceed || status.limitReached;
  if (!isAnyLimitExceeded) {
    return null;
  }
  return {
    header,
    type: hardLimitExceed ? 'danger' : 'warning',
    subheader: `${status.currentCount}/${limits.hardLimit} (${plan}, ${getLimitThresholdPercentage(limits, hardLimitExceed)}%)`,
    softLimitExceed,
    hardLimitExceed,
  };
}

export const useLimitBannerStore = defineStore('limitBanner', () => {
  const bannerDetails = ref<BannerDetails | null>(null);

  function setBannerDetails(details: BannerDetails | null): void {
    bannerDetails.value = details;
  }

  function clearBannerDetails(): void {
    bannerDetails.value = null;
  }

  /**
   * Evaluate one fetched status and set the banner when a limit is
   * exceeded. `showBanner: false` evaluates nothing (the caller
   * opted out). A non-exceeding status leaves the current banner
   * alone — only an exceed sets it, and only a dismiss or an
   * unmount clears it.
   */
  function maybeShowLimitBanner(args: {
    status: ResourceLimitStatus;
    header: string;
    plan: string;
    showBanner?: boolean;
  }): void {
    if (args.showBanner === false) {
      return;
    }
    const details = buildBannerDetails(args);
    if (details) {
      setBannerDetails(details);
    }
  }

  return { bannerDetails, setBannerDetails, clearBannerDetails, maybeShowLimitBanner };
});
