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
  getCommaSeparatedStringArray,
  getCommaSeparatedValues,
  getDestinationTypeUpdate,
  getDestinationWithNotifyDownstream,
  getListValue,
  getRuleCopy,
  getRuleItems,
  getRulesWithAddedRule,
  getRulesWithEffect,
  getRulesWithName,
  getRulesWithoutIndex,
  getRuntimeArguments,
  getStringArrayValue,
  getTextArgumentCopy,
  getValidationPath,
  hasExternalDestinationConfig,
  isInternalDestination,
  isWebhookDestination,
} from './alertFormUtils';
import type { TranslateFn } from './alertUtils';

const t: TranslateFn = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key) as TranslateFn;

describe('destination predicates', () => {
  it('treats every category but External as internal', () => {
    expect(isInternalDestination('Owners')).toBe(true);
    expect(isInternalDestination('External')).toBe(false);
    expect(isInternalDestination('Email')).toBe(false);
    expect(isInternalDestination(undefined)).toBe(false);
  });

  it('narrows webhook destinations', () => {
    expect(isWebhookDestination('Slack')).toBe(true);
    expect(isWebhookDestination('MsTeams')).toBe(true);
    expect(isWebhookDestination('GChat')).toBe(true);
    expect(isWebhookDestination('Webhook')).toBe(true);
    expect(isWebhookDestination('Email')).toBe(false);
  });

  it('detects configured external destinations', () => {
    expect(hasExternalDestinationConfig([{ category: 'External', type: 'Slack' }])).toBe(true);
    expect(hasExternalDestinationConfig([{ category: 'External', type: 'ActivityFeed' }])).toBe(false);
    expect(hasExternalDestinationConfig([{ category: 'Owners', type: 'Email' }])).toBe(false);
  });
});

describe('value normalizers', () => {
  it('normalizes scalar/array values', () => {
    expect(getStringArrayValue(undefined)).toEqual([]);
    expect(getStringArrayValue('a')).toEqual(['a']);
    expect(getStringArrayValue(['a'])).toEqual(['a']);
    expect(getListValue('a')).toEqual(['a']);
    expect(getCommaSeparatedValues(['a', 'b'])).toBe('a, b');
    expect(getCommaSeparatedValues('a')).toBe('a');
    expect(getCommaSeparatedValues(undefined)).toBe('');
  });

  it('splits comma-separated input, trimming and dropping empties', () => {
    expect(getCommaSeparatedStringArray('a, b,, c ')).toEqual(['a', 'b', 'c']);
  });

  it('builds validation paths', () => {
    expect(getValidationPath('input', 'filters', 0, 'name')).toBe('input.filters.0.name');
  });
});

describe('getTextArgumentCopy', () => {
  it('covers the searchable arguments and defaults to entity', () => {
    expect(getTextArgumentCopy('fqnList', t).label).toBe('label.fqn-uppercase');
    expect(getTextArgumentCopy('domainList', t).placeholder).toBe(
      'label.search-by-type:{"type":"label.domain-lowercase"}',
    );
    expect(getTextArgumentCopy('userList', t).placeholder).toBe(
      'label.search-by-type:{"type":"label.user"}',
    );
    expect(getTextArgumentCopy('unknownArg', t).label).toBe('label.entity');
  });
});

describe('rule helpers', () => {
  it('builds rule items with chosen rules disabled and unknown rules appended', () => {
    const items = getRuleItems(
      [
        { name: 'a', displayName: 'A' },
        { name: 'b' },
        {},
      ],
      [{ name: 'a' }, { name: 'gone' }, { name: 'gone' }],
    );
    expect(items).toEqual([
      { id: 'a', isDisabled: true, label: 'A' },
      { id: 'b', isDisabled: false, label: 'b' },
      { id: 'gone', isDisabled: true, label: 'gone' },
    ]);
  });

  it('returns section copy', () => {
    expect(getRuleCopy('filters', t)).toEqual({
      description: 'message.alerts-filter-description',
      label: 'label.filter',
      placeholder: 'label.select-field:{"field":"label.filter"}',
    });
    expect(getRuleCopy('actions', t).label).toBe('label.trigger');
  });

  it('resolves runtime arguments from the descriptor, else from saved names', () => {
    expect(
      getRuntimeArguments(
        { name: 'r', arguments: [{ name: 'saved' }] },
        [{ name: 'r', inputType: 'runtime', arguments: ['x', 'y'] }],
      ),
    ).toEqual(['x', 'y']);
    expect(
      getRuntimeArguments(
        { name: 'r', arguments: [{ name: 'saved' }, {}] },
        [{ name: 'r', inputType: 'static' }],
      ),
    ).toEqual(['saved']);
    expect(getRuntimeArguments({ name: 'r' }, undefined)).toEqual([]);
  });

  it('renames a rule and resets its argument skeleton', () => {
    const rules = getRulesWithName({
      index: 0,
      ruleName: 'new',
      selectedRules: [{ name: 'old', effect: 'exclude', arguments: [{ name: 'a', input: ['1'] }] }],
      supportedRules: [{ name: 'new', arguments: ['fqnList'] }],
    });
    expect(rules).toEqual([
      { name: 'new', effect: 'exclude', arguments: [{ input: [], name: 'fqnList' }] },
    ]);
    const unknown = getRulesWithName({
      index: 0,
      ruleName: 'missing',
      selectedRules: [{ name: 'old', arguments: [{ name: 'a', input: ['1'] }] }],
      supportedRules: [],
    });
    expect(unknown[0].arguments).toBeUndefined();
  });

  it('toggles effects, adds include placeholders, removes by index', () => {
    expect(getRulesWithEffect([{ name: 'r' }], 0, false)).toEqual([
      { name: 'r', effect: 'exclude' },
    ]);
    expect(getRulesWithAddedRule([{ name: 'r' }])).toEqual([
      { name: 'r' },
      { effect: 'include' },
    ]);
    expect(getRulesWithoutIndex([{ name: 'a' }, { name: 'b' }], 0)).toEqual([{ name: 'b' }]);
  });
});

describe('destination updates', () => {
  it('ignores header rows', () => {
    const destination = { destinationType: 'Email' as const };
    expect(getDestinationTypeUpdate(destination, 'header-internal')).toBe(destination);
  });

  it('restarts the row on type change, with the config field for Admins/Owners/Followers', () => {
    expect(
      getDestinationTypeUpdate(
        {
          destinationType: 'Email',
          category: 'External',
          type: 'Email',
          config: { receivers: ['a@b.c'] },
          notifyDownstream: true,
          downstreamDepth: 3,
        },
        'Owners',
      ),
    ).toEqual({
      category: 'Owners',
      destinationType: 'Owners',
      config: { sendToOwners: true },
      downstreamDepth: undefined,
      notifyDownstream: undefined,
      type: undefined,
    });
    expect(
      getDestinationTypeUpdate({ destinationType: 'Owners', category: 'Owners' }, 'Slack'),
    ).toEqual({
      category: 'External',
      destinationType: 'Slack',
      config: undefined,
      downstreamDepth: undefined,
      notifyDownstream: undefined,
      type: 'Slack',
    });
  });

  it('sets depth to 1 when notifying downstream, clears it when not', () => {
    expect(getDestinationWithNotifyDownstream({}, true)).toEqual({
      downstreamDepth: 1,
      notifyDownstream: true,
    });
    expect(
      getDestinationWithNotifyDownstream({ downstreamDepth: 4 }, true).downstreamDepth,
    ).toBe(4);
    expect(
      getDestinationWithNotifyDownstream({ downstreamDepth: 4 }, false),
    ).toEqual({ downstreamDepth: undefined, notifyDownstream: false });
  });
});
