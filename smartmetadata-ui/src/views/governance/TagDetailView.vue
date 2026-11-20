<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Descriptions, Empty, Form, Input, Switch, message } from 'ant-design-vue';
import SmRichTextEditor from '@/components/shared/SmRichTextEditor.vue';
import EntityDescriptionCell from '@/components/shared/EntityDescriptionCell.vue';
import { useEntityPermissions } from '@/composables/useEntityPermissions';
import FormModal from '@/components/shared/FormModal.vue';
import { deleteTag, getTag, patchTag, updateTag } from '@/api/tags';
import { domainsPatch, ownersPatch } from '@/governance/assetPatch';
import { loadGovernanceCatalog, type GovernanceCatalog } from '@/governance/catalogOptions';
import WidgetDomainCell from '@/components/shared/widgets/WidgetDomainCell.vue';
import WidgetOwnersCell from '@/components/shared/widgets/WidgetOwnersCell.vue';
import WidgetReviewerCell from '@/components/shared/widgets/WidgetReviewerCell.vue';
import { usePermissionStore } from '@/stores/permissions';
import { listEntityActivity } from '@/api/activity';
import { listConversations } from '@/api/conversations';
import { latestGovernanceVersionPath } from '@/api/governanceVersions';
import { getTagVersionPath } from '@/catalog/versionPaths';
import { DetailWidgetKeys } from '@/catalog/detailWidgetDispatch';
import GenericTab from '@/components/customize/GenericTab.vue';
import { resolveWidgetLayout } from '@/composables/customizeWidgetLayout';
import { findCustomizedTabEntry, useCustomPages } from '@/composables/useCustomPages';
import { isWidgetLayoutTab } from '@/views/admin/persona/editors/customizePageData';
import AssetActivityPanel from '@/features/crud/AssetActivityPanel.vue';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { confirmDelete } from '@/features/crud/confirmDelete';
import { entityLabel } from '@/features/crud/paging';
import { toEntityLink } from '@/quality/entityLink';
import { setFieldPatch } from '@/admin/jsonPatch';
import type { EntityBreadcrumb, EntityDetailTab } from '@/features/crud/types';
import type { ActivityEvent, Conversation } from '@/types/collaboration';
import type { ClassificationTag } from '@/types/governance';

const props = defineProps<{ id: string }>();
const router = useRouter();
const { t } = useI18n();
const loading = ref(false);
const errorMessage = ref('');
const tag = ref<ClassificationTag | null>(null);
// Upstream TagPage isEditable (disabled AND deleted): the product read path
// never surfaces deleted tags (the server default excludes them), so disabled
// is the observable half. Delete is not an Edit* operation and keeps its own gate.
const isEditable = computed(() => !!tag.value && tag.value.disabled !== true);
const activeTab = ref('overview');
const activity = ref<ActivityEvent[]>([]);
const conversations = ref<Conversation[]>([]);
const collaborationError = ref('');
const editOpen = ref(false);
const editKey = ref(0);
const descriptionEditorRef = ref<{ getEditorContent: () => string } | null>(null);
const saving = ref(false);

/**
 * D-4: the composable fetches the tag's permissions by FQN and derives
 * the flags. Official TagPage isEditable is disabled AND deleted, so
 * both feed the deleted gate. A fetch failure is toasted once via the
 * error watcher; the flags stay all-false (fail-closed).
 */
const tagPermissions = useEntityPermissions(
  'tag',
  () => tag.value?.fullyQualifiedName || tag.value?.name || '',
  { deleted: () => tag.value?.deleted === true || tag.value?.disabled === true },
);
const canEditDescription = computed(() => tagPermissions.canEditDescription.value);

/**
 * D-2 batch 2 widget-cell gates (P1 dual line): each action gate ORs
 * `isAdminUser` with the derived flag — never only one. The composable
 * exposes only the named flags it owns; the rest go through its generic
 * `can(op)` escape hatch, which applies the same prioritization and
 * deleted gating (disabled feeds the deleted gate here, see above).
 */
const permissionStore = usePermissionStore();
const catalog = ref<GovernanceCatalog>({ owners: [], tags: [], domains: [] });
const canEditOwners = computed(() => permissionStore.isAdminUser || tagPermissions.can('EditOwners'));
const canEditDomains = computed(() => permissionStore.isAdminUser || tagPermissions.can('EditDomains'));
const canEditReviewers = computed(() => permissionStore.isAdminUser || tagPermissions.can('EditReviewers'));
watch(
  () => tagPermissions.error.value,
  (error) => {
    if (error) {
      message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
    }
  },
);
const editForm = reactive({
  displayName: '',
  description: '',
});

const breadcrumbs = computed<EntityBreadcrumb[]>(() => [
  {
    label: entityLabel(tag.value?.classification) || t('tags.classification'),
    to: tag.value?.classification?.id
      ? { name: 'governance-classification', params: { id: tag.value.classification.id } }
      : { name: 'governance-classifications' },
  },
  { label: entityLabel(tag.value) || t('tags.fallback') },
]);

// B-7 fixed tab list, per the official TagPage `tabItems` (a fixed
// useMemo: OVERVIEW, ASSETS, ACTIVITY_FEED, DATA_OBSERVABILITY —
// `getDetailsTabWithNewLabel` is absent there, and the tab list never
// reorders or renames with the customized page). The customized page
// only feeds the OVERVIEW widget grid, through the GenericProvider
// chain. The model-only custom_properties tab (TagClassBase TabsIds)
// is not rendered, matching the official page.
const tabs = computed<EntityDetailTab[]>(() => [
  { key: 'overview', label: t('asset.tabs.overview'), testId: 'tag-tab-overview' },
  { key: 'assets', label: t('asset.tabs.assets'), testId: 'tag-tab-assets' },
  { key: 'activity_feed', label: t('asset.tabs.activityFeed'), testId: 'tag-tab-activity-feed' },
  {
    key: 'data_observability',
    label: t('asset.tabs.dataObservability'),
    testId: 'tag-tab-data-observability',
  },
]);

// Widget layer (B-8): the widget grid mounts ONLY on this page type's
// widget-layout tab (Tag: overview), and only when the customized
// page has a tab entry resolving to the rendered tab key whose
// official id is that mount tab (`isWidgetLayoutTab`, reading
// layoutAppliesTo — the official GenericTab mount set, one tab per
// page type). The editor saves ALL tabs with layout: [] on the
// non-mount ones, so entry resolution alone would blank every other
// tab; non-mount tabs always keep their existing panels. The grid
// renders the entry's resolved layout, including empty when the entry
// carries no layout. The entry's own id — never the rendered key —
// is passed to the layout resolver, because the official lookup
// matches tab entries by id only (`customizeWidgetLayout.ts`). Tag
// has no customization editor (official CustomizablePage has no Tag
// renderer), so a customized Tag page can only arrive as stored
// history data; the read path carries it verbatim.
const { customizedPage } = useCustomPages('Tag');

// Dispatch-resolvable keys with no branch in this view's widget chains,
// absent on purpose, so their cells stay empty (same disclosure format
// as AssetDetailView): DATA_PRODUCTS — the Tag spec carries it, but
// TAG_FIELDS does not request it and `mapTag` does not map it, so there
// is no supporting data; TAGS / GLOSSARY_TERMS / TIER / CERTIFICATION —
// the Tag spec (`entity/classification/tag.json`) carries no tags field
// (the entity IS a tag label), and tier/certification derive from tag
// labels, so no surface exists; EXPERTS — the Tag spec carries no such
// field; CUSTOM_PROPERTIES — the Tag spec carries no `extension` and
// this view loads no custom-property defs; KNOWLEDGE_ARTICLE — no
// knowledge-article data source exists in the product. LEFT_PANEL is
// structural, not a missing branch: GenericTab renders the panel's
// children and never offers the panel itself to the slot.
function customizedEntryFor(tabKey: string) {
  const entry = findCustomizedTabEntry(customizedPage.value?.tabs, tabKey);
  if (!entry?.id || !isWidgetLayoutTab('Tag', entry.id)) {
    return undefined;
  }
  return entry;
}

function widgetLayoutFor(tabKey: string) {
  const entry = customizedEntryFor(tabKey);
  return entry ? resolveWidgetLayout('Tag', entry.id, customizedPage.value) : [];
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    tag.value = await getTag(props.id);
    const fqn = tag.value.fullyQualifiedName || tag.value.name;
    try {
      const [activityPage, conversationPage] = await Promise.all([
        listEntityActivity('tag', fqn),
        listConversations({ entityLink: toEntityLink('tag', fqn), limit: 20 }),
      ]);
      activity.value = activityPage.data;
      conversations.value = conversationPage.data;
      collaborationError.value = '';
    } catch (error) {
      activity.value = [];
      conversations.value = [];
      collaborationError.value = error instanceof Error ? error.message : t('crud.loadFailed');
    }
  } catch (error) {
    tag.value = null;
    activity.value = [];
    conversations.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('tags.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function onOpenVersions(): Promise<void> {
  // M-Next A4: official TAG_VERSION is the generic entity-version route;
  // same pattern as ClassificationDetailView.onOpenVersions.
  const targetId = tag.value?.id ?? props.id;
  if (!targetId) {
    return;
  }
  try {
    const path = await latestGovernanceVersionPath('tag', targetId, (version) => getTagVersionPath(targetId, version));
    if (!path) {
      message.info(t('asset.versionsEmpty'));
      return;
    }
    await router.push(path);
  } catch {
    message.error(t('asset.versionsFailed'));
  }
}

async function onDeleteTag(): Promise<void> {
  if (!tag.value) {
    return;
  }
  const confirmed = await confirmDelete({
    title: t('crud.deleteTitle'),
    content: t('crud.deleteConfirm', { name: tag.value.displayName || tag.value.name }),
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed) {
    return;
  }
  try {
    await deleteTag(tag.value.id);
    message.success(t('crud.deletedName', { name: tag.value.displayName || tag.value.name }));
    if (tag.value.classification?.id) {
      await router.push({ name: 'governance-classification', params: { id: tag.value.classification.id } });
    } else {
      await router.push({ name: 'governance-classifications' });
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.deleteFailed'));
  }
}

async function onToggleTagDisabled(disabled: boolean): Promise<void> {
  if (!tag.value) {
    return;
  }
  const previous = tag.value.disabled === true;
  tag.value = { ...tag.value, disabled };
  try {
    await patchTag(tag.value.id, setFieldPatch('/disabled', previous, disabled));
    message.success(t('crud.updated'));
  } catch (error) {
    tag.value = { ...tag.value, disabled: previous };
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  }
}

function openEdit(): void {
  if (!tag.value) {
    return;
  }
  editForm.displayName = tag.value.displayName || '';
  editForm.description = tag.value.description || '';
  // Rebuild the rich-text editor so it opens on the current description.
  editKey.value += 1;
  editOpen.value = true;
}

async function onSave(): Promise<void> {
  if (!tag.value) {
    return;
  }
  saving.value = true;
  try {
    await updateTag({
      name: tag.value.name,
      description: descriptionEditorRef.value?.getEditorContent()?.trim() ?? editForm.description.trim(),
      displayName: editForm.displayName.trim() || undefined,
      classification: tag.value.classification?.fullyQualifiedName || tag.value.classification?.name,
      parent: tag.value.parent?.fullyQualifiedName || tag.value.parent?.name,
    });
    editOpen.value = false;
    message.success(t('tags.updated'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  } finally {
    saving.value = false;
  }
}

/**
 * D-3 description-cell save: the same full-body PUT as onSave, built
 * from the loaded entity (not the edit form, which is only populated
 * while the page modal is open). Throws on failure so the cell keeps
 * its editor open.
 */
async function onDescriptionUpdate(description: string): Promise<void> {
  if (!tag.value) {
    return;
  }
  await updateTag({
    name: tag.value.name,
    description,
    displayName: tag.value.displayName || undefined,
    classification: tag.value.classification?.fullyQualifiedName || tag.value.classification?.name,
    parent: tag.value.parent?.fullyQualifiedName || tag.value.parent?.name,
  });
  message.success(t('tags.updated'));
  await load();
}

/**
 * D-2 batch 2 widget-cell saves: each is one field's JSON Patch via
 * patchTag. Each throws on failure so the cell keeps its editor open.
 */
async function onOwnersChange(owners: Array<{ id: string; type: 'user' | 'team' }>): Promise<void> {
  if (!tag.value) {
    return;
  }
  await patchTag(tag.value.id, ownersPatch(tag.value.owners, owners));
  message.success(t('tags.updated'));
  await load();
}

async function onDomainsChange(domainIds: string[]): Promise<void> {
  if (!tag.value) {
    return;
  }
  await patchTag(tag.value.id, domainsPatch(tag.value.domains, domainIds));
  message.success(t('tags.updated'));
  await load();
}

async function onReviewersChange(owners: Array<{ id: string; type: 'user' | 'team' }>): Promise<void> {
  if (!tag.value) {
    return;
  }
  await patchTag(tag.value.id, ownersPatch(tag.value.reviewers, owners));
  message.success(t('tags.updated'));
  await load();
}

watch(
  () => props.id,
  () => {
    void load();
  },
);

onMounted(() => {
  void load();
  void loadGovernanceCatalog()
    .then((loaded) => {
      catalog.value = loaded;
    })
    .catch(() => undefined);
});
</script>

<template>
  <EntityDetailShell
    :title="tag?.displayName || tag?.name || t('tags.fallback')"
    :name="tag?.name"
    :fqn="tag?.fullyQualifiedName"
    :loading="loading"
    :error="errorMessage"
    :empty="!tag && !loading && !errorMessage"
    :breadcrumbs="breadcrumbs"
    :tabs="tag ? tabs : []"
    v-model:active-tab="activeTab"
  >
    <template #actions>
      <!-- Stable keys: the back button appears only after load, and
           without keys the insertion reuses the sibling button
           instances positionally, leaving stale data-testid
           attributes on the wrong buttons. -->
      <Button
        key="tag-back"
        v-if="tag?.classification?.id"
        @click="router.push({ name: 'governance-classification', params: { id: tag.classification.id } })"
      >
        {{ t('tags.back') }}
      </Button>
      <Button key="delete-tag" danger data-testid="delete-tag" :disabled="!tag" @click="onDeleteTag">{{ t('crud.delete') }}</Button>
      <Button key="tag-versions" data-testid="tag-versions" :disabled="!tag" @click="onOpenVersions">{{ t('governance.versions.openVersions') }}</Button>
      <Button key="edit-tag" type="primary" data-testid="edit-tag" :disabled="!isEditable" @click="openEdit">
        {{ t('tags.edit') }}
      </Button>
    </template>
    <template #overview>
      <GenericTab v-if="customizedEntryFor('overview')" :layout="widgetLayoutFor('overview')" page-type="Tag">
        <template #widget="{ contentKey }">
          <div v-if="contentKey === DetailWidgetKeys.DESCRIPTION && tag" data-testid="widget-description">
            <EntityDescriptionCell
              :description="tag.description"
              :entity-name="tag.displayName || tag.name"
              :has-edit-access="canEditDescription"
              :on-description-update="onDescriptionUpdate"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.OWNERS && tag" data-testid="widget-owners">
            <WidgetOwnersCell
              :owners="tag.owners"
              :options="catalog.owners"
              :has-edit-access="canEditOwners"
              :on-change="onOwnersChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.DOMAIN && tag" data-testid="widget-domain">
            <WidgetDomainCell
              :domains="tag.domains"
              :options="catalog.domains"
              :has-edit-access="canEditDomains"
              :on-change="onDomainsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.REVIEWER && tag" data-testid="widget-reviewer">
            <WidgetReviewerCell
              :reviewers="tag.reviewers"
              :options="catalog.owners"
              :has-edit-access="canEditReviewers"
              :on-change="onReviewersChange"
            />
          </div>
        </template>
      </GenericTab>
      <Descriptions v-else-if="tag" bordered :column="1" size="small">
        <Descriptions.Item :label="t('crud.name')">{{ tag.name }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.fqn')">{{ tag.fullyQualifiedName }}</Descriptions.Item>
        <Descriptions.Item :label="t('tags.classification')">{{ tag.classification?.name || '—' }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.parent')">{{ tag.parent?.name || '—' }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.description')">
              <EntityDescriptionCell
                :description="tag.description"
                :entity-name="tag.displayName || tag.name"
                :has-edit-access="canEditDescription"
                :on-description-update="onDescriptionUpdate"
              />
            </Descriptions.Item>
        <Descriptions.Item :label="t('crud.disabled')">
          <Switch
            :checked="tag.disabled === true"
            data-testid="tag-disabled"
            @change="(value: boolean | string | number) => onToggleTagDisabled(value === true)"
          />
        </Descriptions.Item>
        <Descriptions.Item :label="t('tags.usage')">{{ tag.usageCount ?? '—' }}</Descriptions.Item>
      </Descriptions>
    </template>
    <template #assets>
      <GenericTab v-if="customizedEntryFor('assets')" :layout="widgetLayoutFor('assets')" page-type="Tag">
        <template #widget="{ contentKey }">
          <div v-if="contentKey === DetailWidgetKeys.DESCRIPTION && tag" data-testid="widget-description">
            <EntityDescriptionCell
              :description="tag.description"
              :entity-name="tag.displayName || tag.name"
              :has-edit-access="canEditDescription"
              :on-description-update="onDescriptionUpdate"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.OWNERS && tag" data-testid="widget-owners">
            <WidgetOwnersCell
              :owners="tag.owners"
              :options="catalog.owners"
              :has-edit-access="canEditOwners"
              :on-change="onOwnersChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.DOMAIN && tag" data-testid="widget-domain">
            <WidgetDomainCell
              :domains="tag.domains"
              :options="catalog.domains"
              :has-edit-access="canEditDomains"
              :on-change="onDomainsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.REVIEWER && tag" data-testid="widget-reviewer">
            <WidgetReviewerCell
              :reviewers="tag.reviewers"
              :options="catalog.owners"
              :has-edit-access="canEditReviewers"
              :on-change="onReviewersChange"
            />
          </div>
        </template>
      </GenericTab>
      <Empty v-else data-testid="asset-tab-residual" :description="t('asset.tabResidual.tagAssets')" />
    </template>
    <template #activity_feed>
      <AssetActivityPanel
        :activity="activity"
        :conversations="conversations"
        :collaboration-error="collaborationError"
        entity-type="tag"
        :fqn="tag?.fullyQualifiedName || tag?.name || ''"
      />
    </template>
    <template #data_observability>
      <GenericTab v-if="customizedEntryFor('data_observability')" :layout="widgetLayoutFor('data_observability')" page-type="Tag">
        <template #widget="{ contentKey }">
          <div v-if="contentKey === DetailWidgetKeys.DESCRIPTION && tag" data-testid="widget-description">
            <EntityDescriptionCell
              :description="tag.description"
              :entity-name="tag.displayName || tag.name"
              :has-edit-access="canEditDescription"
              :on-description-update="onDescriptionUpdate"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.OWNERS && tag" data-testid="widget-owners">
            <WidgetOwnersCell
              :owners="tag.owners"
              :options="catalog.owners"
              :has-edit-access="canEditOwners"
              :on-change="onOwnersChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.DOMAIN && tag" data-testid="widget-domain">
            <WidgetDomainCell
              :domains="tag.domains"
              :options="catalog.domains"
              :has-edit-access="canEditDomains"
              :on-change="onDomainsChange"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.REVIEWER && tag" data-testid="widget-reviewer">
            <WidgetReviewerCell
              :reviewers="tag.reviewers"
              :options="catalog.owners"
              :has-edit-access="canEditReviewers"
              :on-change="onReviewersChange"
            />
          </div>
        </template>
      </GenericTab>
      <Empty v-else data-testid="asset-tab-residual" :description="t('asset.tabResidual.dataObservability')" />
    </template>
  </EntityDetailShell>
  <FormModal
    :open="editOpen"
    :title="t('tags.editTitle')"
    :ok-text="t('crud.save')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="saving"
    @ok="onSave" @cancel="editOpen = false">
    <Form layout="vertical">
      <Form.Item :label="t('crud.displayName')" :extra="t('crud.displayNameHelp')">
        <Input v-model:value="editForm.displayName" />
      </Form.Item>
      <Form.Item :label="t('crud.description')" required>
        <SmRichTextEditor
              :key="editKey"
              ref="descriptionEditorRef"
              :autofocus="true"
              :initial-value="editForm.description"
            />
      </Form.Item>
    </Form>
  </FormModal>
</template>
