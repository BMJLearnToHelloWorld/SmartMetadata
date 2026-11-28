<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { getErrorText } from '@/views/admin/accessApiErrors';
import { Button, Descriptions, Form, Input, message } from 'ant-design-vue';
import { getTestSuite, patchTestSuite, updateTestSuite, deleteTestSuite } from '@/api/testSuites';
import {
  addTestCasesToLogicalTestSuiteBulk,
  type AddTestCaseListSubmitPayload,
} from '@/api/testCases';
import AddTestCaseList from '@/components/quality/AddTestCaseList.vue';
import EntityDescriptionCell from '@/components/shared/EntityDescriptionCell.vue';
import EntityHeaderTitle from '@/components/shared/EntityHeaderTitle.vue';
import FormModal from '@/components/shared/FormModal.vue';
import TestSuitePipelineTab from '@/components/quality/TestSuitePipelineTab.vue';
import WidgetDomainCell from '@/components/shared/widgets/WidgetDomainCell.vue';
import WidgetOwnersCell from '@/components/shared/widgets/WidgetOwnersCell.vue';
import { confirmDelete } from '@/features/crud/confirmDelete';
import { useEntityPermissions } from '@/composables/useEntityPermissions';
import EntityManageButton from '@/components/quality/EntityManageButton.vue';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { loadGovernanceCatalog, type GovernanceCatalog } from '@/governance/catalogOptions';
import { descriptionPatch, domainsPatch, ownersPatch } from '@/governance/assetPatch';
import { usePermissionStore } from '@/stores/permissions';
import { QUALITY_PAGE_TABS } from '@/catalog/qualityTabs';
import { entityLabel } from '@/features/crud/paging';
import type { EntityDetailTab } from '@/features/crud/types';
import type { TestSuite } from '@/types/quality';
import TestCasesListView from '@/views/quality/TestCasesListView.vue';
import {
  buildTestCaseSuiteDetailOriginBreadcrumb,
  buildTestSuiteDetailBreadcrumbs,
} from '@/utils/qualityDetailBreadcrumbs';
import { getDataQualityPagePath } from '@/utils/fqnPaths';

const props = defineProps<{ id: string }>();
const { t } = useI18n();
const router = useRouter();
const permissionStore = usePermissionStore();
const loading = ref(false);
const errorMessage = ref('');
const suite = ref<TestSuite | null>(null);
const activeTab = ref('test-cases');
const suiteFqn = computed(() => suite.value?.fullyQualifiedName ?? '');
const suiteDeleted = computed(() => suite.value?.deleted === true);
const suitePerms = useEntityPermissions('testSuite', suiteFqn, {
  deleted: suiteDeleted,
  enabled: computed(() => Boolean(suiteFqn.value)),
});
const hasDeletePermission = computed(() => !suiteDeleted.value && suitePerms.canDelete.value);
const editDisplayNamePermission = computed(() => !suiteDeleted.value && suitePerms.canEditDisplayName.value);
const canAddTestCases = computed(() => !suiteDeleted.value && suitePerms.can('EditTests'));
const canEditSuiteOwners = computed(
  () => !suiteDeleted.value && (permissionStore.isAdminUser || suitePerms.can('EditOwners')),
);
const canEditSuiteDomains = computed(
  () => !suiteDeleted.value && (permissionStore.isAdminUser || suitePerms.can('EditDomains')),
);
const canEditDescription = computed(
  () => !suiteDeleted.value && (permissionStore.isAdminUser || suitePerms.canEditDescription.value),
);

const testCaseTabCount = ref(0);
const pipelineTabCount = ref(0);
const governanceCatalog = ref<GovernanceCatalog>({ owners: [], tags: [], domains: [] });

const editOpen = ref(false);
const saving = ref(false);
const editForm = reactive({
  displayName: '',
  description: '',
});

const breadcrumbs = computed(() =>
  buildTestSuiteDetailBreadcrumbs(
    t,
    entityLabel(suite.value) || t('label.entity-detail-plural', { entity: t('label.test-suite') }),
  ),
);

const embeddedCasesBreadcrumbData = computed(() =>
  suite.value?.fullyQualifiedName
    ? buildTestCaseSuiteDetailOriginBreadcrumb(
        t,
        entityLabel(suite.value) || suite.value.fullyQualifiedName,
        suite.value.fullyQualifiedName,
      )
    : undefined,
);

const tabs = computed<EntityDetailTab[]>(() =>
  QUALITY_PAGE_TABS.testSuite.map((tab) => ({
    key: tab.key,
    label: t(tab.labelKey),
    testId: `test-suite-tab-${tab.key}`,
    count: tab.key === 'test-cases' ? testCaseTabCount.value : tab.key === 'pipeline' ? pipelineTabCount.value : undefined,
  })),
);

const removeFromSuite = computed(() =>
  suite.value?.id
    ? { suiteId: suite.value.id, allowed: suitePerms.can('EditTests') }
    : undefined,
);

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    suite.value = await getTestSuite(props.id);
  } catch (error) {
    suite.value = null;
    errorMessage.value = getErrorText(error, t('server.entity-fetch-error', { entity: t('label.test-suite') }));
  } finally {
    loading.value = false;
  }
}

async function onDeleteTestSuite(): Promise<void> {
  if (!suite.value) {
    return;
  }
  const confirmed = await confirmDelete({
    title: t('label.delete'),
    content: t('message.delete-entity-message', { entity: entityLabel(suite.value) }),
    okText: t('label.delete'),
    cancelText: t('label.cancel'),
  });
  if (!confirmed) {
    return;
  }
  try {
    await deleteTestSuite(suite.value.id, { hardDelete: true });
    message.success(t('server.entity-deleted-successfully', { entity: entityLabel(suite.value) }));
    await router.push(getDataQualityPagePath('test-suites'));
  } catch (error) {
    message.error(getErrorText(error, t('server.delete-entity-error', { entity: t('label.test-suite') })));
  }
}

function openEdit(): void {
  if (!suite.value) {
    return;
  }
  editForm.displayName = suite.value.displayName || '';
  editForm.description = suite.value.description || '';
  editOpen.value = true;
}

async function onSave(): Promise<void> {
  if (!suite.value) {
    return;
  }
  saving.value = true;
  try {
    await updateTestSuite({
      name: suite.value.name,
      description: editForm.description.trim() || undefined,
      displayName: editForm.displayName.trim() || undefined,
    });
    editOpen.value = false;
    message.success(t('server.update-entity-success', { entity: t('label.test-suite') }));
    await load();
  } catch (error) {
    message.error(getErrorText(error, t('server.update-entity-error', { entity: t('label.test-suite') })));
  } finally {
    saving.value = false;
  }
}

async function onDescriptionUpdate(description: string): Promise<void> {
  if (!suite.value?.id) {
    return;
  }
  await patchTestSuite(suite.value.id, descriptionPatch(suite.value.description, description));
  message.success(t('server.update-entity-success', { entity: t('label.description') }));
  await load();
}

async function onHeaderOwnersSave(owners: Array<{ id: string; type: string }>): Promise<void> {
  if (!suite.value?.id) {
    return;
  }
  await patchTestSuite(
    suite.value.id,
    ownersPatch(
      suite.value.owners,
      owners.map((owner) => ({ id: owner.id, type: owner.type })),
    ),
  );
  message.success(t('server.update-entity-success', { entity: t('label.owner-plural') }));
  await load();
}

async function onHeaderDomainsSave(domainIds: string[]): Promise<void> {
  if (!suite.value?.id) {
    return;
  }
  await patchTestSuite(suite.value.id, domainsPatch(suite.value.domains, domainIds));
  message.success(t('server.update-entity-success', { entity: t('label.domain-plural') }));
  await load();
}

const addOpen = ref(false);
const adding = ref(false);

function openAddTests(): void {
  addOpen.value = true;
}

async function onAddTestsSubmit(payload: AddTestCaseListSubmitPayload): Promise<void> {
  if (!suite.value) {
    return;
  }
  const hasSelection = payload.selectAll ? true : payload.includeIds.length > 0;
  if (!hasSelection) {
    return;
  }
  adding.value = true;
  try {
    await addTestCasesToLogicalTestSuiteBulk(suite.value.id, payload);
    addOpen.value = false;
    message.success(t('server.update-entity-success', { entity: t('label.test-suite') }));
    await load();
  } catch (error) {
    message.error(getErrorText(error, t('server.update-entity-error', { entity: t('label.test-suite') })));
  } finally {
    adding.value = false;
  }
}

watch(
  () => props.id,
  () => {
    void load();
  },
);

onMounted(() => {
  void loadGovernanceCatalog().then((catalog) => {
    governanceCatalog.value = catalog;
  });
  void load();
});
</script>

<template>
  <EntityDetailShell
    :title="entityLabel(suite) || t('label.entity-detail-plural', { entity: t('label.test-suite') })"
    :name="suite?.name"
    :fqn="suite?.fullyQualifiedName"
    :lead="t('label.entity-detail-plural', { entity: t('label.test-suite') })"
    :loading="loading"
    :error="errorMessage"
    :empty="!suite && !loading && !errorMessage"
    :breadcrumbs="breadcrumbs"
    :tabs="suite ? tabs : []"
    v-model:active-tab="activeTab"
    header-container-test-id="test-suite-header-container"
    entity-page-header-test-id="entity-page-header"
  >
    <template v-if="suite" #header-title>
      <EntityHeaderTitle
        :name="suite.name"
        :display-name="suite.displayName"
        :deleted="suiteDeleted"
        service-name="test-suite"
      />
    </template>
    <template #actions>
      <EntityManageButton
        :entity-label="t('label.test-suite')"
        :can-rename="editDisplayNamePermission"
        :can-delete="hasDeletePermission"
        :deleted="suiteDeleted"
        rename-test-id="edit-test-suite"
        delete-test-id="delete-test-suite"
        @rename="openEdit"
        @delete="onDeleteTestSuite"
      />
      <Button
        v-if="canAddTestCases"
        data-testid="add-tests-to-suite"
        :disabled="!suite"
        @click="openAddTests"
      >
        {{ t('label.add-entity', { entity: t('label.test-case-plural') }) }}
      </Button>
    </template>
    <template #meta>
      <Descriptions v-if="suite" bordered :column="2" size="small" data-testid="test-suite-header-meta">
        <Descriptions.Item :label="t('label.type')">
          {{ suite.basic ? t('label.table-suite-plural') : t('label.bundle-suite') }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('label.domain')">
          <WidgetDomainCell
            test-id="test-suite-header-domain"
            :domains="suite.domains ?? []"
            :options="governanceCatalog.domains"
            :has-edit-access="canEditSuiteDomains"
            :on-change="onHeaderDomainsSave"
          />
        </Descriptions.Item>
        <Descriptions.Item :label="t('label.owner-plural')">
          <WidgetOwnersCell
            test-id="test-suite-header-owners"
            :owners="suite.owners ?? []"
            :options="governanceCatalog.owners"
            :has-edit-access="canEditSuiteOwners"
            :on-change="onHeaderOwnersSave"
          />
        </Descriptions.Item>
      </Descriptions>
    </template>
    <template #test-cases>
      <div class="test-suite-tab-stack">
        <EntityDescriptionCell
          v-if="suite"
          :description="suite.description"
          :entity-name="entityLabel(suite)"
          :has-edit-access="canEditDescription"
          :on-description-update="onDescriptionUpdate"
        />
        <TestCasesListView
          v-if="suite?.id"
          embedded
          prefer-search
          suite-detail-mode
          :test-suite-id="suite.id"
          :breadcrumb-data="embeddedCasesBreadcrumbData"
          :remove-from-suite="removeFromSuite"
          data-testid="test-suite-embedded-cases"
          @update:total="testCaseTabCount = $event"
          @removed-from-suite="load"
        />
      </div>
    </template>
    <template #pipeline>
      <TestSuitePipelineTab
        v-if="suite?.fullyQualifiedName"
        :test-suite-fqn="suite.fullyQualifiedName"
        :test-suite-id="suite.id"
        :deleted="suiteDeleted"
        @update:total="pipelineTabCount = $event"
      />
    </template>
  </EntityDetailShell>
  <FormModal
    :open="editOpen"
    :title="t('label.edit-entity', { entity: t('label.test-suite') })"
    :ok-text="t('label.update')"
    :cancel-text="t('label.cancel')"
    :confirm-loading="saving"
    @ok="onSave" @cancel="editOpen = false">
    <Form layout="vertical">
      <Form.Item :label="t('label.display-name')">
        <Input v-model:value="editForm.displayName" />
      </Form.Item>
      <Form.Item :label="t('label.description')">
        <Input.TextArea v-model:value="editForm.description" :rows="3" />
      </Form.Item>
    </Form>
  </FormModal>
  <FormModal
    :open="addOpen"
    :title="t('label.add-entity', { entity: t('label.test-case-plural') })"
    :footer="null"
    width="640"
    @cancel="addOpen = false"
  >
    <AddTestCaseList
      :existing-test="suite?.tests ?? []"
      @cancel="addOpen = false"
      @submit="onAddTestsSubmit"
    />
  </FormModal>
</template>

<style scoped>
.test-suite-tab-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>