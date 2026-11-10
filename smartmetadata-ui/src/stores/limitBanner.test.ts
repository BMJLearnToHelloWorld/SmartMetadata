/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { ResourceLimitStatus } from '@/api/limits';
import {
  buildBannerDetails,
  startCase,
  useLimitBannerStore,
} from './limitBanner';

function status(overrides: Partial<ResourceLimitStatus> = {}): ResourceLimitStatus {
  return {
    name: 'dataAssets',
    limitReached: false,
    currentCount: 0,
    configuredLimit: {
      name: 'dataAssets',
      limits: { softLimit: 80, hardLimit: 100 },
    },
    ...overrides,
  };
}

describe('limit banner evaluation', () => {
  it('labels resources in start case', () => {
    expect(startCase('dataAssets')).toBe('Data Assets');
    expect(startCase('metric')).toBe('Metric');
  });

  it('stays silent below the soft limit', () => {
    expect(
      buildBannerDetails({ status: status({ currentCount: 79 }), header: 'H', plan: 'FREE' }),
    ).toBeNull();
  });

  it('warns at the soft limit with the soft threshold percentage', () => {
    expect(
      buildBannerDetails({ status: status({ currentCount: 80 }), header: 'H', plan: 'FREE' }),
    ).toEqual({
      header: 'H',
      type: 'warning',
      subheader: '80/100 (FREE, 80%)',
      softLimitExceed: true,
      hardLimitExceed: false,
    });
  });

  it('is danger at the hard limit with the hard threshold percentage', () => {
    expect(
      buildBannerDetails({ status: status({ currentCount: 100 }), header: 'H', plan: 'PRO' }),
    ).toEqual({
      header: 'H',
      type: 'danger',
      subheader: '100/100 (PRO, 100%)',
      softLimitExceed: true,
      hardLimitExceed: true,
    });
  });

  it('shows on the server’s limitReached even below the counted limits', () => {
    expect(
      buildBannerDetails({
        status: status({ currentCount: 10, limitReached: true }),
        header: 'H',
        plan: 'FREE',
      }),
    ).toMatchObject({ type: 'warning', softLimitExceed: false, hardLimitExceed: false });
  });

  it('treats a -1 soft limit as unset and a zero hard limit as 100%', () => {
    expect(
      buildBannerDetails({
        status: status({
          currentCount: 5,
          configuredLimit: { name: 'x', limits: { softLimit: -1, hardLimit: 0 } },
        }),
        header: 'H',
        plan: 'FREE',
      }),
    ).toMatchObject({ type: 'danger', subheader: '5/0 (FREE, 100%)' });
  });

  it('sets and clears the banner through the store', () => {
    setActivePinia(createPinia());
    const store = useLimitBannerStore();
    expect(store.bannerDetails).toBeNull();
    store.maybeShowLimitBanner({
      status: status({ currentCount: 80 }),
      header: 'H',
      plan: 'FREE',
    });
    expect(store.bannerDetails?.type).toBe('warning');
    store.maybeShowLimitBanner({
      status: status({ currentCount: 1 }),
      header: 'H',
      plan: 'FREE',
      showBanner: false,
    });
    expect(store.bannerDetails?.type).toBe('warning');
    store.clearBannerDetails();
    expect(store.bannerDetails).toBeNull();
  });
});
