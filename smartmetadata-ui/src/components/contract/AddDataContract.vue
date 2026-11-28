<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official AddDataContract wizard (lazy-loaded from ContractTab, not a route).
  Tabs from EDataContractTab / getDataContractTabByEntity. Create POST vs
  PATCH compare(filteredContract), DisplayNameOverwriteBug, Semantics
  save-gate, quality/security valid* filters. YAML mode is unreachable in
  official UI and is not invented here. Vue3 + ant-design-vue, no CCL CSS.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, Tabs, message } from 'ant-design-vue';
import { compare } from 'fast-json-patch';
import {
  createContract,
  updateContract,
  type ContractColumn,
  type CreateDataContractRequest,
  type DataContract,
} from '@/api/dataContracts';
import { EDataContractTab, getContractTabLabelKey, getDataContractTabByEntity } from '@/catalog/dataContractTabs';
import { filterInheritedContract, termsOfUseContent, validSecurity, validSemantics } from '@/catalog/dataContractForm';
import { getErrorText } from '@/views/admin/accessApiErrors';
import ContractDetailFormTab from '@/components/contract/ContractDetailFormTab.vue';
import ContractTermsOfServiceTab from '@/components/contract/ContractTermsOfServiceTab.vue';
import ContractSchemaFormTab from '@/components/contract/ContractSchemaFormTab.vue';
import ContractSemanticFormTab from '@/components/contract/ContractSemanticFormTab.vue';
import ContractSecurityFormTab from '@/components/contract/ContractSecurityFormTab.vue';
import ContractQualityFormTab from '@/components/contract/ContractQualityFormTab.vue';
import ContractSLAFormTab from '@/components/contract/ContractSLAFormTab.vue';

const props = defineProps<{
  contract?: DataContract;
  entityId: string;
  entityType: string;
  entityName?: string;
  entityFqn?: string;
  entityColumns?: ContractColumn[];
}>();

const emit = defineEmits<{
  cancel: [];
  save: [];
}>();

const { t } = useI18n();
const submitting = ref(false);
const entityContractTabs = computed(() => getDataContractTabByEntity(props.entityType));
const filteredContract = computed(() => filterInheritedContract(props.contract));
const formValues = ref<Partial<DataContract>>(filteredContract.value ? { ...filteredContract.value } : {});
const activeTab = ref(String(entityContractTabs.value[0] ?? EDataContractTab.CONTRACT_DETAIL));
const visitedTabs = ref(new Set<string>([activeTab.value]));

watch(filteredContract, (next) => {
  formValues.value = next ? { ...next } : {};
});

watch(activeTab, (key) => {
  const next = new Set(visitedTabs.value);
  next.add(key);
  visitedTabs.value = next;
});

const semantics = computed(() => validSemantics(formValues.value.semantics));
const security = computed(() => validSecurity(formValues.value.security));

const isSaveDisabled = computed(() => {
  const patch = compare(filteredContract.value ?? {}, {
    ...filteredContract.value,
    ...formValues.value,
    semantics: semantics.value,
    security: security.value,
  });
  return patch.length === 0;
});

function onFormChange(data: Partial<DataContract>): void {
  formValues.value = { ...formValues.value, ...data };
}

const currentIndex = computed(() => entityContractTabs.value.findIndex((tab) => String(tab) === activeTab.value));
const hasNext = computed(() => currentIndex.value !== -1 && currentIndex.value < entityContractTabs.value.length - 1);
function tabLabel(tab: EDataContractTab): string {
  return t(getContractTabLabelKey(tab));
}
const nextTabLabel = computed(() => (hasNext.value ? tabLabel(entityContractTabs.value[currentIndex.value + 1]) : ''));
const prevTabLabel = computed(() => (currentIndex.value > 0 ? tabLabel(entityContractTabs.value[currentIndex.value - 1]) : ''));

function onNext(): void {
  if (hasNext.value) {
    activeTab.value = String(entityContractTabs.value[currentIndex.value + 1]);
  }
}

function onPrev(): void {
  if (currentIndex.value > 0) {
    activeTab.value = String(entityContractTabs.value[currentIndex.value - 1]);
  }
}

function visible(tab: EDataContractTab): boolean {
  return entityContractTabs.value.includes(tab) && visitedTabs.value.has(String(tab));
}

async function handleSave(): Promise<void> {
  submitting.value = true;
  try {
    if (props.contract) {
      await updateContract(
        props.contract.id,
        compare(filteredContract.value ?? {}, {
          ...filteredContract.value,
          ...formValues.value,
          semantics: semantics.value,
          security: security.value,
          ...(formValues.value.name !== undefined && formValues.value.name !== filteredContract.value?.name
            ? { displayName: formValues.value.name }
            : {}),
        }),
      );
    } else {
      const terms = termsOfUseContent(formValues.value.termsOfUse);
      const body: CreateDataContractRequest = {
        ...(formValues.value as CreateDataContractRequest),
        name: formValues.value.name ?? '',
        displayName: formValues.value.name,
        entity: { id: props.entityId, type: props.entityType },
        semantics: semantics.value,
        security: security.value,
        termsOfUse: terms,
        entityStatus: formValues.value.entityStatus ?? 'Draft',
      };
      await createContract(body);
    }
    message.success(t('message.data-contract-saved-successfully'));
    emit('save');
  } catch (error) {
    message.error(getErrorText(error, t('server.create-entity-error', { entity: t('label.contract') })));
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Card data-testid="add-contract-card">
    <template #title>{{ t('label.add-contract-detail-plural') }}</template>
    <template #extra>
      <Button data-testid="cancel-contract-btn" @click="emit('cancel')">{{ t('label.cancel') }}</Button>
      <Button data-testid="save-contract-btn" type="primary" :disabled="isSaveDisabled" :loading="submitting" @click="handleSave">
        {{ t('label.save') }}
      </Button>
    </template>
    <p>{{ t('message.add-contract-detail-description') }}</p>
    <div class="add-contract-layout">
      <Tabs v-model:active-key="activeTab" tab-position="left">
        <Tabs.TabPane v-for="tab in entityContractTabs" :key="String(tab)" :tab="tabLabel(tab)" />
      </Tabs>
      <div class="add-contract-panels">
        <template v-if="visible(EDataContractTab.CONTRACT_DETAIL)">
        <div v-show="activeTab === String(EDataContractTab.CONTRACT_DETAIL)">
          <ContractDetailFormTab :initial-values="filteredContract" :next-label="nextTabLabel" :is-next-visible="hasNext" @change="onFormChange" @next="onNext" />
        </div>
        </template>
        <template v-if="visible(EDataContractTab.TERMS_OF_SERVICE)">
        <div v-show="activeTab === String(EDataContractTab.TERMS_OF_SERVICE)">
          <ContractTermsOfServiceTab :initial-values="filteredContract" :next-label="nextTabLabel" :prev-label="prevTabLabel" :is-next-visible="hasNext" @change="onFormChange" @next="onNext" @prev="onPrev" />
        </div>
        </template>
        <template v-if="visible(EDataContractTab.SCHEMA)">
        <div v-show="activeTab === String(EDataContractTab.SCHEMA)">
          <ContractSchemaFormTab
            :entity-type="entityType"
            :entity-fqn="entityFqn"
            :entity-columns="entityColumns"
            :selected-schema="filteredContract?.schema ?? []"
            :next-label="nextTabLabel"
            :prev-label="prevTabLabel"
            :is-next-visible="hasNext"
            @change="onFormChange"
            @next="onNext"
            @prev="onPrev"
          />
        </div>
        </template>
        <template v-if="visible(EDataContractTab.SEMANTICS)">
        <div v-show="activeTab === String(EDataContractTab.SEMANTICS)">
          <ContractSemanticFormTab :initial-values="filteredContract" :next-label="nextTabLabel" :prev-label="prevTabLabel" :is-next-visible="hasNext" @change="onFormChange" @next="onNext" @prev="onPrev" />
        </div>
        </template>
        <template v-if="visible(EDataContractTab.SECURITY)">
        <div v-show="activeTab === String(EDataContractTab.SECURITY)">
          <ContractSecurityFormTab :entity-type="entityType" :initial-values="filteredContract" :next-label="nextTabLabel" :prev-label="prevTabLabel" :is-next-visible="hasNext" @change="onFormChange" @next="onNext" @prev="onPrev" />
        </div>
        </template>
        <template v-if="visible(EDataContractTab.QUALITY)">
        <div v-show="activeTab === String(EDataContractTab.QUALITY)">
          <ContractQualityFormTab
            :entity-type="entityType"
            :entity-fqn="entityFqn"
            :selected-quality="(filteredContract?.qualityExpectations ?? []).map((item) => item.id ?? '')"
            :initial-values="filteredContract"
            :next-label="nextTabLabel"
            :prev-label="prevTabLabel"
            :is-next-visible="hasNext"
            @change="onFormChange"
            @next="onNext"
            @prev="onPrev"
          />
        </div>
        </template>
        <template v-if="visible(EDataContractTab.SLA)">
        <div v-show="activeTab === String(EDataContractTab.SLA)">
          <ContractSLAFormTab :initial-values="filteredContract" :columns="entityColumns" :prev-label="prevTabLabel" @change="onFormChange" @prev="onPrev" />
        </div>
        </template>
      </div>
    </div>
  </Card>
</template>

<style scoped>
.add-contract-layout {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}
.add-contract-panels {
  flex: 1;
  min-width: 0;
}
</style>
