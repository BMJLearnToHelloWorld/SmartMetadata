<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official ContractSemanticFormTab: rule cards, JSONLogic builder,
  name/description/rule validation, save-gate, placeholder seed without dirtying parent.
-->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, Form, Input, Switch, message } from 'ant-design-vue';
import type { DataContract, SemanticsRule } from '@/api/dataContracts';
import { semanticRuleValidator } from '@/catalog/dataContractForm';
import type { SemanticTree } from '@/catalog/jsonLogicSemantic';
import ContractFormStep from '@/components/contract/ContractFormStep.vue';
import JsonLogicQueryBuilder from '@/components/contract/JsonLogicQueryBuilder.vue';

const props = defineProps<{
  initialValues?: Partial<DataContract>;
  nextLabel?: string;
  prevLabel?: string;
  isNextVisible?: boolean;
}>();

const emit = defineEmits<{
  change: [data: Partial<DataContract>];
  next: [];
  prev: [];
}>();

const { t } = useI18n();
const semantics = ref<SemanticsRule[]>([]);
const editingKey = ref<number | null>(null);
const dirty = ref(false);

function seed(): void {
  const initial = props.initialValues?.semantics;
  semantics.value = !initial || initial.length === 0 ? [{ enabled: true, name: '', rule: '' }] : initial.map((rule) => ({ ...rule }));
  editingKey.value = 0;
  dirty.value = false;
}

watch(
  () => props.initialValues,
  () => {
    seed();
  },
  { immediate: true },
);

function reportChange(): void {
  if (!dirty.value) {
    return;
  }
  emit('change', { semantics: semantics.value });
}

function markDirty(next: SemanticsRule[]): void {
  semantics.value = next;
  dirty.value = true;
  reportChange();
}

function addSemantic(): void {
  if (editingKey.value !== null) {
    return;
  }
  markDirty([...semantics.value, { enabled: true, name: '', rule: '' }]);
  editingKey.value = semantics.value.length - 1;
}

function deleteSemantic(index: number): void {
  markDirty(semantics.value.filter((_, i) => i !== index));
  editingKey.value = null;
}

function updateRule(index: number, patch: Partial<SemanticsRule>): void {
  markDirty(semantics.value.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
}

function onBuilderChange(index: number, rule: string, tree: SemanticTree): void {
  updateRule(index, { rule, jsonTree: JSON.stringify(tree) });
}

function handleSaveRule(index: number): void {
  const current = semantics.value[index];
  if (!current?.name) {
    message.error(t('message.field-text-is-required', { fieldText: t('label.name') }));
    return;
  }
  if (!current.description) {
    message.error(t('message.field-text-is-required', { fieldText: t('label.description') }));
    return;
  }
  if (semanticRuleValidator(current.rule) !== true) {
    message.error(t('message.field-text-is-required', { fieldText: t('label.rule') }));
    return;
  }
  editingKey.value = null;
}
</script>

<template>
  <ContractFormStep
    :title="t('label.semantic-plural')"
    :description="t('message.semantics-description')"
    :next-label="nextLabel"
    :prev-label="prevLabel"
    :is-next-visible="isNextVisible"
    show-prev
    @next="emit('next')"
    @prev="emit('prev')"
  >
    <template #extra>
      <Button data-testid="add-semantic-button" :disabled="editingKey !== null" @click="addSemantic">
        {{ t('label.add-entity', { entity: t('label.semantic-plural') }) }}
      </Button>
    </template>
    <Card
      v-for="(semantic, index) in semantics"
      :key="index"
      :data-testid="`contract-semantics-card-${index}`"
      style="margin-bottom: 12px"
    >
      <div v-if="editingKey !== index" style="display: flex; justify-content: space-between; gap: 12px">
        <div>
          <Switch :checked="Boolean(semantic.enabled)" @update:checked="(value) => updateRule(index, { enabled: Boolean(value) })" />
          <strong style="margin-left: 8px">{{ semantic.name || t('label.untitled') }}</strong>
          <div>{{ semantic.description || t('label.no-description') }}</div>
        </div>
        <div>
          <Button :data-testid="`edit-semantic-${index}`" @click="editingKey = index">{{ t('label.edit') }}</Button>
          <Button danger :data-testid="`delete-semantic-${index}`" @click="deleteSemantic(index)">{{ t('label.delete') }}</Button>
        </div>
      </div>
      <Form v-else layout="vertical">
        <Form.Item :label="t('label.name')" required>
          <Input :id="`semantics_${index}_name`" :value="semantic.name" @update:value="(value) => updateRule(index, { name: String(value ?? '') })" />
        </Form.Item>
        <Form.Item :label="t('label.description')" required>
          <Input.TextArea :id="`semantics_${index}_description`" :value="semantic.description" :rows="3" @update:value="(value) => updateRule(index, { description: String(value ?? '') })" />
        </Form.Item>
        <Form.Item :label="t('label.rule')" required>
          <JsonLogicQueryBuilder
            :rule="semantic.rule"
            :json-tree="semantic.jsonTree"
            @change="(rule, tree) => onBuilderChange(index, rule, tree)"
          />
        </Form.Item>
        <div style="display: flex; justify-content: flex-end; gap: 8px">
          <Button @click="editingKey = null">{{ t('label.cancel') }}</Button>
          <Button type="primary" data-testid="save-semantic-button" @click="handleSaveRule(index)">{{ t('label.save') }}</Button>
        </div>
      </Form>
      <div v-if="editingKey !== index" class="semantic-rule-editor-view-only">
        <JsonLogicQueryBuilder readonly :rule="semantic.rule" :json-tree="semantic.jsonTree" />
      </div>
    </Card>
  </ContractFormStep>
</template>
