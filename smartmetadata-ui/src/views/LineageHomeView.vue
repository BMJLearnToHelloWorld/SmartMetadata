<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Button, message, Spin, Tooltip } from 'ant-design-vue';
import { getDerivedPermissionFlags } from '@/api/permissions';
import { lineageLocation } from '@/catalog/entityRoutes';
import LineageCanvas from '@/components/lineage/LineageCanvas.vue';
import LineageEntitySearch from '@/components/lineage/LineageEntitySearch.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import { resolveLineageLens, type LineagePlatformLens } from '@/lineage/config';
import { usePermissionStore } from '@/stores/permissions';

/**
 * Unified lineage page — pin pages/PlatformLineage/PlatformLineage.tsx
 * serves both `/lineage` (platform-wide) and `/lineage/:entityType/:fqn`
 * (focused) from one component; this view does the same. There is no
 * FQN form: pin has none, the search picker is the only entry point.
 *
 * The page owns the search picker, the export + config actions and the
 * per-entity permission check; the graph itself stays in LineageCanvas
 * (the seam L4's scene map plugs into later). Config save writes the
 * Pinia lineage store, which the canvas watches — the same store-write
 * → refetch shape as pin's Zustand store.
 */
const props = withDefaults(
  defineProps<{
    entityType?: string;
    fqn?: string;
  }>(),
  { entityType: '', fqn: '' },
);

const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const permissionStore = usePermissionStore();

const focused = computed(() => Boolean(props.entityType && props.fqn));

// Pin getSceneRequestFromSearch: the lens comes from ?lineageLens= in
// the URL search and defaults to Service. The lens switcher UI is the
// L4 scene map; L1 only reads the value for the title and the platform
// fetch's `view` param.
const lens = computed<LineagePlatformLens>(() => resolveLineageLens(route.query.lineageLens));

const LENS_LABEL_KEYS: Record<LineagePlatformLens, string> = {
  service: 'lineage.lensServiceName',
  domain: 'lineage.lensDomainName',
  dataProduct: 'lineage.lensDataProductName',
};

const title = computed(() =>
  t('lineage.platformTitle', { platformType: t(LENS_LABEL_KEYS[lens.value]) }),
);

// Pin pageTitle: the focused variant names the entity it is centred on
// (the FQN when no entity name was fetched); the platform variant is
// the plain lineage title.
const pageTitle = computed(() =>
  focused.value
    ? t('lineage.platformTitle', { platformType: props.fqn })
    : t('lineage.title'),
);

// Per-entity edit permission (pin useEntityPermissions → canEditLineage),
// read through the permission store like AssetDetailView: the resource
// is the route's entity type, so it must re-resolve when the route
// changes. Fail-closed: a failed read leaves editing disabled, and the
// failure is toasted once like pin's showErrorToast.
const canEditLineage = ref(false);
const permissionsLoading = ref(false);
const permissionsError = ref('');
let permissionSeq = 0;

async function loadPermissions(): Promise<void> {
  const seq = ++permissionSeq;
  if (!focused.value) {
    canEditLineage.value = false;
    permissionsLoading.value = false;
    permissionsError.value = '';
    return;
  }
  permissionsLoading.value = true;
  permissionsError.value = '';
  try {
    const ops = await permissionStore.getEntityPermissionByFqn(props.entityType, props.fqn);
    if (seq !== permissionSeq) {
      return;
    }
    canEditLineage.value = getDerivedPermissionFlags(ops).canEditLineage;
  } catch (error) {
    if (seq !== permissionSeq) {
      return;
    }
    canEditLineage.value = false;
    permissionsError.value =
      error instanceof Error ? error.message : t('lineage.permissionLoadFailed');
  } finally {
    if (seq === permissionSeq) {
      permissionsLoading.value = false;
    }
  }
}

watch(
  () => [props.entityType, props.fqn],
  () => {
    void loadPermissions();
  },
  { immediate: true },
);

watch(permissionsError, (value) => {
  if (value) {
    message.error(value);
  }
});

// The canvas owns the modal and the graph the export captures; the page
// buttons delegate to it, mirroring pin's page-level actions.
const canvasRef = ref<{
  exportPng: () => Promise<void>;
  openConfig: () => void;
} | null>(null);

async function onExportPng(): Promise<void> {
  try {
    await canvasRef.value?.exportPng();
  } catch {
    message.error(t('lineage.exportPngFailed'));
  }
}

function onOpenConfig(): void {
  canvasRef.value?.openConfig();
}

function openTarget(target: { entityType: string; fqn: string }): void {
  void router.push(lineageLocation(target.entityType, target.fqn));
}
</script>

<template>
  <PageLayout :document-title="pageTitle" test-id="platform-lineage-page">
    <PageHeader :header="title" :sub-header="t('lineage.platformLead')" learning-page-id="lineage" />
    <div class="lineage-page__toolbar" data-testid="platform-lineage-toolbar">
      <div data-testid="search-entity-select">
        <LineageEntitySearch :placeholder="focused ? fqn : undefined" @select="openTarget" />
      </div>
      <div class="lineage-page__actions">
        <Tooltip :title="t('lineage.exportAsPng')" placement="top">
          <Button data-testid="export-button" :aria-label="t('lineage.exportAsPng')" @click="onExportPng">
            {{ t('lineage.exportPng') }}
          </Button>
        </Tooltip>
        <Tooltip :title="t('lineage.config')" placement="top">
          <Button data-testid="lineage-config" :aria-label="t('lineage.config')" @click="onOpenConfig">
            {{ t('lineage.config') }}
          </Button>
        </Tooltip>
      </div>
    </div>
    <Spin :spinning="permissionsLoading">
      <LineageCanvas
        ref="canvasRef"
        :entity-type="entityType"
        :fqn="fqn"
        :platform="!focused"
        :lens="lens"
        :show-header="false"
        :has-edit-access="canEditLineage"
        variant="page"
      />
    </Spin>
  </PageLayout>
</template>

<style scoped>
.lineage-page__toolbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin: 12px 0;
}
.lineage-page__actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
</style>
