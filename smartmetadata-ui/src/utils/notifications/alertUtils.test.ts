/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the Apache License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import type { EventSubscriptionDestination } from '@/types/quality';
import {
  formatDiagnosticTabValue,
  formatEventCount,
  getAlertActionTypeDisplayName,
  getAlertEventsFilterLabels,
  getChangeEventDataFromTypedEvent,
  getConfigHeaderArrayFromObject,
  getConfigHeaderObjectFromArray,
  getConfigQueryParamsArrayFromObject,
  getConfigQueryParamsObjectFromArray,
  getDestinationsWithTestStatus,
  getDiagnosticItems,
  getDisplayNameForEntities,
  getEntityName,
  getFormattedDestinations,
  getFunctionDisplayName,
  getLabelsForEventDetails,
  getMessageFromArgumentName,
  getRandomizedAlertName,
  getSelectOptionsFromEnum,
  getSelectOptionsFromValues,
  getSubscriptionTypeOptions,
  isSubscriptionCategoryName,
  normalizeDestinationConfig,
  type TranslateFn,
} from './alertUtils';
import { startCase } from '@/utils/text';

const t = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key) as TranslateFn;

describe('startCase', () => {
  it('splits camel humps, uppercase runs, and separators', () => {
    expect(startCase('GChat')).toBe('G Chat');
    expect(startCase('entityCreated')).toBe('Entity Created');
    expect(startCase('FOO_BAR')).toBe('FOO BAR');
    expect(startCase('test-suite-status')).toBe('Test Suite Status');
    expect(startCase('')).toBe('');
  });
});

describe('getEntityName', () => {
  it('prefers displayName, then name, then empty', () => {
    expect(getEntityName({ displayName: 'Shown', name: 'stored' })).toBe('Shown');
    expect(getEntityName({ displayName: '', name: 'stored' })).toBe('stored');
    expect(getEntityName({})).toBe('');
    expect(getEntityName(undefined)).toBe('');
  });
});

describe('header/queryParams conversions', () => {
  it('round-trips arrays and objects, preserving undefined', () => {
    expect(getConfigHeaderObjectFromArray(undefined)).toBeUndefined();
    expect(getConfigHeaderArrayFromObject(undefined)).toBeUndefined();
    expect(getConfigQueryParamsObjectFromArray(undefined)).toBeUndefined();
    expect(getConfigQueryParamsArrayFromObject(undefined)).toBeUndefined();
    const pairs = [
      { key: 'X-A', value: '1' },
      { key: 'X-B', value: '2' },
    ];
    expect(getConfigHeaderObjectFromArray(pairs)).toEqual({ 'X-A': '1', 'X-B': '2' });
    expect(getConfigHeaderArrayFromObject({ 'X-A': '1', 'X-B': '2' })).toEqual(pairs);
    expect(getConfigQueryParamsObjectFromArray(pairs)).toEqual({ 'X-A': '1', 'X-B': '2' });
    expect(getConfigQueryParamsArrayFromObject({ 'X-A': '1' })).toEqual([
      { key: 'X-A', value: '1' },
    ]);
  });

  it('stringifies non-string object values, nullish to empty', () => {
    expect(getConfigHeaderArrayFromObject({ n: 3, b: true, z: null })).toEqual([
      { key: 'n', value: '3' },
      { key: 'b', value: 'true' },
      { key: 'z', value: '' },
    ]);
  });
});

describe('getDestinationsWithTestStatus', () => {
  it('pairs positionally, taking only statusDetails from results', () => {
    const submitted = [
      { type: 'Slack', config: { endpoint: 'https://a' } },
      { type: 'Email', config: { receivers: ['a@b.c'] } },
    ] as EventSubscriptionDestination[];
    const results = [
      { statusDetails: { status: 'Success' }, config: { redacted: true } },
    ] as EventSubscriptionDestination[];
    const paired = getDestinationsWithTestStatus(submitted, results);
    expect(paired[0]).toMatchObject({
      type: 'Slack',
      config: { endpoint: 'https://a' },
      statusDetails: { status: 'Success' },
    });
    expect(paired[1]?.statusDetails).toBeUndefined();
  });
});

describe('normalizeDestinationConfig', () => {
  it('normalizes object and array forms to the same shape', () => {
    const fromObject = normalizeDestinationConfig({
      headers: { 'X-A': '1' },
      queryParams: { q: 'v' },
    } as never);
    const fromArrays = normalizeDestinationConfig({
      headers: [{ key: 'X-A', value: '1' }],
      queryParams: [{ key: 'q', value: 'v' }],
    } as never);
    expect(fromObject).toEqual(fromArrays);
  });

  it('collapses empty headers/queryParams to undefined', () => {
    const normalized = normalizeDestinationConfig({ headers: [], queryParams: {} } as never);
    expect(normalized).not.toHaveProperty('headers');
    expect(normalized).not.toHaveProperty('queryParams');
  });
});

describe('getFormattedDestinations', () => {
  it('drops destinationType, object-ifies lists, and drops empty ones', () => {
    expect(getFormattedDestinations(undefined)).toBeUndefined();
    const formatted = getFormattedDestinations([
      {
        destinationType: 'Webhook',
        type: 'Webhook',
        category: 'External',
        config: {
          endpoint: 'https://hook',
          headers: [{ key: 'X-A', value: '1' }],
          queryParams: [],
        },
      },
    ]);
    expect(formatted).toHaveLength(1);
    expect(formatted?.[0]).not.toHaveProperty('destinationType');
    expect(formatted?.[0]?.config).toEqual({
      endpoint: 'https://hook',
      headers: { 'X-A': '1' },
    });
  });
});

describe('display-name helpers', () => {
  it('maps filter functions, empty for unknown ones', () => {
    expect(getFunctionDisplayName('matchAnyEntityFqn', t)).toBe('label.fqn-uppercase');
    expect(getFunctionDisplayName('matchTestResult', t)).toContain('label.test-entity');
    expect(getFunctionDisplayName('nope', t)).toBe('');
  });

  it('maps action types, empty for unknown ones', () => {
    expect(getAlertActionTypeDisplayName('Email', t)).toBe('label.email');
    expect(getAlertActionTypeDisplayName('MsTeams', t)).toBe('label.ms-team-plural');
    expect(getAlertActionTypeDisplayName('GChat', t)).toBe('label.g-chat');
    expect(getAlertActionTypeDisplayName('ActivityFeed', t)).toBe('label.activity-feed-plural');
    expect(getAlertActionTypeDisplayName('Unknown' as never, t)).toBe('');
  });

  it('special-cases kpi/mlmodel, startCases the rest', () => {
    expect(getDisplayNameForEntities('kpi', t)).toBe('label.kpi-uppercase');
    expect(getDisplayNameForEntities('mlmodel', t)).toBe('label.ml-model');
    expect(getDisplayNameForEntities('dashboard', t)).toBe('Dashboard');
  });

  it('builds startCase-labelled options from enums and values', () => {
    expect(getSelectOptionsFromEnum(['entityCreated'])).toEqual([
      { label: 'Entity Created', value: 'entityCreated' },
    ]);
    expect(getSelectOptionsFromValues(['GChat'])).toEqual([
      { label: 'G Chat', value: 'GChat' },
    ]);
  });

  it('disables non-Email types for Users/Followers/Admins', () => {
    const users = getSubscriptionTypeOptions('Users');
    expect(users.find((option) => option.value === 'Email')?.disabled).toBe(false);
    expect(users.find((option) => option.value === 'Slack')?.disabled).toBe(true);
    const owners = getSubscriptionTypeOptions('Owners');
    expect(owners.every((option) => !option.disabled)).toBe(true);
  });

  it('maps recent-event filter labels', () => {
    expect(getAlertEventsFilterLabels('all', t)).toBe('label.all');
    expect(getAlertEventsFilterLabels('successful', t)).toBe('label.successful');
    expect(getAlertEventsFilterLabels('failed', t)).toBe('label.failed');
  });

  it('labels all eight event-detail fields', () => {
    expect(getLabelsForEventDetails('eventType', t)).toBe('label.event-type');
    expect(getLabelsForEventDetails('entityId', t)).toContain('label.entity-id');
    expect(getLabelsForEventDetails('userName', t)).toBe('label.user-name');
    expect(getLabelsForEventDetails('previousVersion', t)).toBe('label.previous-version');
    expect(getLabelsForEventDetails('currentVersion', t)).toBe('label.current-version');
    expect(getLabelsForEventDetails('reason', t)).toBe('label.reason');
    expect(getLabelsForEventDetails('source', t)).toBe('label.source');
    expect(getLabelsForEventDetails('failingSubscriptionId', t)).toBe(
      'label.failing-subscription-id',
    );
  });

  it('maps argument names to required-list messages, empty for unknown ones', () => {
    expect(getMessageFromArgumentName('fqnList', t)).toContain('message.field-text-is-required');
    expect(getMessageFromArgumentName('tableNameList', t)).toContain(
      'message.field-text-is-required',
    );
    expect(getMessageFromArgumentName('nope', t)).toBe('');
  });
});

describe('getChangeEventDataFromTypedEvent', () => {
  it('reads the first data entry for successful events', () => {
    const { changeEventData, changeEventDataToDisplay } = getChangeEventDataFromTypedEvent({
      status: 'successful',
      timestamp: 100,
      data: [
        {
          id: 'e1',
          eventType: 'entityCreated',
          entityId: 'x',
          userName: 'u',
          previousVersion: 0.1,
          currentVersion: 0.2,
          reason: 'r',
          source: 's',
        },
      ],
    } as never);
    expect(changeEventData.id).toBe('e1');
    expect(changeEventDataToDisplay).toMatchObject({
      eventType: 'entityCreated',
      entityId: 'x',
      userName: 'u',
      previousVersion: 0.1,
      currentVersion: 0.2,
      reason: 'r',
      source: 's',
    });
  });

  it('unwraps the nested change event for failed events, keeping outer reason/source', () => {
    const { changeEventData, changeEventDataToDisplay } = getChangeEventDataFromTypedEvent({
      status: 'failed',
      timestamp: 200,
      data: [
        {
          id: 'outer',
          reason: 'outer-reason',
          source: 'outer-source',
          failingSubscriptionId: 'sub-1',
          changeEvent: { id: 'inner', eventType: 'entityUpdated', entityId: 'y' },
        },
      ],
    } as never);
    expect(changeEventData.id).toBe('inner');
    expect(changeEventDataToDisplay).toMatchObject({
      eventType: 'entityUpdated',
      entityId: 'y',
      reason: 'outer-reason',
      source: 'outer-source',
      failingSubscriptionId: 'sub-1',
    });
  });

  it('falls back to an unreadable id embedding status and timestamp', () => {
    const { changeEventData, changeEventDataToDisplay } = getChangeEventDataFromTypedEvent({
      status: 'failed',
      timestamp: 300,
      data: [],
    } as never);
    expect(changeEventData).toEqual({ id: 'unreadable-failed-300', timestamp: 300 });
    expect(Object.values(changeEventDataToDisplay).every((value) => value === undefined)).toBe(
      true,
    );
  });
});

describe('diagnostics', () => {
  it('returns the six items in fixed order', () => {
    const items = getDiagnosticItems(
      {
        latestOffset: 9,
        currentOffset: 8,
        startingOffset: 0,
        successfulEventsCount: 7,
        failedEventsCount: 1,
        hasProcessedAllEvents: true,
      },
      t,
    );
    expect(items.map((item) => item.key)).toEqual([
      'label.latest-offset',
      'label.current-offset',
      'label.starting-offset',
      'label.successful-event-plural',
      'label.failed-event-plural',
      'label.processed-all-event-plural',
    ]);
    expect(items[0]?.value).toBe(9);
    expect(items[5]?.value).toBe(true);
    expect(items[0]?.description).toBe('message.latest-offset-description');
  });

  it('formats booleans as Yes/No and everything else via String()', () => {
    expect(formatDiagnosticTabValue(true, t)).toBe('label.yes');
    expect(formatDiagnosticTabValue(false, t)).toBe('label.no');
    expect(formatDiagnosticTabValue(42, t)).toBe('42');
    expect(formatDiagnosticTabValue(undefined, t)).toBe('undefined');
  });
});

describe('getRandomizedAlertName', () => {
  it('uses the pin prefix plus nine alphanumerics', () => {
    const name = getRandomizedAlertName();
    expect(name).toMatch(/^OpenMetadata_alert_[A-Za-z0-9]{9}$/);
    expect(getRandomizedAlertName()).not.toBe(name);
  });
});

describe('formatEventCount', () => {
  it('defaults to zero and appends + only for lower bounds', () => {
    expect(formatEventCount(undefined)).toBe('0');
    expect(formatEventCount(null)).toBe('0');
    expect(formatEventCount(5)).toBe('5');
    expect(formatEventCount(5, true)).toBe('5+');
    expect(formatEventCount('12', true)).toBe('12+');
  });
});

describe('isSubscriptionCategoryName', () => {
  it('accepts categories and rejects types', () => {
    expect(isSubscriptionCategoryName('Admins')).toBe(true);
    expect(isSubscriptionCategoryName('External')).toBe(true);
    expect(isSubscriptionCategoryName('Owners')).toBe(true);
    expect(isSubscriptionCategoryName('Email')).toBe(false);
    expect(isSubscriptionCategoryName('Slack')).toBe(false);
  });
});
