<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { Popover } from 'ant-design-vue';

/**
 * Owners cell, ported from official `Owner` (ui-core-components,
 * pin a3012259ca) as used by `ownerTableObject`: non-compact, no
 * label, `maxVisibleOwners` 4, overflow behind a popover, empty
 * renders `--`. Pin renders an avatar stack; the product has no
 * avatar-stack precedent in tables and renders owner names
 * (AssetOverviewFields), so this cell renders names with pin's
 * cap-4 + overflow-popover semantics.
 */
export interface CellOwnerRef {
  id?: string;
  name?: string;
  displayName?: string;
  type?: string;
}

const props = withDefaults(
  defineProps<{
    owners: CellOwnerRef[];
    maxVisibleOwners?: number;
  }>(),
  { maxVisibleOwners: 4 },
);

function ownerName(owner: CellOwnerRef): string {
  return owner.displayName ?? owner.name ?? '';
}

const visibleOwners = computed(() => props.owners.slice(0, props.maxVisibleOwners));
const overflowOwners = computed(() => props.owners.slice(props.maxVisibleOwners));
</script>

<template>
  <span v-if="owners.length === 0" data-testid="owner-label">--</span>
  <span v-else class="service-child-owners-cell" data-testid="owner-label">
    <span
      v-for="(owner, index) in visibleOwners"
      :key="owner.id ?? owner.name ?? index"
      class="service-child-owners-cell__name"
    >
      {{ ownerName(owner) }}
    </span>
    <span v-if="overflowOwners.length > 0">
      <Popover trigger="click" placement="bottom">
        <template #content>
          <span class="service-child-owners-cell__popover">
            <span
              v-for="(owner, index) in overflowOwners"
              :key="owner.id ?? owner.name ?? index"
            >
              {{ ownerName(owner) }}
            </span>
          </span>
        </template>
        <button
          type="button"
          class="service-child-owners-cell__more"
          data-testid="owner-more-count"
        >
          +{{ overflowOwners.length }}
        </button>
      </Popover>
    </span>
  </span>
</template>

<style scoped>
.service-child-owners-cell {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.service-child-owners-cell__more {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--sm-text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.service-child-owners-cell__popover {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 160px;
  padding: 12px;
}
</style>
