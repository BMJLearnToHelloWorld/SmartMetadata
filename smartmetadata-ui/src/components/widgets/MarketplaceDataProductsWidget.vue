/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
<script setup lang="ts">
/**
 * Marketplace data products widget — the pin
 * `MarketplaceDataProductsWidget.component.tsx` equivalent (D-2 batch
 * 5b). Self-fetches the three most recently updated data products
 * (`searchAssets`, `DISPLAY_COUNT = 3`, `updatedAt` desc); a failed
 * fetch yields an empty list, silently, as the pin does. The header
 * carries the Add button (Create permission only) and the View-all
 * link (only when more than three exist); the empty state is a
 * `CreatePlaceholder` whose New action appears only with the Create
 * permission — the placeholder's own `permission` prop is NOT used,
 * because a `false` there renders a permission-denied placeholder
 * instead of the empty state. Navigation and creation stay with the
 * owning view through the `add` / `view-all` / `open` events; `refresh`
 * is exposed so the view re-fetches after a successful create.
 */
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Spin, Typography } from 'ant-design-vue';
import { AppstoreOutlined } from '@ant-design/icons-vue';
import { searchAssets } from '@/api/search';
import type { SearchHit } from '@/types/api';
import { getTextFromHtmlString } from '@/utils/richTextUtils';
import CreatePlaceholder from '@/components/shared/CreatePlaceholder.vue';
import MarketplaceItemCard from '@/components/widgets/MarketplaceItemCard.vue';

const DISPLAY_COUNT = 3;

const { t } = useI18n();

defineProps<{
  canCreate: boolean;
}>();

const emit = defineEmits<{
  add: [];
  'view-all': [];
  open: [hit: SearchHit];
}>();

const loading = ref(true);
const items = ref<SearchHit[]>([]);
const total = ref(0);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const page = await searchAssets('', 0, DISPLAY_COUNT, {
      index: 'dataProduct',
      sortField: 'updatedAt',
      sortOrder: 'desc',
    });
    items.value = page.hits;
    total.value = page.total;
  } catch {
    items.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

defineExpose({ refresh: load });
</script>

<template>
  <Spin v-if="loading" size="small" data-testid="marketplace-dp-widget-loading" />
  <div v-else class="marketplace-widget-section" data-testid="marketplace-dp-widget" data-tour-step="data-marketplace">
    <div class="marketplace-widget__header">
      <div class="marketplace-widget__titles">
        <Typography.Title :level="5" class="marketplace-widget__title">
          {{ t('marketplace.newDataProducts') }}
        </Typography.Title>
        <Typography.Text type="secondary">
          {{ t('marketplace.recentlyCreatedDataProducts') }}
        </Typography.Text>
      </div>
      <div class="marketplace-widget__actions">
        <Button v-if="canCreate" type="primary" data-testid="add-data-product-btn" @click="emit('add')">
          {{ t('marketplace.addDataProduct') }}
        </Button>
        <Button
          v-if="total > DISPLAY_COUNT"
          type="link"
          data-testid="view-all-data-products"
          @click="emit('view-all')"
        >
          {{ t('marketplace.viewAll') }}
        </Button>
      </div>
    </div>

    <div v-if="items.length > 0" class="marketplace-widget__cards">
      <MarketplaceItemCard
        v-for="hit in items"
        :key="hit.id ?? hit.fullyQualifiedName"
        :name="hit.displayName || hit.name"
        :subtitle="getTextFromHtmlString(hit.description)"
        :test-id="`marketplace-dp-card-${hit.id ?? hit.fullyQualifiedName}`"
        :on-click="() => emit('open', hit)"
      />
    </div>
    <div v-else class="marketplace-widget__empty">
      <CreatePlaceholder
        :icon="AppstoreOutlined"
        :title="t('marketplace.noDataProductsYet')"
        :description="t('marketplace.noDataProductsYetDescription')"
        :test-id="'marketplace-dp-empty-state'"
        :actions="canCreate ? [{ key: 'add', label: t('marketplace.addDataProduct'), color: 'primary', onPress: () => emit('add') }] : undefined"
      />
    </div>
  </div>
</template>

<style scoped>
.marketplace-widget-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Pin MarketplaceDataProductsWidget.component.tsx:264 wraps the
   CreatePlaceholder in `tw:relative tw:flex tw:min-h-60
   tw:items-center tw:justify-center`: the placeholder root is
   absolutely positioned, so without a positioned host it anchors to
   the nearest positioned ancestor up the page and both widgets'
   empty states stack on the same spot, covering the sidebar. */
.marketplace-widget__empty {
  position: relative;
  display: flex;
  min-height: 240px;
  align-items: center;
  justify-content: center;
}

.marketplace-widget__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.marketplace-widget__titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.marketplace-widget__title {
  margin: 0;
}

.marketplace-widget__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.marketplace-widget__cards {
  display: flex;
  gap: 12px;
}
</style>
