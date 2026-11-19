/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the Apache License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import type { EventSubscription } from '@/types/quality';
import type { JsonPatchOp } from '@/admin/jsonPatch';
import type { AlertFormValue } from '@/types/notifications';
import type { TranslateFn } from '@/utils/notifications/alertUtils';
import {
  destinationsAsAWholeListReplace,
  formatDestinations,
  getAlertCreationData,
  getAlertErrorText,
  getAlertInputForForm,
  getAlertUpdateData,
  getClassicAlertInitialValues,
  getModifiedAlertDataForForm,
  handleAlertSave,
  handleEntityCreationError,
  hasRulesWithoutSelections,
  stripUndefinedTopLevel,
  type InlineAlertDetails,
} from './alertSave';

const t = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key) as unknown as TranslateFn;

function formValue(overrides: Partial<AlertFormValue> = {}): AlertFormValue {
  return {
    displayName: 'DQ Alert',
    description: 'Checks data.',
    resources: ['table'],
    input: { filters: [], actions: [] },
    destinations: [
      {
        id: 'd1',
        type: 'Email',
        category: 'External',
        config: { receivers: ['a@example.com'] },
      },
    ],
    timeout: 10,
    readTimeout: 12,
    alertType: 'Observability',
    provider: 'user',
    ...overrides,
  };
}

function storedAlert(overrides: Partial<EventSubscription> = {}): EventSubscription {
  return {
    id: 'id1',
    name: 'dq-alert',
    fullyQualifiedName: 'dq-alert',
    displayName: 'DQ Alert',
    description: 'Checks data.',
    alertType: 'Observability',
    provider: 'user',
    filteringRules: { resources: ['table'] },
    input: { filters: [], actions: [] },
    destinations: [
      {
        id: 'd1',
        type: 'Email',
        category: 'External',
        config: { receivers: ['a@example.com'] },
        timeout: 10,
        readTimeout: 12,
      },
    ],
    ...overrides,
  } as EventSubscription;
}

describe('stripUndefinedTopLevel', () => {
  it('drops only undefined top-level keys', () => {
    expect(stripUndefinedTopLevel({ a: 1, b: undefined, c: null, d: 0 })).toEqual({
      a: 1,
      c: null,
      d: 0,
    });
  });
});

describe('destinationsAsAWholeListReplace', () => {
  it('leaves a patch untouched when no op touches destinations', () => {
    const ops = [{ op: 'replace', path: '/displayName', value: 'New' }] as const;
    expect(destinationsAsAWholeListReplace([...ops], [])).toEqual([...ops]);
  });

  it('collapses destination ops into one whole-list replace, appended last', () => {
    const ops: JsonPatchOp[] = [
      { op: 'replace', path: '/displayName', value: 'New' },
      { op: 'replace', path: '/destinations/0/config', value: {} },
      { op: 'add', path: '/destinations/1', value: {} },
    ];
    const destinations = [{ id: 'd1' }];
    expect(destinationsAsAWholeListReplace(ops, destinations as never)).toEqual([
      { op: 'replace', path: '/displayName', value: 'New' },
      { op: 'replace', path: '/destinations', value: destinations },
    ]);
  });
});

describe('hasRulesWithoutSelections / getAlertInputForForm', () => {
  it('flags stored rules with no form selections', () => {
    const alert = storedAlert({
      input: undefined,
      filteringRules: {
        resources: ['table'],
        rules: [{ name: 'matchAll', effect: 'include' }],
      } as never,
    });
    expect(hasRulesWithoutSelections(alert)).toBe(true);
    expect(getAlertInputForForm(alert)).toEqual({
      filters: [{ arguments: undefined, effect: 'include', name: 'matchAll', prefixCondition: undefined }],
      actions: [],
    });
  });

  it('passes the stored input through when selections exist', () => {
    const alert = storedAlert({
      input: { filters: [{ name: 'matchAll' }], actions: [] },
      filteringRules: { resources: ['table'], rules: [{ name: 'matchAll' }] } as never,
    });
    expect(hasRulesWithoutSelections(alert)).toBe(false);
    expect(getAlertInputForForm(alert)).toBe(alert.input);
  });

  it('is false when nothing is stored', () => {
    expect(hasRulesWithoutSelections(storedAlert({ input: undefined, filteringRules: { resources: [] } }))).toBe(false);
  });
});

describe('formatDestinations', () => {
  it('spreads the id-matched stored destination and applies the form timeouts to every row', () => {
    const formatted = formatDestinations(
      formValue({
        timeout: 30,
        readTimeout: 40,
        destinations: [
          { id: 'd1', type: 'Email', category: 'External', config: { receivers: ['b@example.com'] } },
          { type: 'Slack', category: 'External', config: {} },
        ],
      }),
      storedAlert(),
    );
    expect(formatted[0]).toMatchObject({
      id: 'd1',
      type: 'Email',
      timeout: 30,
      readTimeout: 40,
      config: { receivers: ['b@example.com'] },
    });
    expect(formatted[1]).toMatchObject({ type: 'Slack', timeout: 30, readTimeout: 40 });
  });

  it('turns header and query-param arrays into objects', () => {
    const formatted = formatDestinations(
      formValue({
        destinations: [
          {
            type: 'Webhook',
            category: 'External',
            config: {
              endpoint: 'https://hook.example',
              headers: [{ key: 'X-A', value: '1' }],
              queryParams: [{ key: 'q', value: 'v' }],
            },
          },
        ],
      }),
    );
    expect(formatted[0]?.config).toMatchObject({
      headers: { 'X-A': '1' },
      queryParams: { q: 'v' },
    });
  });
});

describe('getAlertCreationData', () => {
  it('strips the UI-only timeouts and keeps top-level resources, never filteringRules', () => {
    const created = getAlertCreationData(formValue(), undefined, 'user-1');
    expect(created).not.toHaveProperty('timeout');
    expect(created).not.toHaveProperty('readTimeout');
    expect(created).not.toHaveProperty('filteringRules');
    expect(created.resources).toEqual(['table']);
    expect(created.owners).toEqual([{ id: 'user-1', type: 'user' }]);
  });

  it('trims the display name and keeps the initial name', () => {
    const created = getAlertCreationData(
      formValue({ displayName: '  Spaced  ' }),
      storedAlert(),
    );
    expect(created.displayName).toBe('Spaced');
    expect(created.name).toBe('dq-alert');
    expect(created.owners).toBeUndefined();
  });

  it('generates the pin-prefixed random name when no initial name exists', () => {
    const created = getAlertCreationData(formValue());
    expect(created.name).toMatch(/^OpenMetadata_alert_[A-Za-z0-9]{9}$/);
  });
});

describe('getAlertUpdateData', () => {
  it('omits input entirely when the stored rules have no selections', () => {
    // The stored alert carries no input key at all, as parsed JSON
    // arrives; an explicit `input: undefined` would fake the key in.
    const { input: _input, ...initial } = storedAlert({
      filteringRules: { resources: ['table'], rules: [{ name: 'matchAll' }] } as never,
    });
    const updated = getAlertUpdateData(formValue(), initial);
    expect(updated).not.toHaveProperty('input');
    expect(updated.filteringRules?.resources).toEqual(['table']);
  });

  it('defaults input rows to empty arrays when selections exist', () => {
    const updated = getAlertUpdateData(formValue({ input: undefined }), storedAlert());
    expect(updated.input).toEqual({ actions: [], filters: [] });
  });
});

describe('getAlertErrorText', () => {
  it('prefers the body message, then responseMessage, then a string body', () => {
    expect(getAlertErrorText('plain', 'fallback')).toBe('plain');
    expect(
      getAlertErrorText(new ApiError(500, JSON.stringify({ message: 'boom' })), 'fallback'),
    ).toBe('boom');
    expect(
      getAlertErrorText(new ApiError(500, JSON.stringify({ responseMessage: 'deep' })), 'fallback'),
    ).toBe('deep');
    expect(getAlertErrorText(new ApiError(500, 'raw body'), 'fallback')).toBe('raw body');
    expect(getAlertErrorText(new Error('no body'), 'fallback')).toBe('fallback');
  });
});

describe('handleEntityCreationError', () => {
  it('maps 409, 429 and the default branch, always with the server text below', () => {
    const seen: Array<InlineAlertDetails | undefined> = [];
    const setInlineAlertDetails = (details?: InlineAlertDetails) => {
      seen.push(details);
    };
    const base = {
      setInlineAlertDetails,
      entity: 'label.alert',
      entityLowercase: 'label.alert-lowercase',
      entityLowercasePlural: 'label.alert-lowercase-plural',
      name: 'dq-alert',
      defaultErrorType: 'create' as const,
      t,
    };
    handleEntityCreationError({
      ...base,
      error: new ApiError(409, JSON.stringify({ message: 'exists' })),
    });
    expect(seen[0]?.description).toContain('server.entity-already-exist');
    expect(seen[0]?.subDescription).toBe('exists');

    handleEntityCreationError({ ...base, error: new ApiError(429, '') });
    expect(seen[1]?.description).toContain('server.entity-limit-reached');

    handleEntityCreationError({ ...base, error: new ApiError(500, JSON.stringify({ message: 'boom' })) });
    expect(seen[2]?.description).toContain('server.entity-creation-error');
    expect(seen[2]?.subDescription).toBe('boom');
  });
});

describe('handleAlertSave', () => {
  const saveArgs = (overrides: Record<string, unknown> = {}) => ({
    data: formValue(),
    createAlertAPI: vi.fn().mockResolvedValue(storedAlert()),
    updateAlertAPI: vi.fn().mockResolvedValue(storedAlert()),
    afterSaveAction: vi.fn(),
    setInlineAlertDetails: vi.fn(),
    t,
    notifySuccess: vi.fn(),
    ...overrides,
  });

  it('creates when no fqn is given, toasts, and hands the returned FQN on', async () => {
    const args = saveArgs({ currentUserId: 'user-1' });
    await handleAlertSave(args as never);
    expect(args.createAlertAPI).toHaveBeenCalledTimes(1);
    expect(args.createAlertAPI.mock.calls[0]?.[0]).toMatchObject({ name: expect.stringMatching(/^OpenMetadata_alert_/) });
    expect(args.notifySuccess).toHaveBeenCalledWith(expect.stringContaining('server.create-entity-success'));
    expect(args.afterSaveAction).toHaveBeenCalledWith('dq-alert');
    expect(args.updateAlertAPI).not.toHaveBeenCalled();
  });

  it('updates by id with a stripped diff and the whole-list destination replace last', async () => {
    const initial = storedAlert({ description: undefined });
    const args = saveArgs({
      fqn: 'dq-alert',
      initialData: initial,
      data: formValue({
        description: 'New description',
        destinations: [
          {
            id: 'd1',
            type: 'Email',
            category: 'External',
            config: { receivers: ['changed@example.com'] },
          },
        ],
      }),
    });
    await handleAlertSave(args as never);
    expect(args.createAlertAPI).not.toHaveBeenCalled();
    expect(args.updateAlertAPI).toHaveBeenCalledTimes(1);
    const [id, ops] = args.updateAlertAPI.mock.calls[0] as [
      string,
      Array<{ op: string; path: string; value?: unknown }>,
    ];
    expect(id).toBe('id1');
    // The stripped original has no description key, so the new one ADDS.
    expect(ops).toContainEqual({ op: 'add', path: '/description', value: 'New description' });
    const destinationOps = ops.filter((op) => op.path.startsWith('/destinations'));
    expect(destinationOps).toHaveLength(1);
    expect(ops[ops.length - 1]).toMatchObject({ op: 'replace', path: '/destinations' });
    expect(args.notifySuccess).toHaveBeenCalledWith(expect.stringContaining('server.update-entity-success'));
  });

  it('routes a save failure to the inline alert, with no toast', async () => {
    const args = saveArgs({
      createAlertAPI: vi.fn().mockRejectedValue(new ApiError(409, JSON.stringify({ message: 'exists' }))),
    });
    await handleAlertSave(args as never);
    expect(args.notifySuccess).not.toHaveBeenCalled();
    expect(args.setInlineAlertDetails).toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.stringContaining('server.entity-already-exist') }),
    );
  });

  it('routes an after-save failure through the same catch', async () => {
    const args = saveArgs({
      afterSaveAction: vi.fn().mockRejectedValue(new Error('navigation broke')),
    });
    await handleAlertSave(args as never);
    expect(args.setInlineAlertDetails).toHaveBeenCalledTimes(1);
  });
});

describe('getModifiedAlertDataForForm / getClassicAlertInitialValues', () => {
  it('refills the timeouts from the first destination and derives the row type', () => {
    const modified = getModifiedAlertDataForForm(
      storedAlert({
        destinations: [
          {
            id: 'd1',
            type: 'Webhook',
            category: 'External',
            config: { endpoint: 'https://hook.example', headers: { 'X-A': '1' } },
            timeout: 25,
            readTimeout: 35,
          },
          { id: 'd2', type: 'Email', category: 'Email', config: {} },
        ] as never,
      }),
    );
    expect(modified.timeout).toBe(25);
    expect(modified.readTimeout).toBe(35);
    expect(modified.destinations[0]?.destinationType).toBe('Webhook');
    expect(modified.destinations[0]?.config?.headers).toEqual([{ key: 'X-A', value: '1' }]);
    expect(modified.destinations[1]?.destinationType).toBe('Email');
  });

  it('throws on an alert with no destinations, as pin does', () => {
    expect(() => getModifiedAlertDataForForm(storedAlert({ destinations: [] }))).toThrow();
  });

  it('prefills displayName from displayName or name, and defaults a missing alertType', () => {
    const initial = getClassicAlertInitialValues(
      getModifiedAlertDataForForm(storedAlert({ displayName: undefined, alertType: undefined as never })),
    );
    expect(initial.displayName).toBe('dq-alert');
    expect(initial.alertType).toBe('Observability');
    expect(initial.resources).toEqual(['table']);
  });
});
