/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Official testCaseThreshold.utils.ts (OSS reference) — run threshold + scope.
 */
import type { TestCase, TestCaseResult, TestDefinition } from '@/types/quality';
import type { TestCaseEvaluationScope } from '@/types/quality';

export const THRESHOLD_PARAM = 'threshold';
export const THRESHOLD_UNIT_PARAM = 'thresholdUnit';
const OPERATOR_PARAM = 'operator';
const STRATEGY_PARAM = 'strategy';
const MATCH_ENUM_PARAM = 'matchEnum';
const TABLE_CUSTOM_SQL_QUERY = 'tableCustomSQLQuery';
const COLUMN_VALUES_TO_BE_IN_SET = 'columnValuesToBeInSet';

export enum CustomSqlStrategy {
  Rows = 'ROWS',
  Count = 'COUNT',
}

const OPERATOR_LABEL_KEYS: Record<string, string> = {
  '<=': 'label.threshold-operator-at-most',
  '<': 'label.threshold-operator-fewer-than',
  '>=': 'label.threshold-operator-at-least',
  '>': 'label.threshold-operator-more-than',
  '==': 'label.threshold-operator-exactly',
  '!=': 'label.threshold-operator-anything-other-than',
};

const STRATEGY_LABEL_KEYS: Record<string, string> = {
  [CustomSqlStrategy.Rows]: 'label.custom-sql-strategy-rows',
  [CustomSqlStrategy.Count]: 'label.custom-sql-strategy-count',
};
const ANY_DIMENSION_POLICY = 'ANY_DIMENSION';

export enum ThresholdUnit {
  Absolute = 'ABSOLUTE',
  Percentage = 'PERCENTAGE',
}

export enum ThresholdNoun {
  Rows = 'ROWS',
  NonNullValues = 'NON_NULL_VALUES',
  TableRows = 'TABLE_ROWS',
  Units = 'UNITS',
  Bound = 'BOUND',
}

export enum ThresholdTestSemantic {
  RowCountable = 'ROW_COUNTABLE',
  Statistical = 'STATISTICAL',
  CustomSql = 'CUSTOM_SQL',
  NotEnforced = 'NOT_ENFORCED',
}

export enum ThresholdSamplingKind {
  StaticPercentage = 'STATIC_PERCENTAGE',
  StaticRows = 'STATIC_ROWS',
  Dynamic = 'DYNAMIC',
}

const STATISTICAL_BOUND_PARAMS: Record<string, { min: string; max: string }> = {
  columnValueMaxToBeBetween: { min: 'minValueForMaxInCol', max: 'maxValueForMaxInCol' },
  columnValueMeanToBeBetween: { min: 'minValueForMeanInCol', max: 'maxValueForMeanInCol' },
  columnValueMedianToBeBetween: { min: 'minValueForMedianInCol', max: 'maxValueForMedianInCol' },
  columnValueMinToBeBetween: { min: 'minValueForMinInCol', max: 'maxValueForMinInCol' },
  columnValueStdDevToBeBetween: { min: 'minValueForStdDevInCol', max: 'maxValueForStdDevInCol' },
  columnValuesSumToBeBetween: { min: 'minValueForColSum', max: 'maxValueForColSum' },
  columnValuesMissingCount: { min: 'missingCountValue', max: 'missingCountValue' },
  tableColumnCountToBeBetween: { min: 'minColValue', max: 'maxColValue' },
  tableColumnCountToEqual: { min: 'columnCount', max: 'columnCount' },
  tableRowCountToBeBetween: { min: 'minValue', max: 'maxValue' },
  tableRowCountToEqual: { min: 'value', max: 'value' },
  tableRowInsertedCountToBeBetween: { min: 'min', max: 'max' },
};

const ROW_COUNTABLE_DENOMINATORS: Record<string, ThresholdNoun> = {
  columnValueLengthsToBeBetween: ThresholdNoun.Rows,
  columnValuesToBeBetween: ThresholdNoun.Rows,
  columnValuesToMatchRegex: ThresholdNoun.NonNullValues,
  columnValuesToBeUnique: ThresholdNoun.NonNullValues,
  columnValuesToBeInSet: ThresholdNoun.Rows,
  columnValuesToBeNotInSet: ThresholdNoun.Rows,
  columnValuesToBeNotNull: ThresholdNoun.Rows,
  columnValuesToNotMatchRegex: ThresholdNoun.Rows,
};

export const THRESHOLD_NOUN_KEYS: Record<ThresholdNoun, string> = {
  [ThresholdNoun.Rows]: 'label.threshold-noun-rows',
  [ThresholdNoun.NonNullValues]: 'label.threshold-noun-non-null-values',
  [ThresholdNoun.TableRows]: 'label.threshold-noun-table-rows',
  [ThresholdNoun.Units]: 'label.threshold-noun-units',
  [ThresholdNoun.Bound]: 'label.threshold-noun-the-bound',
};

export const THRESHOLD_COUNT_NOUN_KEYS: Record<ThresholdNoun, string> = {
  [ThresholdNoun.Rows]: 'label.threshold-count-noun-rows',
  [ThresholdNoun.NonNullValues]: 'label.threshold-count-noun-non-null-values',
  [ThresholdNoun.TableRows]: 'label.threshold-count-noun-table-rows',
  [ThresholdNoun.Units]: 'label.threshold-count-noun-units',
  [ThresholdNoun.Bound]: 'label.threshold-count-noun-the-bound',
};

const SIGNIFICANT_DIGITS = 12;

function isNil(value: unknown): boolean {
  return value === null || value === undefined;
}

export function unwrapSelectValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (value !== null && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === 'string' ? id : undefined;
  }
  return undefined;
}

const normalizeValue = (value: number): number =>
  Number.isFinite(value) ? Number(value.toPrecision(SIGNIFICANT_DIGITS)) : value;

const isBooleanParamOn = (value: unknown): boolean =>
  value === true || (typeof value === 'string' && value.toLowerCase() === 'true');

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

const formatBound = (min: number | undefined, max: number | undefined): string | undefined => {
  if (min !== undefined && max !== undefined) {
    return min === max ? `= ${min}` : `${min} – ${max}`;
  }
  if (min !== undefined) {
    return `≥ ${min}`;
  }
  if (max !== undefined) {
    return `≤ ${max}`;
  }
  return undefined;
};

export function getThresholdTestSemantic(definitionName: string | undefined): ThresholdTestSemantic {
  if (definitionName === TABLE_CUSTOM_SQL_QUERY) {
    return ThresholdTestSemantic.CustomSql;
  }
  if (definitionName && STATISTICAL_BOUND_PARAMS[definitionName]) {
    return ThresholdTestSemantic.Statistical;
  }
  if (definitionName && ROW_COUNTABLE_DENOMINATORS[definitionName]) {
    return ThresholdTestSemantic.RowCountable;
  }
  return ThresholdTestSemantic.NotEnforced;
}

export function getThresholdNoun(unit: string, definitionName: string | undefined): ThresholdNoun {
  const isPercentage = unit === ThresholdUnit.Percentage;
  switch (getThresholdTestSemantic(definitionName)) {
    case ThresholdTestSemantic.Statistical:
      return isPercentage ? ThresholdNoun.Bound : ThresholdNoun.Units;
    case ThresholdTestSemantic.CustomSql:
      return isPercentage ? ThresholdNoun.TableRows : ThresholdNoun.Rows;
    case ThresholdTestSemantic.RowCountable:
      return isPercentage
        ? ROW_COUNTABLE_DENOMINATORS[definitionName ?? ''] ?? ThresholdNoun.Rows
        : ThresholdNoun.Rows;
    default:
      return ThresholdNoun.Rows;
  }
}

function getEffectiveSemantic(
  definitionName: string | undefined,
  params: Record<string, unknown>,
): { semantic: ThresholdTestSemantic; needsMatchEnum?: boolean } {
  const needsMatchEnum =
    definitionName === COLUMN_VALUES_TO_BE_IN_SET && !isBooleanParamOn(params[MATCH_ENUM_PARAM]);
  return {
    needsMatchEnum,
    semantic: needsMatchEnum ? ThresholdTestSemantic.NotEnforced : getThresholdTestSemantic(definitionName),
  };
}

export function getTestCaseParams(testCase: Pick<TestCase, 'parameterValues'>): Record<string, unknown> {
  return Object.fromEntries((testCase.parameterValues ?? []).map(({ name, value }) => [name, value]));
}

export type RunThresholdResult = Pick<
  TestCaseResult,
  'testCaseStatus' | 'passedRows' | 'failedRows' | 'failedRowsPercentage' | 'minBound' | 'maxBound'
>;

export interface RunThresholdData {
  semantic: ThresholdTestSemantic.RowCountable | ThresholdTestSemantic.Statistical;
  threshold: number;
  isPercentage: boolean;
  noun: ThresholdNoun;
  failedRows?: number;
  failedPercentage?: number;
  evaluatedRows?: number;
  populationNoun?: ThresholdNoun;
  configuredRange?: string;
  effectiveRange?: string;
}

const COMPLETED_RUN_STATUSES = new Set<string | undefined>(['Success', 'Failed']);

function getRowCountableRun(
  definitionName: string,
  result: RunThresholdResult,
): Pick<RunThresholdData, 'failedRows' | 'failedPercentage' | 'evaluatedRows' | 'populationNoun'> {
  const { passedRows, failedRows, failedRowsPercentage } = result;
  const evaluatedRows =
    isNil(passedRows) || isNil(failedRows) ? undefined : passedRows + failedRows;
  const populationNoun = ROW_COUNTABLE_DENOMINATORS[definitionName];
  let failedPercentage: number | undefined;
  if (evaluatedRows) {
    failedPercentage = ((failedRows ?? 0) / evaluatedRows) * 100;
  } else if (populationNoun === ThresholdNoun.Rows) {
    failedPercentage = failedRowsPercentage ?? undefined;
  }
  return {
    failedRows: failedRows ?? undefined,
    failedPercentage,
    evaluatedRows,
    populationNoun,
  };
}

function getStatisticalRun(
  testCase: Pick<TestCase, 'useDynamicAssertion'>,
  definitionName: string,
  params: Record<string, unknown>,
  result: RunThresholdResult,
): Pick<RunThresholdData, 'configuredRange' | 'effectiveRange'> {
  const bounds = STATISTICAL_BOUND_PARAMS[definitionName];
  const toBound = (value: number | undefined) => (isNil(value) ? undefined : normalizeValue(value));
  return {
    configuredRange: testCase.useDynamicAssertion
      ? undefined
      : formatBound(toNumber(params[bounds.min]), toNumber(params[bounds.max])),
    effectiveRange: formatBound(toBound(result.minBound), toBound(result.maxBound)),
  };
}

export function getRunThresholdData(
  testCase: Pick<TestCase, 'parameterValues' | 'testDefinition' | 'useDynamicAssertion'>,
  result: RunThresholdResult,
): RunThresholdData | undefined {
  if (!COMPLETED_RUN_STATUSES.has(result.testCaseStatus)) {
    return undefined;
  }
  const definitionName = testCase.testDefinition?.name ?? '';
  const params = getTestCaseParams(testCase);
  const { semantic } = getEffectiveSemantic(definitionName, params);
  if (semantic !== ThresholdTestSemantic.RowCountable && semantic !== ThresholdTestSemantic.Statistical) {
    return undefined;
  }
  const unit = unwrapSelectValue(params[THRESHOLD_UNIT_PARAM]) ?? ThresholdUnit.Absolute;
  const common = {
    semantic,
    threshold: toNumber(params[THRESHOLD_PARAM]) ?? 0,
    isPercentage: unit === ThresholdUnit.Percentage,
    noun: getThresholdNoun(unit, definitionName),
  } as const;
  return semantic === ThresholdTestSemantic.RowCountable
    ? { ...common, semantic, ...getRowCountableRun(definitionName, result) }
    : {
        ...common,
        semantic,
        ...getStatisticalRun(testCase, definitionName, params, result),
      };
}

export interface RunScopeBadges {
  sample?: { kind: ThresholdSamplingKind; value?: number };
  partitionColumn?: string;
  isPartitioned: boolean;
}

export function getRunScopeBadges(scope: TestCaseEvaluationScope | undefined): RunScopeBadges | undefined {
  if (!scope?.sampled && !scope?.partitioned) {
    return undefined;
  }
  let sample: RunScopeBadges['sample'];
  if (scope.sampled) {
    const hasSize = !isNil(scope.profileSample);
    sample = {
      kind:
        scope.profileSampleType === 'ROWS'
          ? ThresholdSamplingKind.StaticRows
          : ThresholdSamplingKind.StaticPercentage,
      value: hasSize ? scope.profileSample : undefined,
    };
  }
  return {
    sample,
    isPartitioned: Boolean(scope.partitioned),
    partitionColumn: scope.partitioned ? scope.partitionColumnName : undefined,
  };
}

// ─── Live threshold preview (official testCaseThreshold.utils) ───────────────

export interface TableProfilerConfig {
  profileSampleConfig?: {
    sampleConfigType?: string;
    config?: {
      profileSample?: number;
      profileSampleType?: string;
      smartSampling?: boolean;
    };
  };
}

export interface ThresholdPreviewInput {
  definition: TestDefinition;
  params: Record<string, unknown>;
  target?: string;
  profilerConfig?: TableProfilerConfig;
  useDynamicAssertion?: boolean;
}

export interface ThresholdSampling {
  kind: ThresholdSamplingKind;
  value?: number;
}

export interface ThresholdPreviewData {
  semantic: ThresholdTestSemantic;
  threshold: number;
  isPercentage: boolean;
  noun: ThresholdNoun;
  target?: string;
  bound?: string;
  effectiveRange?: string;
  isBoundLearned: boolean;
  operator?: string;
  operatorLabelKey?: string;
  strategy?: CustomSqlStrategy;
  sampling?: ThresholdSampling;
  hasZeroBound: boolean;
  isThresholdIgnored: boolean;
  needsMatchEnum: boolean;
}

export function hasThresholdUnitParam(definition: TestDefinition | undefined): boolean {
  return Boolean(definition?.parameterDefinition?.some((param) => param.name === THRESHOLD_UNIT_PARAM));
}

export function getThresholdPreviewTarget({
  isColumnLevel,
  columnName,
  tableName,
  tableFqn,
}: {
  isColumnLevel: boolean;
  columnName?: string;
  tableName?: string;
  tableFqn?: string;
}): string | undefined {
  return isColumnLevel ? columnName : tableName ?? tableFqn;
}

const getEffectiveBound = (
  bound: number,
  threshold: number,
  unit: string,
  direction: -1 | 1,
): number => {
  const delta =
    unit === ThresholdUnit.Percentage ? Math.abs(bound) * (threshold / 100) : threshold;
  return normalizeValue(bound + direction * delta);
};

export function getThresholdSampling(
  profilerConfig: TableProfilerConfig | undefined,
): ThresholdSampling | undefined {
  const sampleConfig = profilerConfig?.profileSampleConfig;
  if (!sampleConfig) {
    return undefined;
  }
  const staticConfig = sampleConfig.config;
  const isDynamic =
    sampleConfig.sampleConfigType === 'DYNAMIC' || Boolean(staticConfig?.smartSampling);
  if (isDynamic) {
    return { kind: ThresholdSamplingKind.Dynamic };
  }
  const profileSample = staticConfig?.profileSample;
  if (profileSample === undefined) {
    return undefined;
  }
  return {
    kind:
      staticConfig?.profileSampleType === 'ROWS'
        ? ThresholdSamplingKind.StaticRows
        : ThresholdSamplingKind.StaticPercentage,
    value: profileSample,
  };
}

function getStatisticalPreview(
  input: ThresholdPreviewInput,
  threshold: number,
  unit: string,
): Pick<ThresholdPreviewData, 'bound' | 'effectiveRange' | 'hasZeroBound'> | undefined {
  const { definition, params } = input;
  const bounds = STATISTICAL_BOUND_PARAMS[definition.name ?? ''];
  if (!bounds) {
    return undefined;
  }
  const min = toNumber(params[bounds.min]);
  const max = toNumber(params[bounds.max]);
  const bound = formatBound(min, max);
  if (!bound) {
    return undefined;
  }
  if (threshold <= 0) {
    return { bound, hasZeroBound: false };
  }
  const effectiveMin = min === undefined ? undefined : getEffectiveBound(min, threshold, unit, -1);
  const effectiveMax = max === undefined ? undefined : getEffectiveBound(max, threshold, unit, 1);
  return {
    bound,
    effectiveRange:
      effectiveMin !== undefined && effectiveMax !== undefined
        ? `${effectiveMin} – ${effectiveMax}`
        : formatBound(effectiveMin, effectiveMax),
    hasZeroBound: unit === ThresholdUnit.Percentage && (min === 0 || max === 0),
  };
}

function getCustomSqlPreview(
  params: Record<string, unknown>,
): Pick<ThresholdPreviewData, 'operator' | 'operatorLabelKey' | 'strategy'> {
  const operator = unwrapSelectValue(params[OPERATOR_PARAM]) ?? '<=';
  return {
    operator,
    operatorLabelKey: OPERATOR_LABEL_KEYS[operator],
    strategy:
      unwrapSelectValue(params[STRATEGY_PARAM]) === CustomSqlStrategy.Count
        ? CustomSqlStrategy.Count
        : CustomSqlStrategy.Rows,
  };
}

export function getThresholdPreviewData(input: ThresholdPreviewInput): ThresholdPreviewData | undefined {
  const { definition, params } = input;
  if (!hasThresholdUnitParam(definition)) {
    return undefined;
  }
  const threshold = toNumber(params[THRESHOLD_PARAM]) ?? 0;
  const unit = unwrapSelectValue(params[THRESHOLD_UNIT_PARAM]) ?? ThresholdUnit.Absolute;
  const { semantic, needsMatchEnum } = getEffectiveSemantic(definition.name, params);
  const isPercentage = unit === ThresholdUnit.Percentage;
  const common = {
    semantic,
    threshold,
    isPercentage,
    noun: getThresholdNoun(unit, definition.name),
    target: input.target,
    sampling: getThresholdSampling(input.profilerConfig),
    hasZeroBound: false,
    isBoundLearned: false,
    needsMatchEnum: Boolean(needsMatchEnum),
    isThresholdIgnored: semantic === ThresholdTestSemantic.NotEnforced && !needsMatchEnum,
  } satisfies Partial<ThresholdPreviewData>;

  if (semantic === ThresholdTestSemantic.Statistical) {
    if (input.useDynamicAssertion) {
      return { ...common, isBoundLearned: true } as ThresholdPreviewData;
    }
    const statistical = getStatisticalPreview(input, threshold, unit);
    return statistical ? ({ ...common, ...statistical } as ThresholdPreviewData) : undefined;
  }
  if (semantic === ThresholdTestSemantic.CustomSql) {
    return { ...common, ...getCustomSqlPreview(params) } as ThresholdPreviewData;
  }
  return common as ThresholdPreviewData;
}