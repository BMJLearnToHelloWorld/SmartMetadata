/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { fetchAssetDetail, getEntityVersion, listEntityVersions, type EntityVersion } from '@/api/entities';
import { DEFAULT_ENTITY_PERMISSION } from '@/composables/useEntityPermissions';
import { useEntityPermissions } from '@/composables/useEntityPermissions';
import type { AssetDetail } from '@/types/api';
import { getResourceEntityFromEntityType } from '@/catalog/entityVersion';
import { getDecodedFqn, getEntityDetailsPath, getVersionPath } from '@/utils/fqnPaths';

export interface EntityVersionRouteProps {
  entityType: string;
  fqn: string;
  version: string;
  tab?: string;
}

export function useSelfContainedVersionPage(props: {
  entityType: string;
  fqn: MaybeRefOrGetter<string>;
  version: MaybeRefOrGetter<string>;
  tab?: MaybeRefOrGetter<string | undefined>;
}) {
  const router = useRouter();
  const decodedFqn = computed(() => getDecodedFqn(toValue(props.fqn)));
  const version = computed(() => toValue(props.version));
  const tab = computed(() => toValue(props.tab));
  const {
    permissions: entityPermissions,
    isLoading: isPermissionsLoading,
    error: permissionsError,
    hasViewAccess,
  } = useEntityPermissions(
    () => getResourceEntityFromEntityType(props.entityType),
    () => decodedFqn.value,
    { enabled: () => Boolean(decodedFqn.value) },
  );

  const entityId = ref('');
  const currentVersionData = ref<AssetDetail>({} as AssetDetail);
  const versionList = ref<EntityVersion[]>([]);
  const isEntityVersionsLoading = ref(true);
  const isVersionLoading = ref(true);

  const isLoading = computed(
    () => isPermissionsLoading.value || (hasViewAccess.value && isEntityVersionsLoading.value),
  );

  watch(permissionsError, (error) => {
    if (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  });

  async function fetchVersionsList(): Promise<void> {
    isEntityVersionsLoading.value = true;
    try {
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

  async function fetchCurrentVersionData(id: string): Promise<void> {
    isVersionLoading.value = true;
    try {
      currentVersionData.value = await getEntityVersion(props.entityType, id, version.value);
    } finally {
      isVersionLoading.value = false;
    }
  }

  function versionHandler(newVersion = version.value): void {
    void router.push(
      getVersionPath(props.entityType, decodedFqn.value, newVersion, tab.value),
    );
  }

  function backHandler(): void {
    void router.push(getEntityDetailsPath(props.entityType, decodedFqn.value));
  }

  watch(
    [decodedFqn, hasViewAccess],
    ([, allowed]) => {
      if (allowed) {
        void fetchVersionsList();
      }
    },
    { immediate: true },
  );

  watch(
    [version, entityId],
    ([, id]) => {
      if (id) {
        void fetchCurrentVersionData(id);
      }
    },
  );

  return {
    decodedFqn,
    entityPermissions: computed(() => entityPermissions.value ?? DEFAULT_ENTITY_PERMISSION),
    hasViewAccess,
    isLoading,
    isVersionLoading,
    currentVersionData,
    versionList,
    versionHandler,
    backHandler,
  };
}
