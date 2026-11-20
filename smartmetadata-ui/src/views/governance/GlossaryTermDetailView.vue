<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Descriptions, Empty, Form, Input, Select, Space, Tag, Typography, message } from 'ant-design-vue';
import SmTable from '@/components/shared/SmTable.vue';
import SmRichTextEditor from '@/components/shared/SmRichTextEditor.vue';
import EntityDescriptionCell from '@/components/shared/EntityDescriptionCell.vue';
import { useEntityPermissions } from '@/composables/useEntityPermissions';
import FormModal from '@/components/shared/FormModal.vue';
import { isDetailWired } from '@/catalog/entityRoutes';
import { getSafeHttpUrl } from '@/catalog/safeHttpUrl';
import { DetailWidgetKeys } from '@/catalog/detailWidgetDispatch';
import GenericTab from '@/components/customize/GenericTab.vue';
import DataQualityDashboard from '@/features/quality/DataQualityDashboard.vue';
import { resolveWidgetLayout } from '@/composables/customizeWidgetLayout';
import { findCustomizedTabEntry, getDetailsTabWithNewLabel, useCustomPages } from '@/composables/useCustomPages';
import { isWidgetLayoutTab } from '@/views/admin/persona/editors/customizePageData';
import { deleteGlossaryTerm, getGlossaryTerm, listGlossaryTermAssets, listGlossaryTerms, updateGlossaryTerm } from '@/api/glossaryTerms';
import { listEntityActivity } from '@/api/activity';
import { listConversations } from '@/api/conversations';
import { latestGovernanceVersionPath } from '@/api/governanceVersions';
import { getGlossaryTermVersionPath } from '@/catalog/versionPaths';
import AssetActivityPanel from '@/features/crud/AssetActivityPanel.vue';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { confirmDelete } from '@/features/crud/confirmDelete';
import { entityLabel, joinRefNames } from '@/features/crud/paging';
import { getCertificationTag, getTierTag } from '@/ingestion/tierTags';
import { toEntityLink } from '@/quality/entityLink';
import type { EntityBreadcrumb, EntityDetailTab } from '@/features/crud/types';
import type { DqDashboardChartFilters } from '@/quality/dashboard';
import type { ActivityEvent, Conversation } from '@/types/collaboration';
import type { EntityRef, TagRef } from '@/types/api';
import type { GlossaryTerm } from '@/types/governance';

const props = defineProps<{ id: string }>();
const router = useRouter();
const { t } = useI18n();
const loading = ref(false);
const errorMessage = ref('');
const term = ref<GlossaryTerm | null>(null);
const siblings = ref<GlossaryTerm[]>([]);
const assets = ref<EntityRef[]>([]);
const activeTab = ref('overview');
const activity = ref<ActivityEvent[]>([]);
const conversations = ref<Conversation[]>([]);
const collaborationError = ref('');
const editOpen = ref(false);
const editKey = ref(0);
const descriptionEditorRef = ref<{ getEditorContent: () => string } | null>(null);
const saving = ref(false);

/**
 * D-4: the composable fetches the term's permissions by FQN and derives
 * the flags (deleted-gated). A fetch failure is toasted once via the
 * error watcher; the flags stay all-false (fail-closed).
 */
const termPermissions = useEntityPermissions(
  'glossaryTerm',
  () => term.value?.fullyQualifiedName || term.value?.name || '',
  { deleted: () => term.value?.deleted === true },
);
const canEditDescription = computed(() => termPermissions.canEditDescription.value);
watch(
  () => termPermissions.error.value,
  (error) => {
    if (error) {
      message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
    }
  },
);
const editForm = reactive({
  displayName: '',
  description: '',
  relatedTermFqns: [] as string[],
});

const assetColumns = computed(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('crud.type'), dataIndex: 'type', key: 'type', width: 140 },
  { title: t('crud.fqn'), dataIndex: 'fullyQualifiedName', key: 'fullyQualifiedName' },
]);

const breadcrumbs = computed<EntityBreadcrumb[]>(() => [
  {
    label: entityLabel(term.value?.glossary) || t('terms.glossary'),
    to: term.value?.glossary?.id
      ? { name: 'governance-glossary', params: { id: term.value.glossary.id } }
      : { name: 'governance-glossaries' },
  },
  { label: entityLabel(term.value) || t('terms.fallback') },
]);

// B-7 customized tab list: the official rendered seven
// (GlossaryTermUtils base six + the ClassBase data-observability tab),
// replaced by the selected persona's GlossaryTerm page
// (official `getDetailsTabWithNewLabel` — see `useCustomPages.ts`).
// No tab is preserved: every rendered key matches a GlossaryTerm
// TabsId exactly, so a customization can remove any of them.
const { customizedPage } = useCustomPages('GlossaryTerm');

const tabs = computed<EntityDetailTab[]>(() =>
  getDetailsTabWithNewLabel(
    [
      { key: 'overview', label: t('asset.tabs.overview'), testId: 'term-tab-overview' },
      { key: 'glossary_terms', label: t('asset.tabs.glossaryTerms'), testId: 'term-tab-glossary-terms' },
      { key: 'assets', label: t('asset.tabs.assets'), testId: 'term-tab-assets' },
      { key: 'activity_feed', label: t('asset.tabs.activityFeed'), testId: 'term-tab-activity-feed' },
      { key: 'relations_graph', label: t('asset.tabs.relationsGraph'), testId: 'term-tab-relations-graph' },
      { key: 'custom_properties', label: t('asset.tabs.customProperties'), testId: 'term-tab-custom-properties' },
      {
        key: 'data_observability',
        label: t('asset.tabs.dataObservability'),
        testId: 'term-tab-data-observability',
      },
    ],
    customizedPage.value?.tabs,
  ),
);

// B-15: pin GlossaryTermClassBase (utils/Glossary/GlossaryTermClassBase.ts):
// the DQ tab mounts DataQualityDashboard with hiddenFilters
// ['glossaryTerms'] and initialFilters {glossaryTerms: [termFqn]}. Pin
// appends the tab only outside the version view; this view has no
// version mode (versions open on a separate route), so it mounts
// directly.
const termDqInitialFilters = computed<DqDashboardChartFilters | undefined>(() => {
  const fqn = term.value?.fullyQualifiedName;
  return fqn ? { glossaryTerms: [fqn] } : undefined;
});

// Widget layer (B-8): the widget grid mounts ONLY on this page type's
// widget-layout tab (GlossaryTerm: overview — only buildOverviewTab
// mounts GenericTab officially; every other tab renders fixed
// children), and only when the customized page has a tab entry
// resolving to the rendered tab key whose official id is that mount
// tab (`isWidgetLayoutTab`, reading layoutAppliesTo). The editor
// saves ALL tabs with layout: [] on the non-mount ones, so entry
// resolution alone would blank every other tab; non-mount tabs
// always keep their existing panels. The grid renders the entry's
// resolved layout, including empty when the entry carries no layout.
// The entry's own id — never the rendered key — is passed to the
// layout resolver, because the official lookup matches tab entries
// by id only (`customizeWidgetLayout.ts`).
// Dispatch-resolvable keys with no branch in this view's widget chains,
// absent on purpose, so their cells stay empty (same disclosure format
// as AssetDetailView): DATA_PRODUCTS — the GlossaryTerm spec carries it,
// but GLOSSARY_TERM_FIELDS does not request it and `mapTerm` does not
// map it, so there is no supporting data; CUSTOM_PROPERTIES — the spec
// carries `extension`, but the GlossaryTerm type carries none and this
// view loads no custom-property defs, so the widget would need a defs
// fetch; EXPERTS — the GlossaryTerm spec carries no such field;
// WORKFLOW_HISTORY — no workflow-history data source exists in this
// view; KNOWLEDGE_ARTICLE — no knowledge-article data source exists in
// the product. OWNERS never surfaces as a content key here: the
// GlossaryTerm OWNER startsWith check resolves `KnowledgePanel.Owners`
// to OWNER (see `detailWidgetDispatch.ts`), so the OWNER branch covers
// it. LEFT_PANEL is structural, not a missing branch: GenericTab
// renders the panel's children and never offers the panel itself to
// the slot.
function customizedEntryFor(tabKey: string) {
  const entry = findCustomizedTabEntry(customizedPage.value?.tabs, tabKey);
  if (!entry?.id || !isWidgetLayoutTab('GlossaryTerm', entry.id)) {
    return undefined;
  }
  return entry;
}

function widgetLayoutFor(tabKey: string) {
  const entry = customizedEntryFor(tabKey);
  return entry ? resolveWidgetLayout('GlossaryTerm', entry.id, customizedPage.value) : [];
}

// Tag labels split the official way: glossary-sourced labels are the
// glossary-terms widget, the rest are the tags widget.
const termTags = computed(() =>
  (term.value?.tags ?? []).filter((tag) => tag.source !== 'Glossary'),
);
const termGlossaryTerms = computed(() =>
  (term.value?.tags ?? []).filter((tag) => tag.source === 'Glossary'),
);
const termTierTag = computed(() => getTierTag(term.value?.tags ?? []));
const termCertificationTag = computed(() => getCertificationTag(term.value?.tags ?? []));

function tagFqnList(tags: readonly TagRef[]): string {
  return tags.map((tag) => tag.tagFQN).join(', ');
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    term.value = await getGlossaryTerm(props.id);
    const glossaryId = term.value.glossary?.id;
    if (glossaryId) {
      siblings.value = (await listGlossaryTerms({ glossary: glossaryId, limit: 100 })).data;
    } else {
      siblings.value = [];
    }
    try {
      assets.value = (await listGlossaryTermAssets(props.id, 50)).data;
    } catch {
      assets.value = [];
    }
    const fqn = term.value.fullyQualifiedName || term.value.name;
    try {
      const [activityPage, conversationPage] = await Promise.all([
        listEntityActivity('glossaryTerm', fqn),
        listConversations({ entityLink: toEntityLink('glossaryTerm', fqn), limit: 20 }),
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
    term.value = null;
    assets.value = [];
    activity.value = [];
    conversations.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('terms.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function onOpenVersions(): Promise<void> {
  const targetId = term.value?.id ?? props.id;
  if (!targetId) {
    return;
  }
  try {
    const path = await latestGovernanceVersionPath('term', targetId, (version) => getGlossaryTermVersionPath(targetId, version));
    if (!path) {
      message.info(t('asset.versionsEmpty'));
      return;
    }
    await router.push(path);
  } catch {
    message.error(t('asset.versionsFailed'));
  }
}

function openEdit(): void {
  if (!term.value) {
    return;
  }
  editForm.displayName = term.value.displayName || '';
  editForm.description = term.value.description || '';
  editForm.relatedTermFqns = term.value.relatedTerms
    .map((item) => item.fullyQualifiedName || item.name)
    .filter(Boolean);
  // Rebuild the rich-text editor so it opens on the current description.
  editKey.value += 1;
  editOpen.value = true;
}

async function onSave(): Promise<void> {
  if (!term.value?.glossary) {
    message.error(t('terms.missingGlossary'));
    return;
  }
  saving.value = true;
  try {
    await updateGlossaryTerm({
      glossary: term.value.glossary.fullyQualifiedName || term.value.glossary.name,
      name: term.value.name,
      description: descriptionEditorRef.value?.getEditorContent()?.trim() ?? editForm.description.trim(),
      displayName: editForm.displayName.trim() || undefined,
      parent: term.value.parent?.fullyQualifiedName || term.value.parent?.name,
      relatedTerms: editForm.relatedTermFqns,
    });
    editOpen.value = false;
    message.success(t('terms.updated'));
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
  if (!term.value?.glossary) {
    message.error(t('terms.missingGlossary'));
    return;
  }
  await updateGlossaryTerm({
    glossary: term.value.glossary.fullyQualifiedName || term.value.glossary.name,
    name: term.value.name,
    description,
    displayName: term.value.displayName || undefined,
    parent: term.value.parent?.fullyQualifiedName || term.value.parent?.name,
    relatedTerms: term.value.relatedTerms
      .map((item) => item.fullyQualifiedName || item.name)
      .filter(Boolean),
  });
  message.success(t('terms.updated'));
  await load();
}

async function onDeleteTerm(): Promise<void> {
  if (!term.value) {
    return;
  }
  const confirmed = await confirmDelete({
    title: t('crud.deleteTitle'),
    content: t('crud.deleteConfirm', { name: term.value.displayName || term.value.name }),
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed) {
    return;
  }
  try {
    await deleteGlossaryTerm(term.value.id, { hardDelete: true, recursive: true });
    message.success(t('crud.deletedName', { name: term.value.displayName || term.value.name }));
    if (term.value.glossary?.id) {
      await router.push({ name: 'governance-glossary', params: { id: term.value.glossary.id } });
    } else {
      await router.push({ name: 'governance-glossaries' });
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.deleteFailed'));
  }
}

function openAsset(asset: EntityRef): void {
  const entityType = asset.type || '';
  const fqn = asset.fullyQualifiedName || asset.name;
  if (!isDetailWired(entityType) || !fqn) {
    return;
  }
  void router.push({ name: 'asset', params: { entityType, fqn } });
}

function openTerm(child: EntityRef): void {
  if (!child.id) {
    return;
  }
  void router.push({ name: 'governance-term', params: { id: child.id } });
}

watch(
  () => props.id,
  () => {
    void load();
  },
);

onMounted(() => {
  void load();
});
</script>

<template>
  <EntityDetailShell
    :title="term?.displayName || term?.name || t('terms.fallback')"
    :name="term?.name"
    :fqn="term?.fullyQualifiedName"
    :loading="loading"
    :error="errorMessage"
    :empty="!term && !loading && !errorMessage"
    :breadcrumbs="breadcrumbs"
    :tabs="term ? tabs : []"
    v-model:active-tab="activeTab"
  >
    <template #meta>
      <!-- Status renders only when the server returned entityStatus;
           it is never defaulted to Approved (see GlossaryTerm type). -->
      <Tag v-if="term?.status" data-testid="term-status" color="purple">
        {{ term.status }}
      </Tag>
    </template>
    <template #actions>
      <!-- Stable keys: the back button appears only after load, and
           without keys the insertion reuses the sibling button
           instances positionally, leaving stale data-testid
           attributes on the wrong buttons. -->
      <Button
        key="term-back"
        v-if="term?.glossary?.id"
        @click="router.push({ name: 'governance-glossary', params: { id: term.glossary.id } })"
      >
        {{ t('terms.back') }}
      </Button>
      <Button key="term-versions" data-testid="term-versions" :disabled="!term" @click="onOpenVersions">{{ t('governance.versions.openVersions') }}</Button>
      <Button key="delete-term" danger data-testid="delete-term" :disabled="!term" @click="onDeleteTerm">{{ t('crud.delete') }}</Button>
      <Button key="edit-term" type="primary" data-testid="edit-term" :disabled="!term" @click="openEdit">
        {{ t('terms.edit') }}
      </Button>
    </template>
    <template #overview>
      <GenericTab v-if="customizedEntryFor('overview')" :layout="widgetLayoutFor('overview')" page-type="GlossaryTerm">
        <template #widget="{ contentKey }">
          <div v-if="contentKey === DetailWidgetKeys.DESCRIPTION && term" data-testid="widget-description">
            <EntityDescriptionCell
              :description="term.description"
              :entity-name="term.displayName || term.name"
              :has-edit-access="canEditDescription"
              :on-description-update="onDescriptionUpdate"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.RELATED_TERMS && term" data-testid="widget-related-terms">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('terms.relatedTerms')">{{ joinRefNames(term.relatedTerms) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.OWNER && term" data-testid="widget-owner">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('crud.owners')">{{ joinRefNames(term.owners) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TAGS && term" data-testid="widget-tags">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.fields.tags')">{{ tagFqnList(termTags) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.GLOSSARY_TERMS && term" data-testid="widget-glossary-terms">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.tabs.glossaryTerms')">{{ tagFqnList(termGlossaryTerms) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TIER && term" data-testid="widget-tier">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('label.tier')">{{ termTierTag?.tagFQN || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CERTIFICATION && term" data-testid="widget-certification">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('label.certification')">{{ termCertificationTag?.tagFQN || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.SYNONYMS && term" data-testid="widget-synonyms">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('terms.synonyms')">{{ term.synonyms.join(', ') || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.REFERENCES && term" data-testid="widget-references">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('terms.references')">
                <Space v-if="term.references.length" wrap>
                  <template v-for="(reference, index) in term.references" :key="index">
                    <a
                      v-if="getSafeHttpUrl(reference.endpoint)"
                      :href="getSafeHttpUrl(reference.endpoint)"
                      target="_blank"
                      rel="noopener noreferrer"
                    >{{ reference.name || reference.endpoint }}</a>
                    <span v-else>{{ reference.name || reference.endpoint }}</span>
                  </template>
                </Space>
                <template v-else>—</template>
              </Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.REVIEWER && term" data-testid="widget-reviewer">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('terms.reviewers')">{{ joinRefNames(term.reviewers) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.DOMAIN && term" data-testid="widget-domain">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.fields.domains')">{{ joinRefNames(term.domains) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
        </template>
      </GenericTab>
      <Descriptions v-else-if="term" bordered :column="1" size="small">
        <Descriptions.Item :label="t('crud.name')">{{ term.name }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.fqn')">{{ term.fullyQualifiedName }}</Descriptions.Item>
        <Descriptions.Item :label="t('terms.glossary')">{{ term.glossary?.name || '—' }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.parent')">{{ term.parent?.name || '—' }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.description')">
              <EntityDescriptionCell
                :description="term.description"
                :entity-name="term.displayName || term.name"
                :has-edit-access="canEditDescription"
                :on-description-update="onDescriptionUpdate"
              />
            </Descriptions.Item>
        <Descriptions.Item :label="t('terms.relatedTerms')">
          {{ term.relatedTerms.map((item) => item.displayName || item.name).join(', ') || '—' }}
        </Descriptions.Item>
      </Descriptions>
    </template>
    <template #glossary_terms>
      <GenericTab v-if="customizedEntryFor('glossary_terms')" :layout="widgetLayoutFor('glossary_terms')" page-type="GlossaryTerm">
        <template #widget="{ contentKey }">
          <div v-if="contentKey === DetailWidgetKeys.DESCRIPTION && term" data-testid="widget-description">
            <EntityDescriptionCell
              :description="term.description"
              :entity-name="term.displayName || term.name"
              :has-edit-access="canEditDescription"
              :on-description-update="onDescriptionUpdate"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.RELATED_TERMS && term" data-testid="widget-related-terms">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('terms.relatedTerms')">{{ joinRefNames(term.relatedTerms) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.OWNER && term" data-testid="widget-owner">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('crud.owners')">{{ joinRefNames(term.owners) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TAGS && term" data-testid="widget-tags">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.fields.tags')">{{ tagFqnList(termTags) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.GLOSSARY_TERMS && term" data-testid="widget-glossary-terms">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.tabs.glossaryTerms')">{{ tagFqnList(termGlossaryTerms) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TIER && term" data-testid="widget-tier">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('label.tier')">{{ termTierTag?.tagFQN || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CERTIFICATION && term" data-testid="widget-certification">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('label.certification')">{{ termCertificationTag?.tagFQN || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.SYNONYMS && term" data-testid="widget-synonyms">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('terms.synonyms')">{{ term.synonyms.join(', ') || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.REFERENCES && term" data-testid="widget-references">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('terms.references')">
                <Space v-if="term.references.length" wrap>
                  <template v-for="(reference, index) in term.references" :key="index">
                    <a
                      v-if="getSafeHttpUrl(reference.endpoint)"
                      :href="getSafeHttpUrl(reference.endpoint)"
                      target="_blank"
                      rel="noopener noreferrer"
                    >{{ reference.name || reference.endpoint }}</a>
                    <span v-else>{{ reference.name || reference.endpoint }}</span>
                  </template>
                </Space>
                <template v-else>—</template>
              </Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.REVIEWER && term" data-testid="widget-reviewer">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('terms.reviewers')">{{ joinRefNames(term.reviewers) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.DOMAIN && term" data-testid="widget-domain">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.fields.domains')">{{ joinRefNames(term.domains) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
        </template>
      </GenericTab>
      <SmTable
        v-else
        row-key="id"
        test-id="term-children-table"
        :columns="assetColumns"
        :data-source="term?.children ?? []"
        :pagination="false"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a
              v-if="(record as EntityRef).id"
              href="#"
              @click.prevent="openTerm(record as EntityRef)"
            >
              {{ (record as EntityRef).displayName || (record as EntityRef).name }}
            </a>
            <span v-else>{{ (record as EntityRef).displayName || (record as EntityRef).name }}</span>
          </template>
        </template>
      </SmTable>
    </template>
    <template #assets>
      <GenericTab v-if="customizedEntryFor('assets')" :layout="widgetLayoutFor('assets')" page-type="GlossaryTerm">
        <template #widget="{ contentKey }">
          <div v-if="contentKey === DetailWidgetKeys.DESCRIPTION && term" data-testid="widget-description">
            <EntityDescriptionCell
              :description="term.description"
              :entity-name="term.displayName || term.name"
              :has-edit-access="canEditDescription"
              :on-description-update="onDescriptionUpdate"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.RELATED_TERMS && term" data-testid="widget-related-terms">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('terms.relatedTerms')">{{ joinRefNames(term.relatedTerms) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.OWNER && term" data-testid="widget-owner">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('crud.owners')">{{ joinRefNames(term.owners) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TAGS && term" data-testid="widget-tags">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.fields.tags')">{{ tagFqnList(termTags) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.GLOSSARY_TERMS && term" data-testid="widget-glossary-terms">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.tabs.glossaryTerms')">{{ tagFqnList(termGlossaryTerms) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TIER && term" data-testid="widget-tier">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('label.tier')">{{ termTierTag?.tagFQN || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CERTIFICATION && term" data-testid="widget-certification">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('label.certification')">{{ termCertificationTag?.tagFQN || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.SYNONYMS && term" data-testid="widget-synonyms">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('terms.synonyms')">{{ term.synonyms.join(', ') || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.REFERENCES && term" data-testid="widget-references">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('terms.references')">
                <Space v-if="term.references.length" wrap>
                  <template v-for="(reference, index) in term.references" :key="index">
                    <a
                      v-if="getSafeHttpUrl(reference.endpoint)"
                      :href="getSafeHttpUrl(reference.endpoint)"
                      target="_blank"
                      rel="noopener noreferrer"
                    >{{ reference.name || reference.endpoint }}</a>
                    <span v-else>{{ reference.name || reference.endpoint }}</span>
                  </template>
                </Space>
                <template v-else>—</template>
              </Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.REVIEWER && term" data-testid="widget-reviewer">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('terms.reviewers')">{{ joinRefNames(term.reviewers) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.DOMAIN && term" data-testid="widget-domain">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.fields.domains')">{{ joinRefNames(term.domains) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
        </template>
      </GenericTab>
      <template v-else>
        <Typography.Title :level="5">{{ t('terms.relatedEntities') }}</Typography.Title>
        <Typography.Paragraph type="secondary">
          {{ t('terms.relatedLead') }}
        </Typography.Paragraph>
        <SmTable
          row-key="id"
          test-id="term-assets-table"
          :columns="assetColumns"
          :data-source="assets"
          :pagination="false"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              <a
                v-if="isDetailWired((record as EntityRef).type || '') && (record as EntityRef).fullyQualifiedName"
                href="#"
                @click.prevent="openAsset(record as EntityRef)"
              >
                {{ (record as EntityRef).displayName || (record as EntityRef).name }}
              </a>
              <span v-else>{{ (record as EntityRef).displayName || (record as EntityRef).name }}</span>
            </template>
          </template>
        </SmTable>
        <Typography.Text v-if="!assets.length" type="secondary">{{ t('terms.noAssets') }}</Typography.Text>
      </template>
    </template>
    <template #activity_feed>
      <GenericTab v-if="customizedEntryFor('activity_feed')" :layout="widgetLayoutFor('activity_feed')" page-type="GlossaryTerm">
        <template #widget="{ contentKey }">
          <div v-if="contentKey === DetailWidgetKeys.DESCRIPTION && term" data-testid="widget-description">
            <EntityDescriptionCell
              :description="term.description"
              :entity-name="term.displayName || term.name"
              :has-edit-access="canEditDescription"
              :on-description-update="onDescriptionUpdate"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.RELATED_TERMS && term" data-testid="widget-related-terms">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('terms.relatedTerms')">{{ joinRefNames(term.relatedTerms) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.OWNER && term" data-testid="widget-owner">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('crud.owners')">{{ joinRefNames(term.owners) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TAGS && term" data-testid="widget-tags">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.fields.tags')">{{ tagFqnList(termTags) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.GLOSSARY_TERMS && term" data-testid="widget-glossary-terms">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.tabs.glossaryTerms')">{{ tagFqnList(termGlossaryTerms) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TIER && term" data-testid="widget-tier">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('label.tier')">{{ termTierTag?.tagFQN || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CERTIFICATION && term" data-testid="widget-certification">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('label.certification')">{{ termCertificationTag?.tagFQN || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.SYNONYMS && term" data-testid="widget-synonyms">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('terms.synonyms')">{{ term.synonyms.join(', ') || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.REFERENCES && term" data-testid="widget-references">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('terms.references')">
                <Space v-if="term.references.length" wrap>
                  <template v-for="(reference, index) in term.references" :key="index">
                    <a
                      v-if="getSafeHttpUrl(reference.endpoint)"
                      :href="getSafeHttpUrl(reference.endpoint)"
                      target="_blank"
                      rel="noopener noreferrer"
                    >{{ reference.name || reference.endpoint }}</a>
                    <span v-else>{{ reference.name || reference.endpoint }}</span>
                  </template>
                </Space>
                <template v-else>—</template>
              </Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.REVIEWER && term" data-testid="widget-reviewer">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('terms.reviewers')">{{ joinRefNames(term.reviewers) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.DOMAIN && term" data-testid="widget-domain">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.fields.domains')">{{ joinRefNames(term.domains) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
        </template>
      </GenericTab>
      <AssetActivityPanel
        v-else
        :activity="activity"
        :conversations="conversations"
        :collaboration-error="collaborationError"
        entity-type="glossaryTerm"
        :fqn="term?.fullyQualifiedName || term?.name || ''"
      />
    </template>
    <template #relations_graph>
      <GenericTab v-if="customizedEntryFor('relations_graph')" :layout="widgetLayoutFor('relations_graph')" page-type="GlossaryTerm">
        <template #widget="{ contentKey }">
          <div v-if="contentKey === DetailWidgetKeys.DESCRIPTION && term" data-testid="widget-description">
            <EntityDescriptionCell
              :description="term.description"
              :entity-name="term.displayName || term.name"
              :has-edit-access="canEditDescription"
              :on-description-update="onDescriptionUpdate"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.RELATED_TERMS && term" data-testid="widget-related-terms">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('terms.relatedTerms')">{{ joinRefNames(term.relatedTerms) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.OWNER && term" data-testid="widget-owner">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('crud.owners')">{{ joinRefNames(term.owners) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TAGS && term" data-testid="widget-tags">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.fields.tags')">{{ tagFqnList(termTags) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.GLOSSARY_TERMS && term" data-testid="widget-glossary-terms">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.tabs.glossaryTerms')">{{ tagFqnList(termGlossaryTerms) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TIER && term" data-testid="widget-tier">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('label.tier')">{{ termTierTag?.tagFQN || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CERTIFICATION && term" data-testid="widget-certification">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('label.certification')">{{ termCertificationTag?.tagFQN || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.SYNONYMS && term" data-testid="widget-synonyms">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('terms.synonyms')">{{ term.synonyms.join(', ') || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.REFERENCES && term" data-testid="widget-references">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('terms.references')">
                <Space v-if="term.references.length" wrap>
                  <template v-for="(reference, index) in term.references" :key="index">
                    <a
                      v-if="getSafeHttpUrl(reference.endpoint)"
                      :href="getSafeHttpUrl(reference.endpoint)"
                      target="_blank"
                      rel="noopener noreferrer"
                    >{{ reference.name || reference.endpoint }}</a>
                    <span v-else>{{ reference.name || reference.endpoint }}</span>
                  </template>
                </Space>
                <template v-else>—</template>
              </Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.REVIEWER && term" data-testid="widget-reviewer">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('terms.reviewers')">{{ joinRefNames(term.reviewers) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.DOMAIN && term" data-testid="widget-domain">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.fields.domains')">{{ joinRefNames(term.domains) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
        </template>
      </GenericTab>
      <Empty v-else data-testid="asset-tab-residual" :description="t('asset.tabResidual.relationsGraph')" />
    </template>
    <template #custom_properties>
      <GenericTab v-if="customizedEntryFor('custom_properties')" :layout="widgetLayoutFor('custom_properties')" page-type="GlossaryTerm">
        <template #widget="{ contentKey }">
          <div v-if="contentKey === DetailWidgetKeys.DESCRIPTION && term" data-testid="widget-description">
            <EntityDescriptionCell
              :description="term.description"
              :entity-name="term.displayName || term.name"
              :has-edit-access="canEditDescription"
              :on-description-update="onDescriptionUpdate"
            />
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.RELATED_TERMS && term" data-testid="widget-related-terms">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('terms.relatedTerms')">{{ joinRefNames(term.relatedTerms) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.OWNER && term" data-testid="widget-owner">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('crud.owners')">{{ joinRefNames(term.owners) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TAGS && term" data-testid="widget-tags">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.fields.tags')">{{ tagFqnList(termTags) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.GLOSSARY_TERMS && term" data-testid="widget-glossary-terms">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.tabs.glossaryTerms')">{{ tagFqnList(termGlossaryTerms) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.TIER && term" data-testid="widget-tier">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('label.tier')">{{ termTierTag?.tagFQN || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.CERTIFICATION && term" data-testid="widget-certification">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('label.certification')">{{ termCertificationTag?.tagFQN || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.SYNONYMS && term" data-testid="widget-synonyms">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('terms.synonyms')">{{ term.synonyms.join(', ') || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.REFERENCES && term" data-testid="widget-references">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('terms.references')">
                <Space v-if="term.references.length" wrap>
                  <template v-for="(reference, index) in term.references" :key="index">
                    <a
                      v-if="getSafeHttpUrl(reference.endpoint)"
                      :href="getSafeHttpUrl(reference.endpoint)"
                      target="_blank"
                      rel="noopener noreferrer"
                    >{{ reference.name || reference.endpoint }}</a>
                    <span v-else>{{ reference.name || reference.endpoint }}</span>
                  </template>
                </Space>
                <template v-else>—</template>
              </Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.REVIEWER && term" data-testid="widget-reviewer">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('terms.reviewers')">{{ joinRefNames(term.reviewers) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
          <div v-else-if="contentKey === DetailWidgetKeys.DOMAIN && term" data-testid="widget-domain">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item :label="t('asset.fields.domains')">{{ joinRefNames(term.domains) || '—' }}</Descriptions.Item>
            </Descriptions>
          </div>
        </template>
      </GenericTab>
      <Empty v-else data-testid="asset-tab-residual" :description="t('asset.tabResidual.termCustomProperties')" />
    </template>
    <template #data_observability>
      <DataQualityDashboard
        v-if="term"
        is-governance-view
        class-name="data-quality-governance-tab-wrapper"
        :hidden-filters="['glossaryTerms']"
        :initial-filters="termDqInitialFilters"
      />
    </template>
  </EntityDetailShell>
  <FormModal
    :open="editOpen"
    :title="t('terms.editTitle')"
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
      <Form.Item :label="t('terms.relatedTerms')">
        <Select v-model:value="editForm.relatedTermFqns" mode="multiple" allow-clear>
          <Select.Option
            v-for="item in siblings.filter((candidate) => candidate.id !== term?.id)"
            :key="item.id"
            :value="item.fullyQualifiedName || item.name"
          >
            {{ item.displayName || item.name }}
          </Select.Option>
        </Select>
      </Form.Item>
    </Form>
  </FormModal>
</template>
