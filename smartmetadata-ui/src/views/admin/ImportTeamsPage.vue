<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import {
  Breadcrumb,
  Button,
  Card,
  Spin,
  Steps,
  Typography,
  Upload,
  message,
} from 'ant-design-vue';
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons-vue';
import SmTable from '@/components/shared/SmTable.vue';
import NoDataPlaceholder from '@/components/shared/NoDataPlaceholder.vue';
import PermissionPlaceholder from '@/components/shared/PermissionPlaceholder.vue';
import { getEntityName } from '@/components/shared/profilePictureUtils';
import {
  getCsvAsyncImportResult,
  pollCsvAsyncJob,
  type CsvImportResult,
} from '@/api/csvImport';
import { getTeamByName, importTeam, importUsersInTeam } from '@/api/teams';
import { parseCsv, rowsToRecords } from '@/features/csv/csv';
import type { AdminTeam } from '@/types/admin';
import { getTeamsWithFqnPath } from '@/utils/fqnPaths';
import { useMembersPermissions } from './useMembersPermissions';

/**
 * ImportTeamsPage + EntityImport equivalent (pin pages/TeamsPage/
 * ImportTeamsPage + components/common/EntityImport). Page gate:
 * Create AND EditAll (both required; the team fetch runs when
 * either holds, matching the pin's two effects); permission errors
 * toast. Group + type=teams and undefined-team guards render plain
 * NoDataPlaceholders. The breadcrumb is a single team-name item.
 *
 * Flow (2 named steps, 3 screens): 1 Upload CSV → dry-run import,
 * poll the async job, preview the result; 2 Preview Data → Back or
 * Import (real run), poll again; 3 success screen with a View
 * button back to the detail page (?activeTab=<type>). The pin
 * resolves jobs over websocket with a resolveCsvImportResult
 * fallback; the product polls via the csvImport infra (draft §2.9
 * W3). Result tables parse importResultsCsv; column sets are the
 * pin TeamImportResult/UserImportResult sets, keyed by the CSV
 * header names (including the `*` required markers).
 */

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const fqn = computed(() => String(route.params.fqn ?? route.params.id ?? ''));
const importType = computed(() => (route.query.type === 'users' ? 'users' : 'teams'));

const team = ref<AdminTeam | undefined>();
const pageLoading = ref(true);

const deletedRef = computed(() => team.value?.deleted ?? false);
const perms = useMembersPermissions('team', fqn, deletedRef);
const canCreate = computed(() => perms.ungatedFlags.value.can('Create'));
const canEditAll = computed(() => perms.ungatedFlags.value.canEditAll);

watch(
  () => perms.error.value,
  (error) => {
    if (error !== undefined) {
      message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
    }
  },
);

async function fetchTeam(): Promise<void> {
  pageLoading.value = true;
  try {
    team.value = await getTeamByName(fqn.value);
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  } finally {
    pageLoading.value = false;
  }
}

watch(
  [canCreate, canEditAll],
  ([create, edit]) => {
    if (create || edit) {
      void fetchTeam();
    }
  },
  { immediate: true },
);

watch(
  () => perms.isLoading.value,
  (loading) => {
    if (!loading && !canCreate.value && !canEditAll.value) {
      pageLoading.value = false;
    }
  },
);

const showPermissionPlaceholder = computed(
  () => !pageLoading.value && (!canCreate.value || !canEditAll.value),
);
const isGroupTeamsGuard = computed(
  () => team.value?.teamType === 'Group' && importType.value === 'teams',
);

function handleViewClick(): void {
  if (!team.value) {
    return;
  }
  void router.push({
    path: getTeamsWithFqnPath(team.value.fullyQualifiedName ?? team.value.name),
    query: { activeTab: importType.value },
  });
}

// --- Import flow ---
const activeStep = ref(1);
const fileName = ref('');
const csvText = ref('');
const csvImportResult = ref<CsvImportResult | undefined>();
const isImporting = ref(false);
const isResolving = ref(false);

const isAborted = computed(() => csvImportResult.value?.status === 'aborted');

const steps = computed(() => [
  { title: t('label.upload-csv-uppercase-file') },
  { title: t('label.preview-data') },
]);

async function runImport(dryRun: boolean): Promise<CsvImportResult | undefined> {
  const current = team.value;
  if (!current) {
    return undefined;
  }
  try {
    const response =
      importType.value === 'users'
        ? await importUsersInTeam(current.name, csvText.value, dryRun)
        : await importTeam(current.name, csvText.value, dryRun);
    await pollCsvAsyncJob(response.jobId);
    return await getCsvAsyncImportResult(response.jobId);
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
    return undefined;
  }
}

async function handleFile(uploaded: unknown): Promise<boolean> {
  // antd passes the raw File to beforeUpload; tolerate the wrapped
  // UploadFile shape (originFileObj) as well.
  const file =
    (uploaded as { originFileObj?: File }).originFileObj ?? (uploaded as File);
  fileName.value = file.name;
  try {
    csvText.value = await file.text();
  } catch {
    message.error(t('crud.loadFailed'));
    return false;
  }
  isResolving.value = true;
  try {
    const result = await runImport(true);
    if (result) {
      csvImportResult.value = result;
      activeStep.value = 2;
    }
  } finally {
    isResolving.value = false;
  }
  return false;
}

async function handleImport(): Promise<void> {
  isImporting.value = true;
  try {
    const result = await runImport(false);
    if (result) {
      csvImportResult.value = result;
      activeStep.value = 3;
    }
  } finally {
    isImporting.value = false;
  }
}

function handleBack(): void {
  csvImportResult.value = undefined;
  activeStep.value = 1;
}

// --- Result table ---
const parsedRecords = computed<Array<Record<string, string>>>(() => {
  const csv = csvImportResult.value?.importResultsCsv;
  if (!csv) {
    return [];
  }
  return rowsToRecords(parseCsv(csv)).records;
});

const resultColumns = computed(() => {
  const statusColumn = { title: t('label.status'), dataIndex: 'status', key: 'status' };
  if (importType.value === 'users') {
    return [
      statusColumn,
      { title: t('label.name'), dataIndex: 'name*', key: 'name*' },
      { title: t('label.display-name'), dataIndex: 'displayName', key: 'displayName' },
      { title: t('label.description'), dataIndex: 'description', key: 'description' },
      { title: t('label.email'), dataIndex: 'email*', key: 'email*' },
      { title: t('label.timezone'), dataIndex: 'timezone', key: 'timezone' },
      { title: t('label.admin'), dataIndex: 'isAdmin', key: 'isAdmin' },
      { title: t('label.team-plural'), dataIndex: 'teams*', key: 'teams*' },
      { title: t('label.role-plural'), dataIndex: 'Roles', key: 'Roles' },
    ];
  }
  return [
    statusColumn,
    { title: t('label.name'), dataIndex: 'name*', key: 'name*' },
    { title: t('label.display-name'), dataIndex: 'displayName', key: 'displayName' },
    { title: t('label.description'), dataIndex: 'description', key: 'description' },
    { title: t('label.team-type'), dataIndex: 'teamType*', key: 'teamType*' },
    { title: t('label.parent'), dataIndex: 'parents*', key: 'parents*' },
    { title: t('label.owner'), dataIndex: 'Owner', key: 'Owner' },
    { title: t('label.joinable'), dataIndex: 'isJoinable', key: 'isJoinable' },
    { title: t('label.role-plural'), dataIndex: 'defaultRoles', key: 'defaultRoles' },
    { title: t('label.policy-plural'), dataIndex: 'policies', key: 'policies' },
  ];
});

const importTitle = computed(() =>
  t('label.import-entity', {
    entity: importType.value === 'users' ? t('label.user-plural') : t('label.team-plural'),
  }),
);
</script>

<template>
  <div data-testid="import-teams">
    <Spin v-if="pageLoading" :spinning="true" data-testid="import-teams-loader" />
    <PermissionPlaceholder
      v-else-if="showPermissionPlaceholder"
      :permission-value="
        t('label.create-entity', {
          entity: t('label.import-entity', {
            entity: importType === 'users' ? t('label.user-plural') : t('label.team-plural'),
          }),
        })
      "
      test-id="permission-error-placeholder"
    />
    <NoDataPlaceholder v-else-if="!team" test-id="no-data-placeholder" />
    <NoDataPlaceholder
      v-else-if="isGroupTeamsGuard"
      :description="t('message.group-type-team-not-allowed-to-have-sub-team')"
      test-id="no-data-placeholder"
    />
    <template v-else>
      <Breadcrumb data-testid="entity-detail-breadcrumb">
        <Breadcrumb.Item>
          <RouterLink :to="getTeamsWithFqnPath(team.fullyQualifiedName ?? team.name)">
            {{ getEntityName(team) }}
          </RouterLink>
        </Breadcrumb.Item>
      </Breadcrumb>
      <Typography.Title :level="5" data-testid="title">{{ importTitle }}</Typography.Title>

      <Steps :current="activeStep - 1" :items="steps" style="margin: 16px 0" />

      <div v-if="activeStep === 1" data-testid="upload-file-container">
        <Spin :spinning="isResolving">
          <Upload.Dragger
            accept=".csv"
            :show-upload-list="false"
            :before-upload="(file) => handleFile(file)"
          >
            <p>{{ t('label.upload-csv-uppercase-file') }}</p>
          </Upload.Dragger>
        </Spin>
        <div style="display: flex; justify-content: flex-end; margin-top: 16px">
          <Button data-testid="cancel-button" @click="handleViewClick">
            {{ t('label.cancel') }}
          </Button>
        </div>
      </div>

      <div v-if="activeStep === 2 && csvImportResult" data-testid="import-results">
        <Card v-if="isAborted" style="margin-top: 16px">
          <Typography.Paragraph data-testid="abort-reason" style="text-align: center">
            <strong style="display: block">{{ t('label.aborted') }}</strong>
            {{ csvImportResult.abortReason }}
          </Typography.Paragraph>
          <div style="display: flex; justify-content: center">
            <Button data-testid="cancel-button" @click="handleBack">
              {{ t('label.back') }}
            </Button>
          </div>
        </Card>
        <template v-else>
          <div class="import-teams__status">
            <span data-testid="processed-row">
              {{ csvImportResult.numberOfRowsProcessed }}
            </span>
            <span data-testid="passed-row">
              {{ csvImportResult.numberOfRowsPassed }} {{ t('label.passed') }}
            </span>
            <span data-testid="failed-row">
              {{ csvImportResult.numberOfRowsFailed }} {{ t('label.failed') }}
            </span>
            <span
              v-if="csvImportResult.numberOfRowsPendingApproval"
              data-testid="pending-approval-row"
            >
              {{ csvImportResult.numberOfRowsPendingApproval }}
              {{ t('label.pending-approval') }}
            </span>
          </div>
          <SmTable
            :columns="resultColumns"
            :data-source="parsedRecords"
            :row-key="(_record, index) => String(index)"
            :pagination="false"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'status'">
                <span data-testid="status-container">
                  <CheckCircleOutlined
                    v-if="record.status === 'success'"
                    style="color: var(--ant-color-success, #52c41a)"
                  />
                  <CloseCircleOutlined
                    v-else-if="record.status === 'failure'"
                    style="color: var(--ant-color-error, #ff4d4f)"
                  />
                  <span v-if="record.status === 'failure'">{{ record.details }}</span>
                  <span v-else>{{ record.status }}</span>
                </span>
              </template>
            </template>
          </SmTable>
          <div class="import-teams__footer">
            <Button
              data-testid="preview-cancel-button"
              :disabled="isImporting"
              @click="handleBack"
            >
              {{ t('label.back') }}
            </Button>
            <Button
              type="primary"
              data-testid="import-button"
              :disabled="isImporting"
              :loading="isImporting"
              @click="handleImport"
            >
              {{ t('label.import') }}
            </Button>
          </div>
        </template>
      </div>

      <div v-if="activeStep > 2" style="text-align: center; margin-top: 24px">
        <CheckCircleOutlined
          data-testid="success-badge"
          style="font-size: 36px; color: var(--ant-color-success, #52c41a)"
        />
        <p>
          <strong data-testid="file-name">{{ fileName }}</strong>
          {{ `${t('label.successfully-uploaded')}.` }}
        </p>
        <Button type="primary" @click="handleViewClick">{{ t('label.view') }}</Button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.import-teams__status {
  display: flex;
  gap: 16px;
  margin: 16px 0;
}
.import-teams__footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
