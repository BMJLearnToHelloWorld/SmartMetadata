<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Button, Checkbox, Modal, Radio, RadioGroup, Select, Upload, Tag, message } from 'ant-design-vue';
import { compare } from 'fast-json-patch';
import { load as yamlLoad } from 'js-yaml';
import {
  createContract,
  createOrUpdateContractFromODCSYaml,
  deleteContractById,
  importContractFromODCSYaml,
  parseODCSYaml,
  updateContract,
  validateContractYaml,
  validateODCSYaml,
  type ContractValidation,
  type CreateDataContractRequest,
  type DataContract,
} from '@/api/dataContracts';
import type { ContractImportFormat, ImportMode } from '@/catalog/dataContractConstants';
import { getErrorText } from '@/views/admin/accessApiErrors';

interface ParsedODCSContract {
  name?: string;
  version: string;
  status: string;
  description?: string;
  hasSchema: boolean;
  hasSla: boolean;
  hasSecurity: boolean;
  hasTeam: boolean;
}

interface ParsedOpenMetadataContract {
  name?: string;
  displayName?: string;
  description?: string;
  hasSchema: boolean;
  hasSla: boolean;
  hasSecurity: boolean;
  hasSemantics: boolean;
}

type ParsedContract = ParsedODCSContract | ParsedOpenMetadataContract;

const props = defineProps<{
  visible: boolean;
  entityId: string;
  entityType: string;
  entityName?: string;
  format: ContractImportFormat;
  existingContract?: DataContract | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'success', contract: DataContract): void;
}>();

const { t } = useI18n();
const yamlContent = ref<string | null>(null);
const parsedRawContent = ref<Record<string, unknown> | null>(null);
const fileName = ref('');
const parsedContract = ref<ParsedContract | null>(null);
const parseError = ref<string | null>(null);
const importMode = ref<ImportMode>('merge');
const isLoading = ref(false);
const isValidating = ref(false);
const serverValidation = ref<ContractValidation | null>(null);
const serverValidationError = ref<string | null>(null);
const schemaObjects = ref<string[]>([]);
const selectedObjectName = ref('');
const hasMultipleObjects = ref(false);
const createTestCases = ref(true);

const isODCSFormat = computed(() => props.format === 'odcs');
const hasExistingContract = computed(() => Boolean(props.existingContract?.id));
const odcsReport = computed(() => (isODCSFormat.value ? serverValidation.value?.odcsImportReport : undefined));
const isODCSParsed = computed(() => Boolean(parsedContract.value && 'version' in parsedContract.value && 'status' in parsedContract.value && !('hasSemantics' in parsedContract.value)));

const hasValidationErrors = computed(() => {
  if (serverValidationError.value) return true;
  const validation = serverValidation.value;
  if (validation && validation.valid === false) return true;
  if (validation?.entityErrors?.length) return true;
  if (validation?.constraintErrors?.length) return true;
  return false;
});

const isImportDisabled = computed(() =>
  !yamlContent.value ||
  Boolean(parseError.value) ||
  isValidating.value ||
  hasValidationErrors.value ||
  (hasMultipleObjects.value && !selectedObjectName.value),
);

const dialogWidth = computed(() => {
  if (!yamlContent.value) return 680;
  return odcsReport.value ? 1040 : 900;
});

const modalTitle = computed(() =>
  isODCSFormat.value ? t('label.import-odcs-contract') : t('label.import-contract'),
);

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as object).length === 0;
  return false;
}

function parseODCSContent(parsed: Record<string, unknown>): ParsedODCSContract | null {
  if (!parsed.apiVersion || !parsed.kind || !parsed.status) return null;
  const description = parsed.description as Record<string, string> | undefined;
  return {
    name: parsed.name as string | undefined,
    version: (parsed.version as string) ?? '1.0.0',
    status: parsed.status as string,
    description: description?.purpose,
    hasSchema: Array.isArray(parsed.schema) && parsed.schema.length > 0,
    hasSla: Array.isArray(parsed.slaProperties) && parsed.slaProperties.length > 0,
    hasSecurity: Array.isArray(parsed.roles) && parsed.roles.length > 0,
    hasTeam: Array.isArray(parsed.team) && parsed.team.length > 0,
  };
}

function parseOpenMetadataContent(parsed: Record<string, unknown>): ParsedOpenMetadataContract | null {
  if (!parsed.name) return null;
  return {
    name: parsed.name as string | undefined,
    displayName: parsed.displayName as string | undefined,
    description: parsed.description as string | undefined,
    hasSchema: Array.isArray(parsed.schema) && parsed.schema.length > 0,
    hasSla: !isEmptyValue(parsed.sla),
    hasSecurity: !isEmptyValue(parsed.security),
    hasSemantics: Array.isArray(parsed.semantics) && parsed.semantics.length > 0,
  };
}

function parseYamlContent(content: string): ParsedContract | null {
  try {
    const parsed = yamlLoad(content) as Record<string, unknown>;
    parsedRawContent.value = parsed;
    return isODCSFormat.value ? parseODCSContent(parsed) : parseOpenMetadataContent(parsed);
  } catch {
    return null;
  }
}

function clearSchemaObjects(): void {
  schemaObjects.value = [];
  hasMultipleObjects.value = false;
  selectedObjectName.value = '';
}

async function applyOdcsSchemaObjects(content: string): Promise<void> {
  try {
    const parseResult = await parseODCSYaml(content);
    const objects = parseResult.schemaObjects ?? [];
    schemaObjects.value = objects;
    hasMultipleObjects.value = parseResult.hasMultipleObjects ?? false;
    if (objects.length === 1) {
      selectedObjectName.value = objects[0];
      return;
    }
    if (objects.length > 1) {
      const matching = props.entityName
        ? objects.find((obj) => obj.toLowerCase() === props.entityName?.toLowerCase())
        : undefined;
      selectedObjectName.value = matching ?? '';
    }
  } catch {
    clearSchemaObjects();
  }
}

async function processFile(file: File): Promise<void> {
  const content = await file.text();
  yamlContent.value = content;
  fileName.value = file.name;
  const parsed = parseYamlContent(content);
  if (!parsed) {
    parsedContract.value = null;
    parseError.value = isODCSFormat.value
      ? t('message.invalid-odcs-contract-format')
      : t('message.invalid-openmetadata-contract-format');
    clearSchemaObjects();
    return;
  }
  parsedContract.value = parsed;
  parseError.value = null;
  if (isODCSFormat.value) {
    await applyOdcsSchemaObjects(content);
  }
}

function beforeUpload(file: File): boolean {
  void processFile(file);
  return false;
}

function normalizeTermsOfUseForPatch(
  mergedForPatch: Record<string, unknown>,
  existing?: DataContract | null,
): Record<string, unknown> {
  if (typeof mergedForPatch.termsOfUse !== 'string') {
    return mergedForPatch;
  }
  const existingTermsOfUse =
    existing?.termsOfUse && typeof existing.termsOfUse === 'object' ? existing.termsOfUse : {};
  return {
    ...mergedForPatch,
    termsOfUse: { ...existingTermsOfUse, content: mergedForPatch.termsOfUse },
  };
}

async function applyReplaceImport(existingContractId: string | undefined, contractData: CreateDataContractRequest): Promise<DataContract> {
  await deleteContractById(existingContractId ?? '');
  return createContract(contractData);
}

async function applyMergeImport(existing: DataContract | undefined | null, contractData: CreateDataContractRequest): Promise<DataContract> {
  const mergedForPatch = normalizeTermsOfUseForPatch({ ...existing, ...contractData }, existing);
  const patchOperations = compare(existing as object, mergedForPatch);
  return updateContract(existing?.id ?? '', patchOperations);
}

async function handleODCSImport(): Promise<DataContract> {
  if (!yamlContent.value) throw new Error('No content to import');
  if (hasExistingContract.value) {
    return createOrUpdateContractFromODCSYaml(
      yamlContent.value,
      props.entityId,
      props.entityType,
      importMode.value,
      selectedObjectName.value || undefined,
      createTestCases.value,
    );
  }
  return importContractFromODCSYaml(
    yamlContent.value,
    props.entityId,
    props.entityType,
    selectedObjectName.value || undefined,
    createTestCases.value,
  );
}

async function handleOpenMetadataImport(): Promise<DataContract> {
  if (!parsedRawContent.value) throw new Error('No content to import');
  const contractData = {
    ...parsedRawContent.value,
    entity: { id: props.entityId, type: props.entityType },
  } as CreateDataContractRequest;
  if (hasExistingContract.value && importMode.value === 'replace') {
    return applyReplaceImport(props.existingContract?.id, contractData);
  }
  if (hasExistingContract.value && importMode.value === 'merge') {
    return applyMergeImport(props.existingContract, contractData);
  }
  return createContract(contractData);
}

function handleReset(): void {
  yamlContent.value = null;
  parsedRawContent.value = null;
  fileName.value = '';
  parsedContract.value = null;
  parseError.value = null;
  importMode.value = 'merge';
  serverValidation.value = null;
  serverValidationError.value = null;
  schemaObjects.value = [];
  selectedObjectName.value = '';
  hasMultipleObjects.value = false;
  createTestCases.value = true;
  emit('close');
}

function handleRemoveFile(): void {
  yamlContent.value = null;
  parsedRawContent.value = null;
  fileName.value = '';
  parsedContract.value = null;
  parseError.value = null;
  serverValidation.value = null;
  serverValidationError.value = null;
  schemaObjects.value = [];
  selectedObjectName.value = '';
  hasMultipleObjects.value = false;
  createTestCases.value = true;
}

async function handleImport(): Promise<void> {
  if (!yamlContent.value) return;
  isLoading.value = true;
  try {
    const result = isODCSFormat.value ? await handleODCSImport() : await handleOpenMetadataImport();
    message.success(
      t('message.entity-imported-successfully', {
        entity: isODCSFormat.value ? t('label.odcs-contract') : t('label.contract'),
      }),
    );
    emit('success', result);
    handleReset();
  } catch (error) {
    message.error(getErrorText(error, t('server.entity-fetch-error', { entity: t('label.contract') })));
  } finally {
    isLoading.value = false;
  }
}

const includedFeatures = computed(() => {
  const parsed = parsedContract.value;
  if (!parsed) return [] as string[];
  const features: string[] = [];
  if (parsed.hasSchema) features.push(t('label.schema'));
  if (parsed.hasSla) features.push(t('label.sla'));
  if (parsed.hasSecurity) features.push(t('label.security'));
  if ('hasSemantics' in parsed && parsed.hasSemantics) features.push(t('label.semantic-plural'));
  if ('hasTeam' in parsed && parsed.hasTeam) features.push(t('label.team'));
  return features;
});

const failedSchema = computed(() =>
  serverValidation.value?.schemaValidation?.failed !== undefined &&
  serverValidation.value.schemaValidation.failed > 0,
);

watch(
  () => [props.visible, yamlContent.value, parseError.value, hasMultipleObjects.value, selectedObjectName.value, createTestCases.value, isODCSFormat.value, props.entityId, props.entityType] as const,
  ([visible, content, error, multi, selected]) => {
    if (!visible || !content || error || (isODCSFormat.value && multi && !selected)) {
      if (!content || error) {
        serverValidation.value = null;
        serverValidationError.value = null;
      }
      return;
    }
    let latest = true;
    isValidating.value = true;
    serverValidationError.value = null;
    const run = async () => {
      try {
        const validation = isODCSFormat.value
          ? await validateODCSYaml(content, props.entityId, props.entityType, selected || undefined, createTestCases.value)
          : await validateContractYaml(content);
        if (latest) serverValidation.value = validation;
      } catch (err) {
        if (latest) {
          serverValidationError.value = getErrorText(err, String(err));
          serverValidation.value = null;
        }
      } finally {
        if (latest) isValidating.value = false;
      }
    };
    void run();
    return () => { latest = false; };
  },
);

const reportBlocking = computed(() => (odcsReport.value?.issues ?? []).filter((issue) => issue.severity === 'blocking'));
const reportWarnings = computed(() => (odcsReport.value?.issues ?? []).filter((issue) => issue.severity === 'warning'));
const qualitySummary = computed(() => {
  const rules = odcsReport.value?.qualityRules ?? [];
  return {
    total: rules.length,
    testCases: rules.filter((rule) => rule.outcome === 'testCase').length,
    sla: rules.filter((rule) => rule.outcome === 'sla').length,
    notExecuted: rules.filter((rule) => rule.outcome === 'notExecuted').length,
  };
});
</script>

<template>
  <Modal
    :open="visible"
    :title="modalTitle"
    :width="dialogWidth"
    :confirm-loading="isLoading"
    :ok-button-props="{ disabled: isImportDisabled }"
    data-testid="import-contract-modal"
    :ok-text="t('label.import')"
    :cancel-text="t('label.cancel')"
    @ok="handleImport"
    @cancel="handleReset"
  >
    <template #title>
      <span data-testid="import-contract-modal-title">{{ modalTitle }}</span>
    </template>
    <div v-if="!yamlContent">
      <Upload.Dragger
        :before-upload="beforeUpload"
        :show-upload-list="false"
        accept=".yaml,.yml"
        data-testid="file-upload-input"
      >
        <p>{{ t('label.click-to-upload') }} {{ t('label.or-drag-and-drop') }}</p>
        <p>{{ t('label.supports-yaml-format') }}</p>
      </Upload.Dragger>
    </div>
    <div v-else>
      <div class="file-info-card" data-testid="file-info-card">
        <span>{{ fileName }}</span>
        <Button type="link" danger data-testid="remove-file-button" @click="handleRemoveFile">{{ t('label.remove') }}</Button>
      </div>

      <Alert v-if="parseError" type="error" show-icon data-testid="parse-error-panel" :message="parseError" />

      <div v-if="parsedContract && !parseError" class="preview-card" data-testid="contract-preview-card">
        <div class="preview-title">{{ t('label.contract-preview') }}</div>
        <div>{{ parsedContract.name || ('displayName' in parsedContract ? parsedContract.displayName : '') }}</div>
        <div v-if="isODCSParsed && 'version' in parsedContract">{{ t('label.version') }}: {{ parsedContract.version }}</div>
        <div v-if="isODCSParsed && 'status' in parsedContract">{{ t('label.status') }}: {{ parsedContract.status }}</div>
        <div v-if="parsedContract.description">{{ parsedContract.description }}</div>
        <Tag v-for="feature in includedFeatures" :key="feature">{{ feature }}</Tag>
      </div>

      <div v-if="hasMultipleObjects" data-testid="object-selector-section">
        <div>{{ t('label.select-schema-object') }}</div>
        <Alert type="info" show-icon data-testid="multi-object-contract-detected" :message="t('message.multi-object-contract-detected')" />
        <Select
          v-model:value="selectedObjectName"
          data-testid="schema-object-select"
          :options="schemaObjects.map((obj) => ({ label: obj, value: obj }))"
          style="width: 100%"
        />
      </div>

      <div v-if="isValidating">{{ t('message.validating-contract-schema') }}</div>
      <Alert v-if="serverValidationError" type="error" show-icon data-testid="server-validation-error-panel" :message="serverValidationError" />
      <Alert
        v-if="failedSchema"
        type="error"
        show-icon
        data-testid="server-validation-failed-error-panel"
        :message="t('label.validation-failed')"
      >
        <ul data-testid="failed-fields-list">
          <li v-for="field in serverValidation?.schemaValidation?.failedFields ?? []" :key="field">{{ field }}</li>
        </ul>
      </Alert>
      <Alert
        v-if="serverValidation?.entityErrors?.length || serverValidation?.constraintErrors?.length"
        type="error"
        show-icon
        data-testid="entity-validation-error-panel"
        :message="t('label.contract-validation')"
      >
        <ul data-testid="entity-errors-list">
          <li v-for="err in [...(serverValidation?.entityErrors ?? []), ...(serverValidation?.constraintErrors ?? [])]" :key="err">{{ err }}</li>
        </ul>
      </Alert>
      <Alert
        v-if="serverValidation && !hasValidationErrors && !isValidating"
        type="success"
        show-icon
        data-testid="validation-success-panel"
        :message="t('message.contract-syntax-valid')"
      >
        <ul v-if="serverValidation.schemaValidation?.typeMismatchFields?.length" data-testid="type-mismatch-warnings-list">
          <li v-for="field in serverValidation.schemaValidation.typeMismatchFields" :key="field">{{ field }}</li>
        </ul>
      </Alert>

      <div v-if="hasExistingContract" data-testid="existing-contract-warning">
        <p>{{ t('message.existing-contract-detected') }}</p>
        <p>{{ t('message.please-select-action-below') }}</p>
        <RadioGroup v-model:value="importMode">
          <Radio value="merge" data-testid="import-mode-merge">{{ t('label.merge-with-existing') }}</Radio>
          <Radio value="replace" data-testid="import-mode-replace">{{ t('label.replace-entire-contract') }}</Radio>
        </RadioGroup>
      </div>

      <div v-if="isODCSFormat && odcsReport" data-testid="odcs-import-report-section">
        <div v-if="reportBlocking.length">
          <strong>{{ t('label.validation-failed') }}</strong>
          <ul>
            <li v-for="issue in reportBlocking" :key="issue.path ?? issue.message">{{ issue.message }}</li>
          </ul>
        </div>
        <div v-if="reportWarnings.length">
          <strong>{{ t('label.warning-plural') }}</strong>
          <ul>
            <li v-for="issue in reportWarnings" :key="issue.path ?? issue.message">{{ issue.message }}</li>
          </ul>
        </div>
        <div v-if="qualitySummary.total">
          {{ t('label.quality') }}: {{ qualitySummary.testCases }}/{{ qualitySummary.total }}
        </div>
      </div>

      <Checkbox
        v-if="isODCSFormat"
        v-model:checked="createTestCases"
        data-testid="create-test-cases-checkbox"
      >
        {{ t('label.create-test-cases-from-quality-rules') }}
      </Checkbox>
    </div>
    <template #footer>
      <Button data-testid="cancel-button" @click="handleReset">{{ t('label.cancel') }}</Button>
      <Button type="primary" data-testid="import-button" :disabled="isImportDisabled" :loading="isLoading" @click="handleImport">
        {{ t('label.import') }}
      </Button>
    </template>
  </Modal>
</template>

<style scoped>
.file-info-card, .preview-card {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding: 12px;
  border: 1px solid var(--sm-border-color);
  border-radius: var(--sm-border-radius, 6px);
  background: var(--sm-bg-container);
}
.preview-title { font-weight: 600; width: 100%; color: var(--sm-text-primary); }
</style>
