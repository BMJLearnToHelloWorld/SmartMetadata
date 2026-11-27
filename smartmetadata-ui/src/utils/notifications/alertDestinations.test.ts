/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import {
  alignDestinationsWithTestStatus,
  buildGroupedOptions,
  destinationOptionsForTab,
  checkIfDestinationIsInternal,
  getConfigFieldFromDestinationType,
  getDestinationStatusDetails,
  getDestinationStatusLabel,
  getExpandedConfigKeys,
  getTestableExternalDestinations,
  hasExternalDestination,
  isTestableExternalDestination,
  isValidEmailAddress,
} from './alertDestinations';
import type { EventSubscriptionDestination } from '@/types/quality';
import type { TranslateFn } from './alertUtils';

const t: TranslateFn = ((key: string) => key) as TranslateFn;

describe('buildGroupedOptions', () => {
  it('filters internal options by the offered categories plus the current one', () => {
    const options = buildGroupedOptions('Internal', 'External', ['Owners'], 'Teams');
    expect(options.map((option) => option.id)).toEqual([
      'header-internal',
      'Owners',
      'Teams',
      'header-external',
      'Email',
      'GChat',
      'MsTeams',
      'Slack',
      'Webhook',
    ]);
    expect(options[0].isDisabled).toBe(true);
    expect(options[1]).toEqual({ id: 'Owners', label: 'Owners', iconValue: 'Owners' });
    expect(options.find((option) => option.id === 'MsTeams')?.label).toBe('Ms Teams');
  });

  it('shows only the current category before the server answers', () => {
    const options = buildGroupedOptions('Internal', 'External', [], 'Followers');
    expect(options.filter((option) => !option.id.startsWith('header-')).map((o) => o.id)).toEqual(
      ['Followers', 'Email', 'GChat', 'MsTeams', 'Slack', 'Webhook'],
    );
  });
});

describe('checkIfDestinationIsInternal', () => {
  it('returns true for every category, External included', () => {
    expect(checkIfDestinationIsInternal('Owners')).toBe(true);
    expect(checkIfDestinationIsInternal('External')).toBe(true);
    expect(checkIfDestinationIsInternal('Email')).toBe(false);
  });
});

describe('getConfigFieldFromDestinationType', () => {
  it('maps Admins/Owners/Followers and nothing else', () => {
    expect(getConfigFieldFromDestinationType('Admins')).toBe('sendToAdmins');
    expect(getConfigFieldFromDestinationType('Owners')).toBe('sendToOwners');
    expect(getConfigFieldFromDestinationType('Followers')).toBe('sendToFollowers');
    expect(getConfigFieldFromDestinationType('Teams')).toBe('');
  });
});

describe('testable destinations', () => {
  const internal: EventSubscriptionDestination = {
    category: 'Owners',
    type: 'Email',
    config: { sendToOwners: true },
  };
  const externalEmpty: EventSubscriptionDestination = {
    category: 'External',
    type: 'Slack',
    config: {},
  };
  const external: EventSubscriptionDestination = {
    category: 'External',
    type: 'Slack',
    config: { endpoint: 'https://x' },
  };

  it('detects external destinations and testable ones', () => {
    expect(hasExternalDestination([internal])).toBe(false);
    expect(hasExternalDestination([externalEmpty])).toBe(true);
    expect(isTestableExternalDestination(internal)).toBe(false);
    expect(isTestableExternalDestination(externalEmpty)).toBe(false);
    expect(isTestableExternalDestination(external)).toBe(true);
    expect(getTestableExternalDestinations([internal, externalEmpty, external])).toEqual([
      external,
    ]);
  });

  it('re-aligns tested statuses to form indexes', () => {
    const tested = { ...external, statusDetails: { statusCode: 200 } };
    expect(alignDestinationsWithTestStatus([internal, external, externalEmpty], [tested])).toEqual(
      [undefined, tested, undefined],
    );
  });
});

describe('isValidEmailAddress / getExpandedConfigKeys', () => {
  it('validates email shape', () => {
    expect(isValidEmailAddress('a@b.c')).toBe(true);
    expect(isValidEmailAddress('a b@c.d')).toBe(false);
    expect(isValidEmailAddress('a@b')).toBe(false);
  });

  it('expands only the advanced config key', () => {
    expect(getExpandedConfigKeys(true, 'advanced-config-0')).toEqual(
      new Set(['advanced-config-0']),
    );
    expect(getExpandedConfigKeys(false, 'advanced-config-0')).toEqual(new Set());
  });
});

describe('getDestinationStatusDetails', () => {
  const statusDetails = { status: 'Success' as const, statusCode: 200, reason: 'OK' };
  const tested: EventSubscriptionDestination = {
    category: 'External',
    type: 'Webhook',
    config: { endpoint: 'https://x', headers: { a: '1' } },
    statusDetails,
  };

  it('returns the status while the row still equals the tested destination', () => {
    expect(
      getDestinationStatusDetails(
        {
          category: 'External',
          type: 'Webhook',
          config: { endpoint: 'https://x', headers: [{ key: 'a', value: '1' }] },
        },
        [tested],
        0,
      ),
    ).toEqual(statusDetails);
  });

  it('hides the status once the row is edited', () => {
    expect(
      getDestinationStatusDetails(
        {
          category: 'External',
          type: 'Webhook',
          config: { endpoint: 'https://y', headers: [{ key: 'a', value: '1' }] },
        },
        [tested],
        0,
      ),
    ).toBeUndefined();
  });

  it('returns undefined without a tested row at the index', () => {
    expect(
      getDestinationStatusDetails({ category: 'External', type: 'Webhook' }, [undefined], 0),
    ).toBeUndefined();
    expect(
      getDestinationStatusDetails({ category: 'External', type: 'Webhook' }, undefined, 0),
    ).toBeUndefined();
  });

  it('labels any non-Success status as Failed', () => {
    expect(getDestinationStatusLabel('Success', t)).toBe('label.success');
    expect(getDestinationStatusLabel('Failed', t)).toBe('label.failed');
    expect(getDestinationStatusLabel(undefined, t)).toBe('label.failed');
  });
});

describe('destinationOptionsForTab', () => {
  it('lists official internal and external destination labels, including G Chat', () => {
    const internal = destinationOptionsForTab('internal', ['Admins', 'Followers', 'Owners', 'Teams', 'Users']);
    expect(internal.map((item) => item.label)).toEqual(['Admins', 'Followers', 'Owners', 'Teams', 'Users']);
    const external = destinationOptionsForTab('external');
    expect(external.map((item) => item.id)).toEqual(['Email', 'GChat', 'MsTeams', 'Slack', 'Webhook']);
    expect(external.map((item) => item.label)).toEqual(['Email', 'G Chat', 'Ms Teams', 'Slack', 'Webhook']);
  });
});
