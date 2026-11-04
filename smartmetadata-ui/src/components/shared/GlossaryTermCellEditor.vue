<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Input, Select, Typography } from 'ant-design-vue';
import { listGlossaryTerms } from '@/api/glossaryTerms';
import { fqnListFromCell } from '@/features/csv/metricBulkEdit';

/**
 * Official CSV glossary-terms editor (CSVUtilsClassBase
 * getCsvGlossaryTermsEditor): a glossary-term picker whose cell value is
 * term FQNs joined by ';' (fqnsToGlossaryTags splits on ';'). Options
 * come from the real glossary-term listing (first 100, client-side
 * filtered); if the listing fails, the editor falls back to a plain text
 * input so the cell stays editable instead of dead.
 */
const props = defineProps<{ modelValue: string; testId?: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const { t } = useI18n();

interface TermOption {
  value: string;
  label: string;
}

const options = ref<TermOption[]>([]);
const loadFailed = ref(false);

const selected = computed({
  get: () => fqnListFromCell(props.modelValue),
  set: (values: string[]) => {
    emit('update:modelValue', values.join(';'));
  },
});

onMounted(async () => {
  try {
    const page = await listGlossaryTerms({ limit: 100 });
    options.value = page.data
      .filter((term) => Boolean(term.fullyQualifiedName))
      .map((term) => ({
        value: term.fullyQualifiedName as string,
        label: term.displayName ?? term.name,
      }));
  } catch {
    loadFailed.value = true;
  }
});
</script>

<template>
  <Input
    v-if="loadFailed"
    :value="modelValue"
    :data-testid="testId"
    @change="(event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value)"
  />
  <template v-else>
    <Select
      v-model:value="selected"
      mode="multiple"
      show-search
      :placeholder="t('bulkImport.glossaryPlaceholder')"
      :options="options"
      :data-testid="testId"
      style="width: 100%"
      :filter-option="
        (input: string, option?: { label?: string; value?: string }) =>
          `${option?.label ?? ''} ${option?.value ?? ''}`.toLowerCase().includes(input.toLowerCase())
      "
    />
    <Typography.Text v-if="options.length === 0" type="secondary">
      {{ t('bulkImport.glossaryLoading') }}
    </Typography.Text>
  </template>
</template>
