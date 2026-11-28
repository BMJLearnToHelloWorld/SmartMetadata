<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official TestCaseConfigurationCard (IncidentManager TestCaseResultTab).
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, Typography } from 'ant-design-vue';
import { EditOutlined } from '@ant-design/icons-vue';
import type { TestCase, TestDefinition, TestParameterValue } from '@/types/quality';
import type { ConfigurationParameterRow } from '@/quality/testCaseResultTab.utils';
import {
  getCategoryLine,
  getConfiguredThresholdSentence,
  getDefinitionDisplayName,
} from '@/quality/testCaseResultTab.utils';

const props = defineProps<{
  testCase: TestCase;
  testDefinition?: TestDefinition;
  parameterRows: ConfigurationParameterRow[];
  withSqlParams: TestParameterValue[];
  showEditButton?: boolean;
}>();

const emit = defineEmits<{
  editParameter: [];
}>();

const { t } = useI18n();

const definitionName = computed(() => getDefinitionDisplayName(props.testDefinition ?? props.testCase.testDefinition));
const categoryLine = computed(() => getCategoryLine(props.testCase, t));

const isDynamicAssertion = computed(() => Boolean(props.testCase.useDynamicAssertion));

const thresholdSentence = computed(() =>
  getConfiguredThresholdSentence(props.testCase, props.testDefinition ?? props.testCase.testDefinition, t),
);

const isEmpty = computed(
  () =>
    !isDynamicAssertion.value &&
    props.parameterRows.length === 0 &&
    props.withSqlParams.length === 0,
);

function sqlLines(value: string): string[] {
  return value.split('\n');
}
</script>

<template>
  <div class="tc-config-card" data-testid="test-case-configuration-card">
    <div class="tc-config-card__header">
      <span class="tc-config-card__title" data-testid="configuration-title">
        {{ t('label.configuration') }}
      </span>
      <Button
        v-if="showEditButton"
        type="text"
        size="small"
        data-testid="edit-parameter-icon"
        :title="t('label.edit-entity', { entity: t('label.parameter') })"
        @click="emit('editParameter')"
      >
        <EditOutlined />
      </Button>
    </div>
    <div class="tc-config-card__body">
      <div v-if="definitionName || categoryLine" class="tc-config-card__intro">
        <Typography.Paragraph
          v-if="definitionName"
          class="tc-config-card__test-name"
          data-testid="configuration-test-name"
        >
          {{ definitionName }}
        </Typography.Paragraph>
        <Typography.Paragraph
          v-if="categoryLine"
          class="tc-config-card__category"
          data-testid="configuration-category"
        >
          {{ categoryLine }}
        </Typography.Paragraph>
        <Typography.Paragraph
          v-if="thresholdSentence"
          class="tc-config-card__threshold-sentence"
          data-testid="configuration-threshold-sentence"
        >
          {{ thresholdSentence }}
        </Typography.Paragraph>
      </div>
      <div v-if="isDynamicAssertion" class="tc-config-card__dynamic" data-testid="dynamic-assertion">
        <div class="tc-config-card__dynamic-title">{{ t('label.dynamic-assertion') }}</div>
        <div class="tc-config-card__dynamic-sub">{{ t('message.bounds-learned-automatically') }}</div>
      </div>
      <div
        v-if="parameterRows.length"
        class="tc-config-card__rows"
        data-testid="configuration-parameter-rows"
      >
        <div
          v-for="row in parameterRows"
          :key="row.name ?? row.label"
          class="tc-config-card__row"
          :data-testid="`configuration-parameter-${row.name ?? row.label}`"
        >
          <span class="tc-config-card__row-label">{{ row.label }}</span>
          <span class="tc-config-card__row-value">{{ row.value }}</span>
        </div>
      </div>
      <div v-for="param in withSqlParams" :key="param.name">
        <Card
          size="small"
          class="tc-config-card__sql"
          data-testid="sql-expression-container"
          :title="t('label.sql-query')"
        >
          <pre class="tc-config-card__sql-pre"><template v-for="(line, index) in sqlLines(param.value ?? '')" :key="index">{{ line }}
</template></pre>
        </Card>
      </div>
      <Typography.Paragraph
        v-if="isEmpty"
        class="tc-config-card__empty"
        data-testid="configuration-empty-state"
      >
        {{ t('message.no-configurable-parameters') }}
      </Typography.Paragraph>
    </div>
  </div>
</template>

<style scoped>
.tc-config-card {
  border: 1px solid var(--sm-border-color);
  border-radius: var(--sm-radius-lg, 12px);
  background: var(--sm-bg-container);
  overflow: hidden;
}

.tc-config-card__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--sm-border-color);
}

.tc-config-card__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--sm-text-tertiary);
}

.tc-config-card__body {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tc-config-card__test-name {
  margin: 0 !important;
  font-weight: 600;
  font-size: 14px;
}

.tc-config-card__category {
  margin: 0 !important;
  font-size: 12px;
  color: var(--sm-text-tertiary);
}

.tc-config-card__threshold-sentence {
  margin: 4px 0 0 !important;
  font-size: 12px;
  color: var(--sm-text-secondary);
}

.tc-config-card__dynamic {
  font-size: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--sm-color-primary-50);
  background: var(--sm-color-primary-bg);
}

.tc-config-card__dynamic-title {
  font-weight: 600;
  color: var(--sm-color-primary);
}

.tc-config-card__dynamic-sub {
  margin-top: 2px;
  color: var(--sm-text-secondary);
}

.tc-config-card__rows {
  border: 1px solid var(--sm-border-color);
  border-radius: 8px;
  overflow: hidden;
}

.tc-config-card__row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  font-size: 12px;
  border-bottom: 1px solid var(--sm-border-color);
}

.tc-config-card__row:last-child {
  border-bottom: none;
}

.tc-config-card__row-value {
  font-family: ui-monospace, monospace;
  font-weight: 600;
  text-align: right;
  word-break: break-word;
  max-width: 65%;
}

.tc-config-card__sql-pre {
  margin: 0;
  font-size: 11px;
  white-space: pre-wrap;
  font-family: ui-monospace, monospace;
}

.tc-config-card__empty {
  margin: 0 !important;
  font-size: 12px;
  color: var(--sm-text-tertiary);
}
</style>