/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Official testCaseThresholdSentence.utils.ts — formatThresholdAmount.
 */
import type { ComposerTranslation } from 'vue-i18n';
import {
  THRESHOLD_COUNT_NOUN_KEYS,
  THRESHOLD_NOUN_KEYS,
  type ThresholdNoun,
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