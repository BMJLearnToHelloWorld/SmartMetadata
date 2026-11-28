<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official GlossaryVersion: shared glossary and glossary-term version
  surfaces (isGlossary sibling). Official version-view tabs only.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Tabs, Tooltip, Typography, message } from 'ant-design-vue';
import { mapChangeDescription, type ChangeDescription } from '@/api/entities';
import { getGovernanceVersion, listGovernanceVersions } from '@/api/governanceVersions';
import { DetailWidgetKeys } from '@/catalog/detailWidgetDispatch';
import { getGovernanceDetailPath, getGlossaryTermVersionPath, getGlossaryVersionPath } from '@/catalog/versionPaths';
import GenericTab from '@/components/customize/GenericTab.vue';
import ServiceVersionTimeline from '@/components/ingestion/ServiceVersionTimeline.vue';
import VersionDiffText from '@/components/ingestion/VersionDiffText.vue';
import GlossaryTermsWidget from '@/components/lists/GlossaryTermsWidget.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import SmState from '@/components/shared/SmState.vue';
import WidgetCertificationTagCell from '@/components/shared/widgets/WidgetCertificationTagCell.vue';
import WidgetDomainCell from '@/components/shared/widgets/WidgetDomainCell.vue';
import WidgetOwnerCell from '@/components/shared/widgets/WidgetOwnerCell.vue';
import WidgetOwnersCell from '@/components/shared/widgets/WidgetOwnersCell.vue';
import WidgetReferencesCell from '@/components/shared/widgets/WidgetReferencesCell.vue';
import WidgetRelatedTermsCell from '@/components/shared/widgets/WidgetRelatedTermsCell.vue';
import WidgetReviewerCell from '@/components/shared/widgets/WidgetReviewerCell.vue';
import WidgetSynonymsCell from '@/components/shared/widgets/WidgetSynonymsCell.vue';
import WidgetTagsCell from '@/components/shared/widgets/WidgetTagsCell.vue';
import WidgetTierCell from '@/components/shared/widgets/WidgetTierCell.vue';
import WidgetWorkflowHistoryCell from '@/components/shared/widgets/WidgetWorkflowHistoryCell.vue';
import { resolveWidgetLayout } from '@/composables/customizeWidgetLayout';
import { useCustomPages } from '@/composables/useCustomPages';
import { VERSION_VIEW_GLOSSARY_PERMISSION } from '@/composables/useEntityPermissions';
import { getEntityVersionByField } from '@/ingestion/versionDiff';
import type { OwnerOption } from '@/governance/catalogOptions';
import type { AssetTagOption, Domain, Glossary, TermReference } from '@/types/governance';
import type { EntityRef, TagRef } from '@/types/api';
import { getErrorText } from '@/views/admin/accessApiErrors';

const props = withDefaults(defineProps<{
  isGlossary?: boolean;
  id: string;
  version: string;
  tab?: string;
}>(), {
  isGlossary: false,
});

const router = useRouter();
const { t } = useI18n();

const loading = ref(true);
const versions = ref(awaitableEmpty());
const snapshot = ref<Record<string, unknown> | null>(null);

function awaitableEmpty() {
  return [] as Awaited<ReturnType<typeof listGovernanceVersions>>;
}

const kind = computed(() => (props.isGlossary ? 'glossary' : 'term'));
const pageType = computed(() => (props.isGlossary ? 'Glossary' : 'GlossaryTerm'));
const versionTab = computed(() => (props.isGlossary ? 'terms' : (props.tab || 'overview')));
const { customizedPage } = useCustomPages(pageType);

const layout = computed(() => resolveWidgetLayout(pageType.value, versionTab.value, customizedPage.value, true));

const changeDescription = computed<ChangeDescription | undefined>(() => {
  const raw = snapshot.value;
  return raw ? mapChangeDescription(raw.changeDescription) : undefined;
});

const entityName = computed(() => {
  const raw = snapshot.value ?? {};
  const displayName = typeof raw.displayName === 'string' ? raw.displayName : '';
  const name = typeof raw.name === 'string' ? raw.name : '';
  return displayName || name || props.id;
});

const pageTitle = computed(() =>
  t('label.entity-version', {
    entity: entityName.value || t(props.isGlossary ? 'label.glossary' : 'label.glossary-term'),
  }),
);

const termNameDiff = computed(() => {
  const raw = snapshot.value ?? {};
  const fallback = typeof raw.name === 'string' ? raw.name : props.id;
  return getEntityVersionByField(changeDescription.value, 'name', fallback);
});

const termDisplayNameDiff = computed(() => {
  const raw = snapshot.value ?? {};
  const fallback = typeof raw.displayName === 'string' ? raw.displayName : '';
  return getEntityVersionByField(changeDescription.value, 'displayName', fallback);
});

const descriptionText = computed(() => {
  const raw = snapshot.value ?? {};
  return typeof raw.description === 'string' ? raw.description : '';
});

const descriptionDiff = computed(() =>
  getEntityVersionByField(changeDescription.value, 'description', descriptionText.value),
);

const glossaryEntity = computed(() => (snapshot.value ?? {}) as unknown as Glossary);

const owners = computed(() => (Array.isArray(snapshot.value?.owners) ? snapshot.value.owners : []) as EntityRef[]);
const domains = computed(() => (Array.isArray(snapshot.value?.domains) ? snapshot.value.domains : []) as EntityRef[]);
const reviewers = computed(() => (Array.isArray(snapshot.value?.reviewers) ? snapshot.value.reviewers : []) as EntityRef[]);
const tags = computed(() => (Array.isArray(snapshot.value?.tags) ? snapshot.value.tags : []) as TagRef[]);
const synonyms = computed(() => (Array.isArray(snapshot.value?.synonyms) ? snapshot.value.synonyms : []) as string[]);
const references = computed(() => (Array.isArray(snapshot.value?.references) ? snapshot.value.references : []) as TermReference[]);
const relatedTerms = computed(() => (Array.isArray(snapshot.value?.relatedTerms) ? snapshot.value.relatedTerms : []) as EntityRef[]);
const termFqn = computed(() => {
  const value = snapshot.value?.fullyQualifiedName;
  return typeof value === 'string' ? value : undefined;
});
const entityStatus = computed(() => {
  const value = snapshot.value?.status;
  return typeof value === 'string' ? value : undefined;
});

const emptyDomains: Domain[] = [];
const emptyOwners: OwnerOption[] = [];
const emptyTags: AssetTagOption[] = [];
const emptyTerms: EntityRef[] = [];
const emptyRelationTypes: Array<{ name: string; displayName?: string }> = [];

function noop(): void {
  // Official VERSION_VIEW_GLOSSARY_PERMISSION: all edit flags are false.
}

async function noopAsync(): Promise<void> {
  // Official version-view widgets stay read-only.
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const [list, snap] = await Promise.all([
      listGovernanceVersions(kind.value, props.id),
      getGovernanceVersion(kind.value, props.id, props.version),
    ]);
    versions.value = list;
    snapshot.value = snap;
  } catch (error) {
    versions.value = [];
    snapshot.value = null;
    message.error(
      getErrorText(
        error,
        t('server.entity-fetch-error', {
          entity: t(props.isGlossary ? 'label.glossary' : 'label.glossary-term'),
        }),
      ),
    );
  } finally {
    loading.value = false;
  }
}

function onSelectVersion(version: string): void {
  const path = props.isGlossary
    ? getGlossaryVersionPath(props.id, version)
    : getGlossaryTermVersionPath(props.id, version, props.tab);
  void router.push(path);
}

const displayVersion = computed(() => {
  const value = snapshot.value?.version ?? props.version;
  return String(value);
});

function onBack(): void {
  void router.push(getGovernanceDetailPath(kind.value, props.id));
}

watch(
  () => [props.isGlossary, props.id, props.version],
  () => {
    void load();
  },
  { immediate: true },
);
</script>

<template>
  <PageLayout>
    <div class="glossary-version">
      <div class="glossary-version__main">
        <PageHeader :header="pageTitle" />
        <SmState
          v-if="loading || !snapshot"
          :state="loading ? 'loading' : 'empty'"
          test-id="glossary-version-state"
        />
        <template v-else>
          <div data-testid="glossary-header" class="glossary-version__header">
            <Typography.Title :level="3">
              <template v-if="isGlossary">{{ entityName }}</template>
              <template v-else>
                <VersionDiffText :diff="termDisplayNameDiff" />
                <span class="glossary-version__name">
                  <VersionDiffText :diff="termNameDiff" />
                </span>
              </template>
            </Typography.Title>
            <div class="glossary-version__header-actions">
              <Tooltip :title="t('label.exit-version-history')">
                <Button data-testid="version-button" @click="onBack">
                  {{ displayVersion }}
                </Button>
              </Tooltip>
            </div>
          </div>
          <Tabs :active-key="versionTab" data-testid="glossary-version-tabs">
            <Tabs.TabPane
              v-if="isGlossary"
              :key="'terms'"
              :tab="t('label.term-plural')"
            >
              <div data-testid="glossary-tab-terms">
              <GenericTab :layout="layout" page-type="Glossary" data-testid="generic-tab">
                <template #widget="{ contentKey }">
                  <div v-if="contentKey === DetailWidgetKeys.DESCRIPTION" data-testid="widget-description">
                    <VersionDiffText :diff="descriptionDiff" />
                  </div>
                  <div v-else-if="contentKey === DetailWidgetKeys.TERMS_TABLE && glossaryEntity.id" data-testid="widget-terms-table">
                    <GlossaryTermsWidget :glossary="glossaryEntity" :deleted="glossaryEntity.deleted === true" :permissions="VERSION_VIEW_GLOSSARY_PERMISSION" />
                  </div>
                  <div v-else-if="contentKey === DetailWidgetKeys.DOMAIN" data-testid="widget-domain">
                    <WidgetDomainCell :domains="domains" :options="emptyDomains" :has-edit-access="false" :on-change="noop" />
                  </div>
                  <div v-else-if="contentKey === DetailWidgetKeys.OWNERS" data-testid="widget-owners">
                    <WidgetOwnersCell :owners="owners" :options="emptyOwners" :has-edit-access="false" :on-change="noop" />
                  </div>
                  <div v-else-if="contentKey === DetailWidgetKeys.REVIEWER" data-testid="widget-reviewer">
                    <WidgetReviewerCell :reviewers="reviewers" :options="emptyOwners" :has-edit-access="false" :on-change="noop" />
                  </div>
                  <div v-else-if="contentKey === DetailWidgetKeys.TAGS" data-testid="widget-tags">
                    <WidgetTagsCell tag-type="Classification" :tags="tags" :options="emptyTags" :has-edit-access="false" :on-tags-change="noop" />
                  </div>
                  <div v-else-if="contentKey === DetailWidgetKeys.GLOSSARY_TERMS" data-testid="widget-glossary-terms">
                    <WidgetTagsCell tag-type="Glossary" :tags="tags" :options="emptyTags" :has-edit-access="false" :on-tags-change="noop" />
                  </div>
                  <div v-else-if="contentKey === DetailWidgetKeys.TIER" data-testid="widget-tier">
                    <WidgetTierCell :tags="tags" :options="emptyTags" :has-edit-access="false" :on-tags-change="noop" />
                  </div>
                  <div v-else-if="contentKey === DetailWidgetKeys.CERTIFICATION" data-testid="widget-certification">
                    <WidgetCertificationTagCell :tags="tags" :options="emptyTags" :has-edit-access="false" :on-tags-change="noop" />
                  </div>
                </template>
              </GenericTab>
              </div>
            </Tabs.TabPane>
            <Tabs.TabPane
              v-else
              :key="'overview'"
              :tab="t('label.overview')"
            >
              <div data-testid="glossary-tab-overview">
              <GenericTab :layout="layout" page-type="GlossaryTerm" data-testid="generic-tab">
                <template #widget="{ contentKey }">
                  <div v-if="contentKey === DetailWidgetKeys.DESCRIPTION" data-testid="widget-description">
                    <VersionDiffText :diff="descriptionDiff" />
                  </div>
                  <div v-else-if="contentKey === DetailWidgetKeys.DOMAIN" data-testid="widget-domain">
                    <WidgetDomainCell :domains="domains" :options="emptyDomains" :has-edit-access="false" :on-change="noop" />
                  </div>
                  <div v-else-if="contentKey === DetailWidgetKeys.OWNERS" data-testid="widget-owners">
                    <WidgetOwnersCell :owners="owners" :options="emptyOwners" :has-edit-access="false" :on-change="noop" />
                  </div>
                  <div v-else-if="contentKey === DetailWidgetKeys.OWNER" data-testid="widget-owner">
                    <WidgetOwnerCell :owners="owners" :owner-options="emptyOwners" :has-edit-access="false" :on-save="noopAsync" />
                  </div>
                  <div v-else-if="contentKey === DetailWidgetKeys.REVIEWER" data-testid="widget-reviewer">
                    <WidgetReviewerCell :reviewers="reviewers" :options="emptyOwners" :has-edit-access="false" :on-change="noop" />
                  </div>
                  <div v-else-if="contentKey === DetailWidgetKeys.TAGS" data-testid="widget-tags">
                    <WidgetTagsCell tag-type="Classification" :tags="tags" :options="emptyTags" :has-edit-access="false" :on-tags-change="noop" />
                  </div>
                  <div v-else-if="contentKey === DetailWidgetKeys.GLOSSARY_TERMS" data-testid="widget-glossary-terms">
                    <WidgetTagsCell tag-type="Glossary" :tags="tags" :options="emptyTags" :has-edit-access="false" :on-tags-change="noop" />
                  </div>
                  <div v-else-if="contentKey === DetailWidgetKeys.SYNONYMS" data-testid="widget-synonyms">
                    <WidgetSynonymsCell :synonyms="synonyms" :has-edit-access="false" :on-save="noopAsync" />
                  </div>
                  <div v-else-if="contentKey === DetailWidgetKeys.RELATED_TERMS" data-testid="widget-related-terms">
                    <WidgetRelatedTermsCell
                      :relations="relatedTerms"
                      :relation-types="emptyRelationTypes"
                      :term-options="emptyTerms"
                      :has-edit-access="false"
                      :on-save="noopAsync"
                      :on-term-click="noop"
                    />
                  </div>
                  <div v-else-if="contentKey === DetailWidgetKeys.REFERENCES" data-testid="widget-references">
                    <WidgetReferencesCell :references="references" :has-edit-access="false" :on-save="noopAsync" />
                  </div>
                  <div v-else-if="contentKey === DetailWidgetKeys.WORKFLOW_HISTORY" data-testid="widget-workflow-history">
                    <WidgetWorkflowHistoryCell :glossary-term-fqn="termFqn" :entity-status="entityStatus" />
                  </div>
                  <div v-else-if="contentKey === DetailWidgetKeys.TIER" data-testid="widget-tier">
                    <WidgetTierCell :tags="tags" :options="emptyTags" :has-edit-access="false" :on-tags-change="noop" />
                  </div>
                  <div v-else-if="contentKey === DetailWidgetKeys.CERTIFICATION" data-testid="widget-certification">
                    <WidgetCertificationTagCell :tags="tags" :options="emptyTags" :has-edit-access="false" :on-tags-change="noop" />
                  </div>
                </template>
              </GenericTab>
              </div>
            </Tabs.TabPane>
          </Tabs>
        </template>
      </div>
      <ServiceVersionTimeline
        :versions="versions"
        :current-version="version"
        entity-type="glossary"
        @select="onSelectVersion"
        @close="onBack"
      />
    </div>
  </PageLayout>
</template>

<style scoped>
.glossary-version {
  display: flex;
  gap: var(--sm-spacing-md, 16px);
  align-items: flex-start;
}

.glossary-version__main {
  flex: 1;
  min-width: 0;
}

.glossary-version__header {
  margin: var(--sm-spacing-md, 16px) 0;
}

.glossary-version__name {
  display: block;
  color: var(--sm-color-text-secondary, rgba(0, 0, 0, 0.45));
}
</style>
