<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Spin, Tabs } from 'ant-design-vue';
import type { OperationPermissions } from '@/api/permissions';
import { getDerivedPermissionFlags } from '@/api/permissions';
import type { EntityVersion } from '@/api/entities';
import type { AssetDetail, TagRef } from '@/types/api';
import DataAssetsVersionHeader from '@/components/entityVersion/DataAssetsVersionHeader.vue';
import ServiceVersionTimeline from '@/components/ingestion/ServiceVersionTimeline.vue';
import VersionDiffText from '@/components/ingestion/VersionDiffText.vue';
import PermissionPlaceholder from '@/components/shared/PermissionPlaceholder.vue';
import {
  getCommonDiffsFromVersionData,
  getCommonExtraInfoForVersionDetails,
  type TagLabelWithStatus,
} from '@/ingestion/versionDiff';
import { getTierTag } from '@/ingestion/tierTags';
import { getVersionPath } from '@/utils/fqnPaths';
import { getEntityName } from '@/components/shared/profilePictureUtils';
import { EntityTabs } from '@/catalog/entityVersion';
import { getEntityDetailsPath } from '@/utils/fqnPaths';

const props = defineProps<{
  entityType: string;
  version: string;
  tab?: string;
  currentVersionData: AssetDetail;
  versionList: EntityVersion[];
  isVersionLoading: boolean;
  entityPermissions: OperationPermissions;
  mainTabKey: string;
  mainTabLabel: string;
  deleted?: boolean;
}>();

const emit = defineEmits<{
  back: [];
  selectVersion: [version: string];
}>();

const { t } = useI18n();
const router = useRouter();

const diffs = computed(() =>
  getCommonDiffsFromVersionData(props.currentVersionData, props.currentVersionData.changeDescription),
);

const tier = computed(() => getTierTag(props.currentVersionData.tags ?? []));

const extra = computed(() =>
  getCommonExtraInfoForVersionDetails(
    props.currentVersionData.changeDescription,
    props.currentVersionData.owners,
    tier.value,
    props.currentVersionData.domains,
  ),
);

const canViewCustomFields = computed(
  () => getDerivedPermissionFlags(props.entityPermissions).canViewCustomFields,
);

const fqn = computed(() => props.currentVersionData.fullyQualifiedName || '');

const breadcrumbs = computed(() => {
  const detailsPath = fqn.value ? getEntityDetailsPath(props.entityType, fqn.value) : undefined;
  return [
    {
      name: getEntityName(props.currentVersionData) || props.currentVersionData.name || fqn.value,
      path: detailsPath,
    },
  ];
});

const activeTab = computed(() => props.tab || props.mainTabKey);

function handleTabChange(key: string | number) {
  if (!fqn.value) {
    return;
  }
  void router.push(getVersionPath(props.entityType, fqn.value, String(props.version), String(key)));
}

function classificationTags(tags: TagLabelWithStatus[]): TagLabelWithStatus[] {
  return tags.filter((tag) => (tag as TagRef).source !== 'Glossary');
}

function glossaryTags(tags: TagLabelWithStatus[]): TagLabelWithStatus[] {
  return tags.filter((tag) => (tag as TagRef).source === 'Glossary');
}

const entityTitle = computed(
  () => getEntityName(props.currentVersionData) || props.currentVersionData.name || '',
);
</script>

<template>
  <div class="entity-version-page">
    <Spin v-if="isVersionLoading" class="entity-version-page__spin" />
    <template v-else>
      <div class="entity-version-page__data" data-testid="version-data">
        <DataAssetsVersionHeader
          :breadcrumb-links="breadcrumbs"
          :current-version-data="currentVersionData"
          :deleted="deleted"
          :display-name="diffs.displayName"
          :domain-display-name="extra.domainDisplayName"
          :domains="extra.domainRef"
          :entity-type="entityType"
          :owner-display-name="extra.ownerDisplayName"
          :owner-ref="extra.ownerRef"
          :service-name="currentVersionData.service?.name"
          :tier-display-name="extra.tierDisplayName"
          :version="version"
          @version-click="emit('back')"
        />
        <Tabs :active-key="activeTab" class="entity-version-page-tabs" data-testid="entity-version-tabs" @change="handleTabChange">
          <Tabs.TabPane :key="mainTabKey" :tab="mainTabLabel">
            <div class="entity-version-page__tab">
              <div class="entity-version-page__main">
                <div data-testid="description-container" class="entity-version-page__description">
                  <VersionDiffText :diff="diffs.description" />
                </div>
                <slot />
              </div>
              <aside class="entity-version-page__right" data-testid="entity-right-panel">
                <section class="entity-version-page__panel">
                  <h3>{{ t('label.data-product-plural') }}</h3>
                  <ul v-if="currentVersionData.dataProducts?.length">
                    <li v-for="product in currentVersionData.dataProducts" :key="product.id || product.fullyQualifiedName">
                      {{ getEntityName(product) || product.name }}
                    </li>
                  </ul>
                  <p v-else class="entity-version-page__muted">
                    {{ t('label.no-entity', { entity: t('label.data-product-plural') }) }}
                  </p>
                </section>
                <section class="entity-version-page__panel">
                  <h3>{{ t('label.tag-plural') }}</h3>
                  <span
                    v-for="tag in classificationTags(diffs.tags)"
                    :key="tag.tagFQN"
                    :class="['entity-version-page__tag', tag.added && 'is-added', tag.removed && 'is-removed']"
                  >
                    {{ tag.displayName || tag.tagFQN }}
                  </span>
                </section>
                <section class="entity-version-page__panel">
                  <h3>{{ t('label.glossary-term-plural') }}</h3>
                  <span
                    v-for="tag in glossaryTags(diffs.tags)"
                    :key="tag.tagFQN"
                    :class="['entity-version-page__tag', tag.added && 'is-added', tag.removed && 'is-removed']"
                  >
                    {{ tag.displayName || tag.tagFQN }}
                  </span>
                </section>
              </aside>
            </div>
          </Tabs.TabPane>
          <Tabs.TabPane :key="EntityTabs.CUSTOM_PROPERTIES" :tab="t('label.custom-property-plural')">
            <PermissionPlaceholder
              v-if="!canViewCustomFields"
              :permission-value="t('label.custom-property-plural')"
            />
            <div v-else data-testid="custom-properties-version-view" class="entity-version-page__custom">
              <div v-if="currentVersionData.extension && Object.keys(currentVersionData.extension).length">
                <div v-for="(value, key) in currentVersionData.extension" :key="String(key)" class="entity-version-page__custom-row">
                  <strong>{{ key }}</strong>
                  <span>{{ typeof value === 'string' ? value : JSON.stringify(value) }}</span>
                </div>
              </div>
              <p v-else class="entity-version-page__muted">
                {{ t('label.no-entity', { entity: t('label.custom-property-plural') }) }}
              </p>
            </div>
          </Tabs.TabPane>
        </Tabs>
      </div>
      <ServiceVersionTimeline
        :current-version="version"
        :versions="versionList"
        @close="emit('back')"
        @select="emit('selectVersion', $event)"
      />
    </template>
    <span class="entity-version-page__title-sr">{{ t('label.entity-detail-plural', { entity: entityTitle }) }}</span>
  </div>
</template>

<style scoped>
.entity-version-page {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  min-height: 100%;
}
.entity-version-page__data {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.entity-version-page__tab {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}
.entity-version-page__main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.entity-version-page__right {
  flex: 0 0 220px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.entity-version-page__panel h3 {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--sm-color-text, inherit);
}
.entity-version-page__muted {
  color: var(--sm-color-text-secondary, rgba(0, 0, 0, 0.45));
}
.entity-version-page__tag {
  display: inline-block;
  margin: 0 4px 4px 0;
  padding: 0 6px;
  border-radius: 4px;
  background: var(--sm-color-bg-muted, rgba(0, 0, 0, 0.06));
}
.entity-version-page__tag.is-added {
  text-decoration: underline;
}
.entity-version-page__tag.is-removed {
  text-decoration: line-through;
  color: var(--sm-color-text-secondary, rgba(0, 0, 0, 0.45));
}
.entity-version-page__custom-row {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
}
.entity-version-page__title-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
.entity-version-page__spin {
  display: block;
  margin: 48px auto;
}
</style>
