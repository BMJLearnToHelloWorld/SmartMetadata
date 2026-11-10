/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import {
  ENTITY_NAME_REGEX,
  METRIC_FORM_DEFAULTS,
  METRIC_GRANULARITY_VALUES,
  METRIC_LANGUAGE_VALUES,
  METRIC_TYPE_VALUES,
  METRIC_UNIT_VALUES,
  serializeIntakeFormExtension,
  transformMetricFormData,
  validateMetricForm,
  type MetricFormValues,
} from './metricForm';
import type { CustomPropertyDef } from '@/types/collaboration';
import type { EntityRef } from '@/types/api';

function baseValues(overrides: Partial<MetricFormValues> = {}): MetricFormValues {
  return {
    ...METRIC_FORM_DEFAULTS,
    name: 'orders_per_day',
    code: 'SELECT COUNT(*) FROM orders',
    ...overrides,
  };
}

function metricRef(name: string): EntityRef {
  return { id: name, type: 'metric', name, fullyQualifiedName: name };
}

describe('enum value sets', () => {
  it('match the official generated enums verbatim', () => {
    expect(METRIC_TYPE_VALUES).toEqual([
      'AVERAGE',
      'CONVERSION',
      'COUNT',
      'CUMULATIVE',
      'DERIVED',
      'MAX',
      'MEDIAN',
      'MIN',
      'MODE',
      'OTHER',
      'PERCENTAGE',
      'RATIO',
      'SIMPLE',
      'STANDARD_DEVIATION',
      'SUM',
      'VARIANCE',
    ]);
    expect(METRIC_GRANULARITY_VALUES).toEqual([
      'DAY',
      'HOUR',
      'MINUTE',
      'MONTH',
      'QUARTER',
      'SECOND',
      'WEEK',
      'YEAR',
    ]);
    expect(METRIC_LANGUAGE_VALUES).toEqual(['External', 'Java', 'JavaScript', 'Python', 'SQL']);
    expect(METRIC_UNIT_VALUES).toEqual([
      'COUNT',
      'DOLLARS',
      'EVENTS',
      'OTHER',
      'PERCENTAGE',
      'REQUESTS',
      'SIZE',
      'TIMESTAMP',
      'TRANSACTIONS',
    ]);
  });
});

describe('ENTITY_NAME_REGEX', () => {
  it('accepts ordinary names and rejects ::, >, " and control characters', () => {
    expect(ENTITY_NAME_REGEX.test('orders_per_day')).toBe(true);
    expect(ENTITY_NAME_REGEX.test('订单量')).toBe(true);
    expect(ENTITY_NAME_REGEX.test('a::b')).toBe(false);
    expect(ENTITY_NAME_REGEX.test('a>b')).toBe(false);
    expect(ENTITY_NAME_REGEX.test('a"b')).toBe(false);
    expect(ENTITY_NAME_REGEX.test('a\tb')).toBe(false);
  });
});

describe('validateMetricForm', () => {
  it('requires name and code', () => {
    expect(validateMetricForm(baseValues({ name: '', code: '' }), new Set(), [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'name' }),
        expect.objectContaining({ field: 'code' }),
      ]),
    );
  });

  it('rejects a name longer than 128 characters or with illegal characters', () => {
    expect(validateMetricForm(baseValues({ name: 'x'.repeat(129) }), new Set(), [])).toHaveLength(1);
    expect(validateMetricForm(baseValues({ name: 'a::b' }), new Set(), [])).toHaveLength(1);
    expect(validateMetricForm(baseValues({ name: 'x'.repeat(128) }), new Set(), [])).toHaveLength(0);
  });

  it('requires customUnit only when unit is Other', () => {
    expect(
      validateMetricForm(baseValues({ unitOfMeasurement: 'OTHER' }), new Set(), []),
    ).toHaveLength(1);
    expect(
      validateMetricForm(
        baseValues({ unitOfMeasurement: 'OTHER', customUnitOfMeasurement: 'sessions' }),
        new Set(),
        [],
      ),
    ).toHaveLength(0);
    expect(
      validateMetricForm(baseValues({ unitOfMeasurement: 'COUNT' }), new Set(), []),
    ).toHaveLength(0);
  });

  it('requires intake-required native and extension fields, and skips unknown intake paths', () => {
    const errors = validateMetricForm(
      baseValues({ code: '', displayName: '' }),
      new Set(['code', 'displayName']),
      ['customScore'],
    );
    // 'code' is already covered by the base check (the loop skips it);
    // displayName comes from the required-native set, customScore from
    // the required-extension list.
    expect(errors.map((error) => error.field)).toEqual([
      'code',
      'displayName',
      'extension.customScore',
    ]);
    expect(
      validateMetricForm(
        baseValues({ extensionFormValues: { customScore: '5' } }),
        new Set(['unknown.path']),
        ['customScore'],
      ),
    ).toHaveLength(0);
  });
});

describe('transformMetricFormData', () => {
  it('trims text, defaults language to SQL, and drops empty optionals', () => {
    expect(transformMetricFormData(baseValues())).toEqual({
      name: 'orders_per_day',
      metricExpression: { language: 'SQL', code: 'SELECT COUNT(*) FROM orders' },
    });
  });

  it('keeps an explicit unit and a custom unit only with unit Other', () => {
    expect(
      transformMetricFormData(
        baseValues({ unitOfMeasurement: 'COUNT', customUnitOfMeasurement: 'sessions' }),
      ),
    ).not.toHaveProperty('customUnitOfMeasurement');
    expect(
      transformMetricFormData(
        baseValues({ unitOfMeasurement: 'OTHER', customUnitOfMeasurement: 'sessions' }),
      ),
    ).toMatchObject({ unitOfMeasurement: 'OTHER', customUnitOfMeasurement: 'sessions' });
  });

  it('prefers the passed parent metric over the form parent value', () => {
    expect(
      transformMetricFormData(baseValues({ parentMetric: metricRef('form.parent') }), 'drawer.parent'),
    ).toMatchObject({ parent: 'drawer.parent' });
    expect(transformMetricFormData(baseValues({ parentMetric: metricRef('form.parent') }))).toMatchObject({
      parent: 'form.parent',
    });
  });

  it('never sets metricGroup and includes extension only when non-empty', () => {
    const customProperties: CustomPropertyDef[] = [
      { name: 'customScore', propertyType: 'integer' },
    ];
    expect(
      transformMetricFormData(baseValues(), undefined, customProperties),
    ).not.toHaveProperty('extension');
    expect(
      transformMetricFormData(
        baseValues({ extensionFormValues: { customScore: '7' } }),
        undefined,
        customProperties,
      ),
    ).toEqual(
      expect.objectContaining({ extension: { customScore: 7 } }),
    );
    expect(
      transformMetricFormData(baseValues(), undefined, customProperties),
    ).not.toHaveProperty('metricGroup');
  });
});

describe('serializeIntakeFormExtension', () => {
  const customProperties: CustomPropertyDef[] = [
    { name: 'intScore', propertyType: 'integer' },
    { name: 'fltScore', propertyType: 'number' },
    { name: 'ts', propertyType: 'timestamp' },
    { name: 'window', propertyType: 'timeInterval' },
    { name: 'table', propertyType: 'table-cp' },
    { name: 'labels', propertyType: 'enum' },
    { name: 'ownerRef', propertyType: 'entityReference' },
    { name: 'refList', propertyType: 'entityReferenceList' },
    { name: 'link', propertyType: 'hyperlink-cp' },
    { name: 'free', propertyType: 'string' },
  ];

  it('serializes each type per the official dispatch table and drops empties', () => {
    expect(
      serializeIntakeFormExtension(
        {
          intScore: '7',
          fltScore: '1.5',
          ts: '1710000000000',
          window: { start: '1710000000000', end: '1711000000000' },
          table: { rows: [{ a: 'x' }, {}] },
          labels: ['a', '', 'b'],
          ownerRef: { id: 'u1', type: 'user' },
          refList: [{ id: 't1', type: 'team' }, null],
          link: { url: 'https://example.com', displayText: 'docs' },
          free: 'hello',
        },
        customProperties,
      ),
    ).toEqual({
      intScore: 7,
      fltScore: 1.5,
      ts: 1710000000000,
      window: { start: 1710000000000, end: 1711000000000 },
      table: { rows: [{ a: 'x' }, {}] },
      labels: ['a', 'b'],
      ownerRef: { id: 'u1', type: 'user' },
      refList: [{ id: 't1', type: 'team' }],
      link: { url: 'https://example.com', displayText: 'docs' },
      free: 'hello',
    });
    expect(serializeIntakeFormExtension({ intScore: '' }, customProperties)).toEqual({});
    expect(serializeIntakeFormExtension({ intScore: 'abc' }, customProperties)).toEqual({});
    expect(serializeIntakeFormExtension({ table: { rows: [{}] } }, customProperties)).toEqual({});
    expect(serializeIntakeFormExtension({ unknown: 'x' }, customProperties)).toEqual({
      unknown: 'x',
    });
  });

  it('decodes cp_ hex code-point keys back to the property name', () => {
    const cps: CustomPropertyDef[] = [{ name: 'my prop', propertyType: 'string' }];
    expect(
      serializeIntakeFormExtension({ cp_6d_79_20_70_72_6f_70: 'v' }, cps),
    ).toEqual({ 'my prop': 'v' });
    // An undecodable key is kept as-is.
    expect(
      serializeIntakeFormExtension({ cp_zz: 'v' }, cps),
    ).toEqual({ cp_zz: 'v' });
  });
});
