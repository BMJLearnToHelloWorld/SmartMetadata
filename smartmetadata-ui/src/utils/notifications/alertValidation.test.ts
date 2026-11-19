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
import type { AlertFormValue } from '@/types/notifications';
import { validateAlertAiForm, validateAlertControllerFields, validateAlertForm } from './alertValidation';
import type { TranslateFn } from './alertUtils';

const t: TranslateFn = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key) as TranslateFn;

function formValue(overrides: Partial<AlertFormValue> = {}): AlertFormValue {
  return {
    alertType: 'Notification',
    displayName: 'My alert',
    resources: ['table'],
    timeout: 10,
    readTimeout: 12,
    destinations: [
      {
        destinationType: 'Email',
        category: 'External',
        type: 'Email',
        config: { receivers: ['a@b.c'] },
      },
    ],
    ...overrides,
  };
}

describe('validateAlertAiForm', () => {
  it('passes a complete form', () => {
    expect(validateAlertAiForm(formValue(), t)).toEqual({});
  });

  it('requires a name, from displayName or name', () => {
    expect(validateAlertAiForm(formValue({ displayName: '  ', name: undefined }), t).displayName)
      .toBe('message.field-text-is-required:{"fieldText":"label.name"}');
    expect(validateAlertAiForm(formValue({ displayName: undefined, name: 'n' }), t)).toEqual({});
  });

  it('rejects names over 128 characters and names with forbidden characters', () => {
    const long = validateAlertAiForm(formValue({ displayName: 'x'.repeat(129) }), t);
    expect(long.displayName).toBe(
      'message.entity-size-in-between:{"entity":"label.name","min":1,"max":128}',
    );
    const bad = validateAlertAiForm(formValue({ displayName: 'a::b' }), t);
    expect(bad.displayName).toBe('message.entity-name-validation');
    const quoted = validateAlertAiForm(formValue({ displayName: 'a"b' }), t);
    expect(quoted.displayName).toBe('message.entity-name-validation');
  });

  it('requires sources', () => {
    expect(validateAlertAiForm(formValue({ resources: [] }), t).resources)
      .toBe('message.field-text-is-required:{"fieldText":"label.source"}');
  });

  it('requires rule names and filled-in arguments, skipping input-less stored rules', () => {
    const errors = validateAlertAiForm(
      formValue({
        input: {
          filters: [
            { arguments: [{ name: 'fqnList', input: [] }] },
            { name: 'kept', arguments: [{ name: 'fqnList' }] },
          ],
          actions: [{ name: 't', arguments: [{ name: 'eventTypeList', input: [] }] }],
        },
      }),
      t,
    );
    expect(errors['input.filters.0.name']).toBe(
      'message.field-text-is-required:{"fieldText":"label.filter"}',
    );
    expect(errors['input.filters.0.arguments.0.input']).toBeDefined();
    expect(errors['input.filters.1.arguments.0.input']).toBeUndefined();
    expect(errors['input.actions.0.arguments.0.input']).toBeDefined();
  });

  it('requires destinations and a destination type per row', () => {
    const empty = validateAlertAiForm(formValue({ destinations: [] }), t);
    expect(empty.destinations).toBe(
      'message.field-text-is-required:{"fieldText":"label.destination"}',
    );
    const typeless = validateAlertAiForm(formValue({ destinations: [{}] }), t);
    expect(typeless['destinations.0.destinationType']).toBe(
      'message.field-text-is-required:{"fieldText":"label.destination"}',
    );
  });

  it('requires a channel type for internal destinations', () => {
    const errors = validateAlertAiForm(
      formValue({
        destinations: [{ destinationType: 'Owners', category: 'Owners' }],
      }),
      t,
    );
    expect(errors['destinations.0.type']).toBe(
      'message.field-text-is-required:{"fieldText":"label.type"}',
    );
  });

  it('requires downstream depth above zero only when notifying downstream', () => {
    const errors = validateAlertAiForm(
      formValue({
        destinations: [
          {
            destinationType: 'Email',
            category: 'External',
            type: 'Email',
            config: { receivers: ['a@b.c'] },
            notifyDownstream: true,
            downstreamDepth: 0,
          },
        ],
      }),
      t,
    );
    expect(errors['destinations.0.downstreamDepth']).toBe(
      'message.value-must-be-greater-than:{"field":"label.downstream-depth","minimum":0}',
    );
    const off = validateAlertAiForm(
      formValue({
        destinations: [
          {
            destinationType: 'Email',
            category: 'External',
            type: 'Email',
            config: { receivers: ['a@b.c'] },
            downstreamDepth: 0,
          },
        ],
      }),
      t,
    );
    expect(off['destinations.0.downstreamDepth']).toBeUndefined();
  });

  it('requires receivers for Email and Teams/Users destinations', () => {
    const email = validateAlertAiForm(
      formValue({
        destinations: [{ destinationType: 'Email', category: 'External', type: 'Email', config: {} }],
      }),
      t,
    );
    expect(email['destinations.0.config.receivers']).toBe(
      'message.field-text-is-required:{"fieldText":"label.email"}',
    );
    const teams = validateAlertAiForm(
      formValue({
        destinations: [{ destinationType: 'Teams', category: 'Teams', type: 'Email', config: {} }],
      }),
      t,
    );
    expect(teams['destinations.0.config.receivers']).toBe(
      'message.field-text-is-required:{"fieldText":"label.receiver-plural"}',
    );
  });

  it('requires webhook endpoint, header/query key-values and auth fields', () => {
    const errors = validateAlertAiForm(
      formValue({
        destinations: [
          {
            destinationType: 'Webhook',
            category: 'External',
            type: 'Webhook',
            config: {
              headers: [{ key: '', value: 'v' }],
              queryParams: [{ key: 'k', value: '' }],
              authType: { type: 'oauth2', clientId: 'c' },
            },
          },
        ],
      }),
      t,
    );
    expect(errors['destinations.0.config.endpoint']).toBe(
      'message.field-text-is-required:{"fieldText":"label.endpoint-url"}',
    );
    expect(errors['destinations.0.config.headers.0.key']).toBeDefined();
    expect(errors['destinations.0.config.headers.0.value']).toBeUndefined();
    expect(errors['destinations.0.config.queryParams.0.value']).toBeDefined();
    expect(errors['destinations.0.config.authType.tokenUrl']).toBeDefined();
    expect(errors['destinations.0.config.authType.clientId']).toBeUndefined();
    expect(errors['destinations.0.config.authType.clientSecret']).toBeDefined();
  });

  it('requires the bearer secret key', () => {
    const errors = validateAlertAiForm(
      formValue({
        destinations: [
          {
            destinationType: 'Slack',
            category: 'External',
            type: 'Slack',
            config: { endpoint: 'https://x', authType: { type: 'bearer' } },
          },
        ],
      }),
      t,
    );
    expect(errors['destinations.0.config.authType.secretKey']).toBe(
      'message.field-text-is-required:{"fieldText":"label.secret-key"}',
    );
  });
});

describe('validateAlertControllerFields', () => {
  it('passes when timeouts are positive integers and depth is set', () => {
    expect(
      validateAlertControllerFields(
        formValue({
          timeout: 10,
          readTimeout: 12,
          destinations: [
            {
              destinationType: 'Email',
              category: 'External',
              type: 'Email',
              config: { receivers: ['a@b.c'] },
              notifyDownstream: true,
              downstreamDepth: 2,
            },
          ],
        }),
        t,
      ),
    ).toEqual({});
  });

  it('requires both timeouts', () => {
    const errors = validateAlertControllerFields(
      formValue({ timeout: undefined, readTimeout: undefined }),
      t,
    );
    expect(errors.timeout).toBe('label.field-required:{"field":"label.connection-timeout"}');
    expect(errors.readTimeout).toBe(
      'label.field-required:{"field":"label.read-type:{\\"type\\":\\"label.timeout\\"}"}',
    );
  });

  it('rejects non-integer and non-positive timeouts', () => {
    const errors = validateAlertControllerFields(
      formValue({ timeout: 1.5, readTimeout: 0 }),
      t,
    );
    expect(errors.timeout).toBe('label.field-invalid:{"field":"label.connection-timeout"}');
    expect(errors.readTimeout).toContain('label.field-invalid');
  });

  it('requires downstream depth when notify-downstream is on, where the custom validator passes', () => {
    const value = formValue({
      timeout: 10,
      readTimeout: 12,
      destinations: [
        {
          destinationType: 'Email',
          category: 'External',
          type: 'Email',
          config: { receivers: ['a@b.c'] },
          notifyDownstream: true,
        },
      ],
    });
    expect(validateAlertAiForm(value, t)['destinations.0.downstreamDepth']).toBeUndefined();
    expect(
      validateAlertControllerFields(value, t)['destinations.0.downstreamDepth'],
    ).toBe('message.field-text-is-required:{"fieldText":"label.downstream-depth"}');
  });

  it('rejects a non-finite depth', () => {
    const errors = validateAlertControllerFields(
      formValue({
        timeout: 10,
        readTimeout: 12,
        destinations: [
          {
            destinationType: 'Email',
            category: 'External',
            type: 'Email',
            config: { receivers: ['a@b.c'] },
            notifyDownstream: true,
            downstreamDepth: Number.NaN,
          },
        ],
      }),
      t,
    );
    expect(errors['destinations.0.downstreamDepth']).toContain('message.value-must-be-greater-than');
  });

  it('combines both validators in validateAlertForm', () => {
    const errors = validateAlertForm(formValue({ displayName: '', timeout: undefined }), t);
    expect(errors.displayName).toBeDefined();
    expect(errors.timeout).toBeDefined();
  });
});
