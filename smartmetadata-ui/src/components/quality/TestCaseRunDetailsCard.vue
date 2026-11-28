<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official RunDetailsCard — core run summary fields (no Collate threshold bars).
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TestCase, TestCaseResult } from '@/types/quality';
import { getRunDetails } from '@/quality/runDetailsCard.utils';

const props = defineProps<{
  testCase: TestCase;
  selectedRun?: TestCaseResult;
}>();

const { t } = useI18n();

const details = computed(() =>
  props.selectedRun ? getRunDetails(props.testCase, props.selectedRun) : undefined,
);
</script>

<template>
  <article
    v-if="details && selectedRun"
    class="run-details-card"
    data-testid="run-details-card"
    :data-timestamp="selectedRun.timestamp"
  >
    <header class="run-details-card__header">
      <span class="run-details-card__status" :data-status="details.status">{{ details.status ?? '—' }}</span>
    </header>
    <dl class="run-details-card__grid">
      <div>
        <dt>{{ t('label.found') }}</dt>
        <dd data-testid="run-details-found">{{ details.foundText }}</dd>
      </div>
      <div>
        <dt>{{ t('label.expected') }}</dt>
        <dd data-testid="run-details-expected">{{ details.expectedText }}</dd>
      </div>
    </dl>
  </article>
</template>

<style scoped>
.run-details-card {
  border: 1px solid var(--sm-border-color, #e8e8e8);
  border-radius: 12px;
  padding: 16px;
  background: var(--sm-bg-container, #fff);
}
.run-details-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-weight: 600;
}
.run-details-card__duration {
  font-size: 12px;
  color: var(--sm-text-secondary);
  font-weight: 400;
}
.run-details-card__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin: 0;
}
.run-details-card__grid dt {
  font-size: 12px;
  color: var(--sm-text-secondary);
}
.run-details-card__grid dd {
  margin: 4px 0 0;
  font-weight: 600;
}
</style>