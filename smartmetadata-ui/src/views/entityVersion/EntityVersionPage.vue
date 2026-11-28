<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { message, Spin } from 'ant-design-vue';
import { fetchAssetDetail, getEntityVersion, listEntityVersions, type EntityVersion } from '@/api/entities';
import { DEFAULT_ENTITY_PERMISSION } from '@/composables/useEntityPermissions';
import { getEntityName } from '@/components/shared/profilePictureUtils';
import PermissionPlaceholder from '@/components/shared/PermissionPlaceholder.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import { useEntityPermissions } from '@/composables/useEntityPermissions';
import type { AssetDetail } from '@/types/api';
import {
  getResourceEntityFromEntityType,
  isParentFetchedVersionType,
  isRegularDetailVersionType,
  isSelfContainedVersionType,
} from '@/catalog/entityVersion';
import entityVersionClassBase from '@/utils/entityVersionClassBase';
import { getDecodedFqn, getEntityDetailsPath, getVersionPath } from '@/utils/fqnPaths';

const props = defineProps<{
  entityType: string;
  fqn: string;
  version: string;
  tab?: string;
}>();

const { t } = useI18n();
const router = useRouter();

const decodedFqn = computed(() => getDecodedFqn(props.fqn));
const resourceEntity = computed(() => getResourceEntityFromEntityType(props.entityType));

const {
  permissions: entityPermissions,
  isLoading: isPermissionsLoading,
  error: permissionsError,
  hasViewAccess,
} = useEntityPermissions(resourceEntity, decodedFqn, {
  enabled: () => Boolean(decodedFqn.value),
});

watch(permissionsError, (error) => {
  if (error) {
    message.error(error instanceof Error ? error.message : String(error));
  }
});

const entityId = ref('');
const currentVersionData = ref<AssetDetail>({} as AssetDetail);
const versionList = ref<EntityVersion[]>([]);
const isEntityVersionsLoading = ref(true);
const isVersionLoading = ref(true);

const isLoading = computed(
  () => isPermissionsLoading.value || (hasViewAccess.value && isEntityVersionsLoading.value),
);

function backHandler(): void {
  void router.push(getEntityDetailsPath(props.entityType, decodedFqn.value));
}

function versionHandler(newVersion = props.version): void {
  void router.push(
    props.tab
      ? getVersionPath(props.entityType, decodedFqn.value, newVersion, props.tab)
      : getVersionPath(props.entityType, decodedFqn.value, newVersion),
  );
}

async function fetchEntityVersions(): Promise<void> {
  isEntityVersionsLoading.value = true;
  try {
    if (!isParentFetchedVersionType(props.entityType)) {
      return;
    }
    const current = await fetchAssetDetail(props.entityType, decodedFqn.value, { include: 'all' });
    entityId.value = current.id ?? '';
    if (current.id) {
      versionList.value = await listEntityVersions(props.entityType, current.id);
    } else {
      versionList.value = [];
    }
  } finally {
    isEntityVersionsLoading.value = false;
  }
}

async function fetchCurrentVersion(id: string): Promise<void> {
  isVersionLoading.value = true;
  try {
    if (hasViewAccess.value && isParentFetchedVersionType(props.entityType)) {
      currentVersionData.value = await getEntityVersion(props.entityType, id, props.version);
    }
  } finally {
    isVersionLoading.value = false;
  }
}

watch(
  [decodedFqn, hasViewAccess],
  ([, allowed]) => {
    if (allowed) {
      void fetchEntityVersions();
    }
  },
  { immediate: true },
);

watch(
  () => [props.version, entityId.value] as const,
  ([, id]) => {
    if (id) {
      void fetchCurrentVersion(id);
    }
  },
);

const versionComponent = computed(() => entityVersionClassBase.getEntityVersionComponent(props.entityType));
const detailComponent = computed(() => entityVersionClassBase.getEntityDetailComponent(props.entityType));
const isSelfContained = computed(() => isSelfContainedVersionType(props.entityType));
const isRegularDetail = computed(() => isRegularDetailVersionType(props.entityType));
const isParentFetched = computed(() => isParentFetchedVersionType(props.entityType));

const pageTitle = computed(() =>
  t('label.entity-detail-plural', {
    entity: getEntityName(currentVersionData.value) || currentVersionData.value.name || '',
  }),
);
</script>

<template>
  <PageLayout :document-title="pageTitle">
    <Spin v-if="isLoading" data-testid="loader" />
    <PermissionPlaceholder
      v-else-if="!hasViewAccess"
      data-testid="permission-error-placeholder"
      :permission-value="t('label.view-entity', {
        entity: `${getEntityName(currentVersionData) || currentVersionData.name || ''} ${t('label.version')}`,
      })"
    />
    <component
      :is="versionComponent"
      v-else-if="isSelfContained && versionComponent"
      :entity-type="entityType"
      :fqn="decodedFqn"
      :tab="tab"
      :version="version"
    />
    <component
      :is="versionComponent"
      v-else-if="isRegularDetail && versionComponent"
      :fqn="decodedFqn"
    />
    <component
      :is="versionComponent"
      v-else-if="isParentFetched && versionComponent"
      :back-handler="backHandler"
      :current-version-data="currentVersionData"
      :data-products="currentVersionData.dataProducts"
      :deleted="currentVersionData.deleted"
      :domains="currentVersionData.domains"
      :entity-permissions="entityPermissions ?? DEFAULT_ENTITY_PERMISSION"
      :is-version-loading="isVersionLoading"
      :owners="currentVersionData.owners"
      :tab="tab"
      :version="version"
      :version-handler="versionHandler"
      :version-list="versionList"
    />
    <component
      :is="detailComponent"
      v-else
      :entity-type="entityType"
      :fqn="decodedFqn"
    />
  </PageLayout>
</template>
