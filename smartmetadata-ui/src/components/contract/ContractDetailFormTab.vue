<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official ContractDetailFormTab: title, status, owners, description.
  Reports only user edits, not reset (DisplayNameOverwriteBug).
-->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Form, Input, Select } from 'ant-design-vue';
import type { DataContract, EntityRefLike } from '@/api/dataContracts';
import { hasOwnerRuleViolation } from '@/catalog/dataContractForm';
import { DATA_CONTRACT_STATUS_OPTIONS } from '@/catalog/dataContractTabs';
import { ENTITY_TYPE_TABLE } from '@/catalog/entityRules';
import ContractFormStep from '@/components/contract/ContractFormStep.vue';
import UserTeamPicker from '@/components/governance/workflowBuilder/forms/UserTeamPicker.vue';
import SmRichTextEditor from '@/components/shared/SmRichTextEditor.vue';
import { useEntityRules } from '@/composables/useEntityRules';
import type { EntityRef } from '@/types/api';

const props = defineProps<{
  initialValues?: Partial<DataContract>;
  nextLabel?: string;
  isNextVisible?: boolean;
}>();

const emit = defineEmits<{
  change: [data: Partial<DataContract>];
  next: [];
}>();

const { t } = useI18n();
const { entityRules } = useEntityRules(ENTITY_TYPE_TABLE);
const name = ref('');
const entityStatus = ref('Draft');
const owners = ref<EntityRef[]>([]);
const description = ref('');
const ownerError = ref('');

function applyOwnerError(value: EntityRef[]): void {
  ownerError.value = hasOwnerRuleViolation(value, entityRules.value)
    ? t('message.owner-multiple-users-or-single-team')
    : '';
}

function entityName(contract?: Partial<DataContract>): string {
  return contract?.displayName || contract?.name || '';
}

function seed(contract?: Partial<DataContract>): void {
  name.value = contract ? entityName(contract) : '';
  entityStatus.value = contract?.entityStatus ?? 'Draft';
  owners.value = (contract?.owners ?? []).map((owner) => ({ ...owner })) as EntityRef[];
  description.value = contract?.description ?? '';
  applyOwnerError(owners.value);
}

watch(
  () => props.initialValues,
  (next) => {
    seed(next);
  },
  { immediate: true },
);

function onNameChange(value: string): void {
  name.value = value;
  emit('change', { name: value });
}

function onStatusChange(value: string): void {
  entityStatus.value = value;
  emit('change', { entityStatus: value });
}

function onOwnersChange(value: EntityRef[]): void {
  owners.value = value;
  applyOwnerError(value);
  emit('change', { owners: value as EntityRefLike[] });
}

watch(entityRules, () => {
  applyOwnerError(owners.value);
});

function onDescriptionChange(value: string): void {
  description.value = value;
  emit('change', { description: value });
}
</script>

<template>
  <ContractFormStep
    :title="t('label.contract-detail-plural')"
    :description="t('message.contract-detail-plural-description')"
    :next-label="nextLabel"
    :is-next-visible="isNextVisible"
    @next="emit('next')"
  >
    <Form layout="vertical">
      <Form.Item :label="t('label.contract-title')" required>
        <Input
          :value="name"
          data-testid="contract-name"
          :placeholder="t('label.please-enter-entity-name', { entity: t('label.contract') })"
          @update:value="onNameChange"
        />
      </Form.Item>
      <Form.Item :label="t('label.status')">
        <Select
          :value="entityStatus"
          data-testid="contract-status"
          style="width: 100%"
          :options="DATA_CONTRACT_STATUS_OPTIONS.map((item) => ({ value: item.value, label: t(item.labelKey) }))"
          @update:value="(value) => onStatusChange(String(value))"
        />
      </Form.Item>
      <Form.Item :label="t('label.owner-plural')" :validate-status="ownerError ? 'error' : undefined" :help="ownerError || undefined">
        <UserTeamPicker
          :model-value="owners"
          test-id="contract-owners"
          @update:model-value="onOwnersChange"
        />
      </Form.Item>
      <Form.Item :label="t('label.description')">
        <SmRichTextEditor
          :key="initialValues?.id || 'new-contract'"
          :initial-value="initialValues?.description ?? ''"
          @text-change="onDescriptionChange"
        />
      </Form.Item>
    </Form>
  </ContractFormStep>
</template>
