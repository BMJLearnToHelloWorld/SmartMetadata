<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { CheckCircleFilled, CloseCircleFilled, MinusCircleOutlined } from '@ant-design/icons-vue';
import type { DataContractResult, SemanticsRule } from '@/api/dataContracts';
import SmMarkdown from '@/components/shared/SmMarkdown.vue';
import ContractConstraintStatus from './ContractConstraintStatus.vue';
import ContractInheritedBadge from './ContractInheritedBadge.vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  semantics: SemanticsRule[];
  latestContractResults?: DataContractResult;
  contractStatus?: string;
}>();

const { t } = useI18n();

function ruleIcon(semantic: SemanticsRule): 'minus' | 'failed' | 'passed' {
  if (!props.latestContractResults || !semantic.enabled) {
    return 'minus';
  }
  const failed = props.latestContractResults.semanticsValidation?.failedRules?.some(
    (rule) => rule.ruleName === semantic.name,
  );
  return failed ? 'failed' : 'passed';
}
</script>

<template>
  <div class="contract-semantic-component-container">
    <div class="rule-item-container">
      <div v-for="item in semantics" :key="item.rule || item.name" class="rule-item">
        <MinusCircleOutlined v-if="ruleIcon(item) === 'minus'" class="rule-icon rule-icon--default" />
        <CloseCircleFilled v-else-if="ruleIcon(item) === 'failed'" class="rule-icon rule-icon--failed" />
        <CheckCircleFilled v-else class="rule-icon rule-icon--passed" />
        <div class="rule-item-content">
          <div class="rule-name-row">
            <span class="rule-name">{{ item.name }}</span>
            <ContractInheritedBadge v-if="item.inherited" entity-key="label.semantic-plural" />
          </div>
          <div v-if="item.description" class="rule-description">
            <SmMarkdown :markdown="item.description" />
          </div>
        </div>
      </div>
    </div>
    <div v-if="contractStatus" class="contract-status-container">
      <span class="contract-status-label">{{ t('label.entity-status', { entity: t('label.semantic-plural') }) }} :</span>
      <ContractConstraintStatus :status="contractStatus" test-id="contract-status-card-item-semantics-status" />
    </div>
  </div>
</template>

<style scoped>
.contract-semantic-component-container { display: flex; gap: 20px; align-items: flex-start; }
.rule-item-container { flex: 1; display: flex; flex-direction: column; gap: 12px; }
.rule-item { display: flex; gap: 8px; }
.rule-icon { font-size: 20px; flex-shrink: 0; margin-top: 1px; }
.rule-icon--default { color: var(--sm-text-quaternary); }
.rule-icon--failed { color: var(--sm-color-error); }
.rule-icon--passed { color: var(--sm-color-success); }
.rule-name-row { display: flex; align-items: center; gap: 6px; }
.rule-name { font-weight: 600; color: var(--sm-text-primary); }
.rule-description { color: var(--sm-text-secondary); }
.contract-status-container { display: flex; align-items: center; gap: 12px; }
</style>
