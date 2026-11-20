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
 * Marketplace domains widget — the pin
 * `MarketplaceDomainsWidget.component.tsx` equivalent (D-2 batch 5b),
 * isomorphic to `MarketplaceDataProductsWidget` with the four pin
 * differences: the domain search index, the domain titles, the card
 * subtitle (`Type: {domainType}`, empty when the domain has no type),
 * and domain creation / navigation. Same permission shape (Add button
 * and empty-state action only with the domain Create permission; the
 * placeholder's own `permission` prop is not used — a `false` there
 * renders a permission-denied placeholder instead of the empty state)
 * and the same exposed `refresh()` for the owning view.
 */
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Spin, Typography } from 'ant-design-vue';
import { GlobalOutlined } from '@ant-design/icons-vue';
import { searchAssets } from '@/api/search';
import type { SearchHit } from '@/types/api';
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
      index: 'domain',
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

function domainSubtitle(hit: SearchHit): string {
  return hit.domainType ? `${t('asset.fields.type')}: ${hit.domainType}` : '';
}
</script>

<template>
  <Spin v-if="loading" size="small" data-testid="marketplace-domains-widget-loading" />
  <div v-else class="marketplace-widget-section" data-testid="marketplace-domains-widget">
    <div class="marketplace-widget__header">
      <div class="marketplace-widget__titles">
        <Typography.Title :level="5" class="marketplace-widget__title">
          {{ t('marketplace.newDomains') }}
        </Typography.Title>
        <Typography.Text type="secondary">
          {{ t('marketplace.recentlyCreatedDomains') }}
        </Typography.Text>
      </div>
      <div class="marketplace-widget__actions">
        <Button v-if="canCreate" type="primary" data-testid="add-domain-btn" @click="emit('add')">
          {{ t('marketplace.addDomain') }}
        </Button>
        <Button
          v-if="total > DISPLAY_COUNT"
          type="link"
          data-testid="view-all-domains"
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
        :subtitle="domainSubtitle(hit)"
        :test-id="`marketplace-domain-card-${hit.id ?? hit.fullyQualifiedName}`"
        :on-click="() => emit('open', hit)"
      />
    </div>
    <CreatePlaceholder
      v-else
      :icon="GlobalOutlined"
      :title="t('marketplace.noDomainsYet')"
      :description="t('marketplace.noDomainsYetDescription')"
      test-id="marketplace-domains-empty-state"
      :actions="canCreate ? [{ key: 'add', label: t('marketplace.addDomain'), color: 'primary', onPress: () => emit('add') }] : undefined"
    />
  </div>
</template>

<style scoped>
.marketplace-widget-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
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
