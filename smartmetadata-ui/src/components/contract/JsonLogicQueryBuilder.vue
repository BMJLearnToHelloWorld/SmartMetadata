<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Vue JSONLogic query builder for official ContractSemanticFormTab.
  Fields and operators come from official getSematicRuleFields; rule output
  is JSONLogic, then official toNegatedRule. No CCL CSS copy.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Input, Select } from 'ant-design-vue';
import {
  SEMANTIC_OPERATOR_LABEL_KEYS,
  getSematicRuleFields,
  parseSemanticTree,
  ruleStringFromTree,
  type SemanticTree,
} from '@/catalog/jsonLogicSemantic';

const props = defineProps<{
  rule?: string;
  jsonTree?: string;
  readonly?: boolean;
}>();

const emit = defineEmits<{ change: [rule: string, tree: SemanticTree] }>();
const { t } = useI18n();
const fields = getSematicRuleFields();
const tree = ref<SemanticTree>(parseSemanticTree(props.jsonTree));

watch(
  () => props.jsonTree,
  (next) => {
    tree.value = parseSemanticTree(next);
  },
);

function emitChange(): void {
  const next = tree.value;
  emit('change', ruleStringFromTree(next), next);
}

function addRule(): void {
  tree.value = {
    ...tree.value,
    rules: [...tree.value.rules, { field: '', operator: 'equal', value: '' }],
  };
  emitChange();
}

function removeRule(index: number): void {
  tree.value = {
    ...tree.value,
    rules: tree.value.rules.filter((_, i) => i !== index),
  };
  emitChange();
}

function updateAtom(index: number, patch: Partial<SemanticTree['rules'][number]>): void {
  tree.value = {
    ...tree.value,
    rules: tree.value.rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)),
  };
  emitChange();
}

function setCombinator(combinator: 'and' | 'or'): void {
  tree.value = { ...tree.value, combinator };
  emitChange();
}

const fieldOptions = computed(() =>
  fields.map((field) => ({ value: field.key, label: t(field.labelKey) })),
);

function operatorsFor(fieldKey: string) {
  const field = fields.find((item) => item.key === fieldKey);
  const ops = field?.operators ?? ['equal'];
  return ops.map((op) => ({ value: op, label: t(SEMANTIC_OPERATOR_LABEL_KEYS[op] ?? op) }));
}

function needsValue(operator: string): boolean {
  return operator !== 'is_null' && operator !== 'is_not_null';
}
</script>

<template>
  <div data-testid="query-builder-widget">
    <div v-if="!readonly" style="margin-bottom: 8px">
      <Select
        :value="tree.combinator"
        style="width: 120px"
        :options="[
          { value: 'and', label: t('label.condition-and') },
          { value: 'or', label: t('label.condition-or') },
        ]"
        @update:value="(value) => setCombinator(value as 'and' | 'or')"
      />
    </div>
    <div v-for="(rule, index) in tree.rules" :key="index" style="display: flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap">
      <Select
        :value="rule.field"
        :disabled="readonly"
        style="min-width: 180px"
        :options="fieldOptions"
        :placeholder="t('label.field')"
        @update:value="(value) => updateAtom(index, { field: String(value), operator: operatorsFor(String(value))[0]?.value ?? 'equal' })"
      />
      <Select
        :value="rule.operator"
        :disabled="readonly"
        style="min-width: 160px"
        :options="operatorsFor(rule.field)"
        :placeholder="t('label.operator')"
        @update:value="(value) => updateAtom(index, { operator: String(value) })"
      />
      <Input
        v-if="needsValue(rule.operator)"
        :value="rule.value"
        :disabled="readonly"
        style="min-width: 180px; flex: 1"
        :placeholder="t('label.value')"
        @update:value="(value) => updateAtom(index, { value: String(value ?? '') })"
      />
      <Button v-if="!readonly" data-testid="remove-rule" @click="removeRule(index)">{{ t('label.remove') }}</Button>
    </div>
    <Button v-if="!readonly" data-testid="add-new-rule-btn" @click="addRule">
      {{ t('label.add-new-entity', { entity: t('label.rule') }) }}
    </Button>
  </div>
</template>
