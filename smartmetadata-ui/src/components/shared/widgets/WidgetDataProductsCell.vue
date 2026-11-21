<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Button, Modal, Select, Space, Typography, message } from 'ant-design-vue';
import type { DefaultOptionType } from 'ant-design-vue/es/select';
import { PlusOutlined, EditOutlined } from '@ant-design/icons-vue';
import { listDataProducts } from '@/api/dataProducts';
import type { DataProduct } from '@/types/governance';
import type { EntityRef } from '@/types/api';

/**
 * Shared data-products widget cell (D-2 batch 2): the product port
 * of pin `DataProductsWidget` → `DataProductsContainer`. Read render
 * is the data-product chips (linked to the data-product detail page);
 * edit is a Modal + multi-Select whose options are self-fetched on
 * open (`listDataProducts({limit: 100})`, pin `DataProductsSelectList`
 * is likewise ES-backed). `requireDomainForDataProduct` gates the add
 * button when the entity has no domains (pin
 * `DataProductsContainer`): empty + permitted + domainless shows
 * `message.select-domain-to-add-data-product` instead of the add
 * button. `hasEditAccess` is the caller's already-derived gate
 * (`isAdminUser || canEditAll`); the cell never reads a permission
 * object. `onSave` receives the new data-product refs; it throws on
 * failure so the cell keeps the editor open.
 */
const props = withDefaults(
  defineProps<{
    dataProducts: EntityRef[];
    domains: EntityRef[];
    hasEditAccess: boolean;
    /** Pin `requireDomainForDataProduct` (default true). */
    requireDomain?: boolean;
    onSave: (products: EntityRef[]) => Promise<unknown> | unknown;
    testId?: string;
  }>(),
  { requireDomain: true, testId: 'widget-data-products-cell' },
);

const { t } = useI18n();
/** antd Select filter, repo pattern (UserTeamPicker): the option is a
 * DefaultOptionType, never a narrower local shape. */
function filterOption(input: string, option?: DefaultOptionType): boolean {
  const haystack = `${String(option?.label ?? '')} ${String(option?.value ?? '')}`.toLowerCase();
  return haystack.includes(input.toLowerCase());
}


const domainMissing = computed(() => props.requireDomain && (props.domains ?? []).length === 0);

const editOpen = ref(false);
const saving = ref(false);
const loadingOptions = ref(false);
const options = ref<DataProduct[]>([]);
const selected = ref<string[]>([]);

const editTitle = computed(() => t('label.edit-entity', { entity: t('label.data-product-plural') }));
const addTitle = computed(() => t('label.add-entity', { entity: t('label.data-product-plural') }));

const pickerOptions = computed(() =>
  options.value.map((product) => ({
    label: product.displayName || product.name,
    value: product.id,
  })),
);

function displayName(product: EntityRef): string {
  return product.displayName || product.name;
}

async function openEdit(): Promise<void> {
  selected.value = props.dataProducts.flatMap((product) => (product.id ? [product.id] : []));
  editOpen.value = true;
  loadingOptions.value = true;
  try {
    const page = await listDataProducts({ limit: 100 });
    options.value = page.data;
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  } finally {
    loadingOptions.value = false;
  }
}

function onPickerChange(value: unknown): void {
  selected.value = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

async function saveProducts(): Promise<void> {
  saving.value = true;
  try {
    const products: EntityRef[] = selected.value.flatMap((id) => {
      const fromOptions = options.value.find((product) => product.id === id);
      const current = props.dataProducts.find((product) => product.id === id);
      if (fromOptions) {
        return [
          {
            id: fromOptions.id,
            type: 'dataProduct',
            name: fromOptions.name,
            displayName: fromOptions.displayName,
            fullyQualifiedName: fromOptions.fullyQualifiedName,
          },
        ];
      }
      return current ? [current] : [];
    });
    await props.onSave(products);
    editOpen.value = false;
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div :data-testid="testId">
    <Space wrap>
      <template v-for="product in dataProducts" :key="product.id">
        <RouterLink
          :to="{ name: 'governance-data-product', params: { id: product.id } }"
          data-testid="data-product-chip"
        >
          {{ displayName(product) }}
        </RouterLink>
      </template>
      <Typography.Text v-if="!dataProducts.length && !domainMissing" type="secondary">—</Typography.Text>
      <Typography.Text v-if="!dataProducts.length && domainMissing && hasEditAccess" type="secondary">
        {{ t('message.select-domain-to-add-data-product') }}
      </Typography.Text>
      <Button
        v-if="hasEditAccess && !dataProducts.length && !domainMissing"
        type="text"
        size="small"
        data-testid="add-data-product"
        :title="addTitle"
        @click="openEdit"
      >
        <PlusOutlined />
      </Button>
      <Button
        v-if="hasEditAccess && dataProducts.length && !domainMissing"
        type="text"
        size="small"
        data-testid="edit-button"
        :title="editTitle"
        @click="openEdit"
      >
        <EditOutlined />
      </Button>
    </Space>
    <Modal
      :open="editOpen"
      :title="editTitle"
      :mask-closable="false"
      :keyboard="false"
      :closable="false"
      :confirm-loading="saving"
      :ok-text="t('crud.save')"
      :cancel-text="t('crud.cancel')"
      @ok="saveProducts"
      @cancel="editOpen = false"
    >
      <Select
        :value="selected" @change="onPickerChange"
        mode="multiple"
        show-search
        style="width: 100%"
        :placeholder="addTitle"
        :loading="loadingOptions"
        :options="pickerOptions"
        :filter-option="filterOption"
      />
    </Modal>
  </div>
</template>
