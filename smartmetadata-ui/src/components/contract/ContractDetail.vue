<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, Dropdown, Empty, Menu, message, Tag } from 'ant-design-vue';
import {
  CheckCircleFilled,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  ExportOutlined,
  ImportOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  SettingOutlined,
} from '@ant-design/icons-vue';
import {
  exportContractToODCSYaml,
  getContractResultByResultId,
  validateContractByEntityId,
  validateContractById,
  type ContractColumn,
  type DataContract,
  type DataContractResult,
} from '@/api/dataContracts';
import {
  DATA_CONTRACT_ACTION_DROPDOWN_KEY,
  DataContractMode,
  type ContractImportFormat,
} from '@/catalog/dataContractConstants';
import SmMarkdown from '@/components/shared/SmMarkdown.vue';
import { isDescriptionContentEmpty } from '@/utils/richTextUtils';
import {
  downloadContractAsODCSYaml,
  downloadContractYamlFile,
  formatContractDateTime,
  getConstraintStatus,
  getEntityName,
  getEntityStatusKind,
} from '@/utils/dataContract';
import { pruneEmptyChildren } from '@/catalog/dataContractForm';
import { getErrorText } from '@/views/admin/accessApiErrors';
import ContractViewSwitchTab from './ContractViewSwitchTab.vue';
import ContractYaml from './ContractYaml.vue';
import ContractStatusAlert from './ContractStatusAlert.vue';
import ContractSLA from './ContractSLA.vue';
import ContractSchemaTable from './ContractSchemaTable.vue';
import ContractSecurityCard from './ContractSecurityCard.vue';
import ContractSemantics from './ContractSemantics.vue';
import ContractQualityCard from './ContractQualityCard.vue';
import ContractExecutionChart from './ContractExecutionChart.vue';
import ContractInheritedBadge from './ContractInheritedBadge.vue';
import ContractImportModal from './ContractImportModal.vue';


const props = withDefaults(defineProps<{
  contract?: DataContract | null;
  entityId: string;
  entityType: string;
  entityName?: string;
  entityColumns?: ContractColumn[];
  hasEditPermission?: boolean;
}>(), {
  hasEditPermission: false,
});

const emit = defineEmits<{
  (e: 'edit'): void;
  (e: 'delete'): void;
  (e: 'updated'): void;
}>();

const { t } = useI18n();
const validateLoading = ref(false);
const latestContractResults = ref<DataContractResult>();
const mode = ref<DataContractMode>(DataContractMode.UI);
const isImportModalVisible = ref(false);
const importFormat = ref<ContractImportFormat>('odcs');

const isInheritedContract = computed(() => Boolean(props.contract?.inherited));

const schemaDetail = computed(() => pruneEmptyChildren(props.contract?.schema || []));
const constraintStatus = computed(() =>
  latestContractResults.value ? getConstraintStatus(latestContractResults.value) : {},
);

const showContractStatusAlert = computed(() => {
  const { result, contractExecutionStatus } = latestContractResults.value ?? {};
  return Boolean(result && (contractExecutionStatus === 'Failed' || contractExecutionStatus === 'Aborted'));
});

const termsContent = computed(() => {
  const terms = props.contract?.termsOfUse;
  if (typeof terms === 'string') return terms;
  return terms?.content ?? '';
});
const termsInherited = computed(() => {
  const terms = props.contract?.termsOfUse;
  return typeof terms === 'object' && Boolean(terms?.inherited);
});

const statusKind = computed(() => getEntityStatusKind(props.contract?.entityStatus));
const statusColor = computed(() => {
  if (statusKind.value === 'success') return 'success';
  if (statusKind.value === 'failure') return 'error';
  if (statusKind.value === 'warning') return 'purple';
  return 'warning';
});

async function fetchLatestContractResults(): Promise<void> {
  if (!props.contract?.id || !props.contract.latestResult?.resultId) {
    latestContractResults.value = undefined;
    return;
  }
  try {
    latestContractResults.value = await getContractResultByResultId(
      props.contract.id,
      props.contract.latestResult.resultId,
    );
  } catch (error) {
    message.error(getErrorText(error, t('server.entity-fetch-error', { entity: t('label.contract') })));
  }
}

function handleExportContract(): void {
  if (!props.contract) return;
  try {
    downloadContractYamlFile(props.contract);
    message.success(t('message.entity-exported-successfully', { entity: t('label.contract') }));
  } catch (error) {
    message.error(getErrorText(error, t('server.entity-fetch-error', { entity: t('label.contract') })));
  }
}

async function handleExportODCSContract(): Promise<void> {
  if (!props.contract?.id) return;
  try {
    const yamlContent = await exportContractToODCSYaml(props.contract.id);
    downloadContractAsODCSYaml(yamlContent, props.contract.name ?? 'contract');
    message.success(t('message.entity-exported-successfully', { entity: t('label.odcs-contract') }));
  } catch (error) {
    message.error(getErrorText(error, t('server.entity-fetch-error', { entity: t('label.odcs-contract') })));
  }
}

function handleImportContract(format: ContractImportFormat): void {
  importFormat.value = format;
  isImportModalVisible.value = true;
}

async function handleRunNow(): Promise<void> {
  if (!props.contract) return;
  try {
    validateLoading.value = true;
    if (isInheritedContract.value && props.contract.entity?.id && props.contract.entity?.type) {
      await validateContractByEntityId(props.contract.entity.id, props.contract.entity.type);
    } else if (props.contract.id) {
      await validateContractById(props.contract.id);
    }
    emit('updated');
    message.success(t('message.contract-validation-trigger-successfully'));
  } catch (error) {
    message.error(getErrorText(error, t('server.entity-fetch-error', { entity: t('label.contract') })));
  } finally {
    validateLoading.value = false;
  }
}

function handleAddContractAction(key: string): void {
  switch (key) {
    case DATA_CONTRACT_ACTION_DROPDOWN_KEY.IMPORT_ODCS:
      return handleImportContract('odcs');
    case DATA_CONTRACT_ACTION_DROPDOWN_KEY.IMPORT_OPENMETADATA:
      return handleImportContract('openmetadata');
    case DATA_CONTRACT_ACTION_DROPDOWN_KEY.CREATE:
    default:
      emit('edit');
  }
}

function handleContractAction(key: string): void {
  switch (key) {
    case DATA_CONTRACT_ACTION_DROPDOWN_KEY.RUN_NOW:
      return void handleRunNow();
    case DATA_CONTRACT_ACTION_DROPDOWN_KEY.EXPORT:
      return handleExportContract();
    case DATA_CONTRACT_ACTION_DROPDOWN_KEY.EXPORT_ODCS:
      return void handleExportODCSContract();
    case DATA_CONTRACT_ACTION_DROPDOWN_KEY.IMPORT_ODCS:
      return handleImportContract('odcs');
    case DATA_CONTRACT_ACTION_DROPDOWN_KEY.IMPORT_OPENMETADATA:
      return handleImportContract('openmetadata');
    case DATA_CONTRACT_ACTION_DROPDOWN_KEY.DELETE:
      return emit('delete');
    default:
      emit('edit');
  }
}

watch(() => props.contract, () => { void fetchLatestContractResults(); }, { immediate: true });

</script>

<template>
  <ContractImportModal
    :visible="isImportModalVisible"
    :entity-id="entityId"
    :entity-type="entityType"
    :entity-name="entityName"
    :existing-contract="contract ?? null"
    :format="importFormat"
    @close="isImportModalVisible = false"
    @success="isImportModalVisible = false; emit('updated')"
  />

  <div v-if="!contract" class="contract-empty">
    <Empty
      data-testid="no-data-placeholder"
      :description="hasEditPermission ? t('message.create-contract-description') : t('message.no-contract-description')"
    >
      <template v-if="hasEditPermission">
        <Dropdown :trigger="['click']">
          <Button type="primary" size="small" data-testid="add-contract-button">
            {{ t('label.add-entity', { entity: t('label.contract') }) }}
            <DownOutlined />
          </Button>
          <template #overlay>
            <Menu data-testid="add-contract-menu" @click="({ key }) => handleAddContractAction(String(key))">
              <Menu.Item :key="DATA_CONTRACT_ACTION_DROPDOWN_KEY.CREATE" data-testid="create-contract-button">
                <PlusOutlined /> {{ t('label.create-contract-with-ui') }}
              </Menu.Item>
              <Menu.Item :key="DATA_CONTRACT_ACTION_DROPDOWN_KEY.IMPORT_OPENMETADATA" data-testid="import-openmetadata-contract-button">
                <ImportOutlined /> {{ t('label.import-om') }}
              </Menu.Item>
              <Menu.Item :key="DATA_CONTRACT_ACTION_DROPDOWN_KEY.IMPORT_ODCS" data-testid="import-odcs-contract-button">
                <ImportOutlined /> {{ t('label.import-odcs') }}
              </Menu.Item>
            </Menu>
          </template>
        </Dropdown>
      </template>
    </Empty>
  </div>

  <Card v-else class="contract-detail-card">
    <div class="contract-header" data-testid="contract-header-container">
      <CheckCircleFilled class="contract-status-img" :aria-label="t('label.approved-entity', { entity: t('label.contract') })" />
      <div class="contract-header-main">
        <div class="contract-header-top">
          <div class="contract-title-row">
            <h2 class="contract-title" data-testid="contract-title">{{ getEntityName(contract) }}</h2>
            <ContractInheritedBadge v-if="contract.inherited" entity-key="label.contract" />
          </div>
          <div class="contract-header-actions">
            <ContractViewSwitchTab :mode="mode" @change="mode = $event" />
            <Dropdown :trigger="['click']">
              <Button type="text" data-testid="manage-contract-actions">
                <SettingOutlined />
              </Button>
              <template #overlay>
                <Menu data-testid="contract-action-dropdown" @click="({ key }) => handleContractAction(String(key))">
                  <template v-if="hasEditPermission">
                    <Menu.Item :key="DATA_CONTRACT_ACTION_DROPDOWN_KEY.EDIT" data-testid="contract-edit-button">
                      <EditOutlined /> {{ t('label.edit') }}
                    </Menu.Item>
                    <Menu.Item :key="DATA_CONTRACT_ACTION_DROPDOWN_KEY.RUN_NOW" data-testid="contract-run-now-button" :disabled="validateLoading">
                      <PlayCircleOutlined /> {{ t('label.run-now') }}
                    </Menu.Item>
                    <Menu.Item :key="DATA_CONTRACT_ACTION_DROPDOWN_KEY.IMPORT_OPENMETADATA" data-testid="import-openmetadata-contract-button">
                      <ImportOutlined /> {{ t('label.import') }}
                    </Menu.Item>
                    <Menu.Item :key="DATA_CONTRACT_ACTION_DROPDOWN_KEY.IMPORT_ODCS" data-testid="import-odcs-contract-button">
                      <ImportOutlined /> {{ t('label.import-odcs') }}
                    </Menu.Item>
                  </template>
                  <Menu.Item :key="DATA_CONTRACT_ACTION_DROPDOWN_KEY.EXPORT" data-testid="export-contract-button">
                    <ExportOutlined /> {{ t('label.export') }}
                  </Menu.Item>
                  <Menu.Item :key="DATA_CONTRACT_ACTION_DROPDOWN_KEY.EXPORT_ODCS" data-testid="export-odcs-contract-button">
                    <ExportOutlined /> {{ t('label.export-odcs') }}
                  </Menu.Item>
                  <template v-if="hasEditPermission">
                    <Menu.Divider />
                    <Menu.Item
                      :key="DATA_CONTRACT_ACTION_DROPDOWN_KEY.DELETE"
                      data-testid="delete-contract-button"
                      :disabled="isInheritedContract"
                      danger
                    >
                      <DeleteOutlined /> {{ t('label.delete') }}
                    </Menu.Item>
                  </template>
                </Menu>
              </template>
            </Dropdown>
          </div>
        </div>
        <div class="contract-meta">
          <span v-if="contract.createdBy" class="meta-item">
            <span data-testid="contract-created-by-label">{{ t('label.created-by') }} : </span>
            <span>{{ contract.createdBy }}</span>
          </span>
          <span v-if="contract.createdAt" class="meta-item">
            <span data-testid="contract-created-at-label">{{ t('label.created-at') }} : </span>
            <span data-testid="contract-created-at-value">{{ formatContractDateTime(contract.createdAt) }}</span>
          </span>
          <span class="meta-item">
            <span data-testid="contract-version-label">{{ t('label.version') }} : </span>
            <Tag color="purple">{{ String(contract.version ?? '') }}</Tag>
          </span>
          <span class="meta-item">
            <span data-testid="contract-status-label">{{ t('label.status') }} : </span>
            <Tag :color="statusColor">{{ contract.entityStatus ?? t('label.approved') }}</Tag>
          </span>
          <span class="meta-item" data-testid="contract-owner-card">
            <span>{{ t('label.owner-plural') }} : </span>
            <span v-if="contract.owners?.length">
              <template v-for="(owner, index) in contract.owners.slice(0, 5)" :key="owner.id || owner.name">
                {{ getEntityName(owner) }}<template v-if="index < Math.min(contract.owners.length, 5) - 1">, </template>
              </template>
            </span>
            <span v-else>—</span>
          </span>
        </div>
      </div>
    </div>

    <ContractYaml v-if="mode === DataContractMode.YAML" :contract="contract" />
    <div v-else class="contract-detail-container">
      <div v-if="showContractStatusAlert" class="contract-card-items">
        <ContractStatusAlert :message="latestContractResults?.result ?? ''" />
      </div>

      <div v-if="!isDescriptionContentEmpty(contract.description ?? '')" class="contract-card-items">
        <div class="contract-card-header-container">
          <span class="contract-card-header">{{ t('label.description') }}</span>
          <div class="contract-dash-separator" />
        </div>
        <SmMarkdown :markdown="contract.description ?? ''" />
      </div>

      <div v-if="!isDescriptionContentEmpty(termsContent)" class="contract-card-items">
        <div class="contract-card-header-container">
          <div class="contract-card-header-row">
            <span class="contract-card-header">{{ t('label.terms-of-service') }}</span>
            <ContractInheritedBadge v-if="termsInherited" entity-key="label.terms-of-service" />
          </div>
          <div class="contract-dash-separator" />
        </div>
        <SmMarkdown :markdown="termsContent" />
      </div>

      <ContractSLA
        :contract="contract"
        :contract-status="constraintStatus.sla"
        :latest-contract-results="latestContractResults"
        :entity-columns="entityColumns"
      />

      <div v-if="schemaDetail.length" class="contract-card-items" data-testid="schema-table-card">
        <div class="contract-card-header-container">
          <span class="contract-card-header">{{ t('label.schema') }}</span>
          <div class="contract-dash-separator" />
        </div>
        <ContractSchemaTable
          :schema-detail="schemaDetail"
          :contract-status="constraintStatus.schema"
          :latest-schema-validation-result="latestContractResults?.schemaValidation"
          :entity-type="entityType"
        />
      </div>

      <div v-if="contract.security && Object.keys(contract.security).length" class="contract-card-items" data-testid="security-card">
        <div class="contract-card-header-container">
          <div class="contract-card-header-row">
            <span class="contract-card-header">{{ t('label.security') }}</span>
            <ContractInheritedBadge v-if="contract.security.inherited" entity-key="label.security" />
          </div>
          <div class="contract-dash-separator" />
        </div>
        <ContractSecurityCard :security="contract.security" :entity-columns="entityColumns" />
      </div>

      <div v-if="contract.semantics?.length" class="contract-card-items" data-testid="semantics-card">
        <div class="contract-card-header-container">
          <span class="contract-card-header">{{ t('label.semantic-plural') }}</span>
          <div class="contract-dash-separator" />
        </div>
        <ContractSemantics
          :semantics="contract.semantics"
          :contract-status="constraintStatus.semantic"
          :latest-contract-results="latestContractResults"
        />
      </div>

      <div v-if="contract.testSuite?.id" class="contract-card-items" data-testid="data-quality-card">
        <div class="contract-card-header-container">
          <span class="contract-card-header">{{ t('label.quality') }}</span>
          <div class="contract-dash-separator" />
        </div>
        <ContractQualityCard :contract="contract" :contract-status="constraintStatus.quality" />
      </div>

      <div v-if="contract.id && contract.latestResult?.resultId" class="contract-card-items" data-testid="execution-history-card">
        <div class="contract-card-header-container">
          <span class="contract-card-header">{{ t('label.execution-history') }}</span>
          <div class="contract-dash-separator" />
        </div>
        <ContractExecutionChart :contract="contract" />
      </div>
    </div>
  </Card>
</template>

<style scoped>
.contract-empty {
  min-height: 360px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--sm-bg-container);
  border-radius: var(--sm-border-radius, 8px);
}
.contract-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 0 16px;
}
.contract-status-img { font-size: 64px; color: var(--sm-color-success); }
.contract-header-main { flex: 1; min-width: 0; }
.contract-header-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.contract-title-row { display: flex; align-items: center; gap: 6px; min-width: 0; }
.contract-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--sm-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.contract-header-actions { display: flex; align-items: center; gap: 12px; }
.contract-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 8px; color: var(--sm-text-secondary); }
.meta-item { display: inline-flex; align-items: center; gap: 6px; }
.contract-detail-container { display: flex; flex-direction: column; gap: 24px; }
.contract-card-header { font-weight: 600; color: var(--sm-text-primary); }
.contract-card-header-row { display: flex; align-items: center; gap: 6px; }
.contract-dash-separator { border-bottom: 2px dotted var(--sm-border-color); margin: 8px 0 16px; }
</style>
