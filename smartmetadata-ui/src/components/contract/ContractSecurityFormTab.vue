<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official ContractSecurityFormTab: dataClassification, policies,
  identities, and rowFilters only for TABLE / DASHBOARD_DATA_MODEL.
  Empty-policy seed does not dirty the parent.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, Form, Input, Select } from 'ant-design-vue';
import type { ContractSecurity, ContractSecurityPolicy, DataContract } from '@/api/dataContracts';
import { SUPPORTED_ROW_FILTER_ENTITIES } from '@/catalog/dataContractTabs';
import ContractFormStep from '@/components/contract/ContractFormStep.vue';

const props = defineProps<{
  entityType: string;
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
const hasRowFilters = computed(() => (SUPPORTED_ROW_FILTER_ENTITIES as readonly string[]).includes(props.entityType));
const dirty = ref(false);
const dataClassification = ref('');
const policies = ref<ContractSecurityPolicy[]>([{ accessPolicy: '', identities: [], rowFilters: [{ columnName: '', values: [] }] }]);
const editingKey = ref<number | null>(0);

function seed(): void {
  const security = props.initialValues?.security;
  dataClassification.value = security?.dataClassification ?? '';
  policies.value = !security || !security.policies?.length
    ? [{ accessPolicy: '', identities: [], rowFilters: [{ columnName: '', values: [] }] }]
    : security.policies.map((policy) => ({
        accessPolicy: policy.accessPolicy ?? '',
        identities: [...(policy.identities ?? [])],
        rowFilters: (policy.rowFilters?.length ? policy.rowFilters : [{ columnName: '', values: [] }]).map((filter) => ({
          columnName: filter.columnName ?? '',
          values: [...(filter.values ?? [])],
        })),
      }));
  dirty.value = false;
  editingKey.value = 0;
}

watch(() => props.initialValues, seed, { immediate: true });

function toSecurity(): ContractSecurity {
  return {
    dataClassification: dataClassification.value,
    policies: policies.value.map((policy) => ({
      accessPolicy: policy.accessPolicy,
      identities: policy.identities,
      rowFilters: policy.rowFilters,
    })),
  };
}

function report(): void {
  dirty.value = true;
  emit('change', { security: toSecurity() });
}

function addPolicy(): void {
  if (editingKey.value !== null) {
    return;
  }
  policies.value = [...policies.value, { accessPolicy: '', identities: [], rowFilters: [{ columnName: '', values: [] }] }];
  editingKey.value = policies.value.length - 1;
  report();
}

function deletePolicy(index: number): void {
  policies.value = policies.value.filter((_, i) => i !== index);
  editingKey.value = null;
  report();
}

function addRowFilter(policyIndex: number): void {
  policies.value = policies.value.map((policy, i) =>
    i === policyIndex
      ? { ...policy, rowFilters: [...(policy.rowFilters ?? []), { columnName: '', values: [] }] }
      : policy,
  );
  report();
}

function removeRowFilter(policyIndex: number, filterIndex: number): void {
  policies.value = policies.value.map((policy, i) =>
    i === policyIndex
      ? { ...policy, rowFilters: (policy.rowFilters ?? []).filter((_, j) => j !== filterIndex) }
      : policy,
  );
  report();
}
</script>

<template>
  <ContractFormStep
    :title="t('label.security')"
    :description="t('message.data-contract-security-description')"
    :next-label="nextLabel"
    :prev-label="prevLabel"
    :is-next-visible="isNextVisible"
    show-prev
    @next="emit('next')"
    @prev="emit('prev')"
  >
    <template #extra>
      <Button data-testid="add-policy-button" :disabled="editingKey !== null" @click="addPolicy">
        {{ t('label.add-entity', { entity: t('label.policy') }) }}
      </Button>
    </template>
    <Form layout="vertical">
      <Form.Item :label="t('label.data-classification')">
        <Input
          data-testid="data-classification-input"
          :value="dataClassification"
          @update:value="(value) => { dataClassification = String(value ?? ''); report(); }"
        />
      </Form.Item>
      <h4>{{ t('label.policy-plural') }}</h4>
      <p>{{ t('message.contract-security-consume-description') }}</p>
      <Card v-for="(policy, policyIndex) in policies" :key="policyIndex" style="margin-bottom: 12px" :data-testid="`contract-security-policy-${policyIndex}`">
        <div v-if="editingKey !== policyIndex" style="display: flex; justify-content: space-between">
          <div>
            <strong>{{ policy.accessPolicy || t('label.untitled') }}</strong>
            <div>{{ (policy.identities ?? []).join(', ') }}</div>
          </div>
          <div>
            <Button @click="editingKey = policyIndex">{{ t('label.edit') }}</Button>
            <Button danger @click="deletePolicy(policyIndex)">{{ t('label.delete') }}</Button>
          </div>
        </div>
        <div v-else>
          <Form.Item :label="t('label.access-policy')">
            <Input :value="policy.accessPolicy" @update:value="(value) => { policy.accessPolicy = String(value ?? ''); report(); }" />
          </Form.Item>
          <Form.Item :label="t('label.identities')">
            <Select
              mode="tags"
              :value="policy.identities"
              style="width: 100%"
              :options="(policy.identities ?? []).map((item) => ({ value: item, label: item }))"
              @update:value="(value) => { policy.identities = (value as string[]) ?? []; report(); }"
            />
          </Form.Item>
          <template v-if="hasRowFilters">
            <div v-for="(filter, filterIndex) in policy.rowFilters ?? []" :key="filterIndex" style="display: flex; gap: 8px; margin-bottom: 8px">
              <Input
                :data-testid="`columnName-input-${policyIndex}-${filterIndex}`"
                :value="filter.columnName"
                :placeholder="t('label.please-enter-entity-name', { entity: t('label.column') })"
                @update:value="(value) => { filter.columnName = String(value ?? ''); report(); }"
              />
              <Select
                mode="tags"
                style="flex: 1"
                :data-testid="`values-${policyIndex}-${filterIndex}`"
                :value="filter.values"
                @update:value="(value) => { filter.values = (value as string[]) ?? []; report(); }"
              />
              <Button @click="removeRowFilter(policyIndex, filterIndex)">{{ t('label.remove') }}</Button>
            </div>
            <Button @click="addRowFilter(policyIndex)">{{ t('label.add-entity', { entity: t('label.row-filter') }) }}</Button>
          </template>
          <div style="margin-top: 12px; display: flex; justify-content: flex-end; gap: 8px">
            <Button data-testid="cancel-policy-button" @click="editingKey = null">{{ t('label.cancel') }}</Button>
            <Button type="primary" data-testid="save-policy-button" @click="editingKey = null">{{ t('label.save') }}</Button>
          </div>
        </div>
      </Card>
    </Form>
  </ContractFormStep>
</template>
