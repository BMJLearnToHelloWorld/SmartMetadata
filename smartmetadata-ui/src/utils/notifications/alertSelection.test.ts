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
import type { AlertCapabilities } from '@/types/notifications';
import {
  capabilitiesKeyOf,
  getAlertSourceChanges,
  getEntityNameLabel,
  getFqnSearchIndexes,
  getSelectionSupport,
  getSourceKindLabel,
  getSourceOptions,
  groupSourcesByKind,
  shouldShowRuleSection,
  toCapabilitiesInput,
  UUID_REGEX,
} from './alertSelection';
import type { TranslateFn } from './alertUtils';

const t: TranslateFn = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key) as TranslateFn;

function capabilities(overrides: Partial<AlertCapabilities> = {}): AlertCapabilities {
  return {
    alertType: 'Notification',
    filters: [],
    sources: [],
    triggers: [],
    ...overrides,
  };
}

describe('capabilitiesKeyOf', () => {
  it('sorts sources so selection order does not ask twice', () => {
    expect(capabilitiesKeyOf('Notification', ['table', 'topic'], {}))
      .toBe(capabilitiesKeyOf('Notification', ['topic', 'table'], {}));
  });

  it('distinguishes alert type and input', () => {
    expect(capabilitiesKeyOf('Notification', ['table'], {}))
      .not.toBe(capabilitiesKeyOf('Observability', ['table'], {}));
    expect(capabilitiesKeyOf('Notification', ['table'], { filters: [] }))
      .not.toBe(capabilitiesKeyOf('Notification', ['table'], {}));
  });
});

describe('getEntityNameLabel', () => {
  it('translates known types and keeps the pin quirks', () => {
    expect(getEntityNameLabel('table', t)).toBe('label.table');
    expect(getEntityNameLabel('alert', t)).toBe('label.alert-plural');
    expect(getEntityNameLabel('THREAD', t)).toBe('label.thread');
    expect(getEntityNameLabel('kpi', t)).toBe('label.kpi');
  });

  it('falls back to startCase for unknown types', () => {
    expect(getEntityNameLabel('someNewThing', t)).toBe('Some New Thing');
    expect(getEntityNameLabel(undefined, t)).toBe('');
  });
});

describe('getSelectionSupport', () => {
  it('offers only recipient categories when no source is chosen', () => {
    const support = getSelectionSupport({
      sources: [],
      selection: capabilities({ recipientCategories: ['Owners'] }),
      answeredFor: [],
      t,
    });
    expect(support).toEqual({ recipientCategories: ['Owners'] });
  });

  it('offers nothing without an answer or without answered sources', () => {
    expect(
      getSelectionSupport({ sources: ['table'], selection: undefined, answeredFor: [], t }),
    ).toEqual({});
    expect(
      getSelectionSupport({ sources: ['table'], selection: capabilities(), answeredFor: [], t }),
    ).toEqual({});
  });

  it('offers only section visibility for a stale answer', () => {
    const support = getSelectionSupport({
      sources: ['topic'],
      selection: capabilities({
        recipientCategories: ['Owners'],
        filters: [{ condition: { name: 'f' }, sources: ['table'] }],
        triggers: [],
      }),
      answeredFor: ['table'],
      t,
    });
    expect(support).toEqual({
      recipientCategories: ['Owners'],
      hasFilters: true,
      hasTriggers: false,
    });
  });

  it('unwraps rules for a matching answer and labels multi-source triggers', () => {
    const support = getSelectionSupport({
      sources: ['table', 'topic'],
      selection: capabilities({
        recipientCategories: ['Owners'],
        filters: [{ condition: { name: 'f', displayName: 'F' }, sources: ['table'] }],
        triggers: [
          { condition: { name: 'tr', displayName: 'T' }, sources: ['table', 'topic'] },
        ],
        containerEntities: ['database'],
        eventTypes: ['entityCreated'],
      }),
      answeredFor: ['topic', 'table'],
      t,
    });
    expect(support.supportedFilters).toEqual([{ name: 'f', displayName: 'F' }]);
    expect(support.supportedTriggers).toEqual([
      { name: 'tr', displayName: 'T (label.table, label.topic)' },
    ]);
    expect(support.containerEntities).toEqual(['database']);
    expect(support.supportedEventTypes).toEqual(['entityCreated']);
    expect(support.hasFilters).toBe(true);
    expect(support.hasTriggers).toBe(true);
  });

  it('leaves single-source triggers unlabelled', () => {
    const support = getSelectionSupport({
      sources: ['table'],
      selection: capabilities({
        triggers: [{ condition: { name: 'tr', displayName: 'T' }, sources: ['table'] }],
      }),
      answeredFor: ['table'],
      t,
    });
    expect(support.supportedTriggers).toEqual([{ name: 'tr', displayName: 'T' }]);
  });
});

describe('shouldShowRuleSection', () => {
  it('shows with no sources, follows the server answer, else follows saved rules', () => {
    expect(shouldShowRuleSection([], undefined, [])).toBe(true);
    expect(shouldShowRuleSection(['table'], true, [])).toBe(true);
    expect(shouldShowRuleSection(['table'], false, [{ name: 'x' }])).toBe(false);
    expect(shouldShowRuleSection(['table'], undefined, [{ name: 'x' }])).toBe(true);
    expect(shouldShowRuleSection(['table'], undefined, [])).toBe(false);
  });
});

describe('getAlertSourceChanges', () => {
  it('resets input always and destinations only when a source is removed', () => {
    expect(getAlertSourceChanges(['table', 'topic'], ['table'])).toEqual({
      resources: ['table', 'topic'],
      input: {},
    });
    expect(getAlertSourceChanges(['table'], ['table', 'topic'])).toEqual({
      resources: ['table'],
      input: {},
      destinations: [],
    });
  });

  it('keeps input for rules stored without selections', () => {
    expect(getAlertSourceChanges(['table'], ['table', 'topic'], true)).toEqual({
      resources: ['table'],
      destinations: [],
    });
  });
});

describe('getSourceOptions', () => {
  it('falls back to known sources and gates joinability', () => {
    const options = getSourceOptions(
      ['table'],
      undefined,
      [
        { name: 'table', kind: 'entity' },
        { name: 'topic', kind: 'entity', canJoin: false, reason: 'nope' },
        { name: 'dashboard', kind: 'entity', warning: 'careful' },
      ],
    );
    expect(options).toEqual([
      { name: 'table', disabled: false, reason: undefined, warning: undefined, kind: 'entity' },
      { name: 'topic', disabled: true, reason: 'nope', warning: undefined, kind: 'entity' },
      { name: 'dashboard', disabled: false, reason: undefined, warning: undefined, kind: 'entity' },
    ]);
  });

  it('shows warnings only for selected sources', () => {
    const options = getSourceOptions(
      ['dashboard'],
      capabilities({
        sources: [{ name: 'dashboard', kind: 'entity', warning: 'careful' }],
      }),
    );
    expect(options[0].warning).toBe('careful');
  });
});

describe('groupSourcesByKind / getSourceKindLabel', () => {
  it('orders All, Entity, Activity and drops empty groups', () => {
    const groups = groupSourcesByKind([
      { name: 'a', kind: 'activity' as const },
      { name: 'e', kind: 'entity' as const },
    ]);
    expect(groups.map((group) => group.kind)).toEqual(['entity', 'activity']);
  });

  it('labels kinds', () => {
    expect(getSourceKindLabel('all', t)).toBe(
      'label.all-entity:{"entity":"label.event-plural"}',
    );
    expect(getSourceKindLabel('activity', t)).toBe('label.data-collaboration');
    expect(getSourceKindLabel('entity', t)).toBe('label.data-asset-plural');
  });
});

describe('toCapabilitiesInput', () => {
  it('drops unnamed rows and empty arguments', () => {
    expect(
      toCapabilitiesInput({
        filters: [
          { name: 'f', effect: 'include', arguments: [{ name: 'a', input: ['1'] }, { name: 'b', input: [] }, { input: ['x'] }] },
          { arguments: [{ name: 'a', input: ['1'] }] },
        ],
        actions: undefined,
      }),
    ).toEqual({
      filters: [{ name: 'f', effect: 'include', arguments: [{ name: 'a', input: ['1'] }] }],
      actions: [],
    });
  });
});

describe('getFqnSearchIndexes', () => {
  it('short-circuits on all and maps mlmodelService', () => {
    expect(getFqnSearchIndexes(['table', 'database'], ['database'])).toEqual([
      'table',
      'database',
    ]);
    expect(getFqnSearchIndexes(['all'], ['database'])).toEqual(['all']);
    expect(getFqnSearchIndexes('mlmodelService')).toEqual(['mlModelService']);
    expect(getFqnSearchIndexes(['unknown'])).toEqual([]);
  });
});

describe('UUID_REGEX', () => {
  it('matches UUIDs only', () => {
    expect(UUID_REGEX.test('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    expect(UUID_REGEX.test('not-a-uuid')).toBe(false);
  });
});
