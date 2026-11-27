<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official Test Definition add/edit drawer: form on the left, English help
  panel on the right (official en-US TestDefinitionForm.md), footer 取消 / 保存.
-->
<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { Button, Drawer, Space } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import TestDefinitionFormFields from '@/components/quality/TestDefinitionFormFields.vue';
import {
  createEmptyTestDefinitionForm,
  formValuesFromDefinition,
  type TestDefinitionFormValues,
} from '@/quality/testDefinitionForm';
import {
  TEST_DEFINITION_HELP_INTRO,
  TEST_DEFINITION_HELP_SECTIONS,
} from '@/quality/testDefinitionFormDocs';
import { isSystemTestDefinition, isExternalTestDefinition } from '@/quality/testLibrary';
import type { TestDefinition } from '@/types/quality';

const props = defineProps<{
  open: boolean;
  definition?: TestDefinition;
  saving?: boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  save: [values: TestDefinitionFormValues];
}>();

const { t } = useI18n();
const form = reactive<TestDefinitionFormValues>(createEmptyTestDefinitionForm());

const isEdit = computed(() => Boolean(props.definition));
const readOnlyExceptDimension = computed(
  () =>
    isEdit.value &&
    (isSystemTestDefinition(props.definition) || isExternalTestDefinition(props.definition)),
);

const title = computed(() =>
  isEdit.value
    ? t('quality.testDefinitions.editTitle')
    : t('quality.testDefinitions.createTitle'),
);

watch(
  () => [props.open, props.definition] as const,
  ([open]) => {
    if (open) {
      Object.assign(form, formValuesFromDefinition(props.definition));
    }
  },
);

function close(): void {
  emit('update:open', false);
}

function save(): void {
  emit('save', { ...form, parameterDefinition: form.parameterDefinition.map((item) => ({ ...item })) });
}
</script>

<template>
  <Drawer
    :open="open"
    :title="title"
    placement="right"
    :width="960"
    destroy-on-close
    data-testid="test-definition-form-drawer"
    @close="close"
  >
    <div class="td-drawer" data-testid="test-definition-form-drawer">
      <div class="td-drawer__form">
        <TestDefinitionFormFields
          :form="form"
          :is-edit="isEdit"
          :read-only-except-dimension="readOnlyExceptDimension"
        />
      </div>
      <aside class="td-drawer__help" data-testid="test-definition-help-panel">
        <h2 class="td-drawer__help-title">Test Definition</h2>
        <p>{{ TEST_DEFINITION_HELP_INTRO }}</p>
        <section v-for="section in TEST_DEFINITION_HELP_SECTIONS" :key="section.id" :data-testid="`help-${section.id}`">
          <h3>{{ section.title }}</h3>
          <p v-for="(paragraph, index) in section.paragraphs" :key="index">{{ paragraph }}</p>
          <ul v-if="section.bullets">
            <li v-for="bullet in section.bullets" :key="bullet">{{ bullet }}</li>
          </ul>
          <p v-if="section.note">{{ section.note }}</p>
        </section>
      </aside>
    </div>
    <template #footer>
      <Space>
        <Button data-testid="test-definition-cancel" @click="close">
          {{ t('quality.testDefinitions.cancel') }}
        </Button>
        <Button type="primary" :loading="saving" data-testid="test-definition-save" @click="save">
          {{ t('quality.testDefinitions.save') }}
        </Button>
      </Space>
    </template>
  </Drawer>
</template>

<style scoped>
.td-drawer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 24px;
  min-height: 100%;
}
.td-drawer__help {
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  padding: 16px;
  background: #fff;
  max-height: calc(100vh - 180px);
  overflow: auto;
}
.td-drawer__help-title {
  font-size: 20px;
  margin: 0 0 12px;
}
.td-drawer__help h3 {
  margin: 16px 0 8px;
  font-size: 14px;
}
.td-drawer__help p,
.td-drawer__help li {
  font-size: 13px;
  line-height: 1.55;
  color: #3d3d3d;
}
@media (max-width: 800px) {
  .td-drawer {
    grid-template-columns: 1fr;
  }
}
</style>
