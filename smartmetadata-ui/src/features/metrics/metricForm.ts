/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import type { CustomPropertyDef } from '@/types/collaboration';
import type { EntityRef } from '@/types/api';
import type { CreateMetric } from '@/api/metrics';

/**
 * Metric create form: values, enum sets, the official transform and the
 * official validation, ported from the pin (openmetadata-ui
 * components/Metric/AddMetric/AddMetricForm.tsx +
 * AddMetricForm.utils.ts, generated/api/data/createMetric.ts).
 *
 * The form carries raw values (strings / EntityRefs), not the official
 * select-item wrappers: the product's antd selects resolve options to
 * values through a ref-by-value map in the drawer, the same shape the
 * product's UserTeamPicker already uses.
 */

// ---------------------------------------------------------------------------
// Enum value sets (official createMetric.ts, verbatim values)
// ---------------------------------------------------------------------------

/** Official MetricType, 16 values. */
export const METRIC_TYPE_VALUES = [
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
] as const;

/** Official MetricGranularity, 8 values. */
export const METRIC_GRANULARITY_VALUES = [
  'DAY',
  'HOUR',
  'MINUTE',
  'MONTH',
  'QUARTER',
  'SECOND',
  'WEEK',
  'YEAR',
] as const;

/** Official Language, 5 values. */
export const METRIC_LANGUAGE_VALUES = [
  'External',
  'Java',
  'JavaScript',
  'Python',
  'SQL',
] as const;

/** Official UnitOfMeasurement, 9 values. */
export const METRIC_UNIT_VALUES = [
  'COUNT',
  'DOLLARS',
  'EVENTS',
  'OTHER',
  'PERCENTAGE',
  'REQUESTS',
  'SIZE',
  'TIMESTAMP',
  'TRANSACTIONS',
] as const;

// ---------------------------------------------------------------------------
// Form values + defaults (official METRIC_FORM_DEFAULTS)
// ---------------------------------------------------------------------------

export interface MetricFormValues {
  name: string;
  displayName: string;
  description: string;
  metricType: string | null;
  granularity: string | null;
  unitOfMeasurement: string | null;
  customUnitOfMeasurement: string;
  language: string;
  code: string;
  parentMetric: EntityRef | null;
  owners: EntityRef[];
  reviewers: EntityRef[];
  domains: EntityRef[];
  relatedMetrics: EntityRef[];
  extensionFormValues: Record<string, unknown>;
}

export const METRIC_FORM_DEFAULTS: MetricFormValues = {
  name: '',
  displayName: '',
  description: '',
  metricType: null,
  granularity: null,
  unitOfMeasurement: null,
  customUnitOfMeasurement: '',
  language: 'SQL',
  code: '',
  parentMetric: null,
  owners: [],
  reviewers: [],
  domains: [],
  relatedMetrics: [],
  extensionFormValues: {},
};

// ---------------------------------------------------------------------------
// Validation (official AddMetricForm field rules)
// ---------------------------------------------------------------------------

/**
 * Official ENTITY_NAME_REGEX (constants/regex.constants.ts), verbatim:
 * blocks the reserved FQN separator characters (::, >, ") and ASCII
 * control characters; Unicode is supported. The product had no entity
 * name regex to reuse, so the official expression is created here
 * rather than invented.
 */
// eslint-disable-next-line no-control-regex
export const ENTITY_NAME_REGEX = /^((?!::)[^>"\u0000-\u001f])*$/;

export const METRIC_NAME_MIN_LENGTH = 1;
export const METRIC_NAME_MAX_LENGTH = 128;

export interface MetricFormError {
  field: string;
  /** i18n key under `metrics.validation.*`, resolved by the drawer. */
  messageKey: string;
  params?: Record<string, string | number>;
}

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === 'string') {
    return value.trim() === '';
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).length === 0;
  }
  return false;
}

/**
 * Native form field value behind an intake fieldPath, so an intake form
 * can mark a native field required (official applyIntakeRequired). A
 * path the form does not render has no value to check and is skipped —
 * the same as the official form, whose applyIntakeRequired only wraps
 * the fields it renders.
 */
function nativeFieldValue(values: MetricFormValues, fieldPath: string): unknown {
  switch (fieldPath) {
    case 'name':
      return values.name;
    case 'displayName':
      return values.displayName;
    case 'description':
      return values.description;
    case 'metricType':
      return values.metricType;
    case 'granularity':
      return values.granularity;
    case 'unitOfMeasurement':
      return values.unitOfMeasurement;
    case 'customUnitOfMeasurement':
      return values.customUnitOfMeasurement;
    case 'language':
      return values.language;
    case 'code':
      return values.code;
    case 'parentMetric':
      return values.parentMetric;
    case 'owners':
      return values.owners;
    case 'reviewers':
      return values.reviewers;
    case 'domains':
      return values.domains;
    case 'relatedMetrics':
      return values.relatedMetrics;
    default:
      return undefined;
  }
}

function hasNativeField(fieldPath: string): boolean {
  return (
    fieldPath === 'name' ||
    fieldPath === 'displayName' ||
    fieldPath === 'description' ||
    fieldPath === 'metricType' ||
    fieldPath === 'granularity' ||
    fieldPath === 'unitOfMeasurement' ||
    fieldPath === 'customUnitOfMeasurement' ||
    fieldPath === 'language' ||
    fieldPath === 'code' ||
    fieldPath === 'parentMetric' ||
    fieldPath === 'owners' ||
    fieldPath === 'reviewers' ||
    fieldPath === 'domains' ||
    fieldPath === 'relatedMetrics'
  );
}

/**
 * Official field rules: name is required, 1–128 characters,
 * ENTITY_NAME_REGEX; code is required; customUnit is required only
 * when the unit is `Other` (the field is not rendered otherwise, and
 * is not validated then either); intake-required native fields are
 * required; intake-required extension fields are required. A failed
 * validation submits nothing — the drawer stays open on the same
 * values with the errors shown at the fields.
 */
export function validateMetricForm(
  values: MetricFormValues,
  requiredNativeFields: ReadonlySet<string>,
  requiredExtensionNames: readonly string[],
): MetricFormError[] {
  const errors: MetricFormError[] = [];
  const name = values.name.trim();
  if (name === '') {
    errors.push({ field: 'name', messageKey: 'fieldRequired', params: { field: 'name' } });
  } else {
    if (name.length < METRIC_NAME_MIN_LENGTH || name.length > METRIC_NAME_MAX_LENGTH) {
      errors.push({
        field: 'name',
        messageKey: 'nameLength',
        params: { min: METRIC_NAME_MIN_LENGTH, max: METRIC_NAME_MAX_LENGTH },
      });
    }
    if (!ENTITY_NAME_REGEX.test(name)) {
      errors.push({ field: 'name', messageKey: 'nameInvalid' });
    }
  }
  if (values.code.trim() === '') {
    errors.push({ field: 'code', messageKey: 'fieldRequired', params: { field: 'code' } });
  }
  if (values.unitOfMeasurement === 'OTHER' && values.customUnitOfMeasurement.trim() === '') {
    errors.push({
      field: 'customUnitOfMeasurement',
      messageKey: 'fieldRequired',
      params: { field: 'customUnitOfMeasurement' },
    });
  }
  for (const fieldPath of requiredNativeFields) {
    if (fieldPath === 'name' || fieldPath === 'code' || !hasNativeField(fieldPath)) {
      continue;
    }
    if (isEmptyValue(nativeFieldValue(values, fieldPath))) {
      errors.push({ field: fieldPath, messageKey: 'fieldRequired', params: { field: fieldPath } });
    }
  }
  for (const propertyName of requiredExtensionNames) {
    if (isEmptyValue(values.extensionFormValues[propertyName])) {
      errors.push({
        field: `extension.${propertyName}`,
        messageKey: 'fieldRequired',
        params: { field: propertyName },
      });
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Intake extension serialization (official IntakeFormExtensionUtils +
// CustomProperty.utils serializeExtensionValue, verbatim in semantics)
// ---------------------------------------------------------------------------

const MAX_UNICODE_CODE_POINT = 0x10ffff;

/**
 * Official getExtensionPropertyNameFromFormKey
 * (AddDomainFormExtensionFields.utils.ts): a form key is either a plain
 * property name, or `cp_` followed by the hex code points of the name.
 * An undecodable key is returned as-is rather than throwing.
 */
export function getExtensionPropertyNameFromFormKey(formKey: string): string {
  if (!formKey.startsWith('cp_')) {
    return formKey;
  }
  const codePoints = formKey
    .substring('cp_'.length)
    .split('_')
    .map((value) => Number.parseInt(value, 16));
  return codePoints.every(
    (codePoint) =>
      Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= MAX_UNICODE_CODE_POINT,
  )
    ? String.fromCodePoint(...codePoints)
    : formKey;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEmptyExtensionValue(value: unknown): boolean {
  const isBlank = value === undefined || value === null || value === '';
  const isEmptyCollection =
    (Array.isArray(value) && value.length === 0) ||
    (isRecord(value) && Object.keys(value).length === 0);
  return isBlank || isEmptyCollection;
}

function toFiniteNumber(raw: unknown): number | undefined {
  const numericValue = Number(raw);
  return Number.isFinite(numericValue) ? numericValue : undefined;
}

function unwrapPickerValue(value: unknown): unknown {
  return isRecord(value) && 'value' in value ? value.value : value;
}

function isEntityReference(value: unknown): value is Record<string, unknown> & { type: string } {
  return (
    isRecord(value) &&
    typeof value.type === 'string' &&
    (typeof value.id === 'string' || typeof value.fullyQualifiedName === 'string')
  );
}

function unwrapEntityReference(value: unknown): Record<string, unknown> | undefined {
  if (isEntityReference(value)) {
    return value;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  if (isEntityReference(value.reference)) {
    return value.reference;
  }
  return isEntityReference(value.value) ? (value.value as Record<string, unknown>) : undefined;
}

function serializeTimeInterval(raw: unknown): Record<string, number> | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const interval = Object.fromEntries(
    ['start', 'end']
      .filter((key) => !isEmptyExtensionValue(raw[key]))
      .map((key) => [key, toFiniteNumber(raw[key])])
      .filter(([, value]) => value !== undefined),
  );
  return isEmptyExtensionValue(interval) ? undefined : interval;
}

function hasPopulatedTableRows(value: unknown): boolean {
  return (
    isRecord(value) &&
    Array.isArray(value.rows) &&
    value.rows.some((row) => isRecord(row) && Object.values(row).some(Boolean))
  );
}

function serializeTableValue(raw: unknown): unknown {
  return hasPopulatedTableRows(raw) ? raw : undefined;
}

function serializeEnumValue(raw: unknown): unknown {
  const values = Array.isArray(raw) ? raw : [raw];
  return values.map(unwrapPickerValue).filter((value) => !isEmptyExtensionValue(value));
}

function serializeEntityReferenceList(raw: unknown): Array<Record<string, unknown>> {
  return (Array.isArray(raw) ? raw : [raw])
    .map(unwrapEntityReference)
    .filter(
      (reference): reference is Record<string, unknown> => reference !== undefined,
    );
}

function serializeHyperlink(raw: unknown): Record<string, string> | undefined {
  if (!isRecord(raw) || typeof raw.url !== 'string' || !raw.url) {
    return undefined;
  }
  return {
    url: raw.url,
    ...(typeof raw.displayText === 'string' && raw.displayText
      ? { displayText: raw.displayText }
      : {}),
  };
}

// Dispatch table replacing a per-type switch: each entry is a pure
// `raw -> serialized` transform, keyed by CustomProperty.propertyType
// name. Unknown/unmapped types fall through to the raw value, matching
// the official switch's `default` branch. (Official type names:
// 'table-cp' and 'hyperlink-cp' carry the -cp suffix.)
const EXTENSION_VALUE_SERIALIZERS: Record<string, (raw: unknown) => unknown> = {
  integer: toFiniteNumber,
  number: toFiniteNumber,
  timestamp: toFiniteNumber,
  timeInterval: serializeTimeInterval,
  'table-cp': serializeTableValue,
  enum: serializeEnumValue,
  entityReference: unwrapEntityReference,
  entityReferenceList: serializeEntityReferenceList,
  'hyperlink-cp': serializeHyperlink,
};

export function serializeExtensionValue(
  definition: CustomPropertyDef,
  raw: unknown,
): unknown {
  if (isEmptyExtensionValue(raw)) {
    return undefined;
  }
  const propertyType = definition.propertyType;
  const serializer = propertyType ? EXTENSION_VALUE_SERIALIZERS[propertyType] : undefined;
  const serializedValue = serializer ? serializer(raw) : raw;
  return isEmptyExtensionValue(serializedValue) ? undefined : serializedValue;
}

/**
 * Official serializeIntakeFormExtension: one extension entry per form
 * value, keyed by the custom property name, serialized by the
 * property's type; empty values are dropped. A form key with no
 * matching custom property definition serializes raw.
 */
export function serializeIntakeFormExtension(
  extensionFormValues: Record<string, unknown> = {},
  customProperties: CustomPropertyDef[],
): Record<string, unknown> {
  return Object.entries(extensionFormValues).reduce<Record<string, unknown>>(
    (extension, [formKey, rawValue]) => {
      const propertyName = getExtensionPropertyNameFromFormKey(formKey);
      const definition = customProperties.find((property) => property.name === propertyName);
      const value = definition ? serializeExtensionValue(definition, rawValue) : rawValue;
      if (value !== undefined) {
        extension[propertyName] = value;
      }
      return extension;
    },
    {},
  );
}

// ---------------------------------------------------------------------------
// Form -> payload transform (official AddMetricForm.utils
// transformMetricFormData, verbatim in semantics)
// ---------------------------------------------------------------------------

function optionalProperty<K extends string, V>(
  key: K,
  value: V | undefined,
): Partial<Record<K, V>> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

function nonEmptyString(value: string): string | undefined {
  return value.trim() || undefined;
}

function nonEmptyArray<T>(values: T[]): T[] | undefined {
  return values.length > 0 ? values : undefined;
}

function referenceNames(references: EntityRef[]): string[] {
  return references.map(
    ({ fullyQualifiedName, name }) => fullyQualifiedName ?? name ?? '',
  );
}

/**
 * Pure form-values → CreateMetric payload transform. Mirrors the
 * official transform exactly: owners/reviewers as EntityReference[];
 * domains/relatedMetrics as name arrays; customUnitOfMeasurement only
 * when the unit is `Other`; parent from `parentMetricFqn` when
 * creating a child from its parent's page, otherwise from the metric
 * picked in the form; `metricExpression: {language, code}` always
 * carried; language defaults to SQL.
 *
 * `metricGroup` is a separate API field and is never set here — the
 * create form has no group picker (official AddMetricForm.utils.ts:55).
 */
export function transformMetricFormData(
  values: MetricFormValues,
  parentMetricFqn?: string,
  customProperties: CustomPropertyDef[] = [],
): CreateMetric {
  const name = values.name.trim();
  const code = values.code.trim();
  const metricType = values.metricType ?? undefined;
  const granularity = values.granularity ?? undefined;
  const unitOfMeasurement = values.unitOfMeasurement ?? undefined;
  const language = values.language || 'SQL';
  const customUnit =
    unitOfMeasurement === 'OTHER'
      ? nonEmptyString(values.customUnitOfMeasurement)
      : undefined;
  const selectedParent = values.parentMetric ?? undefined;
  const parent =
    parentMetricFqn ??
    selectedParent?.fullyQualifiedName ??
    selectedParent?.name;
  // `extension` rides only when the serialized result is non-empty: an
  // intake form whose fields are all blank serializes to {} and must
  // not send an empty extension object.
  const serializedExtension =
    Object.keys(values.extensionFormValues ?? {}).length > 0
      ? serializeIntakeFormExtension(values.extensionFormValues, customProperties)
      : {};
  const extension =
    Object.keys(serializedExtension).length > 0 ? serializedExtension : undefined;

  return {
    name,
    ...optionalProperty('extension', extension),
    ...optionalProperty('displayName', nonEmptyString(values.displayName)),
    ...optionalProperty('description', nonEmptyString(values.description)),
    ...optionalProperty('granularity', granularity),
    ...optionalProperty('metricType', metricType),
    ...optionalProperty('unitOfMeasurement', unitOfMeasurement),
    ...optionalProperty('customUnitOfMeasurement', customUnit),
    ...optionalProperty('parent', parent),
    ...optionalProperty('owners', nonEmptyArray(values.owners)),
    ...optionalProperty('reviewers', nonEmptyArray(values.reviewers)),
    ...optionalProperty('domains', nonEmptyArray(referenceNames(values.domains))),
    ...optionalProperty('relatedMetrics', nonEmptyArray(referenceNames(values.relatedMetrics))),
    metricExpression: {
      language,
      code,
    },
  };
}
