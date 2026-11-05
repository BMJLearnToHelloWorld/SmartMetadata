<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, Form, Input, Space, Typography } from 'ant-design-vue';
import { explainOntologyInference } from '@/api/ontologyEdit';
import type { OntologyInferenceExplanation } from '@/types/ontologyEdit';

defineProps<{
  canEdit: boolean;
}>();

const { t } = useI18n();

const glossaryId = ref('');
const statement = ref('');
const result = ref<OntologyInferenceExplanation | null>(null);
const errorMessage = ref('');
const busy = ref(false);

async function onExplain(): Promise<void> {
  if (!glossaryId.value || !statement.value) {
    return;
  }
  busy.value = true;
  errorMessage.value = '';
  try {
    result.value = await explainOntologyInference({ glossaryId: glossaryId.value, statement: statement.value });
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('ontology.edit.reasoningFailed');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Card data-testid="ontology-reasoning-panel" style="margin-bottom: 16px">
    <Space direction="vertical" style="width: 100%">
      <Typography.Text strong>{{ t('ontology.edit.reasoningTitle') }}</Typography.Text>
      <Typography.Text v-if="errorMessage" type="danger">{{ errorMessage }}</Typography.Text>
      <Form layout="inline" data-testid="ontology-reasoning-form">
        <Form.Item :label="t('ontology.edit.glossaryId')"><Input v-model:value="glossaryId" data-testid="ontology-reasoning-glossary" /></Form.Item>
        <Form.Item :label="t('ontology.edit.statement')"><Input v-model:value="statement" data-testid="ontology-reasoning-statement" /></Form.Item>
        <Form.Item>
          <Button :loading="busy" data-testid="ontology-reasoning-explain" @click="onExplain">
            {{ t('ontology.edit.explain') }}
          </Button>
        </Form.Item>
      </Form>
      <div v-if="result" data-testid="ontology-reasoning-result">
        <Typography.Text>{{ t('ontology.edit.asserted', { items: (result.asserted ?? []).join(', ') }) }}</Typography.Text>
        <br />
        <Typography.Text>{{ t('ontology.edit.inferred', { items: (result.inferred ?? []).join(', ') }) }}</Typography.Text>
        <ul>
          <li v-for="(item, index) in result.explanations" :key="index">
            {{ item.statement ?? '' }}
            <span v-if="item.rule">({{ item.rule }})</span>
            <ul v-if="item.derivation">
              <li v-for="(step, stepIndex) in item.derivation" :key="stepIndex">{{ step }}</li>
            </ul>
          </li>
        </ul>
      </div>
    </Space>
  </Card>
</template>
