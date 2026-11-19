<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { CloseOutlined } from '@ant-design/icons-vue';
import { Button, Select, Switch } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import { useAlertRuleKeys } from '@/composables/useAlertRuleKeys';
import type { AlertSelectionState } from '@/composables/useAlertSelection';
import type { ArgumentsInput, RuleSectionField } from '@/types/notifications';
import type { AlertSearchHooks } from '@/utils/notifications/alertSourceSearch';
import type { TranslateFn } from '@/utils/notifications/alertUtils';
import type { AlertFormValidationErrors } from '@/utils/notifications/alertValidation';
import {
  getRuleCopy,
  getRuleItems,
  getRulesWithAddedRule,
  getRulesWithEffect,
  getRulesWithName,
  getRulesWithoutIndex,
  getRuntimeArguments,
  getValidationPath,
} from '@/utils/notifications/alertFormUtils';
import AlertFormSection from './AlertFormSection.vue';
import FQNListSelect from './FQNListSelect.vue';
import RuleArgumentField from './RuleArgumentField.vue';

/**
 * One Filters/Triggers section, ported from pin
 * components/Alerts/ClassicAlertRuleSection.tsx. Each rule names one
 * offered rule, fills its runtime arguments, and chooses include or
 * exclude; a rule on offer can be chosen once.
 */
const props = withDefaults(
  defineProps<{
    field: RuleSectionField;
    title: string;
    isViewOnly?: boolean;
    rules: ArgumentsInput[];
    selection: AlertSelectionState;
    validationErrors?: AlertFormValidationErrors;
    hooks: AlertSearchHooks;
  }>(),
  { isViewOnly: false, validationErrors: undefined },
);
const emit = defineEmits<{ 'update:rules': [rules: ArgumentsInput[]] }>();

const { t } = useI18n();
const translate = t as unknown as TranslateFn;

const ARGUMENT_TEST_IDS: Record<string, string> = {
  fqnList: 'fqn-list-select',
  domainList: 'domain-select',
  tableNameList: 'table-name-select',
  entityNameList: 'entity-name-select',
  ownerNameList: 'owner-name-select',
  updateByUserList: 'user-name-select',
  userList: 'user-name-select',
  entityIdList: 'entity-id-select',
  testSuiteList: 'test-suite-select',
  eventTypeList: 'event-type-select',
  pipelineStateList: 'pipeline-status-select',
  ingestionPipelineStateList: 'pipeline-status-select',
  testStatusList: 'test-status-select',
  testResultList: 'test-result-select',
  contractStatusList: 'contract-status-select',
};

const prefix = computed(() => (props.field === 'filters' ? 'filter' : 'trigger'));
const supportedRules = computed(() =>
  props.field === 'filters'
    ? props.selection.support.supportedFilters
    : props.selection.support.supportedTriggers,
);
const copy = computed(() => getRuleCopy(props.field, translate));
const items = computed(() => getRuleItems(supportedRules.value, props.rules));
const ruleArguments = computed(() =>
  props.rules.map((rule) => getRuntimeArguments(rule, supportedRules.value)),
);
const { keys, removeKey } = useAlertRuleKeys(() => props.rules.length);

function nameError(ruleIndex: number): string | undefined {
  return props.validationErrors?.[getValidationPath('input', props.field, ruleIndex, 'name')];
}

function argumentError(ruleIndex: number, index: number): string | undefined {
  return props.validationErrors?.[
    getValidationPath('input', props.field, ruleIndex, 'arguments', index, 'input')
  ];
}

function onRuleName(ruleIndex: number, key: string | null): void {
  if (key !== null) {
    emit(
      'update:rules',
      getRulesWithName({
        index: ruleIndex,
        ruleName: key,
        selectedRules: props.rules,
        supportedRules: supportedRules.value,
      }),
    );
  }
}

function onArgumentInput(ruleIndex: number, index: number, next: string[]): void {
  const nextRules = props.rules.map((rule, position) => {
    if (position !== ruleIndex) {
      return rule;
    }
    const args = [...(rule.arguments ?? [])];
    while (args.length <= index) {
      args.push({});
    }
    args[index] = { ...args[index], input: next };
    return { ...rule, arguments: args };
  });
  emit('update:rules', nextRules);
}

function onEffect(ruleIndex: number, included: boolean): void {
  emit('update:rules', getRulesWithEffect(props.rules, ruleIndex, included));
}

function onRemove(ruleIndex: number): void {
  removeKey(ruleIndex);
  emit('update:rules', getRulesWithoutIndex(props.rules, ruleIndex));
}

function onAdd(): void {
  emit('update:rules', getRulesWithAddedRule(props.rules));
}
</script>

<template>
  <AlertFormSection :heading="title" :sub-heading="copy.description">
    <div :data-testid="field === 'filters' ? 'filters-list' : 'triggers-list'">
      <div
        v-for="(rule, ruleIndex) in rules"
        :key="keys[ruleIndex]"
        :data-testid="`${prefix}-${ruleIndex}`"
        class="alert-rule-section__row"
      >
        <div class="alert-rule-section__fields">
          <div class="alert-rule-section__cell">
            <Select
              :value="rule.name || undefined"
              :aria-label="copy.label"
              :data-testid="`${prefix}-select-${ruleIndex}`"
              :disabled="isViewOnly"
              :placeholder="copy.placeholder"
              :status="nameError(ruleIndex) ? 'error' : undefined"
              style="width: 100%"
              @change="(key) => onRuleName(ruleIndex, key === undefined ? null : String(key))"
            >
              <Select.Option
                v-for="item in items"
                :key="item.id"
                :value="item.id"
                :disabled="item.isDisabled"
              >
                <span :data-testid="`${item.label ?? item.id}-filter-option`">{{
                  item.label
                }}</span>
              </Select.Option>
            </Select>
            <div v-if="nameError(ruleIndex)" class="alert-rule-section__hint">
              {{ nameError(ruleIndex) }}
            </div>
          </div>
          <div
            v-for="(argument, argIndex) in ruleArguments[ruleIndex]"
            :key="argument"
            class="alert-rule-section__cell"
          >
            <FQNListSelect
              v-if="argument === 'fqnList'"
              :api="selection.search.byName"
              :container-entities="selection.search.containerEntities"
              test-id="fqn-list-select"
              :hint="argumentError(ruleIndex, argIndex)"
              :disabled="isViewOnly"
              :placeholder="
                t('label.search-by-type', { type: t('label.fqn-uppercase') })
              "
              :search-index="selection.search.indexes"
              :value="rule.arguments?.[argIndex]?.input ?? []"
              :hooks="hooks"
              @update:value="(next) => onArgumentInput(ruleIndex, argIndex, next)"
            />
            <RuleArgumentField
              v-else
              is-label-hidden
              :argument="argument"
              :input-value="rule.arguments?.[argIndex]?.input"
              :is-view-only="isViewOnly"
              :test-id="ARGUMENT_TEST_IDS[argument]"
              :error="argumentError(ruleIndex, argIndex)"
              :source-search="selection.search"
              :supported-event-types="selection.support.supportedEventTypes"
              :hooks="hooks"
              @update:input="(next) => onArgumentInput(ruleIndex, argIndex, next)"
            />
          </div>
        </div>
        <div class="alert-rule-section__include">
          <span>{{ t('label.include') }}</span>
          <Switch
            size="small"
            :aria-label="t('label.include')"
            :data-testid="`${prefix}-switch-${ruleIndex}`"
            :disabled="isViewOnly"
            :checked="rule.effect !== 'exclude'"
            @change="(included) => onEffect(ruleIndex, Boolean(included))"
          />
        </div>
        <Button
          v-if="!isViewOnly"
          type="text"
          size="small"
          :aria-label="t('label.remove-entity', { entity: copy.label })"
          :data-testid="`remove-${prefix}-${ruleIndex}`"
          @click="onRemove(ruleIndex)"
        >
          <template #icon><CloseOutlined /></template>
        </Button>
      </div>
      <div v-if="!isViewOnly && rules.length < (supportedRules?.length ?? 1)">
        <Button
          type="primary"
          size="small"
          :data-testid="field === 'filters' ? 'add-filters' : 'add-trigger'"
          :disabled="selection.sources.length === 0 || supportedRules === undefined"
          @click="onAdd"
        >
          {{ t('label.add-entity', { entity: copy.label }) }}
        </Button>
      </div>
    </div>
  </AlertFormSection>
</template>

<style scoped>
.alert-rule-section__row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin-bottom: 16px;
}

.alert-rule-section__fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.alert-rule-section__include {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.alert-rule-section__hint {
  color: var(--sm-color-error);
  font-size: 12px;
  margin-top: 4px;
}
</style>
