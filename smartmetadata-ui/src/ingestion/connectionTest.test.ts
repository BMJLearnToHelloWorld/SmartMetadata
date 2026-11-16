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
  computeConnectionTestFlags,
  getAreRequiredStepsPassing,
  getHasOptionalStepsFailing,
  resolveCompletionStatus,
  shouldTestConnection,
} from './connectionTest';
import type { TestConnectionStatus } from './connectionTest';

describe('shouldTestConnection (pin ServicePureUtils)', () => {
  it('allows every type except the Custom connectors', () => {
    expect(shouldTestConnection('Mysql')).toBe(true);
    expect(shouldTestConnection('CustomDatabase')).toBe(false);
    expect(shouldTestConnection('CustomDrive')).toBe(false);
    expect(shouldTestConnection('CustomSearch')).toBe(false);
  });
});

describe('required/optional step evaluation (pin TestConnection)', () => {
  const definition = [
    { name: 'checkAccess', mandatory: true },
    { name: 'getDatabases', mandatory: false },
  ];

  it('requires every mandatory definition step to pass', () => {
    expect(
      getAreRequiredStepsPassing(
        [{ name: 'checkAccess', passed: true }],
        definition,
      ),
    ).toBe(true);
    expect(
      getAreRequiredStepsPassing(
        [{ name: 'checkAccess', passed: false }],
        definition,
      ),
    ).toBe(false);
    expect(getAreRequiredStepsPassing([], definition)).toBe(false);
  });

  it('falls back to result-step mandatory flags without a mandatory definition', () => {
    expect(
      getAreRequiredStepsPassing([{ name: 'a', passed: true }], []),
    ).toBe(true);
    expect(
      getAreRequiredStepsPassing([{ name: 'a', mandatory: true, passed: false }], []),
    ).toBe(false);
    expect(getAreRequiredStepsPassing([], [])).toBe(false);
  });

  it('detects failing optional steps from the definition, else from results', () => {
    expect(
      getHasOptionalStepsFailing(
        [{ name: 'getDatabases', passed: false }],
        definition,
      ),
    ).toBe(true);
    expect(
      getHasOptionalStepsFailing(
        [{ name: 'getDatabases', passed: true }],
        definition,
      ),
    ).toBe(false);
    expect(
      getHasOptionalStepsFailing([{ name: 'a', mandatory: false, passed: false }], []),
    ).toBe(true);
  });
});

describe('resolveCompletionStatus (pin handleCompletionStatus)', () => {
  const definition = [{ name: 'checkAccess', mandatory: true }];

  it('is Successful only when required steps pass, the workflow succeeds, and nothing optional fails', () => {
    expect(
      resolveCompletionStatus(true, [{ name: 'checkAccess', passed: true }], definition),
    ).toEqual({
      status: 'Successful',
      successful: true,
      messageKey: 'forms.testConnection.success',
    });
  });

  it('is Warning when required steps pass but the workflow or an optional step failed — still successful to the parent', () => {
    expect(
      resolveCompletionStatus(false, [{ name: 'checkAccess', passed: true }], definition),
    ).toEqual({
      status: 'Warning',
      successful: true,
      messageKey: 'forms.testConnection.warning',
    });
    expect(
      resolveCompletionStatus(
        true,
        [
          { name: 'checkAccess', passed: true },
          { name: 'extra', passed: false },
        ],
        definition,
      ),
    ).toMatchObject({ status: 'Warning', successful: true });
  });

  it('is Failed when a required step fails', () => {
    expect(
      resolveCompletionStatus(true, [{ name: 'checkAccess', passed: false }], definition),
    ).toEqual({
      status: 'Failed',
      successful: false,
      messageKey: 'forms.testConnection.failed',
    });
  });
});

describe('computeConnectionTestFlags (pin TestConnection)', () => {
  it('disables while testing, disabled, validating, custom, or without airflow', () => {
    const base = {
      testing: false,
      disabled: false,
      pending: false,
      allow: true,
      airflow: true,
      status: undefined as TestConnectionStatus,
      missing: 0,
    };
    const flags = (over: Partial<typeof base>) =>
      computeConnectionTestFlags(
        over.testing ?? base.testing,
        over.disabled ?? base.disabled,
        over.pending ?? base.pending,
        over.allow ?? base.allow,
        over.airflow ?? base.airflow,
        over.status ?? base.status,
        over.missing ?? base.missing,
      );
    expect(flags({})).toEqual({
      isConnectionTestInProgress: false,
      isReadyToTestCard: true,
      isTestConnectionDisabled: false,
    });
    expect(flags({ testing: true }).isTestConnectionDisabled).toBe(true);
    expect(flags({ disabled: true }).isTestConnectionDisabled).toBe(true);
    expect(flags({ pending: true }).isTestConnectionDisabled).toBe(true);
    expect(flags({ allow: false }).isTestConnectionDisabled).toBe(true);
    expect(flags({ airflow: false }).isTestConnectionDisabled).toBe(true);
    expect(flags({ missing: 2 }).isReadyToTestCard).toBe(false);
    expect(flags({ missing: 2 }).isTestConnectionDisabled).toBe(false);
    expect(flags({ status: 'Successful' }).isReadyToTestCard).toBe(false);
  });
});
