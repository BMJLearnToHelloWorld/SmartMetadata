<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official ContractTermsOfService: BlockEditor on termsOfUse.content.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { DataContract } from '@/api/dataContracts';
import { termsOfUseContent } from '@/catalog/dataContractForm';
import ContractFormStep from '@/components/contract/ContractFormStep.vue';
import SmRichTextEditor from '@/components/shared/SmRichTextEditor.vue';

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
const content = computed(() => termsOfUseContent(props.initialValues?.termsOfUse));

function onChange(value: string): void {
  emit('change', { termsOfUse: { content: value } });
}
</script>

<template>
  <ContractFormStep
    :title="t('label.terms-of-service')"
    :description="t('message.data-contract-terms-of-service-description')"
    :next-label="nextLabel"
    :prev-label="prevLabel"
    :is-next-visible="isNextVisible"
    show-prev
    @next="emit('next')"
    @prev="emit('prev')"
  >
    <SmRichTextEditor
      :key="initialValues?.id || 'new-terms'"
      :initial-value="content ?? ''"
      data-testid="contract-terms-editor"
      @text-change="onChange"
    />
  </ContractFormStep>
</template>
