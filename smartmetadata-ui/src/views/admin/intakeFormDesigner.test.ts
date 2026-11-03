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
  buildIntakeFormPayload,
  computeFieldRows,
  getIntakeFormFields,
  NATIVE_FIELDS_BY_ENTITY_TYPE,
} from './intakeFormDesigner';

const t = (key: string): string => key;

describe('intakeFormDesigner', () => {
  it('prefers formFields and falls back to requiredFields as required', () => {
    expect(
      getIntakeFormFields({
        formFields: [{ fieldPath: 'a', fieldLabel: 'A', fieldKind: 'native', required: false }],
        requiredFields: [{ fieldPath: 'b', fieldLabel: 'B', fieldKind: 'native' }],
      }),
    ).toHaveLength(1);
    expect(
      getIntakeFormFields({
        requiredFields: [{ fieldPath: 'b', fieldLabel: 'B', fieldKind: 'native' }],
      }),
    ).toEqual([{ fieldPath: 'b', fieldLabel: 'B', fieldKind: 'native', required: true }]);
  });

  it('builds native rows always listed, custom rows by inclusion, orphans kept', () => {
    const rows = computeFieldRows({
      nativeFields: NATIVE_FIELDS_BY_ENTITY_TYPE.dataProduct,
      customProperties: [{ name: 'priority', displayName: 'Priority' }],
      initialValue: {
        formFields: [
          { fieldPath: 'displayName', fieldLabel: 'Display name', fieldKind: 'native', required: true },
          { fieldPath: 'extension.priority', fieldLabel: 'Priority', fieldKind: 'customProperty', required: false },
          { fieldPath: 'extension.gone', fieldLabel: 'Gone', fieldKind: 'customProperty', required: true },
        ],
      },
      t,
    });
    const native = rows.find((row) => row.path === 'displayName');
    expect(native?.included).toBe(true);
    expect(native?.required).toBe(true);
    const custom = rows.find((row) => row.path === 'extension.priority');
    expect(custom?.included).toBe(true);
    expect(custom?.required).toBe(false);
    const orphan = rows.find((row) => row.path === 'extension.gone');
    expect(orphan?.isOrphan).toBe(true);
    expect(orphan?.included).toBe(true);
  });

  it('persists native fields only when required and custom fields when included', () => {
    const payload = buildIntakeFormPayload({
      rows: [
        { path: 'displayName', label: 'Display name', kind: 'native', included: true, required: true },
        { path: 'tags', label: 'Tags', kind: 'native', included: true, required: false },
        { path: 'extension.priority', label: 'Priority', kind: 'customProperty', included: true, required: false },
        { path: 'extension.skip', label: 'Skip', kind: 'customProperty', included: false, required: false },
      ],
      entityType: 'dataProduct',
      name: 'dataProduct',
      displayName: 'Intake form for Data Product',
      description: '',
      enabled: true,
    });
    expect(payload.formFields?.map((field) => field.fieldPath)).toEqual([
      'displayName',
      'extension.priority',
    ]);
    expect(payload.requiredFields?.map((field) => field.fieldPath)).toEqual(['displayName']);
  });
});
