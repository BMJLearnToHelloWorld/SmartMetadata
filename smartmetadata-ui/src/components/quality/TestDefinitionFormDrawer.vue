<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official TestDefinitionForm drawer: ShowHintToggle, FORM_DRAWER_WIDTH_*,
  form column + optional TestDefinitionForm.md help panel (no CCL copy).
-->
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import SmDrawer from '@/components/shared/SmDrawer.vue';
import ShowHintToggle from '@/components/quality/ShowHintToggle.vue';
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
  errorMessage?: string;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  save: [values: TestDefinitionFormValues];
  'dismiss-error': [];
}>();

const { t } = useI18n();
const form = reactive<TestDefinitionFormValues>(createEmptyTestDefinitionForm());
/** Official ShowHintToggle default is true (TestDefinitionForm.component.tsx). */
const showHint = ref(true);

const isEdit = computed(() => Boolean(props.definition));
const readOnlyExceptDimension = computed(
  () =>
    isEdit.value &&
    (isSystemTestDefinition(props.definition) || isExternalTestDefinition(props.definition)),
);

const title = computed(() =>
  isEdit.value
    ? t('label.edit-entity', { entity: t('label.test-definition') })
    : t('label.add-entity', { entity: t('label.test-definition') }),
);

const drawerWidthKey = computed(() => (showHint.value ? 'formWithHint' : 'formWithoutHint'));

watch(
  () => [props.open, props.definition] as const,
  ([open]) => {
    if (open) {
      Object.assign(form, formValuesFromDefinition(props.definition));
      showHint.value = true;
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
  <SmDrawer
    :open="open"
    :title="title"
    :width-key="drawerWidthKey"
    :confirm-loading="saving"
    test-id="test-definition-form-drawer"
    ok-test-id="test-definition-save"
    cancel-test-id="test-definition-cancel"
    :ok-text="isEdit ? t('label.update') : t('label.create')"
    :cancel-text="t('label.cancel')"
    @update:open="(value) => emit('update:open', value)"
    @ok="save"
    @cancel="close"
  >
    <template #headerActions>
      <ShowHintToggle v-model="showHint" />
    </template>
    <div class="td-drawer" :class="{ 'td-drawer--with-hint': showHint }">
      <div class="td-drawer__form">
        <TestDefinitionFormFields
          :form="form"
          :is-edit="isEdit"
          :read-only-except-dimension="readOnlyExceptDimension"
          :error-message="errorMessage"
          @dismiss-error="emit('dismiss-error')"
        />
      </div>
      <aside v-if="showHint" class="td-drawer__help" data-testid="test-definition-help-panel">
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
  </SmDrawer>
</template>

<style scoped>
.td-drawer {
  display: grid;
  gap: 24px;
  min-height: 100%;
}
.td-drawer--with-hint {
  grid-template-columns: minmax(0, 1fr) 320px;
}
.td-drawer__help {
  border: 1px solid var(--sm-border-secondary);
  border-radius: 8px;
  padding: 16px;
  background: var(--sm-bg-container);
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
  color: var(--sm-text-secondary);
}
@media (max-width: 800px) {
  .td-drawer--with-hint {
    grid-template-columns: 1fr;
  }
}
</style>