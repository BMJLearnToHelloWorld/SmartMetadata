<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import SmDrawer from '@/components/shared/SmDrawer.vue';
import type { CreateIntakeForm, IntakeForm, TargetEntityType } from '@/api/intakeForms';
import { ENTITY_TYPE_LABEL_KEYS } from '@/views/admin/intakeFormDesigner';
import IntakeFormDesignerBody from './IntakeFormDesignerBody.vue';

const props = defineProps<{
  open: boolean;
  entityType: TargetEntityType;
  initialValue: IntakeForm | null;
  confirmLoading?: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  submit: [payload: CreateIntakeForm];
}>();

const { t } = useI18n();

const bodyRef = ref<{ submit: () => void } | null>(null);

const title = computed(() =>
  props.initialValue?.id
    ? t('intakeForms.editTitle', {
        entity: t('intakeForms.entityForm', {
          entity: t(ENTITY_TYPE_LABEL_KEYS[props.entityType]),
        }),
      })
    : t('intakeForms.addTitle', {
        entity: t('intakeForms.entityForm', {
          entity: t(ENTITY_TYPE_LABEL_KEYS[props.entityType]),
        }),
      }),
);
</script>

<template>
  <SmDrawer
    :open="open"
    :title="title"
    width-key="feed"
    test-id="intake-form-designer-modal"
    :ok-text="initialValue?.id ? t('crud.save') : t('crud.create')"
    :confirm-loading="confirmLoading ?? false"
    @cancel="emit('cancel')"
    @ok="bodyRef?.submit()"
  >
    <IntakeFormDesignerBody
      v-if="open"
      ref="bodyRef"
      :entity-type="entityType"
      :initial-value="initialValue"
      @submit="(payload: CreateIntakeForm) => emit('submit', payload)"
    />
  </SmDrawer>
</template>
