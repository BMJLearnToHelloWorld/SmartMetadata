/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Official testCaseThresholdSentence.utils.ts — preview + amount formatting.
 */
import type { ComposerTranslation } from 'vue-i18n';
import {
  CustomSqlStrategy,
  ThresholdNoun,
  type ThresholdPreviewData,
  type ThresholdSampling,
  ThresholdSamplingKind,
  ThresholdTestSemantic,
  THRESHOLD_COUNT_NOUN_KEYS,
  THRESHOLD_NOUN_KEYS,
} from '@/quality/testCaseThreshold.utils';

export function formatThresholdAmount(
  threshold: number,
  isPercentage: boolean,
  noun: ThresholdNoun,
  t: ComposerTranslation,
): string {
  return isPercentage
    ? t('message.threshold-amount-percentage', {
        value: threshold,
        noun: t(THRESHOLD_NOUN_KEYS[noun]),
      })
    : t('message.threshold-amount-absolute', {
        value: threshold,
        noun: t(THRESHOLD_COUNT_NOUN_KEYS[noun]),
      });
}

export function formatSamplingNote(
  sampling: ThresholdSampling | undefined,
  t: ComposerTranslation,
): string | undefined {
  if (!sampling) {
    return undefined;
  }
  if (sampling.kind === ThresholdSamplingKind.Dynamic) {
    return t('message.dq-threshold-preview-sampling-dynamic');
  }
  const sample =
    sampling.kind === ThresholdSamplingKind.StaticRows
      ? t('message.threshold-amount-absolute', {
          value: sampling.value,
          noun: t(THRESHOLD_COUNT_NOUN_KEYS[ThresholdNoun.Rows]),
        })
      : t('label.percentage-value', { value: sampling.value });
  return t('message.dq-threshold-preview-sampling', { sample });
}

function formatStatisticalSentence(data: ThresholdPreviewData, t: ComposerTranslation): string {
  const { bound, effectiveRange, isBoundLearned, isPercentage, threshold } = data;
  if (isBoundLearned) {
    return threshold > 0
      ? t('message.dq-threshold-preview-statistical-learned-deviation', {
          amount: isPercentage
            ? t('label.percentage-value', { value: threshold })
            : String(threshold),
        })
      : t('message.dq-threshold-preview-statistical-learned');
  }
  if (!effectiveRange) {
    return t('message.dq-threshold-preview-statistical', { bound });
  }
  return t('message.dq-threshold-preview-statistical-deviation', {
    bound,
    amount: isPercentage
      ? t('label.percentage-value', { value: threshold })
      : String(threshold),
    range: effectiveRange,
  });
}

function formatCustomSqlSentence(
  data: ThresholdPreviewData,
  amount: string,
  t: ComposerTranslation,
): string {
  const { isPercentage, operator, operatorLabelKey, strategy, threshold } = data;
  const operatorText = operatorLabelKey ? t(operatorLabelKey) : operator;
  return strategy === CustomSqlStrategy.Count
    ? t('message.dq-threshold-preview-custom-sql-count', {
        operator: operatorText,
        value: isPercentage ? amount : threshold,
      })
    : t('message.dq-threshold-preview-custom-sql-rows', {
        operator: operatorText,
        amount,
      });
}

export function formatThresholdSentence(
  data: ThresholdPreviewData,
  t: ComposerTranslation,
): string | undefined {
  const { semantic, threshold, isPercentage, noun, target } = data;
  const amount = formatThresholdAmount(threshold, isPercentage, noun, t);
  switch (semantic) {
    case ThresholdTestSemantic.Statistical:
      return formatStatisticalSentence(data, t);
    case ThresholdTestSemantic.CustomSql:
      return formatCustomSqlSentence(data, amount, t);
    case ThresholdTestSemantic.RowCountable:
      return t('message.dq-threshold-preview-row-countable', {
        amount,
        target: target ?? t('label.column-lowercase'),
      });
    default:
      return undefined;
  }
}