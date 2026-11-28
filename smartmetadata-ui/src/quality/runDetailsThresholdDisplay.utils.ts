/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Official RunDetailsCard threshold cell formatting.
 */
import type { ComposerTranslation } from 'vue-i18n';
import type { TestCase, TestCaseResult } from '@/types/quality';
import { NO_VALUE } from '@/quality/testSummary.constants';
import { formatNumber } from '@/quality/runDetailsCard.utils';
import { formatThresholdAmount } from '@/quality/testCaseThresholdSentence.utils';
import {
  getRunThresholdData,
  THRESHOLD_COUNT_NOUN_KEYS,
  ThresholdNoun,
  ThresholdTestSemantic,
  type RunThresholdData,
} from '@/quality/testCaseThreshold.utils';

export interface RunDetailCell {
  labelKey: string;
  testId: string;
  value: string;
}

function formatFailed(data: RunThresholdData, t: ComposerTranslation): string | undefined {
  const countOf = (value: number) =>
    t('message.threshold-amount-absolute', {
      value: formatNumber(value),
      noun: t(THRESHOLD_COUNT_NOUN_KEYS[data.populationNoun ?? ThresholdNoun.Rows]),
    });
  const share =
    data.failedPercentage === undefined
      ? undefined
      : t('label.percentage-value', { value: data.failedPercentage.toFixed(2) });
  const count = data.failedRows === undefined ? undefined : countOf(data.failedRows);
  const [lead, aside] = data.isPercentage ? [share, count] : [count, share];
  return lead && aside ? `${lead} (${aside})` : lead ?? aside;
}

function rowCountableCells(data: RunThresholdData, t: ComposerTranslation): RunDetailCell[] {
  const populationNoun = data.populationNoun ?? ThresholdNoun.Rows;
  const countOf = (value: number) =>
    t('message.threshold-amount-absolute', {
      value: formatNumber(value),
      noun: t(THRESHOLD_COUNT_NOUN_KEYS[populationNoun]),
    });
  const cells: RunDetailCell[] = [];
  const failedText = formatFailed(data, t);
  if (failedText) {
    cells.push({ labelKey: 'label.failed', testId: 'run-details-failed', value: failedText });
  }
  if (data.evaluatedRows !== undefined) {
    cells.push({
      labelKey: 'label.evaluated',
      testId: 'run-details-evaluated',
      value: countOf(data.evaluatedRows),
    });
  }
  return cells;
}

function statisticalCells(data: RunThresholdData): RunDetailCell[] {
  const cells: RunDetailCell[] = [];
  if (data.configuredRange) {
    cells.push({
      labelKey: 'label.configured-range',
      testId: 'run-details-configured-range',
      value: data.configuredRange,
    });
  }
  if (data.threshold > 0 && data.effectiveRange) {
    cells.push({
      labelKey: 'label.effective-range',
      testId: 'run-details-effective-range',
      value: data.effectiveRange,
    });
  }
  return cells;
}

export function getRunThresholdSectionCells(
  testCase: TestCase,
  result: TestCaseResult,
  t: ComposerTranslation,
): RunDetailCell[] | undefined {
  const data = getRunThresholdData(testCase, result);
  if (!data) {
    return undefined;
  }
  const thresholdValue =
    data.threshold > 0
      ? formatThresholdAmount(data.threshold, data.isPercentage, data.noun, t)
      : t('label.no-tolerance');
  const cells: RunDetailCell[] = [
    { labelKey: 'label.threshold', testId: 'run-details-threshold', value: thresholdValue },
  ];
  if (data.semantic === ThresholdTestSemantic.RowCountable) {
    cells.push(...rowCountableCells(data, t));
  } else {
    cells.push(...statisticalCells(data));
  }
  return cells;
}

export function quietWhenUnknown(text: string): string {
  return text || NO_VALUE;
}