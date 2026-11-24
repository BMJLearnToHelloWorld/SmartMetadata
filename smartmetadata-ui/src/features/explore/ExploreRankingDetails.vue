<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Typography } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import { formatScoreValue, type RankingDetails } from '@/catalog/rankingDetails';

/**
 * Ranking details section (Explore D12), rendering pin
 * `ExploreSearchCard.RankingDetailsSection`: the score, the ranking
 * stages the hit matched, the top score reasons parsed from the
 * explanation tree, and the signal boosts split from the lexical
 * score. The parent passes the details only while the Tools →
 * Ranking details toggle is on (pin's `SearchedData` gating); a null
 * prop renders nothing.
 */
defineProps<{ details: RankingDetails | null }>();

const { t } = useI18n();
</script>

<template>
  <div v-if="details" class="explore-ranking" data-testid="ranking-details">
    <div class="explore-ranking__head">
      <Typography.Text strong>{{ t('explore.rankingDetails') }}</Typography.Text>
      <Typography.Text v-if="details.score !== undefined" data-testid="ranking-score">
        {{ t('explore.rankingScore') }}: {{ formatScoreValue(details.score) }}
      </Typography.Text>
    </div>
    <div v-if="details.stages.length" class="explore-ranking__stages">
      <div
        v-for="stage in details.stages"
        :key="stage.name"
        class="explore-ranking__stage"
        :data-testid="`ranking-stage-${stage.name}`"
      >
        <Typography.Text strong class="explore-ranking__label">
          {{ stage.labelKey ? t(stage.labelKey) : stage.name }}
        </Typography.Text>
        <Typography.Text type="secondary">{{ t(stage.descriptionKey) }}</Typography.Text>
      </div>
    </div>
    <div
      v-if="details.reasons.length"
      class="explore-ranking__reasons"
      data-testid="ranking-score-explanation"
    >
      <Typography.Text strong class="explore-ranking__label">{{ t('explore.rankingReason') }}</Typography.Text>
      <div
        v-for="reason in details.reasons"
        :key="`${reason.description}-${reason.value}`"
        class="explore-ranking__contributor"
        data-testid="ranking-score-contributor"
      >
        <Typography.Text strong>{{ formatScoreValue(reason.value) }}</Typography.Text>
        <Typography.Text type="secondary">{{ reason.description }}</Typography.Text>
      </div>
    </div>
    <div
      v-if="details.boosts && details.boosts.contributions.length"
      class="explore-ranking__reasons"
      data-testid="ranking-signal-boosts"
    >
      <div class="explore-ranking__head">
        <Typography.Text strong>{{ t('explore.rankingSignalBoosts') }}</Typography.Text>
        <Typography.Text type="secondary" data-testid="ranking-signal-total">
          {{
            details.boosts.isCapped && details.boosts.maxBoost !== undefined
              ? t('explore.rankingSignalCapped', {
                  max: formatScoreValue(details.boosts.maxBoost),
                  raw: formatScoreValue(details.boosts.rawTotal),
                })
              : `+${formatScoreValue(details.boosts.total)}`
          }}
        </Typography.Text>
      </div>
      <div
        v-for="contribution in details.boosts.contributions"
        :key="`${contribution.label}-${contribution.value}`"
        class="explore-ranking__contributor"
        data-testid="ranking-signal-contributor"
      >
        <Typography.Text strong>{{ `+${formatScoreValue(contribution.value)}` }}</Typography.Text>
        <Typography.Text type="secondary">{{ contribution.label }}</Typography.Text>
      </div>
      <Typography.Text
        v-if="details.boosts.lexicalScore !== undefined"
        type="secondary"
        data-testid="ranking-score-breakdown"
      >
        {{
          t('explore.rankingScoreBreakdown', {
            lexical: formatScoreValue(details.boosts.lexicalScore),
            signals: formatScoreValue(details.boosts.total),
          })
        }}
      </Typography.Text>
    </div>
    <Typography.Text type="secondary">{{ t('explore.rankingSignalsNote') }}</Typography.Text>
  </div>
</template>

<style scoped>
.explore-ranking {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--sm-border-secondary);
  font-size: 12px;
}
.explore-ranking__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.explore-ranking__stages,
.explore-ranking__reasons {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.explore-ranking__stage {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.explore-ranking__label {
  font-size: 12px;
}
.explore-ranking__contributor {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
</style>
