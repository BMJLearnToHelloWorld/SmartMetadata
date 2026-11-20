<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Modal, Select, Space, Typography, message } from 'ant-design-vue';
import type { DefaultOptionType } from 'ant-design-vue/es/select';
import { PlusOutlined, EditOutlined } from '@ant-design/icons-vue';
import type { Domain } from '@/types/governance';
import type { EntityRef } from '@/types/api';

/**
 * Shared domain widget cell (D-2 batch 2): the product port of pin
 * `DomainLabel` as used by the three pin wrappers — the generic
 * `DomainWidget`, the DataProduct exact-`===` version, and the
 * GlossaryTerm inline version. Read render is the domain display
 * names joined by commas; edit is a Modal + multi-Select from the
 * catalog domains. `hasEditAccess` is the caller's already-derived
 * gate (`isAdminUser || canEditDomains`); the cell never reads a
 * permission object.
 *
 * DataProduct confirm: pin's DataProduct domain widget shows a
 * confirm modal when the data product has linked assets (changing the
 * domain moves them); `assetCount` carries that count and the caller
 * supplies the linked-asset total. `onChange` receives the new domain
 * ids; it throws on failure so the cell keeps the editor open.
 */
const props = withDefaults(
  defineProps<{
    domains: EntityRef[];
    options: Domain[];
    hasEditAccess: boolean;
    /** Linked-asset count (DataProduct only); > 0 arms the confirm. */
    assetCount?: number;
    onChange: (domainIds: string[]) => Promise<unknown> | unknown;
    testId?: string;
  }>(),
  { assetCount: 0, testId: 'widget-domain-cell' },
);

const { t } = useI18n();
/** antd Select filter, repo pattern (UserTeamPicker): the option is a
 * DefaultOptionType, never a narrower local shape. */
function filterOption(input: string, option?: DefaultOptionType): boolean {
  const haystack = `${String(option?.label ?? '')} ${String(option?.value ?? '')}`.toLowerCase();
  return haystack.includes(input.toLowerCase());
}


/** Missing domain lists render as empty (`—`): partial payloads may
 * omit the array, and a cell must never crash on that. */
const domains = computed(() => props.domains ?? []);

const pickerOptions = computed(() =>
  props.options.map((domain) => ({
    label: domain.displayName || domain.name,
    value: domain.id,
  })),
);

const editOpen = ref(false);
const saving = ref(false);
const selected = ref<string[]>([]);

const editTitle = computed(() => t('label.edit-entity', { entity: t('label.domain-plural') }));
const addTitle = computed(() => t('label.add-entity', { entity: t('label.domain-plural') }));

function displayName(domain: EntityRef): string {
  return domain.displayName || domain.name;
}

function openEdit(): void {
  selected.value = domains.value.flatMap((domain) => (domain.id ? [domain.id] : []));
  editOpen.value = true;
}

async function commit(): Promise<void> {
  saving.value = true;
  try {
    await props.onChange(selected.value);
    editOpen.value = false;
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  } finally {
    saving.value = false;
  }
}

function onPickerChange(value: unknown): void {
  selected.value = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function saveDomains(): void {
  const changed =
    selected.value.length !== domains.value.length ||
    selected.value.some((id) => !domains.value.some((domain) => domain.id === id));
  if (changed && props.assetCount > 0) {
    Modal.confirm({
      title: t('governance.dataProducts.domainChangeConfirm', { count: props.assetCount }),
      okText: t('crud.save'),
      cancelText: t('crud.cancel'),
      onOk: () => commit(),
    });
    return;
  }
  void commit();
}
</script>

<template>
  <div :data-testid="testId">
    <Space wrap>
      <Typography.Text v-if="domains.length">{{ domains.map(displayName).join(', ') }}</Typography.Text>
      <Typography.Text v-if="!domains.length" type="secondary">—</Typography.Text>
      <Button
        v-if="hasEditAccess && !domains.length"
        type="text"
        size="small"
        data-testid="add-domain"
        :title="addTitle"
        @click="openEdit"
      >
        <PlusOutlined />
      </Button>
      <Button
        v-if="hasEditAccess && domains.length"
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
      @ok="saveDomains"
      @cancel="editOpen = false"
    >
      <Select
        :value="selected" @change="onPickerChange"
        mode="multiple"
        show-search
        style="width: 100%"
        :placeholder="addTitle"
        :options="pickerOptions"
        :filter-option="filterOption"
      />
    </Modal>
  </div>
</template>
